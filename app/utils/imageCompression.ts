export type CompressionFormat = 'webp' | 'jpeg' | 'avif' | 'original'
export type CompressionStatus = 'pending' | 'compressing' | 'success' | 'failed'

export interface ImportedCompressionFile {
  file: File
  relativePath: string
}

export interface CompressionTask extends ImportedCompressionFile {
  id: string
  originalSize: number
  previewUrl: string
  status: CompressionStatus
  outputBlob: Blob | null
  outputSize: number
  outputType: string
  outputPath: string
  savingsPercent: number
  useOriginal: boolean
  error?: string
}

interface CompressionOutputInput {
  originalSize: number
  encodedSize: number
  originalType: string
  encodedType: string
  relativePath: string
}

interface CompressionOutputDecision {
  outputSize: number
  outputType: string
  outputPath: string
  savingsPercent: number
  useOriginal: boolean
}

const MIME_BY_FORMAT: Record<Exclude<CompressionFormat, 'original'>, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/avif': 'avif',
  'image/png': 'png',
}
const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(?:avif|jpe?g|png|webp)$/i

// 仅接收页面压缩链路可解码并可安全导出的位图格式
export const isSupportedCompressionFile = (file: File) => (
  ['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  || (!file.type && SUPPORTED_IMAGE_EXTENSION_PATTERN.test(file.name))
)

// 将用户选择的格式转换为实际编码 MIME，保持原格式时沿用源文件类型
export const resolveTargetMimeType = (originalType: string, format: CompressionFormat) => (
  format === 'original' ? originalType : MIME_BY_FORMAT[format]
)

// 按实际输出 MIME 替换文件扩展名，同时保留原始相对目录
export const getOutputPath = (relativePath: string, mimeType: string) => {
  const extension = EXTENSION_BY_MIME[mimeType]
  if (!extension) return relativePath
  const slashIndex = relativePath.lastIndexOf('/')
  const directory = slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : ''
  const filename = slashIndex >= 0 ? relativePath.slice(slashIndex + 1) : relativePath
  const dotIndex = filename.lastIndexOf('.')
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  return `${directory}${basename}.${extension}`
}

// 为转换后发生扩展名碰撞的文件追加递增序号，避免 ZIP 内文件静默覆盖
export const resolveUniqueOutputPath = (outputPath: string, usedPaths: Set<string>) => {
  if (!usedPaths.has(outputPath)) return outputPath
  const dotIndex = outputPath.lastIndexOf('.')
  const basename = dotIndex > outputPath.lastIndexOf('/') ? outputPath.slice(0, dotIndex) : outputPath
  const extension = dotIndex > outputPath.lastIndexOf('/') ? outputPath.slice(dotIndex) : ''
  let sequence = 2
  while (usedPaths.has(`${basename}-${sequence}${extension}`)) sequence += 1
  return `${basename}-${sequence}${extension}`
}

// 只采纳体积确实变小的编码结果，避免格式转换后文件反而膨胀
export const chooseCompressionOutput = (input: CompressionOutputInput): CompressionOutputDecision => {
  if (input.encodedSize >= input.originalSize) {
    return {
      outputSize: input.originalSize,
      outputType: input.originalType,
      outputPath: input.relativePath,
      savingsPercent: 0,
      useOriginal: true,
    }
  }

  return {
    outputSize: input.encodedSize,
    outputType: input.encodedType,
    outputPath: getOutputPath(input.relativePath, input.encodedType),
    savingsPercent: Math.max(0, Math.round(((input.originalSize - input.encodedSize) / input.originalSize) * 100)),
    useOriginal: false,
  }
}

// 对同一批图片按路径与文件信息去重，并创建页面可直接处理的任务模型
export const createCompressionTasks = (
  importedFiles: ImportedCompressionFile[],
  createPreviewUrl: (file: File) => string = URL.createObjectURL,
): CompressionTask[] => importedFiles.filter((item, index, all) => all.findIndex(other => (
  other.relativePath === item.relativePath
  && other.file.size === item.file.size
  && other.file.lastModified === item.file.lastModified
)) === index).map((item, index) => ({
  ...item,
  id: `image-${index}`,
  originalSize: item.file.size,
  previewUrl: createPreviewUrl(item.file),
  status: 'pending',
  outputBlob: null,
  outputSize: 0,
  outputType: item.file.type,
  outputPath: item.relativePath,
  savingsPercent: 0,
  useOriginal: false,
}))

// 以 B、KB、MB、GB 展示紧凑且可比较的文件体积
export const formatCompressionFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  const size = bytes / (1024 ** (unitIndex + 1))
  return `${Number(size.toFixed(2))} ${units[unitIndex]}`
}
