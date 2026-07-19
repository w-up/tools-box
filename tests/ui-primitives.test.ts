import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { clampToViewport, resolveTipsPlacement } from '../app/utils/uiPosition'
import { createToastRecord, DEFAULT_TOAST_DURATION } from '../app/utils/uiToast'

describe('UiTips 位置计算', () => {
  it('自动位置优先选择空间足够的一侧', () => {
    expect(resolveTipsPlacement({
      requested: 'auto',
      trigger: { top: 180, right: 240, bottom: 220, left: 200, width: 40, height: 40 },
      panel: { width: 180, height: 120 },
      viewport: { width: 440, height: 320 },
      offset: 10,
    })).toBe('top')
  })

  it('把弹层坐标限制在视口安全边距内', () => {
    expect(clampToViewport(-20, 500, 180, 440, 8)).toEqual({ left: 8, top: 252 })
  })
})

describe('UiToast 记录', () => {
  it('生成具备稳定默认值的通知记录', () => {
    expect(createToastRecord({ message: '保存成功', type: 'success' }, 'toast-1')).toEqual({
      id: 'toast-1',
      message: '保存成功',
      type: 'success',
      duration: DEFAULT_TOAST_DURATION,
    })
  })

  it('允许持久通知使用 0 duration', () => {
    expect(createToastRecord({ message: '处理中', duration: 0 }, 'toast-2').duration).toBe(0)
  })
})

describe('UiSelect 下拉层', () => {
  it('通过 Teleport 脱离卡片 overflow 裁剪并使用 fixed 定位', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/ui/UiSelect.vue'), 'utf8')
    expect(source).toContain('<Teleport to="body">')
    expect(source).toContain('position:fixed')
  })

  it('图片选项通过高层级 UiTips 同时预览图片和文件名', () => {
    const selectSource = readFileSync(resolve(process.cwd(), 'app/components/ui/UiSelect.vue'), 'utf8')
    const tipsSource = readFileSync(resolve(process.cwd(), 'app/components/ui/UiTips.vue'), 'utf8')
    const matchSource = readFileSync(resolve(process.cwd(), 'app/components/image-rename/MatchResultItem.vue'), 'utf8')

    expect(selectSource).toContain('imageUrl?: string')
    expect(selectSource).toContain('<template v-if="option.imageUrl" #content>')
    expect(selectSource).toContain(':src="option.imageUrl"')
    expect(matchSource).toContain('imageUrl: asset.previewUrl')
    expect(tipsSource).toContain('z-index: 320')
  })
})

describe('图片匹配预览', () => {
  it('参考图、项目图和大图对比优先完整显示并允许容器留白', () => {
    const matchSource = readFileSync(resolve(process.cwd(), 'app/components/image-rename/MatchResultItem.vue'), 'utf8')
    const compareSource = readFileSync(resolve(process.cwd(), 'app/components/image-rename/ImageCompareModal.vue'), 'utf8')
    const selectSource = readFileSync(resolve(process.cwd(), 'app/components/ui/UiSelect.vue'), 'utf8')

    expect(matchSource).toContain('object-fit: contain;')
    expect(matchSource).toContain('object-position: center;')
    expect(compareSource).toContain('object-fit: contain;')
    expect(compareSource).toContain('object-position: center;')
    expect(selectSource).toContain('object-fit:contain; object-position:center;')
    expect(matchSource).not.toContain('object-fit: cover;')
    expect(compareSource).not.toContain('object-fit: cover;')
  })
})
