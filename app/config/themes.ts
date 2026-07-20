export type ThemeId = 'light' | 'dark' | 'sakura' | 'sky' | 'grass'

export interface ThemeColors {
  background: string
  surface: string
  surfaceElevated: string
  text: string
  muted: string
  border: string
  button: string
  buttonHover: string
  buttonText: string
  soft: string
}

export interface ThemePreset {
  id: ThemeId
  name: string
  description: string
  colorScheme: 'light' | 'dark'
  colors: ThemeColors
}

export const DEFAULT_THEME_ID: ThemeId = 'light'
export const THEME_STORAGE_KEY = 'web-toolbox-theme'

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'light',
    name: '明亮白',
    description: '冷静、干净的浅色工作区',
    colorScheme: 'light',
    colors: {
      background: '#f4f6f8',
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      text: '#18202a',
      muted: '#697386',
      border: '#dce1e8',
      button: '#4f5bd5',
      buttonHover: '#3f49bd',
      buttonText: '#ffffff',
      soft: '#eef0ff',
    },
  },
  {
    id: 'dark',
    name: '深夜黑',
    description: '低眩光的深色专注模式',
    colorScheme: 'dark',
    colors: {
      background: '#0b0d12',
      surface: '#12151c',
      surfaceElevated: '#191d27',
      text: '#f2f4f7',
      muted: '#aeb5c2',
      border: '#394150',
      button: '#717cff',
      buttonHover: '#8790ff',
      buttonText: '#ffffff',
      soft: '#242b52',
    },
  },
  {
    id: 'sakura',
    name: '樱花粉',
    description: '柔和、轻盈的暖粉主题',
    colorScheme: 'light',
    colors: {
      background: '#fff7fa',
      surface: '#ffffff',
      surfaceElevated: '#fffafd',
      text: '#392731',
      muted: '#866b79',
      border: '#f1cedc',
      button: '#e66d9a',
      buttonHover: '#d65385',
      buttonText: '#ffffff',
      soft: '#fde7f0',
    },
  },
  {
    id: 'sky',
    name: '天空蓝',
    description: '清透、明快的蓝色主题',
    colorScheme: 'light',
    colors: {
      background: '#f3faff',
      surface: '#ffffff',
      surfaceElevated: '#f9fdff',
      text: '#183044',
      muted: '#627b90',
      border: '#c9e3f4',
      button: '#3d9ddd',
      buttonHover: '#2587ca',
      buttonText: '#ffffff',
      soft: '#dff2ff',
    },
  },
  {
    id: 'grass',
    name: '嫩草绿',
    description: '清新、舒缓的绿色主题',
    colorScheme: 'light',
    colors: {
      background: '#f5fbf3',
      surface: '#ffffff',
      surfaceElevated: '#fafff8',
      text: '#243627',
      muted: '#69816d',
      border: '#cee5ca',
      button: '#63ae59',
      buttonHover: '#4b9643',
      buttonText: '#ffffff',
      soft: '#e5f5e1',
    },
  },
]

export const getThemeById = (id: string | null | undefined) => (
  THEME_PRESETS.find(theme => theme.id === id)
  ?? THEME_PRESETS.find(theme => theme.id === DEFAULT_THEME_ID)!
)
