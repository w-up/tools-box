import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_ID, getThemeById } from '../app/config/themes'
import { createThemeBootstrapScript } from '../app/config/themeBootstrap'

const executeThemeBootstrap = (storedThemeId: string | null) => {
  const properties = new Map<string, string>()
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      colorScheme: '',
      setProperty: (name: string, value: string) => properties.set(name, value),
    },
  }

  runInNewContext(createThemeBootstrapScript(), {
    document: { documentElement: root },
    localStorage: { getItem: () => storedThemeId },
  })

  return { properties, root }
}

describe('主题首屏恢复脚本', () => {
  it('在客户端应用启动前恢复已保存主题', () => {
    const { properties, root } = executeThemeBootstrap('dark')
    const darkTheme = getThemeById('dark')

    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(properties.get('--color-bg')).toBe(darkTheme.colors.background)
    expect(properties.get('--color-text')).toBe(darkTheme.colors.text)
    expect(properties.get('--color-accent')).toBe(darkTheme.colors.button)
  })

  it('遇到无效主题时在首屏应用默认主题', () => {
    const { properties, root } = executeThemeBootstrap('missing')
    const defaultTheme = getThemeById(DEFAULT_THEME_ID)

    expect(root.dataset.theme).toBe(DEFAULT_THEME_ID)
    expect(root.style.colorScheme).toBe(defaultTheme.colorScheme)
    expect(properties.get('--color-bg')).toBe(defaultTheme.colors.background)
  })
})
