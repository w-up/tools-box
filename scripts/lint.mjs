#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: process.cwd() }).toString().split('\0').filter(Boolean)
const sourceFiles = trackedFiles.filter(file => /\.(js|mjs|ts|vue)$/.test(file))

execFileSync('eslint', ['--quiet', ...sourceFiles], {
  cwd: process.cwd(),
  stdio: 'inherit',
  // Windows 下 .bin 中是 eslint.CMD shell 包装，必须经 shell 解析
  shell: process.platform === 'win32',
})
