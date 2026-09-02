import { defineConfig } from 'vitest/config'

const viteCacheDir = process.env.VITE_CACHE_DIR || 'node_modules/.cache/tools-box-vite-vitest'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  cacheDir: viteCacheDir,
  // Vite 8 转换改用 oxc 并自动发现根 tsconfig.json；Nuxt 4 的 solution-style 根配置
  // references 指向 .nuxt/*.json（实际生成在 .nuxt-* 作用域目录），纯 Node 单测无需它们，
  // 显式禁用 tsconfig 发现，避免 TSCONFIG_ERROR
  oxc: {
    tsconfig: false,
  } as never,
})
