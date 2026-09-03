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
    // Vite 8 的 oxc 转换会自动发现根 tsconfig.json 并加载其 references 指向的
    // .nuxt/tsconfig.*.json；buildDir 被重定向到 .nuxt-* 作用域目录后该文件不存在，
    // 会抛 TSCONFIG_ERROR。构建期转换不依赖这些编译选项（类型检查由 vue-tsc 独立完成），
    // 显式禁用 tsconfig 发现。
    oxc: {
      tsconfig: false,
    } as never,
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
      // 无 JS 环境下取消首页滚动渐入的默认隐藏，保证内容可见
      noscript: [
        { innerHTML: '<style>.reveal{opacity:1 !important;transform:none !important}</style>' },
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
      routes: ['/', '/tools/image-compressor', '/tools/image-compare-rename', '/tools/image-asset-migration', '/tools/image-resizer'],
    },
  },
})
