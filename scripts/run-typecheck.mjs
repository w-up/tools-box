#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const buildDir = process.env.NUXT_BUILD_DIR
if (!buildDir) {
  console.error('NUXT_BUILD_DIR 未设置，拒绝在未隔离的默认目录执行 typecheck。')
  process.exit(2)
}

execFileSync('nuxt', ['prepare'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

const solutionConfig = join(buildDir, 'tsconfig.typecheck.json')
writeFileSync(solutionConfig, `${JSON.stringify({
  files: [],
  references: [
    { path: './tsconfig.app.json' },
    { path: './tsconfig.server.json' },
    { path: './tsconfig.shared.json' },
    { path: './tsconfig.node.json' },
  ],
}, null, 2)}\n`)

const result = spawnSync('vue-tsc', ['-b', solutionConfig, '--noEmit'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`vue-tsc 启动失败：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
