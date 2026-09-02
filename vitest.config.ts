import { defineConfig } from 'vitest/config'

const viteCacheDir = process.env.VITE_CACHE_DIR || 'node_modules/.cache/tools-box-vite-vitest'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  cacheDir: viteCacheDir,
})
