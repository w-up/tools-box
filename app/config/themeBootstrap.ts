import { DEFAULT_THEME_ID, THEME_PRESETS, THEME_STORAGE_KEY } from './themes'

const THEME_BOOTSTRAP_DATA = Object.fromEntries(THEME_PRESETS.map(theme => [theme.id, {
  colorScheme: theme.colorScheme,
  colors: theme.colors,
}]))

// 生成阻塞式首屏脚本，在 CSS 绘制页面前恢复本地主题
export const createThemeBootstrapScript = () => `(()=>{try{const themes=${JSON.stringify(THEME_BOOTSTRAP_DATA)};const saved=localStorage.getItem('${THEME_STORAGE_KEY}');const id=Object.prototype.hasOwnProperty.call(themes,saved)?saved:'${DEFAULT_THEME_ID}';const theme=themes[id];const root=document.documentElement;root.dataset.theme=id;root.style.colorScheme=theme.colorScheme;const colors=theme.colors;root.style.setProperty('--color-bg',colors.background);root.style.setProperty('--color-surface',colors.surface);root.style.setProperty('--color-surface-elevated',colors.surfaceElevated);root.style.setProperty('--color-text',colors.text);root.style.setProperty('--color-muted',colors.muted);root.style.setProperty('--color-line',colors.border);root.style.setProperty('--color-accent',colors.button);root.style.setProperty('--color-accent-hover',colors.buttonHover);root.style.setProperty('--color-accent-text',colors.buttonText);root.style.setProperty('--color-accent-soft',colors.soft)}catch{}})()`
