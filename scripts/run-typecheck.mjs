#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'

// Windows 下 .bin 中是 nuxt.CMD/vue-tsc.CMD 等 shell 包装，必须经 shell 解析
const runOptions = {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: isWindows,
}

const buildDir = process.env.NUXT_BUILD_DIR
if (!buildDir) {
  console.error('NUXT_BUILD_DIR 未设置，拒绝在未隔离的默认目录执行 typecheck。')
  process.exit(2)
}

execFileSync('nuxt', ['prepare'], runOptions)

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

const result = spawnSync('vue-tsc', ['-b', solutionConfig, '--noEmit'], runOptions)

if (result.error) {
  console.error(`vue-tsc 启动失败：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
