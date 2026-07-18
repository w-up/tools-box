import type { ImageAsset, ImageFingerprint, ImportedFile, SamplingRegionKey } from '~/types/image-matching'

const SAMPLING_REGIONS: Array<{
  key: SamplingRegionKey
  x: number
  y: number
  width: number
  height: number
}> = [
  { key: 'TL', x: 0.125, y: 0.125, width: 0.35, height: 0.35 },
  { key: 'TR', x: 0.525, y: 0.125, width: 0.35, height: 0.35 },
  { key: 'BL', x: 0.125, y: 0.525, width: 0.35, height: 0.35 },
  { key: 'BR', x: 0.525, y: 0.525, width: 0.35, height: 0.35 },
  { key: 'C', x: 0.325, y: 0.325, width: 0.35, height: 0.35 },
]

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('当前浏览器无法创建 Canvas 2D context')
  }
  return { canvas, context }
}

// 将透明像素按白底合成后生成区域平均哈希
const createRegionHash = (
  image: ImageBitmap,
  region: typeof SAMPLING_REGIONS[number],
) => {
  const { context } = createCanvas(8, 8)
  context.fillStyle = '#fff'
  context.fillRect(0, 0, 8, 8)
  context.drawImage(
    image,
    image.width * region.x,
    image.height * region.y,
    image.width * region.width,
    image.height * region.height,
    0,
    0,
    8,
    8,
  )

  const data = context.getImageData(0, 0, 8, 8).data
  const grays: number[] = []
  let total = 0
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    const gray = red * 0.299 + green * 0.587 + blue * 0.114
    grays.push(gray)
    total += gray
  }
  const average = total / grays.length
  return grays.map(gray => gray >= average ? '1' : '0').join('')
}

// 提取整图颜色、色彩方差和透明覆盖率
const createColorFeatures = (image: ImageBitmap) => {
  const { context } = createCanvas(32, 32)
  context.clearRect(0, 0, 32, 32)
  context.drawImage(image, 0, 0, 32, 32)
  const data = context.getImageData(0, 0, 32, 32).data

  let opaqueCount = 0
  let totalAlpha = 0
  let red = 0
  let green = 0
  let blue = 0
  const colors: Array<[number, number, number]> = []

  for (let index = 0; index < data.length; index += 4) {
    const sourceRed = data[index] ?? 0
    const sourceGreen = data[index + 1] ?? 0
    const sourceBlue = data[index + 2] ?? 0
    const alpha = (data[index + 3] ?? 0) / 255
    totalAlpha += alpha
    if (alpha <= 0.02) continue
    opaqueCount += 1
    red += sourceRed * alpha
    green += sourceGreen * alpha
    blue += sourceBlue * alpha
    colors.push([sourceRed, sourceGreen, sourceBlue])
  }

  const divisor = Math.max(totalAlpha, 1)
  const averageColor: [number, number, number] = [
    Math.round(red / divisor),
    Math.round(green / divisor),
    Math.round(blue / divisor),
  ]
  const variance = colors.length === 0
    ? 0
    : colors.reduce((total, color) => {
      const [currentRed, currentGreen, currentBlue] = color
      return total + (
        (currentRed - averageColor[0]) ** 2
        + (currentGreen - averageColor[1]) ** 2
        + (currentBlue - averageColor[2]) ** 2
      ) / 3
    }, 0) / colors.length

  return {
    averageColor,
    colorVariance: Math.round(variance),
    alphaCoverage: Number((opaqueCount / (32 * 32)).toFixed(4)),
  }
}

// 在浏览器本地提取图片指纹，不产生网络请求
export const createImageFingerprint = async (file: File): Promise<{
  width: number
  height: number
  contentHash: string
  fingerprint: ImageFingerprint
}> => {
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const regions = Object.fromEntries(
      SAMPLING_REGIONS.map(region => [region.key, createRegionHash(image, region)]),
    ) as ImageFingerprint['regions']
    const colorFeatures = createColorFeatures(image)
    const { context } = createCanvas(image.width, image.height)
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    const pixelDigest = await crypto.subtle.digest('SHA-256', pixels)

    return {
      width: image.width,
      height: image.height,
      contentHash: Array.from(new Uint8Array(pixelDigest), byte => byte.toString(16).padStart(2, '0')).join(''),
      fingerprint: {
        regions,
        ...colorFeatures,
        aspectRatio: image.width / image.height,
      },
    }
  } finally {
    image.close()
  }
}

// 将用户导入文件转换为可匹配图片资产
export const createImageAsset = async (
  imported: ImportedFile,
  batch: 'A' | 'B',
  index: number,
): Promise<ImageAsset> => {
  const analyzed = await createImageFingerprint(imported.file)
  return {
    id: `${batch}-${index}-${imported.file.lastModified}-${imported.file.size}`,
    file: imported.file,
    name: imported.file.name,
    relativePath: imported.relativePath,
    width: analyzed.width,
    height: analyzed.height,
    size: imported.file.size,
    contentHash: analyzed.contentHash,
    previewUrl: URL.createObjectURL(imported.file),
    fingerprint: analyzed.fingerprint,
  }
}
