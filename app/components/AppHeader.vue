<script setup lang="ts">
const route = useRoute()
const settingsOpen = ref(false)
const { hydrateTheme } = useTheme()

const navItems = [
  { label: '全部工具', to: '/' },
  { label: '图片工具', to: '/#image-tools' },
]

const isActive = (to: string) => to === '/' && route.path === '/'

onMounted(hydrateTheme)
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner page-container">
      <NuxtLink class="brand" to="/" aria-label="Web Toolbox 首页">
        <span class="brand__mark" aria-hidden="true">W</span>
        <span>Web Toolbox</span>
      </NuxtLink>

      <div class="site-header__actions">
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
</template>
