import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_ID, getThemeById, THEME_PRESETS } from '../app/config/themes'

const REQUIRED_COLOR_KEYS = [
  'background',
  'surface',
  'surfaceElevated',
  'text',
  'muted',
  'border',
  'button',
  'buttonHover',
  'buttonText',
  'soft',
] as const

describe('主题预设', () => {
  it('包含亮色、暗色及三种指定彩色主题', () => {
    expect(THEME_PRESETS.map(theme => theme.id)).toEqual(expect.arrayContaining([
      'light',
      'dark',
      'sakura',
      'sky',
      'grass',
    ]))
  })

  it.each(THEME_PRESETS.map(theme => [theme.id, theme.colors] as const))(
    '%s 主题提供完整颜色令牌',
    (_id, colors) => {
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(colors[key]).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
      }
    },
  )

  it('未知主题回退到默认主题', () => {
    expect(getThemeById('missing').id).toBe(DEFAULT_THEME_ID)
  })

  it('暗色主题明确标记为 dark color scheme', () => {
    expect(getThemeById('dark').colorScheme).toBe('dark')
  })
})
