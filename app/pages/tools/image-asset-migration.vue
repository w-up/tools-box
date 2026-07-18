<script setup lang="ts">
import JSZip from 'jszip'

import type { DroppedFile } from '~/components/ui/UiFileDropzone.vue'
import type { ImageAsset, ImportedFile, MatchResult } from '~/types/image-matching'
import {
  applyDuplicateTargetNames,
  createAssetMigrationPlan,
  createDuplicateMerges,
  findDuplicateImageGroups,
  formatFileSize,
  getRetainedImageIds,
  resolveAssetOutputPath,
  resolveTemplateTargetName,
  shouldUseTemplateAsset,
  rewriteAssetReferences,
} from '~/utils/assetMigration'
import { createImageAsset } from '~/utils/imageFingerprint'
import { getDirectory, matchFingerprints, resolveTargetNames } from '~/utils/imageMatching'

interface ProjectFile {
  file: File
  relativePath: string
  content?: string
}

interface MigrationSettings {
  updateReferences: boolean
  removeDuplicates: boolean
  useTemplateFiles: boolean
}

const SETTINGS_KEY = 'web-toolbox:asset-migration-settings'
const CODE_FILE_PATTERN = /\.(?:css|html?|json|jsx?|less|sass|scss|tsx?|vue)$/i
const DEFAULT_SETTINGS: MigrationSettings = {
  updateReferences: true,
  removeDuplicates: false,
  useTemplateFiles: false,
}

useSeoMeta({
  title: '图片资源迁移 — Web Toolbox',
  description: '以模板图片规范项目资源命名，并在浏览器本地同步更新代码引用。',
})

const templateImages = ref<ImageAsset[]>([])
const projectFiles = ref<ProjectFile[]>([])
const projectImages = ref<ImageAsset[]>([])
const matches = ref<MatchResult[]>([])
const duplicateKeepImageIds = reactive<Record<string, string>>({})
const duplicatePreviewImage = ref<ImageAsset | null>(null)
const duplicatePreviewOpen = ref(false)
const settings = reactive<MigrationSettings>({ ...DEFAULT_SETTINGS })
const settingsOpen = ref(false)
const exporting = ref(false)
const processingTemplates = ref(false)
const processingProject = ref(false)
const matching = ref(false)
const notice = ref('')
const { show: showToast } = useToast()

const templatePreviewFiles = computed<DroppedFile[]>(() => templateImages.value.map(image => ({ file: image.file, relativePath: image.relativePath })))
const projectPreviewFiles = computed<DroppedFile[]>(() => projectFiles.value.map(file => ({ file: file.file, relativePath: file.relativePath })))
const codeFiles = computed(() => projectFiles.value.filter(file => file.content !== undefined))
const templateById = computed(() => new Map(templateImages.value.map(image => [image.id, image])))
const matchByProjectId = computed(() => new Map(matches.value.map(match => [match.fileBId, match])))
const projectImageById = computed(() => new Map(projectImages.value.map(image => [image.id, image])))
const duplicateGroups = computed(() => findDuplicateImageGroups(projectImages.value))
const duplicateMerges = computed(() => createDuplicateMerges(
  duplicateGroups.value,
  duplicateKeepImageIds,
  projectImages.value,
))
const discardedDuplicateImageIds = computed(() => new Set(duplicateGroups.value.flatMap(group => (
  group.imageIds.filter(imageId => imageId !== duplicateKeepImageIds[group.id])
))))
const retainedProjectImages = computed(() => {
  const retainedIds = new Set(getRetainedImageIds(
    projectImages.value.map(image => image.id),
    duplicateGroups.value,
    duplicateKeepImageIds,
  ))
  return projectImages.value.filter(image => retainedIds.has(image.id))
})

// 根据视觉匹配结果生成项目图片的规范目标名，并解决同目录名称冲突
const targetNames = computed(() => {
  const retainedIds = new Set(retainedProjectImages.value.map(image => image.id))
  const retainedTargetNames = resolveTargetNames(projectImages.value.filter(image => retainedIds.has(image.id)).map(image => {
    const match = matchByProjectId.value.get(image.id)
    const template = match?.fileAId ? templateById.value.get(match.fileAId) : undefined
    return {
      id: image.id,
      directory: getDirectory(image.relativePath),
      desiredName: template
        ? resolveTemplateTargetName(template.name, image.name, settings.useTemplateFiles)
        : image.name,
    }
  }))
  return applyDuplicateTargetNames(retainedTargetNames, duplicateGroups.value, duplicateKeepImageIds)
})
const sourceNames = computed(() => projectImages.value.map(image => image.relativePath))
const renamedTargets = computed(() => new Map(projectImages.value.map(image => [
  image.relativePath,
  `${getDirectory(image.relativePath)}${targetNames.value.get(image.id) ?? image.name}`,
])))
const plan = computed(() => createAssetMigrationPlan(
  sourceNames.value,
  duplicateMerges.value,
  settings.removeDuplicates,
  renamedTargets.value,
))
const planBySource = computed(() => new Map(plan.value.map(item => [item.sourceName, item])))
const targetBySource = computed(() => new Map(plan.value.map(item => [item.sourceName, item.targetName])))
const duplicateTargets = computed(() => {
  const counts = new Map<string, number>()
  for (const image of projectImages.value) {
    const item = planBySource.value.get(image.relativePath)
    if (item?.action !== 'keep') continue
    const outputPath = resolveAssetOutputPath(
      item,
      renamedTargets.value.get(image.relativePath) ?? image.relativePath,
      settings.removeDuplicates,
      discardedDuplicateImageIds.value.has(image.id),
    )
    const normalizedTarget = outputPath.toLocaleLowerCase()
    counts.set(normalizedTarget, (counts.get(normalizedTarget) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
})
const codeChangeCount = computed(() => codeFiles.value.reduce((count, file) => (
  rewriteAssetReferences(file.content ?? '', targetBySource.value, file.relativePath) === file.content ? count : count + 1
), 0))
const matchedCount = computed(() => matches.value.filter(match => match.fileAId).length)
const canExport = computed(() => (
  templateImages.value.length > 0
  && projectImages.value.length > 0
  && matches.value.length === projectImages.value.length
  && duplicateTargets.value.length === 0
  && duplicateGroups.value.every(group => duplicateKeepImageIds[group.id])
))
const canStartMatching = computed(() => (
  templateImages.value.length > 0
  && projectImages.value.length > 0
  && duplicateGroups.value.every(group => duplicateKeepImageIds[group.id])
  && !matching.value
))

const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}

// 保存处理偏好，但不保存浏览器无法恢复的本地 File 对象
const persistSettings = () => useLocalStorage.set(SETTINGS_KEY, settings)
onMounted(() => {
  const stored = useLocalStorage.get<Partial<MigrationSettings>>(SETTINGS_KEY)
  if (stored) Object.assign(settings, DEFAULT_SETTINGS, stored)
})
watch(settings, persistSettings, { deep: true })
watch(() => settings.useTemplateFiles, () => {
  matches.value = []
})
onBeforeUnmount(() => {
  releaseImageAssets(templateImages.value)
  releaseImageAssets(projectImages.value)
})

// 分批提取图片指纹，避免大型目录一次性阻塞浏览器主线程
const analyzeImages = async (files: DroppedFile[], batch: 'A' | 'B') => {
  const results: ImageAsset[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++
      const imported = files[index]
      if (!imported) continue
      try {
        results[index] = await createImageAsset(imported as ImportedFile, batch, index)
      } catch {
        setNotice(`${imported.relativePath} 无法读取，已跳过`, 'warning')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(files.length, 4) }, worker))
  return results.filter(Boolean)
}

// 在替换本次导入或清空任务时释放旧预览 URL，避免反复整理目录后占用内存
const releaseImageAssets = (images: ImageAsset[]) => {
  for (const image of images) URL.revokeObjectURL(image.previewUrl)
}

// 左侧导入模板图：它们提供视觉对比基准与最终规范文件名
const importTemplateImages = async (files: DroppedFile[]) => {
  if (files.length === 0) return setNotice('没有检测到可读取的模板图片', 'warning')
  processingTemplates.value = true
  const nextTemplateImages = await analyzeImages(files, 'A')
  releaseImageAssets(templateImages.value)
  templateImages.value = nextTemplateImages
  processingTemplates.value = false
  matches.value = []
  setNotice(`已导入 ${templateImages.value.length} 张模板图片`, 'success')
}

// 清理上一次扫描的重复组选择，避免新目录错误复用旧图片 ID
const resetDuplicateSelections = () => {
  for (const groupId of Object.keys(duplicateKeepImageIds)) delete duplicateKeepImageIds[groupId]
}

// 右侧导入完整项目目录，保留多层相对路径并自动区分图片、代码和其他文件
const importProjectDirectory = async (files: DroppedFile[]) => {
  if (files.length === 0) return setNotice('没有检测到项目文件', 'warning')
  processingProject.value = true
  projectFiles.value = await Promise.all(files.map(async item => ({
    ...item,
    content: CODE_FILE_PATTERN.test(item.file.name) ? await item.file.text() : undefined,
  })))
  const nextProjectImages = await analyzeImages(files.filter(item => item.file.type.startsWith('image/')), 'B')
  releaseImageAssets(projectImages.value)
  projectImages.value = nextProjectImages
  processingProject.value = false
  matches.value = []
  duplicatePreviewOpen.value = false
  duplicatePreviewImage.value = null
  resetDuplicateSelections()
  setNotice(`项目目录已导入：${projectImages.value.length} 张图片、${codeFiles.value.length} 个代码文件；识别到 ${duplicateGroups.value.length} 组重复图片`, 'success')
}

// 执行模板与项目图片的一对一视觉匹配，匹配结果用于自动命名建议
const startMatching = () => {
  if (!canStartMatching.value) return
  matching.value = true
  requestAnimationFrame(() => {
    const retainedMatches = matchFingerprints(templateImages.value, retainedProjectImages.value)
    const retainedMatchById = new Map(retainedMatches.map(match => [match.fileBId, match]))
    const keepImageIdByDuplicateImageId = new Map(duplicateGroups.value.flatMap(group => (
      group.imageIds.map(imageId => [imageId, duplicateKeepImageIds[group.id]] as const)
    )))
    matches.value = projectImages.value.map(image => {
      const retainedImageId = keepImageIdByDuplicateImageId.get(image.id) ?? image.id
      const retainedMatch = retainedMatchById.get(retainedImageId)
      return retainedMatch ? { ...retainedMatch, id: `match-${image.id}`, fileBId: image.id } : {
        id: `match-${image.id}`,
        fileAId: null,
        fileBId: image.id,
        similarity: 0,
        confidence: 'none' as const,
      }
    })
    matching.value = false
    setNotice(`匹配完成：${matchedCount.value} 张项目图片已匹配到模板`, 'success')
  })
}

// 只通过眼睛按钮打开重复图片大图，不让缩略图本身承担点击行为
const openDuplicatePreview = (image: ImageAsset) => {
  duplicatePreviewImage.value = image
  duplicatePreviewOpen.value = true
}

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// 按项目原目录导出副本：图片改名、代码引用更新，其余文件原样保留
const exportMigration = async () => {
  if (!canExport.value) return
  exporting.value = true
  try {
    const zip = new JSZip()
    const imageByPath = new Map(projectImages.value.map(image => [image.relativePath, image]))
    for (const projectFile of projectFiles.value) {
      const image = imageByPath.get(projectFile.relativePath)
      if (image) {
        const item = planBySource.value.get(image.relativePath)
        if (!item || item.action === 'remove') continue
        const match = matchByProjectId.value.get(image.id)
        const template = match?.fileAId ? templateById.value.get(match.fileAId) : undefined
        const renamedPath = renamedTargets.value.get(image.relativePath) ?? image.relativePath
        const isDiscardedDuplicate = discardedDuplicateImageIds.value.has(image.id)
        const outputPath = resolveAssetOutputPath(item, renamedPath, settings.removeDuplicates, isDiscardedDuplicate)
        const outputFile = template && shouldUseTemplateAsset(item, renamedPath, outputPath, settings.useTemplateFiles, isDiscardedDuplicate)
          ? template.file
          : image.file
        zip.file(outputPath, outputFile)
        continue
      }
      const content = projectFile.content === undefined || !settings.updateReferences
        ? projectFile.file
        : rewriteAssetReferences(projectFile.content, targetBySource.value, projectFile.relativePath)
      zip.file(projectFile.relativePath, content)
    }
    zip.file('migration-report.json', JSON.stringify({
      settings,
      templates: templateImages.value.map(image => image.relativePath),
      matches: matches.value,
      imagePlan: plan.value,
      duplicateGroups: duplicateGroups.value.map(group => ({ ...group, keepImageId: duplicateKeepImageIds[group.id] })),
      codeFiles: codeFiles.value.map(file => ({ path: file.relativePath, changed: rewriteAssetReferences(file.content ?? '', targetBySource.value, file.relativePath) !== file.content })),
    }, null, 2))
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `image-migration-${Date.now()}.zip`)
    setNotice('项目迁移 ZIP 已导出；原始目录未被修改', 'success')
  } catch {
    setNotice('导出失败，请减少单次文件数量后重试', 'error')
  } finally {
    exporting.value = false
  }
}

const clearAll = () => {
  releaseImageAssets(templateImages.value)
  releaseImageAssets(projectImages.value)
  templateImages.value = []
  projectFiles.value = []
  projectImages.value = []
  matches.value = []
  duplicatePreviewOpen.value = false
  duplicatePreviewImage.value = null
  resetDuplicateSelections()
  setNotice('本次任务数据已清空，处理设置会继续保留')
}
</script>

<template>
  <div class="migration-workbench">
    <header class="migration-header">
      <div>
        <NuxtLink class="migration-header__back" to="/">← 全部工具</NuxtLink>
        <p>图片工具 · 本地迁移</p>
        <h1>图片资源迁移</h1>
        <span>用模板图片规范项目资源命名，并同步更新代码引用。</span>
      </div>
      <div class="migration-header__privacy"><i aria-hidden="true" /><strong>文件不会上传</strong><span>比对、替换和导出全部在当前浏览器完成</span></div>
    </header>

    <main class="migration-shell">
      <section class="migration-panel">
        <div class="migration-panel__heading"><div class="migration-step">01</div><div><p>导入资源</p><h2>模板图片与待整理项目</h2></div><button class="migration-button" type="button" @click="settingsOpen = true">处理设置</button></div>
        <div class="migration-imports">
          <div class="migration-import-card">
            <strong>模板图片</strong>
            <UiFileDropzone accept="image/*" title="拖拽模板图片或模板文件夹至此" description="模板文件名将作为项目图片的规范命名" dragging-text="松开即可导入模板图片" :preview-files="templatePreviewFiles" @files="importTemplateImages" />
            <small>{{ processingTemplates ? '正在分析模板图片…' : templateImages.length > 0 ? `已导入 ${templateImages.length} 张模板图片` : '尚未导入' }}</small>
          </div>
          <div class="migration-import-card">
            <strong>待整理项目目录</strong>
            <UiFileDropzone directory title="拖拽完整项目文件夹至此" description="会读取多层 img/、assets/ 等目录中的图片和代码文件" dragging-text="松开即可导入项目目录" :preview-files="projectPreviewFiles" @files="importProjectDirectory" />
            <small>{{ processingProject ? '正在读取项目目录…' : projectFiles.length > 0 ? `已导入 ${projectImages.length} 张图片、${codeFiles.length} 个代码文件` : '尚未导入' }}</small>
          </div>
        </div>
      </section>

      <p v-if="notice" class="migration-notice" role="status">{{ notice }}</p>

      <section class="migration-panel" aria-labelledby="merge-title">
        <div class="migration-panel__heading"><div class="migration-step">02</div><div><p>重复项整理</p><h2 id="merge-title">识别并选择保留图片</h2></div><strong v-if="duplicateGroups.length > 0" class="migration-duplicate-count">{{ duplicateGroups.length }} 组</strong></div>
        <p class="migration-description">只展示像素内容和尺寸完全相同的图片。每组手动勾选保留一张，其余图片的代码引用会统一更新；是否从导出项目删除由处理设置控制。</p>
        <div v-if="duplicateGroups.length > 0" class="migration-duplicate-groups">
          <section v-for="(group, groupIndex) in duplicateGroups" :key="group.id" class="migration-duplicate-group">
            <div class="migration-duplicate-group__heading"><strong>重复组 {{ groupIndex + 1 }}</strong><span>选择保留 1 张</span></div>
            <div class="migration-duplicate-grid">
              <label
                v-for="imageId in group.imageIds"
                :key="imageId"
                :class="['migration-duplicate-card', { 'migration-duplicate-card--selected': duplicateKeepImageIds[group.id] === imageId }]"
              >
                <input v-model="duplicateKeepImageIds[group.id]" type="radio" :name="group.id" :value="imageId" @change="matches = []">
                <div class="migration-duplicate-card__thumb"><img :src="projectImageById.get(imageId)?.previewUrl" alt=""><button type="button" :aria-label="`放大查看 ${projectImageById.get(imageId)?.relativePath}`" @click.prevent="projectImageById.get(imageId) && openDuplicatePreview(projectImageById.get(imageId)!)"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg></button></div>
                <UiTips :text="projectImageById.get(imageId)?.relativePath ?? ''"><code>{{ projectImageById.get(imageId)?.relativePath }}</code></UiTips>
                <span>{{ projectImageById.get(imageId)?.width }} × {{ projectImageById.get(imageId)?.height }} px · {{ formatFileSize(projectImageById.get(imageId)?.size ?? 0) }}</span>
                <strong>{{ duplicateKeepImageIds[group.id] === imageId ? '保留此图片' : '选择保留' }}</strong>
              </label>
            </div>
          </section>
        </div>
        <div v-else class="migration-empty">
          {{ projectImages.length > 0 ? '未识别到像素内容完全相同的图片。' : '导入待整理项目后自动识别重复图片。' }}
        </div>
        <p v-if="duplicateGroups.some(group => !duplicateKeepImageIds[group.id])" class="migration-warning">请为每个重复组选择一张保留图片后再导出。</p>
      </section>

      <UiModal v-model="duplicatePreviewOpen" :title="duplicatePreviewImage?.relativePath" description="重复图片详情" width="960px">
        <div v-if="duplicatePreviewImage" class="migration-image-detail">
          <div class="migration-image-detail__stage"><img :src="duplicatePreviewImage.previewUrl" :alt="duplicatePreviewImage.relativePath"></div>
          <dl><div><dt>图片宽高</dt><dd>{{ duplicatePreviewImage.width }} × {{ duplicatePreviewImage.height }} px</dd></div><div><dt>文件大小</dt><dd>{{ formatFileSize(duplicatePreviewImage.size) }}</dd></div><div><dt>文件路径</dt><dd><UiTips :text="duplicatePreviewImage.relativePath"><code>{{ duplicatePreviewImage.relativePath }}</code></UiTips></dd></div></dl>
        </div>
      </UiModal>

      <section class="migration-panel" aria-labelledby="match-title">
        <div class="migration-panel__heading"><div class="migration-step">03</div><div><p>模板匹配</p><h2 id="match-title">生成规范命名建议</h2></div><button class="migration-button migration-button--primary" type="button" :disabled="!canStartMatching" @click="startMatching">{{ matching ? '正在匹配…' : '开始匹配模板' }}</button></div>
        <p v-if="duplicateGroups.some(group => !duplicateKeepImageIds[group.id])" class="migration-warning">先在第 02 步为每个重复组选择保留图片，再开始模板匹配。</p>
        <div v-if="projectImages.length > 0" class="migration-table-wrap">
          <table class="migration-table"><thead><tr><th>项目图片路径</th><th>匹配模板</th><th>相似度</th><th>最终文件名</th></tr></thead><tbody>
            <tr v-for="image in projectImages" :key="image.id">
              <td><UiTips :text="image.relativePath"><code>{{ image.relativePath }}</code></UiTips></td>
              <td><UiTips :text="matchByProjectId.get(image.id)?.fileAId ? templateById.get(matchByProjectId.get(image.id)?.fileAId ?? '')?.relativePath ?? '—' : '未匹配'"><code>{{ matchByProjectId.get(image.id)?.fileAId ? templateById.get(matchByProjectId.get(image.id)?.fileAId ?? '')?.name : '未匹配' }}</code></UiTips></td>
              <td>{{ matchByProjectId.get(image.id)?.fileAId ? `${matchByProjectId.get(image.id)?.similarity}%` : '—' }}</td>
              <td><code>{{ targetNames.get(image.id) ?? image.name }}</code></td>
            </tr>
          </tbody></table>
        </div>
        <div v-else class="migration-empty">先导入模板图片和待整理项目目录。</div>
        <p v-if="duplicateTargets.length > 0" class="migration-warning">最终文件名冲突：{{ duplicateTargets.join('、') }}。请调整匹配或重复图片保留选择。</p>
      </section>

      <section class="migration-panel migration-export" aria-labelledby="export-title">
        <div class="migration-panel__heading"><div class="migration-step">04</div><div><p>检查与导出</p><h2 id="export-title">导出规范化项目副本</h2></div></div>
        <div class="migration-summary"><span><strong>{{ templateImages.length }}</strong> 模板图片</span><span><strong>{{ projectImages.length }}</strong> 项目图片</span><span><strong>{{ matchedCount }}</strong> 已匹配</span><span><strong>{{ codeFiles.length }}</strong> 代码文件</span><span><strong>{{ codeChangeCount }}</strong> 将更新的代码文件</span></div>
        <p>导出包保留项目原目录结构：图片在原目录改名，HTML/CSS/JS 等代码中的旧图片引用同步更新，其他文件原样保留。</p>
        <div class="migration-export__actions"><button class="migration-button migration-button--primary" type="button" :disabled="!canExport || exporting" @click="exportMigration">{{ exporting ? '正在打包…' : '导出项目 ZIP' }}</button><button class="migration-button" type="button" :disabled="projectFiles.length === 0 && templateImages.length === 0" @click="clearAll">清空本次数据</button></div>
      </section>
    </main>

    <UiModal v-model="settingsOpen" width="620px"><template #header><div class="migration-settings-heading"><span>PROCESS SETTINGS</span><h2>处理设置</h2><p>设置会保存到当前浏览器；导入文件和匹配任务不会保存。</p></div></template><div class="migration-settings"><label><input v-model="settings.updateReferences" type="checkbox"> <span><strong>同步代码引用</strong><small>导出更新后的代码副本，不改写原始项目文件。</small></span></label><label><input v-model="settings.removeDuplicates" type="checkbox"> <span><strong>去除确认重复图片</strong><small>只移除每组中未被选为保留项的图片；原始项目不受影响。</small></span></label><label><input v-model="settings.useTemplateFiles" type="checkbox"> <span><strong>使用模板文件替换</strong><small>需手动勾选。匹配成功后直接输出模板图片文件，并使用模板文件扩展名；关闭时只沿用模板名称。</small></span></label></div><template #footer="{ close }"><span class="migration-settings-footer">刷新页面后仍会保留这些设置</span><button class="migration-button migration-button--primary" type="button" @click="close">完成</button></template></UiModal>
  </div>
</template>

<style scoped>
.migration-workbench { min-height:calc(100svh - 72px); color:var(--color-text); background:var(--color-bg); }.migration-header,.migration-shell { width:min(100% - 48px,1180px); margin-inline:auto; }.migration-header { display:flex; min-height:220px; align-items:flex-end; justify-content:space-between; gap:48px; padding-block:42px 44px; }.migration-header__back { display:inline-flex; min-height:44px; align-items:center; color:var(--color-muted); font-size:12px; }.migration-header p,.migration-panel__heading p { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.1em; }.migration-header > div > p { margin-top:24px; }.migration-header h1 { margin:8px 0 0; font-size:clamp(38px,4.5vw,58px); font-weight:590; letter-spacing:-.055em; line-height:1; }.migration-header > div > span { display:block; margin-top:16px; color:var(--color-muted); font-size:14px; }.migration-header__privacy { display:grid; min-width:310px; grid-template-columns:10px 1fr; gap:4px 10px; border:1px solid var(--color-line); border-radius:10px; padding:16px 18px; background:var(--color-surface); }.migration-header__privacy i { width:8px; height:8px; margin-top:4px; border-radius:50%; background:var(--color-accent); box-shadow:0 0 0 4px var(--color-accent-soft); }.migration-header__privacy strong { font-size:12px; }.migration-header__privacy span { grid-column:2; margin:0; font-size:10px; }.migration-shell { padding-bottom:90px; }.migration-panel { margin-top:14px; border:1px solid var(--color-line); border-radius:16px; padding:26px; background:var(--color-surface-elevated); box-shadow:0 1px 3px rgb(15 23 42 / 4%); }.migration-panel:first-child { margin-top:0; }.migration-panel__heading { display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:14px; margin-bottom:20px; }.migration-panel__heading h2 { margin:4px 0 0; font-size:20px; font-weight:590; letter-spacing:-.025em; }.migration-step { display:grid; width:40px; height:40px; place-items:center; border-radius:10px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; font-weight:700; }.migration-imports { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.migration-import-card { display:flex; min-width:0; flex-direction:column; gap:10px; }.migration-import-card strong { font-size:14px; }.migration-import-card small { color:var(--color-muted); font-size:10px; }.migration-button { min-height:42px; border:1px solid var(--color-line); border-radius:8px; padding-inline:14px; color:var(--color-text); background:var(--color-surface); cursor:pointer; font-size:11px; font-weight:650; }.migration-button:hover:not(:disabled) { border-color:var(--color-accent); }.migration-button:disabled { color:var(--color-muted); cursor:not-allowed; }.migration-button--primary { color:var(--color-accent-text); border-color:var(--color-accent); background:var(--color-accent); }.migration-button--danger { color:#a24425; }.migration-notice,.migration-warning { margin:14px 0 0; border:1px solid var(--color-line); border-radius:9px; padding:11px 14px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; }.migration-warning { color:#a24425; background:#ffebe3; }.migration-table-wrap { overflow-x:auto; border:1px solid var(--color-line); border-radius:10px; }.migration-table { width:100%; min-width:720px; border-collapse:collapse; font-size:11px; }.migration-table th,.migration-table td { border-bottom:1px solid var(--color-line); padding:12px 14px; text-align:left; }.migration-table th { color:var(--color-muted); background:var(--color-bg); font-size:10px; }.migration-table tr:last-child td { border:0; }.migration-table code,.migration-export code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }.migration-table code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.migration-description,.migration-export > p { color:var(--color-muted); font-size:11px; line-height:1.65; }.migration-merge-list { display:grid; gap:10px; margin-top:16px; }.migration-merge-row { display:grid; grid-template-columns:1fr 24px 1fr auto; align-items:center; gap:12px; border:1px solid var(--color-line); border-radius:10px; padding:14px; background:var(--color-bg); }.migration-merge-row label { display:flex; flex-direction:column; gap:7px; color:var(--color-muted); font-size:10px; }.migration-merge-arrow { color:var(--color-accent); font-size:18px; text-align:center; }.migration-empty { border:1px dashed var(--color-line); border-radius:10px; padding:18px; color:var(--color-muted); background:var(--color-bg); font-size:11px; }.migration-summary { display:flex; flex-wrap:wrap; gap:8px; }.migration-summary span { border:1px solid var(--color-line); border-radius:8px; padding:8px 10px; color:var(--color-muted); background:var(--color-surface); font-size:10px; }.migration-summary strong { margin-right:4px; color:var(--color-text); font-size:13px; }.migration-export > p { margin-top:16px; }.migration-export__actions { display:flex; gap:8px; margin-top:16px; }.migration-settings-heading span { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.16em; }.migration-settings-heading h2 { margin:4px 0 0; font-size:24px; }.migration-settings-heading p,.migration-settings-footer { color:var(--color-muted); font-size:11px; }.migration-settings { display:grid; gap:10px; }.migration-settings label { display:flex; gap:12px; align-items:flex-start; border:1px solid var(--color-line); border-radius:10px; padding:15px; cursor:pointer; }.migration-settings input { width:18px; height:18px; accent-color:var(--color-accent); }.migration-settings strong,.migration-settings small { display:block; }.migration-settings strong { font-size:13px; }.migration-settings small { margin-top:4px; color:var(--color-muted); font-size:11px; line-height:1.5; }
.migration-duplicate-count { color:var(--color-accent); font-size:13px; }.migration-duplicate-groups { display:grid; gap:14px; margin-top:18px; }.migration-duplicate-group { border:1px solid var(--color-line); border-radius:12px; padding:16px; background:var(--color-bg); }.migration-duplicate-group__heading { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:12px; }.migration-duplicate-group__heading strong { font-size:13px; }.migration-duplicate-group__heading span { color:var(--color-muted); font-size:11px; }.migration-duplicate-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }.migration-duplicate-card { position:relative; display:grid; min-width:0; gap:8px; border:1px solid var(--color-line); border-radius:10px; padding:10px; background:var(--color-surface); cursor:pointer; transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease; }.migration-duplicate-card:hover { border-color:var(--color-accent); transform:translateY(-1px); }.migration-duplicate-card--selected { border-color:var(--color-accent); box-shadow:0 0 0 3px var(--color-accent-soft); }.migration-duplicate-card > input { position:absolute; z-index:2; top:10px; left:10px; width:22px; height:22px; margin:0; accent-color:var(--color-accent); cursor:pointer; }.migration-duplicate-card__thumb { position:relative; display:grid; height:126px; place-items:center; overflow:hidden; border-radius:7px; background-color:var(--color-bg); background-image:linear-gradient(45deg,var(--color-line) 25%,transparent 25%),linear-gradient(-45deg,var(--color-line) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--color-line) 75%),linear-gradient(-45deg,transparent 75%,var(--color-line) 75%); background-position:0 0,0 8px,8px -8px,-8px 0; background-size:16px 16px; }.migration-duplicate-card__thumb img { width:100%; height:100%; object-fit:contain; }.migration-duplicate-card__thumb button { position:absolute; z-index:3; right:7px; bottom:7px; display:grid; width:34px; height:34px; place-items:center; border:1px solid var(--color-line); border-radius:8px; color:var(--color-text); background:var(--color-surface-elevated); box-shadow:0 3px 10px rgb(8 10 14 / 14%); cursor:pointer; }.migration-duplicate-card__thumb button:hover { color:var(--color-accent); border-color:var(--color-accent); }.migration-duplicate-card__thumb svg { width:18px; height:18px; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.8; }.migration-duplicate-card code { display:block; overflow:hidden; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }.migration-duplicate-card :deep(.ui-tips-anchor) { min-width:0; }.migration-duplicate-card > span { color:var(--color-muted); font-size:10px; }.migration-duplicate-card > strong { color:var(--color-accent); font-size:11px; }.migration-image-detail__stage { display:grid; min-height:360px; max-height:62vh; place-items:center; overflow:auto; padding:24px; background-color:var(--color-bg); background-image:linear-gradient(45deg,var(--color-line) 25%,transparent 25%),linear-gradient(-45deg,var(--color-line) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--color-line) 75%),linear-gradient(-45deg,transparent 75%,var(--color-line) 75%); background-position:0 0,0 8px,8px -8px,-8px 0; background-size:16px 16px; }.migration-image-detail__stage img { display:block; max-width:100%; max-height:56vh; object-fit:contain; }.migration-image-detail dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; margin:0; background:var(--color-line); }.migration-image-detail dl > div { min-width:0; padding:14px 18px; background:var(--color-surface); }.migration-image-detail dt { color:var(--color-muted); font-size:10px; }.migration-image-detail dd { min-width:0; margin:5px 0 0; font-size:12px; }.migration-image-detail dd code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.migration-image-detail dd :deep(.ui-tips-anchor) { min-width:0; }.migration-settings label:has(input:disabled) { opacity:.5; }
@media (max-width:1024px) { .migration-header { align-items:flex-start; flex-direction:column; gap:24px; }.migration-header__privacy { width:100%; min-width:0; }.migration-imports { grid-template-columns:1fr; }.migration-duplicate-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }.migration-table :deep(.ui-tips-anchor) { display:block; max-width:260px; }
@media (max-width:640px) { .migration-header,.migration-shell { width:calc(100% - 28px); }.migration-header { min-height:0; padding-block:28px 30px; }.migration-header h1 { font-size:36px; }.migration-panel { border-radius:12px; padding:16px; }.migration-panel__heading { grid-template-columns:36px 1fr; }.migration-panel__heading > .migration-button,.migration-panel__heading > .migration-duplicate-count { grid-column:2; justify-self:start; }.migration-step { width:36px; height:36px; }.migration-duplicate-grid,.migration-image-detail dl { grid-template-columns:1fr; }.migration-duplicate-card__thumb { height:150px; }.migration-image-detail__stage { min-height:260px; padding:14px; }.migration-export__actions { flex-direction:column; }.migration-export__actions .migration-button { width:100%; min-height:46px; } }
</style>
