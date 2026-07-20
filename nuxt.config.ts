import { createThemeBootstrapScript } from './app/config/themeBootstrap'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: true,
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'Web Toolbox',
      meta: [
        { name: 'description', content: '轻量、安全、直接在浏览器中运行的网页工具箱。' },
        { name: 'theme-color', content: '#f5f5f2' },
      ],
      script: [
        { textContent: createThemeBootstrapScript() },
      ],
    },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes: ['/', '/tools/image-compressor', '/tools/image-compare-rename', '/tools/image-asset-migration'],
    },
  },
})
