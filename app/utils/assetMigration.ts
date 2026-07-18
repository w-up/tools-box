export type AssetMigrationAction = 'keep' | 'remove'

export interface ManualAssetMerge {
  sourceNames: string[]
  targetName: string
}

export interface AssetMigrationPlanItem {
  sourceName: string
  targetName: string
  action: AssetMigrationAction
}

// 重复图片未启用删除时保留各自实体路径，普通重命名和删除模式使用计划目标路径
export const resolveAssetOutputPath = (
  item: AssetMigrationPlanItem,
  renamedPath: string,
  removeDuplicates: boolean,
  isDiscardedDuplicate = false,
) => !removeDuplicates && isDiscardedDuplicate ? item.sourceName : renamedPath

// 仅在图片实体实际按模板目标路径输出时替换文件内容，保留的重复源文件继续使用原字节
export const shouldUseTemplateAsset = (
  item: AssetMigrationPlanItem,
  renamedPath: string,
  outputPath: string,
  useTemplateFiles: boolean,
  isDiscardedDuplicate = false,
) => useTemplateFiles && !isDiscardedDuplicate && item.targetName === renamedPath && outputPath === renamedPath

export interface DuplicateImageCandidate {
  id: string
  relativePath: string
  contentHash: string
  width: number
  height: number
}

export interface DuplicateImageGroup {
  id: string
  imageIds: string[]
}

export interface NamedImageCandidate {
  id: string
  relativePath: string
}

// 按像素内容哈希和原始尺寸识别可安全人工确认的重复图片组
export const findDuplicateImageGroups = (images: DuplicateImageCandidate[]): DuplicateImageGroup[] => {
  const groups = new Map<string, DuplicateImageCandidate[]>()
  for (const image of images) {
    const key = `${image.contentHash}-${image.width}x${image.height}`
    const group = groups.get(key) ?? []
    group.push(image)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      id: `duplicate-${key}`,
      imageIds: group.map(image => image.id),
    }))
}

// 从重复组选择中取得进入模板匹配的图片，未重复图片始终保留
export const getRetainedImageIds = (
  imageIds: string[],
  groups: DuplicateImageGroup[],
  keepImageIds: Record<string, string>,
) => {
  const discarded = new Set(groups.flatMap(group => group.imageIds.filter(imageId => imageId !== keepImageIds[group.id])))
  return imageIds.filter(imageId => !discarded.has(imageId))
}

// 将保留图片的已解析目标名同步给同组其余图片，避免重复项参与名称冲突编号
export const applyDuplicateTargetNames = (
  targetNames: Map<string, string>,
  groups: DuplicateImageGroup[],
  keepImageIds: Record<string, string>,
) => {
  const resolved = new Map(targetNames)
  for (const group of groups) {
    const keepImageId = keepImageIds[group.id]
    const targetName = keepImageId ? resolved.get(keepImageId) : undefined
    if (!targetName) continue
    for (const imageId of group.imageIds) resolved.set(imageId, targetName)
  }
  return resolved
}

// 将重复组中的保留选择转换为现有迁移计划可消费的合并规则
export const createDuplicateMerges = (
  groups: DuplicateImageGroup[],
  keepImageIds: Record<string, string>,
  images: NamedImageCandidate[],
): ManualAssetMerge[] => {
  const imageById = new Map(images.map(image => [image.id, image]))
  return groups.flatMap(group => {
    const keepImageId = keepImageIds[group.id]
    const target = keepImageId ? imageById.get(keepImageId) : undefined
    if (!target) return []
    return [{
      sourceNames: group.imageIds
        .filter(imageId => imageId !== keepImageId)
        .map(imageId => imageById.get(imageId)?.relativePath)
        .filter((relativePath): relativePath is string => Boolean(relativePath)),
      targetName: target.relativePath,
    }]
  })
}

// 以 B、KB、MB 为图片详情生成紧凑的文件大小文本
export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${Number((size / 1024).toFixed(1))} KB`
  return `${Number((size / 1024 ** 2).toFixed(1))} MB`
}

const splitFileName = (name: string) => {
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0
    ? { stem: name.slice(0, dotIndex), extension: name.slice(dotIndex) }
    : { stem: name, extension: '' }
}

// 根据处理设置决定沿用项目编码格式，还是直接使用模板文件替换
export const resolveTemplateTargetName = (
  templateName: string,
  projectName: string,
  useTemplateFiles: boolean,
) => {
  if (useTemplateFiles) return templateName
  const template = splitFileName(templateName)
  const project = splitFileName(projectName)
  return `${template.stem}${project.extension}`
}

// 根据手动合并规则生成图片保留和删除计划
export const createAssetMigrationPlan = (
  sourceNames: string[],
  merges: ManualAssetMerge[],
  removeDuplicates: boolean,
  renamedTargets = new Map<string, string>(),
): AssetMigrationPlanItem[] => {
  const targetBySource = new Map<string, string>()
  for (const merge of merges) {
    for (const sourceName of merge.sourceNames) targetBySource.set(sourceName, merge.targetName)
  }

  return sourceNames.map(sourceName => {
    const mergeTarget = targetBySource.get(sourceName)
    const targetName = mergeTarget
      ? renamedTargets.get(mergeTarget) ?? mergeTarget
      : renamedTargets.get(sourceName) ?? sourceName
    return {
      sourceName,
      targetName,
      action: removeDuplicates && mergeTarget ? 'remove' : 'keep',
    }
  })
}

const normalizeRelativePath = (path: string) => {
  const segments: string[] = []
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

const getDirectory = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
const getFileName = (path: string) => path.split('/').at(-1) ?? path
const getProjectRoot = (path: string) => path.split('/').filter(Boolean)[0] ?? ''

// 计算从代码文件目录到目标图片的相对引用路径，并保留原引用的绝对或相对风格
const createRelativeReference = (codePath: string, targetPath: string, originalReference: string) => {
  if (originalReference.startsWith('/')) {
    const projectRoot = getProjectRoot(codePath)
    const normalizedTarget = normalizeRelativePath(targetPath)
    const rootPrefix = projectRoot ? `${projectRoot}/` : ''
    return `/${normalizedTarget.startsWith(rootPrefix) ? normalizedTarget.slice(rootPrefix.length) : normalizedTarget}`
  }
  const sourceSegments = normalizeRelativePath(getDirectory(codePath)).split('/').filter(Boolean)
  const targetSegments = normalizeRelativePath(targetPath).split('/').filter(Boolean)
  let commonLength = 0
  while (sourceSegments[commonLength] === targetSegments[commonLength]) commonLength += 1
  const relativeSegments = [
    ...Array.from({ length: sourceSegments.length - commonLength }, () => '..'),
    ...targetSegments.slice(commonLength),
  ]
  const relativePath = relativeSegments.join('/') || getFileName(targetPath)
  if (originalReference.startsWith('./') && !relativePath.startsWith('../')) return `./${relativePath}`
  return relativePath
}

// 按代码文件位置精确替换资源路径；旧调用只传文件名时保留兼容行为
export const rewriteAssetReferences = (
  content: string,
  replacements: Map<string, string>,
  codePath?: string,
) => {
  let result = content
  for (const [sourcePath, targetPath] of replacements) {
    if (sourcePath === targetPath) continue
    if (!codePath || (!sourcePath.includes('/') && !targetPath.includes('/'))) {
      const escaped = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g'), targetPath)
      continue
    }

    const codeDirectory = getDirectory(codePath)
    result = result.replace(/(?<=["'(=])((?:\.\.\/|\.\/|\/)?[^"')\s?#]+)(?=[?#]?[^"')\s]*["')])/g, reference => {
      const resolved = reference.startsWith('/')
        ? normalizeRelativePath(`${getProjectRoot(codePath)}/${reference.slice(1)}`)
        : normalizeRelativePath(`${codeDirectory}${reference}`)
      if (resolved !== normalizeRelativePath(sourcePath)) return reference
      return createRelativeReference(codePath, targetPath, reference)
    })
  }
  return result
}
