#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const LOCK_EXIT_CODE = 75
const LOCK_TOKEN_ENV = 'TOOLS_BOX_PROCESS_LOCK_TOKEN'
const LOCK_DIR_ENV = 'TOOLS_BOX_PROCESS_LOCK_DIR'
const SCOPE_ENV = 'TOOLS_BOX_SCOPE'

const args = process.argv.slice(2)
const separatorIndex = args.indexOf('--')
const command = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : []
const options = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args

const optionValue = (name) => {
  const index = options.indexOf(name)
  return index >= 0 ? options[index + 1] : undefined
}

const label = optionValue('--label') || 'project process'
const scope = optionValue('--scope') || process.env[SCOPE_ENV] || 'process'
const configuredLockDir = optionValue('--lock-dir') || process.env[LOCK_DIR_ENV] || 'node_modules/.cache/tools-box-process.lock'
const lockDir = resolve(configuredLockDir)
const promoteOutput = options.includes('--promote-output')
const ownerPath = join(lockDir, 'owner.json')
const token = randomUUID()
const projectRoot = process.cwd()
let hasLock = false
let inheritedLock = false
let child
let tempOutputDir = null
let isStopping = false
let isSettled = false

const knownOptions = new Set(['--scope', '--lock-dir', '--label', '--promote-output', '--output-dir'])
const unknownOptions = options.filter(option => option.startsWith('--') && !knownOptions.has(option))
const hasMissingValue = ['--scope', '--lock-dir', '--label', '--output-dir'].some(name => options.includes(name) && !optionValue(name))
const hasInvalidScope = !/^[a-z0-9._-]+$/i.test(scope)

if (
  command.length === 0
  || hasMissingValue
  || unknownOptions.length > 0
  || hasInvalidScope
) {
  console.error('用法：with-project-lock.mjs [--scope <scope>] [--lock-dir <path>] [--label <label>] [--promote-output] [--output-dir <path>] -- <command> [args...]')
  process.exit(2)
}

const outputDirs = {
  dev: '.output-dev',
  build: '.output',
  generate: '.output',
  preview: '.output',
  test: '.output-test',
  typecheck: '.output-typecheck',
  prepare: '.output-prepare',
  lint: '.output-lint',
}
const configuredOutputDir = optionValue('--output-dir') || outputDirs[scope] || '.output'
const outputDir = resolve(configuredOutputDir)

mkdirSync(dirname(lockDir), { recursive: true })

const readOwner = () => {
  try {
    return JSON.parse(readFileSync(ownerPath, 'utf8'))
  }
  catch {
    return null
  }
}

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return error?.code === 'EPERM'
  }
}

const processStartTime = (pid) => {
  try {
    // Windows 无 POSIX ps，通过 PowerShell 读取进程启动时间（'o' 为固定 ISO 往返格式，便于稳定比较）
    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString('o')`],
        { encoding: 'utf8' },
      )
      return output.trim() || null
    }
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).trim() || null
  }
  catch {
    return null
  }
}

const isValidOwner = owner => Boolean(
  owner
  && Number.isInteger(owner.pid)
  && owner.pid > 0
  && owner.token
  && owner.label
  && owner.scope
  && owner.command
  && owner.processStartedAt
  && owner.lockCreatedAt
  && owner.cwd,
)

const isLiveProcessIdentity = (pid, startedAt) => {
  if (!isProcessAlive(pid)) return false
  const currentStartTime = processStartTime(pid)
  return currentStartTime === null || currentStartTime === startedAt
}

const isLiveOwner = owner => (
  isLiveProcessIdentity(owner.pid, owner.processStartedAt)
  || (Number.isInteger(owner.childPid) && owner.childStartedAt && isLiveProcessIdentity(owner.childPid, owner.childStartedAt))
)

const failLocked = (owner) => {
  const ownerText = isValidOwner(owner)
    ? `当前占用者：${owner.label} (scope ${owner.scope}, PID ${owner.pid})`
    : '占用锁正在初始化'
  console.error(`[tools-box] ${label} 未启动：项目已有其他写入任务运行。${ownerText}`)
  console.error('[tools-box] 为避免 dev/build/generate/typecheck/test 并发写入 .nuxt、.output、.vite 或 cache，请先停止占用者。')
  process.exit(LOCK_EXIT_CODE)
}

const moveAsideStaleLock = (owner) => {
  const staleDir = `${lockDir}.stale-${process.pid}-${Date.now()}`
  try {
    renameSync(lockDir, staleDir)
    rmSync(staleDir, { recursive: true, force: true })
  }
  catch {
    failLocked(owner)
  }
}

const acquireLock = () => {
  try {
    mkdirSync(lockDir)
  }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error

    const owner = readOwner()
    if (isValidOwner(owner) && process.env[LOCK_TOKEN_ENV] === owner.token && isLiveOwner(owner)) {
      inheritedLock = true
      return
    }
    if (!isValidOwner(owner)) failLocked(owner)
    if (isLiveOwner(owner)) failLocked(owner)

    moveAsideStaleLock(owner)
    return acquireLock()
  }

  const owner = {
    pid: process.pid,
    label,
    scope,
    command: command.join(' '),
    processStartedAt: processStartTime(process.pid),
    lockCreatedAt: new Date().toISOString(),
    cwd: projectRoot,
    token,
  }
  if (!owner.processStartedAt) throw new Error('无法读取项目锁 owner 的进程启动时间')
  const ownerTempPath = join(lockDir, `.owner-${process.pid}-${token}`)
  writeFileSync(ownerTempPath, `${JSON.stringify(owner, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  renameSync(ownerTempPath, ownerPath)
  hasLock = true
}

const releaseLock = () => {
  if (!hasLock || inheritedLock) return
  const owner = readOwner()
  if (owner?.pid !== process.pid || owner?.token !== token) return
  rmSync(lockDir, { recursive: true, force: true })
  hasLock = false
}

const recordChildOwner = (childPid) => {
  if (!hasLock || !Number.isInteger(childPid) || childPid <= 0) return
  const owner = readOwner()
  if (owner?.pid !== process.pid || owner?.token !== token) throw new Error('项目锁 owner 已变化，拒绝记录子进程')
  const childStartedAt = processStartTime(childPid)
  if (!childStartedAt) return
  const ownerTempPath = join(lockDir, `.owner-child-${process.pid}-${token}`)
  writeFileSync(ownerTempPath, `${JSON.stringify({ ...owner, childPid, childStartedAt }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  renameSync(ownerTempPath, ownerPath)
}

const scopedBuildDir = {
  dev: '.nuxt-dev',
  build: '.nuxt-build',
  generate: '.nuxt-generate',
  preview: '.nuxt-preview',
  test: '.nuxt-test',
  typecheck: '.nuxt-typecheck',
  prepare: '.nuxt-prepare',
  lint: '.nuxt-lint',
}[scope] || '.nuxt'
const scopedViteCacheDir = `node_modules/.cache/tools-box-vite-${scope}`

// Vite 8 的 oxc 转换会自动发现根 tsconfig.json 并加载其 references 指向的
// .nuxt/tsconfig.*.json；buildDir 重定向到 .nuxt-* 后这些文件不存在，会抛
// TSCONFIG_ERROR（plugin-vue 在 build 阶段不走 config.oxc，无法用选项禁用）。
// 这里保证占位文件存在：构建期转换只读 compilerOptions，默认值与 vite 7 行为一致，
// 真实类型检查由 typecheck 作用域基于作用域内生成的 tsconfig 独立完成。
const ensureNuxtTsconfigStubs = () => {
  const nuxtDir = join(projectRoot, '.nuxt')
  mkdirSync(nuxtDir, { recursive: true })
  for (const name of ['tsconfig.app.json', 'tsconfig.server.json', 'tsconfig.shared.json', 'tsconfig.node.json']) {
    const target = join(nuxtDir, name)
    if (!existsSync(target)) {
      writeFileSync(target, '{\n  "compilerOptions": {}\n}\n', 'utf8')
    }
  }
}
ensureNuxtTsconfigStubs()

const childEnv = {
  ...process.env,
  [LOCK_TOKEN_ENV]: inheritedLock ? process.env[LOCK_TOKEN_ENV] : token,
  [LOCK_DIR_ENV]: lockDir,
  [SCOPE_ENV]: scope,
  NUXT_BUILD_DIR: resolve(projectRoot, scopedBuildDir),
  VITE_CACHE_DIR: resolve(projectRoot, scopedViteCacheDir),
  NITRO_OUTPUT_DIR: outputDir,
}

if (promoteOutput) {
  tempOutputDir = `${outputDir}.build-${scope}-${process.pid}-${token}`
  childEnv.NITRO_OUTPUT_DIR = tempOutputDir
}

const verifyOutput = (dir) => existsSync(join(dir, 'public', 'index.html'))

const removeScopedOutput = () => {
  if (tempOutputDir && existsSync(tempOutputDir)) {
    rmSync(tempOutputDir, { recursive: true, force: true })
  }
}

const promoteScopedOutput = () => {
  if (!tempOutputDir || !verifyOutput(tempOutputDir)) {
    throw new Error(`构建产物不完整：缺少 ${join(tempOutputDir || outputDir, 'public', 'index.html')}`)
  }

  const backupDir = `${outputDir}.backup-${scope}-${process.pid}-${token}`
  let movedExistingOutput = false
  try {
    if (existsSync(outputDir)) {
      renameSync(outputDir, backupDir)
      movedExistingOutput = true
    }
    renameSync(tempOutputDir, outputDir)
    tempOutputDir = null
    if (movedExistingOutput) rmSync(backupDir, { recursive: true, force: true })
  }
  catch (error) {
    if (existsSync(outputDir) && movedExistingOutput) {
      rmSync(outputDir, { recursive: true, force: true })
    }
    if (movedExistingOutput && existsSync(backupDir) && !existsSync(outputDir)) {
      renameSync(backupDir, outputDir)
    }
    throw error
  }
  finally {
    if (tempOutputDir && existsSync(tempOutputDir)) {
      rmSync(tempOutputDir, { recursive: true, force: true })
    }
  }
}

const sendToChildGroup = (signal) => {
  if (!child?.pid) return
  try {
    process.kill(-child.pid, signal)
  }
  catch {
    try {
      process.kill(child.pid, signal)
    }
    catch {
      // 子进程可能已退出，等待 close 事件完成清理。
    }
  }
}

const processGroupExists = (pid) => {
  try {
    process.kill(-pid, 0)
    return true
  }
  catch {
    return false
  }
}

const waitForChildGroupExit = async () => {
  if (!child?.pid || process.platform === 'win32') return
  for (let attempt = 0; attempt < 40 && processGroupExists(child.pid); attempt += 1) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50))
  }
  if (processGroupExists(child.pid)) {
    sendToChildGroup('SIGKILL')
    for (let attempt = 0; attempt < 20 && processGroupExists(child.pid); attempt += 1) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 50))
    }
  }
}

const finish = async (code, signal = null) => {
  if (isSettled) return
  isSettled = true
  sendToChildGroup('SIGTERM')
  await waitForChildGroupExit()

  let finalCode = signal
    ? 128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal] || 1)
    : code ?? 1
  if (!signal && code === 0 && promoteOutput) {
    try {
      promoteScopedOutput()
    }
    catch (error) {
      removeScopedOutput()
      console.error(`[tools-box] ${label} 产物切换失败：${error instanceof Error ? error.message : String(error)}`)
      finalCode = 1
    }
  }
  else {
    removeScopedOutput()
  }

  releaseLock()
  process.exit(finalCode)
}

process.on('exit', releaseLock)

try {
  acquireLock()
}
catch (error) {
  releaseLock()
  console.error(`[tools-box] ${label} 初始化失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const forwardSignal = (signal) => {
  if (isStopping || !child?.pid) return
  isStopping = true
  sendToChildGroup(signal)
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))
process.on('SIGHUP', () => forwardSignal('SIGHUP'))

try {
  child = spawn(command[0], command.slice(1), {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    // Windows 下 .bin 里只有 nuxt.CMD 等 shell 包装，需要 shell 解析 PATH 中的可执行文件
    shell: process.platform === 'win32',
  })
  recordChildOwner(child.pid)
}
catch (error) {
  removeScopedOutput()
  releaseLock()
  console.error(`[tools-box] 无法启动 ${label}：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

child.once('error', (error) => {
  if (isSettled) return
  console.error(`[tools-box] ${label} 进程启动失败：${error.message}`)
  void finish(1)
})

child.once('close', (code, signal) => {
  void finish(code, signal)
})
