import { DEFAULT_THEME_ID, getThemeById, type ThemeId } from '~/config/themes'

const STORAGE_KEY = 'web-toolbox-theme'

export const useTheme = () => {
  const themeId = useState<ThemeId>('theme-id', () => DEFAULT_THEME_ID)
  const hydrated = useState('theme-hydrated', () => false)
  const currentTheme = computed(() => getThemeById(themeId.value))

  // 把主题令牌同步到根元素，保证所有页面和弹窗统一换色
  const applyTheme = (nextThemeId: string, persist = true) => {
    const theme = getThemeById(nextThemeId)
    themeId.value = theme.id
    if (!import.meta.client) return

    const root = document.documentElement
    root.dataset.theme = theme.id
    root.style.colorScheme = theme.colorScheme
    root.style.setProperty('--color-bg', theme.colors.background)
    root.style.setProperty('--color-surface', theme.colors.surface)
    root.style.setProperty('--color-surface-elevated', theme.colors.surfaceElevated)
    root.style.setProperty('--color-text', theme.colors.text)
    root.style.setProperty('--color-muted', theme.colors.muted)
    root.style.setProperty('--color-line', theme.colors.border)
    root.style.setProperty('--color-accent', theme.colors.button)
    root.style.setProperty('--color-accent-hover', theme.colors.buttonHover)
    root.style.setProperty('--color-accent-text', theme.colors.buttonText)
    root.style.setProperty('--color-accent-soft', theme.colors.soft)

    if (persist) localStorage.setItem(STORAGE_KEY, theme.id)
  }

  const hydrateTheme = () => {
    if (!import.meta.client || hydrated.value) return
    applyTheme(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID, false)
    hydrated.value = true
  }

  return {
    themeId,
    currentTheme,
    applyTheme,
    hydrateTheme,
  }
}
