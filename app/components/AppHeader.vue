<script setup lang="ts">
import { THEME_PRESETS } from '~/config/themes'

const route = useRoute()
const settingsOpen = ref(false)
const searchOpen = useToolSearch()
const themeOpen = ref(false)
const themeButtonRef = ref<HTMLButtonElement | null>(null)
const themePanelRef = ref<HTMLDivElement | null>(null)
const { themeId, applyTheme, hydrateTheme } = useTheme()

const navItems = [
  { label: '全部工具', to: '/' },
  { label: '图片工具', to: '/#tools' },
]

const isActive = (to: string) => to === '/' && route.path === '/'

// 提供全站快捷键打开功能搜索，避免在输入框中拦截普通按键
const handleSearchShortcut = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  const editing = target?.matches('input, textarea, select, [contenteditable="true"]')
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    searchOpen.value = true
  } else if (!editing && event.key === '/') {
    event.preventDefault()
    searchOpen.value = true
  }
}

// 点击主题弹层外部时收起
const handlePointerDown = (event: PointerEvent) => {
  if (!themeOpen.value) return
  const target = event.target as Node | null
  if (themeButtonRef.value?.contains(target) || themePanelRef.value?.contains(target)) return
  themeOpen.value = false
}

// Esc 收起主题弹层
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') themeOpen.value = false
}

const chooseTheme = (themeIdToApply: string) => {
  applyTheme(themeIdToApply)
  themeOpen.value = false
}

onMounted(() => {
  hydrateTheme()
  window.addEventListener('keydown', handleSearchShortcut)
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSearchShortcut)
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner page-container">
      <NuxtLink class="brand" to="/" aria-label="Web Toolbox 首页">
        <span class="brand__mark" aria-hidden="true">W</span>
        <span>Web Toolbox</span>
      </NuxtLink>

      <div class="site-header__actions">
        <button class="search-trigger" type="button" aria-label="搜索项目功能" @click="searchOpen = true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
          <span>搜索功能</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav class="site-nav" aria-label="主导航">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :class="['site-nav__link', { 'site-nav__link--active': isActive(item.to) }]"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="theme-switcher">
          <button
            ref="themeButtonRef"
            class="theme-trigger"
            :class="{ 'theme-trigger--open': themeOpen }"
            type="button"
            :aria-expanded="themeOpen"
            aria-haspopup="true"
            aria-label="切换主题"
            @click="themeOpen = !themeOpen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.55-.22-1.05-.6-1.4a2 2 0 0 1-.4-2.3 2 2 0 0 1 1.8-1.1H17a5 5 0 0 0 4-8.1A9.7 9.7 0 0 0 12 3Z" />
              <circle cx="7.5" cy="12" r="1.2" class="theme-trigger__dot" />
              <circle cx="9.5" cy="7.5" r="1.2" class="theme-trigger__dot" />
              <circle cx="14.5" cy="7" r="1.2" class="theme-trigger__dot" />
            </svg>
            <span>主题</span>
          </button>

          <Transition name="theme-pop">
            <div v-if="themeOpen" ref="themePanelRef" class="theme-popover" role="menu" aria-label="选择主题">
              <p class="theme-popover__title">换肤</p>
              <button
                v-for="theme in THEME_PRESETS"
                :key="theme.id"
                type="button"
                role="menuitemradio"
                :class="['theme-popover__item', { 'theme-popover__item--active': themeId === theme.id }]"
                :aria-checked="themeId === theme.id"
                @click="chooseTheme(theme.id)"
              >
                <span class="theme-popover__swatch" :style="{ background: `linear-gradient(135deg, ${theme.colors.background} 55%, ${theme.colors.button} 55%)` }" />
                <span class="theme-popover__copy">
                  <strong>{{ theme.name }}</strong>
                  <small>{{ theme.description }}</small>
                </span>
                <span v-if="themeId === theme.id" class="theme-popover__check" aria-hidden="true">✓</span>
              </button>
            </div>
          </Transition>
        </div>

        <button class="settings-trigger" type="button" aria-label="打开设置" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
            <path d="M19 13.2v-2.4l-2.03-.72a7.1 7.1 0 0 0-.62-1.5l.93-1.95-1.7-1.7-1.95.93a7.1 7.1 0 0 0-1.5-.62L11.4 3H9l-.72 2.03a7.1 7.1 0 0 0-1.5.62l-1.95-.93-1.7 1.7.93 1.95a7.1 7.1 0 0 0-.62 1.5L1.4 10.6V13l2.03.72c.14.53.35 1.03.62 1.5l-.93 1.95 1.7 1.7 1.95-.93c.47.27.97.48 1.5.62L9 18.6h2.4l.72-2.03c.53-.14 1.03-.35 1.5-.62l1.95.93 1.7-1.7-.93-1.95c.27-.47.48-.97.62-1.5L19 13.2Z" />
          </svg>
          <span>设置</span>
        </button>
      </div>
    </div>
  </header>

  <AppSettingsPanel v-model="settingsOpen" />
  <ToolSearchModal v-model="searchOpen" />
</template>

<style scoped>
.theme-switcher {
  position: relative;
}

.theme-trigger {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}

.theme-trigger:hover,
.theme-trigger--open {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.theme-trigger svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.theme-trigger__dot {
  fill: currentColor;
  stroke: none;
}

.theme-popover {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 30;
  display: grid;
  width: 264px;
  gap: 4px;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  padding: 10px;
  background: var(--color-surface);
  box-shadow: 0 18px 48px -18px rgb(0 0 0 / 28%);
}

.theme-popover__title {
  margin: 2px 6px 6px;
  color: var(--color-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.theme-popover__item {
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 140ms ease, border-color 140ms ease;
}

.theme-popover__item:hover {
  border-color: var(--color-line);
  background: var(--color-bg);
}

.theme-popover__item--active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.theme-popover__swatch {
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: 10px;
}

.theme-popover__copy {
  min-width: 0;
}

.theme-popover__copy strong {
  display: block;
  font-size: 12px;
  font-weight: 650;
}

.theme-popover__copy small {
  display: block;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-popover__check {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  color: var(--color-accent-text);
  background: var(--color-accent);
  font-size: 10px;
}

.theme-pop-enter-active,
.theme-pop-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.theme-pop-enter-from,
.theme-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (max-width: 640px) {
  .theme-trigger {
    width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 0;
  }

  .theme-trigger span {
    display: none;
  }

  .theme-popover {
    right: -12px;
    width: min(264px, calc(100vw - 32px));
  }
}
</style>
