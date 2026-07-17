import { describe, expect, it } from 'vitest'

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
