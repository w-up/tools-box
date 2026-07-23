import encodeAvif from '@jsquash/avif/encode'
import encodeJpeg from '@jsquash/jpeg/encode'
import encodeWebp from '@jsquash/webp/encode'

interface EncodeRequest {
  id: string
  imageData: ImageData
  quality: number
  mimeType: 'image/avif' | 'image/jpeg' | 'image/webp'
}

interface EncodeResponse {
  id: string
  success: boolean
  buffer?: ArrayBuffer
  mimeType?: string
  error?: string
}

// 在独立 Worker 中调用本地打包的 jSquash WASM 编码器，避免阻塞页面交互
self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { id, imageData, quality, mimeType } = event.data
  try {
    let buffer: ArrayBuffer
    if (mimeType === 'image/avif') {
      buffer = await encodeAvif(imageData, {
        quality,
        qualityAlpha: quality,
        lossless: false,
        speed: 6,
        subsample: 1,
      })
    } else if (mimeType === 'image/jpeg') {
      buffer = await encodeJpeg(imageData, { quality })
    } else {
      buffer = await encodeWebp(imageData, { quality, method: 4 })
    }

    const response: EncodeResponse = { id, success: true, buffer, mimeType }
    self.postMessage(response, { transfer: [buffer] })
  } catch (error) {
    const response: EncodeResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'WASM 编码失败',
    }
    self.postMessage(response)
  }
}
