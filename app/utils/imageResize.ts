import { getOutputPath } from './imageCompression'

export type ResizeFormat = 'original' | 'webp' | 'jpeg' | 'png'
export type ResizeStatus = 'pending' | 'resizing' | 'success' | 'failed'

export interface ImportedResizeFile {
  file: File
  relativePath: string
}

export interface ResizeTask extends ImportedResizeFile {
  id: string
  originalSize: number
  previewUrl: string
  sourceWidth: number | null
  sourceHeight: number | null
  outputWidth: number | null
  outputHeight: number | null
  status: ResizeStatus
  outputBlob: Blob | null
  outputSize: number
  outputType: string
  outputPath: string
  error?: string
}

const MIME_BY_FORMAT: Record<Exclude<ResizeFormat, 'original'>, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(?:avif|jpe?g|png|webp)$/i

// 与压缩工具保持同一可解码集合：AVIF、JPEG、PNG、WebP
export const isSupportedResizeFile = (file: File) => (
  ['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  || (!file.type && SUPPORTED_IMAGE_EXTENSION_PATTERN.test(file.name))
)

// 将用户选择的输出格式转换为实际编码 MIME，保持原格式时沿用源文件类型
export const resolveResizeTargetMimeType = (originalType: string, format: ResizeFormat) => (
  format === 'original' ? originalType : MIME_BY_FORMAT[format]
)

export interface ResizeSettings {
  targetWidth: number
  targetHeight: number
  keepAspectRatio: boolean
  format: ResizeFormat
  quality: number
}

export interface ResizeDimensions {
  width: number
  height: number
}

const clampPixel = (value: number, max = 16384) => Math.min(Math.max(1, Math.round(value)), max)

// 校验并规范化目标像素输入，非法输入直接抛错供页面提示
export const normalizeResizeTarget = (width: number, height: number): ResizeDimensions => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('目标尺寸必须为数字')
  }
  if (width < 1 || height < 1) {
    throw new Error('目标宽高至少为 1 像素')
  }
  return { width: clampPixel(width), height: clampPixel(height) }
}

/**
 * 计算单张图片的输出尺寸：
 * - keepAspectRatio 为 true 时按「contain」等比缩放到目标框内（2000×2000 → 500×500、2000×1000 → 1000×500）；
 * - keepAspectRatio 为 false 时强制输出为精确的目标宽高。
 */
export const computeResizeDimensions = (
  source: { width: number, height: number },
  target: { width: number, height: number },
  keepAspectRatio: boolean,
): ResizeDimensions => {
  const normalizedTarget = normalizeResizeTarget(target.width, target.height)
  if (!keepAspectRatio) {
    return { ...normalizedTarget }
  }
  const scale = Math.min(normalizedTarget.width / source.width, normalizedTarget.height / source.height)
  return {
    width: clampPixel(source.width * scale),
    height: clampPixel(source.height * scale),
  }
}

// 对同一批图片按路径与文件信息去重，并创建页面可直接处理的任务模型
export const createResizeTasks = (
  importedFiles: ImportedResizeFile[],
  createPreviewUrl: (file: File) => string = URL.createObjectURL,
): ResizeTask[] => importedFiles.filter((item, index, all) => all.findIndex(other => (
  other.relativePath === item.relativePath
  && other.file.size === item.file.size
  && other.file.lastModified === item.file.lastModified
)) === index).map((item, index) => ({
  ...item,
  id: `resize-${index}`,
  originalSize: item.file.size,
  previewUrl: createPreviewUrl(item.file),
  sourceWidth: null,
  sourceHeight: null,
  outputWidth: null,
  outputHeight: null,
  status: 'pending',
  outputBlob: null,
  outputSize: 0,
  outputType: item.file.type,
  outputPath: item.relativePath,
}))

// 读取图片的原始像素尺寸，用于预览输出尺寸与等比换算
export const resolveImageDimensions = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

// 按输出格式替换扩展名，同时保留原始相对目录
export const getResizeOutputPath = (relativePath: string, mimeType: string) => getOutputPath(relativePath, mimeType)
