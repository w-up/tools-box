import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  chooseCompressionOutput,
  createCompressionTasks,
  formatCompressionFileSize,
  getOutputPath,
  isSupportedCompressionFile,
  resolveUniqueOutputPath,
  resolveTargetMimeType,
} from '../app/utils/imageCompression'

describe('图片压缩输出规则', () => {
  it('按实际输出 MIME 更新扩展名并保留原目录', () => {
    expect(getOutputPath('assets/banner.hero.png', 'image/webp')).toBe('assets/banner.hero.webp')
    expect(getOutputPath('images/photo.webp', 'image/jpeg')).toBe('images/photo.jpg')
  })

  it('保持原格式时沿用导入图片的 MIME', () => {
    expect(resolveTargetMimeType('image/png', 'original')).toBe('image/png')
    expect(resolveTargetMimeType('image/png', 'avif')).toBe('image/avif')
  })

  it('编码结果没有变小时保留原图、原路径和原 MIME', () => {
    expect(chooseCompressionOutput({
      originalSize: 1024,
      encodedSize: 1200,
      originalType: 'image/png',
      encodedType: 'image/webp',
      relativePath: 'icons/logo.png',
    })).toEqual({
      outputSize: 1024,
      outputType: 'image/png',
      outputPath: 'icons/logo.png',
      savingsPercent: 0,
      useOriginal: true,
    })
  })

  it('编码结果变小时采用新格式并计算节省比例', () => {
    expect(chooseCompressionOutput({
      originalSize: 1000,
      encodedSize: 640,
      originalType: 'image/png',
      encodedType: 'image/avif',
      relativePath: 'icons/logo.png',
    })).toEqual({
      outputSize: 640,
      outputType: 'image/avif',
      outputPath: 'icons/logo.avif',
      savingsPercent: 36,
      useOriginal: false,
    })
  })

  it('按相对路径、大小和修改时间去重导入图片', () => {
    const first = new File(['a'], 'logo.png', { type: 'image/png', lastModified: 10 })
    const duplicate = new File(['a'], 'logo.png', { type: 'image/png', lastModified: 10 })
    const second = new File(['bb'], 'banner.jpg', { type: 'image/jpeg', lastModified: 20 })

    expect(createCompressionTasks([
      { file: first, relativePath: 'images/logo.png' },
      { file: duplicate, relativePath: 'images/logo.png' },
      { file: second, relativePath: 'images/banner.jpg' },
    ], () => 'preview')).toEqual([
      expect.objectContaining({ id: 'image-0', relativePath: 'images/logo.png', originalSize: 1, previewUrl: 'preview', status: 'pending' }),
      expect.objectContaining({ id: 'image-1', relativePath: 'images/banner.jpg', originalSize: 2, previewUrl: 'preview', status: 'pending' }),
    ])
  })

  it('图片 MIME 缺失时按扩展名识别支持格式', () => {
    expect(isSupportedCompressionFile(new File(['avif'], 'cover.avif'))).toBe(true)
    expect(isSupportedCompressionFile(new File(['svg'], 'icon.svg', { type: 'image/svg+xml' }))).toBe(false)
  })

  it('以紧凑单位显示文件体积', () => {
    expect(formatCompressionFileSize(1024)).toBe('1 KB')
    expect(formatCompressionFileSize(1536)).toBe('1.5 KB')
  })

  it('批量转换发生同名冲突时追加序号', () => {
    const usedPaths = new Set(['images/logo.webp', 'images/logo-2.webp'])
    expect(resolveUniqueOutputPath('images/logo.webp', usedPaths)).toBe('images/logo-3.webp')
  })
})

describe('图片压缩运行时配置', () => {
  it('WASM 失败后重新读取像素再进入 Canvas 兜底', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/tools/image-compressor.vue'), 'utf8')

    expect(source).toContain('encodeWithCanvas(await readImageData(file), mimeType)')
  })

  it('预构建 JSZip 并确保 Worker 不依赖运行时 CDN', () => {
    const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')
    const worker = readFileSync(resolve(process.cwd(), 'app/workers/imageCompression.worker.ts'), 'utf8')

    expect(config).toContain("include: ['jszip']")
    expect(worker).not.toMatch(/https?:\/\/|importScripts/)
  })
})
