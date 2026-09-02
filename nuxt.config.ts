import { createThemeBootstrapScript } from './app/config/themeBootstrap'

const runtimeEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}).process?.env ?? {}
const nuxtBuildDir = runtimeEnv.NUXT_BUILD_DIR || '.nuxt'
const nitroOutputDir = runtimeEnv.NITRO_OUTPUT_DIR || '.output'
const viteCacheDir = runtimeEnv.VITE_CACHE_DIR

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  buildDir: nuxtBuildDir,
  devtools: { enabled: true },
  build: {
    transpile: ['@jsquash/avif', '@jsquash/jpeg', '@jsquash/webp'],
  },
  vite: {
    ...(viteCacheDir ? { cacheDir: viteCacheDir } : {}),
    optimizeDeps: {
      include: ['jszip'],
      exclude: ['@jsquash/avif', '@jsquash/jpeg', '@jsquash/webp'],
    },
    worker: {
      format: 'es',
    },
  },
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
    output: {
      dir: nitroOutputDir,
    },
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes: ['/', '/tools/image-compressor', '/tools/image-compare-rename', '/tools/image-asset-migration'],
    },
  },
})
