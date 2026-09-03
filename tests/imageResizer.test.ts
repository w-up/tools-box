import { describe, expect, it } from 'vitest'

import {
  computeResizeDimensions,
  createResizeTasks,
  isSupportedResizeFile,
  normalizeResizeTarget,
  resolveResizeTargetMimeType,
} from '../app/utils/imageResize'

const makeFile = (name: string, type: string) => new File(['x'], name, { type, lastModified: 1 })

describe('图片批量缩放工具', () => {
  it('仅接收可解码导出的位图格式', () => {
    expect(isSupportedResizeFile(makeFile('a.png', 'image/png'))).toBe(true)
    expect(isSupportedResizeFile(makeFile('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isSupportedResizeFile(makeFile('a.webp', 'image/webp'))).toBe(true)
    expect(isSupportedResizeFile(makeFile('a.avif', 'image/avif'))).toBe(true)
    expect(isSupportedResizeFile(makeFile('a.exe', 'application/octet-stream'))).toBe(false)
    // 无 MIME 时回退按扩展名判断
    expect(isSupportedResizeFile(makeFile('b.webp', ''))).toBe(true)
    expect(isSupportedResizeFile(makeFile('b.txt', ''))).toBe(false)
  })

  it('按用户设置解析输出格式对应的 MIME', () => {
    expect(resolveResizeTargetMimeType('image/png', 'original')).toBe('image/png')
    expect(resolveResizeTargetMimeType('image/jpeg', 'original')).toBe('image/jpeg')
    expect(resolveResizeTargetMimeType('image/png', 'webp')).toBe('image/webp')
    expect(resolveResizeTargetMimeType('image/png', 'jpeg')).toBe('image/jpeg')
    expect(resolveResizeTargetMimeType('image/png', 'png')).toBe('image/png')
  })

  it('拒绝非法的目标像素输入', () => {
    expect(() => normalizeResizeTarget(0, 500)).toThrow()
    expect(() => normalizeResizeTarget(500, -1)).toThrow()
    expect(() => normalizeResizeTarget(Number.NaN, 500)).toThrow()
    expect(normalizeResizeTarget(500.4, 500.6)).toEqual({ width: 500, height: 501 })
  })

  it('保持比例时按目标框等比缩放（contain）', () => {
    // 用户示例：2000×2000 → 500×500
    expect(computeResizeDimensions(
      { width: 2000, height: 2000 },
      { width: 500, height: 500 },
      true,
    )).toEqual({ width: 500, height: 500 })
    // 用户示例：2000×1000 → 1000×500
    expect(computeResizeDimensions(
      { width: 2000, height: 1000 },
      { width: 1000, height: 500 },
      true,
    )).toEqual({ width: 1000, height: 500 })
    // 目标框比例与原图不一致时取较短边
    expect(computeResizeDimensions(
      { width: 2000, height: 1000 },
      { width: 500, height: 500 },
      true,
    )).toEqual({ width: 500, height: 250 })
    expect(computeResizeDimensions(
      { width: 1000, height: 2000 },
      { width: 500, height: 500 },
      true,
    )).toEqual({ width: 250, height: 500 })
  })

  it('不保持比例时强制输出目标宽高', () => {
    expect(computeResizeDimensions(
      { width: 2000, height: 1000 },
      { width: 500, height: 500 },
      false,
    )).toEqual({ width: 500, height: 500 })
  })

  it('等比缩放支持放大并保证结果至少 1 像素', () => {
    expect(computeResizeDimensions(
      { width: 100, height: 50 },
      { width: 1000, height: 1000 },
      true,
    )).toEqual({ width: 1000, height: 500 })
    expect(computeResizeDimensions(
      { width: 3, height: 1 },
      { width: 1, height: 1 },
      true,
    )).toEqual({ width: 1, height: 1 })
  })

  it('创建任务时保留路径并初始化输出字段', () => {
    const tasks = createResizeTasks([
      { file: makeFile('a.png', 'image/png'), relativePath: 'a.png' },
      { file: makeFile('a.png', 'image/png'), relativePath: 'a.png' },
      { file: makeFile('nested/b.jpg', 'image/jpeg'), relativePath: 'nested/b.jpg' },
    ], () => 'blob:preview')

    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      relativePath: 'a.png',
      originalSize: 1,
      previewUrl: 'blob:preview',
      status: 'pending',
      outputBlob: null,
      outputPath: 'a.png',
      sourceWidth: null,
    })
  })
})
