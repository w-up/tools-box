#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const LOCK_EXIT_CODE = 75
const LOCK_TOKEN_ENV = 'TOOLS_BOX_PROCESS_LOCK_TOKEN'
const LOCK_DIR_ENV = 'TOOLS_BOX_PROCESS_LOCK_DIR'

const args = process.argv.slice(2)
const separatorIndex = args.indexOf('--')
const command = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : []
const options = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args
const labelIndex = options.indexOf('--label')
const label = labelIndex >= 0 ? options[labelIndex + 1] : 'project process'
const lockDir = resolve(process.env[LOCK_DIR_ENV] || 'node_modules/.cache/tools-box-process.lock')
const ownerPath = join(lockDir, 'owner.json')
const token = randomUUID()
let hasLock = false
let inheritedLock = false

if (command.length === 0 || (labelIndex >= 0 && !label)) {
  console.error('用法：with-project-lock.mjs --label <label> -- <command> [args...]')
  process.exit(2)
}

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
    ? `当前占用者：${owner.label} (PID ${owner.pid})`
    : '占用锁正在初始化'
  console.error(`[tools-box] ${label} 未启动：项目已有其他写入任务运行。${ownerText}`)
  console.error('[tools-box] 为避免 dev/build/generate/typecheck/postinstall 并发写入 .nuxt、.output 或 cache，请先停止占用者。')
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
    command: command.join(' '),
    processStartedAt: processStartTime(process.pid),
    lockCreatedAt: new Date().toISOString(),
    cwd: process.cwd(),
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
  if (!childStartedAt) throw new Error('无法读取项目锁子进程的启动时间')
  const ownerTempPath = join(lockDir, `.owner-child-${process.pid}-${token}`)
  writeFileSync(ownerTempPath, `${JSON.stringify({ ...owner, childPid, childStartedAt }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  renameSync(ownerTempPath, ownerPath)
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

let child
let isStopping = false

const forwardSignal = (signal) => {
  if (isStopping || !child?.pid) return
  isStopping = true
  try {
    process.kill(-child.pid, signal)
  }
  catch {
    try {
      process.kill(child.pid, signal)
    }
    catch {
      // 子进程可能已退出，等待 close 事件释放锁。
    }
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))
process.on('SIGHUP', () => forwardSignal('SIGHUP'))

const stopChildProcessGroup = (signal = 'SIGTERM') => {
  if (!child?.pid || process.platform === 'win32') return
  try {
    process.kill(-child.pid, signal)
  }
  catch {
    // 进程组可能已完全退出。
  }
}

try {
  const inheritedToken = inheritedLock ? process.env[LOCK_TOKEN_ENV] : token
  child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: { ...process.env, [LOCK_TOKEN_ENV]: inheritedToken },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  recordChildOwner(child.pid)
}
catch (error) {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    }
    catch {
      // 子进程可能尚未完成启动。
    }
  }
  releaseLock()
  console.error(`[tools-box] 无法启动 ${label}：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

child.once('error', (error) => {
  releaseLock()
  console.error(`[tools-box] ${label} 进程启动失败：${error.message}`)
  process.exit(1)
})

child.once('close', (code, signal) => {
  stopChildProcessGroup('SIGTERM')
  releaseLock()
  if (signal) {
    const signalNumber = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal] || 1
    process.exit(128 + signalNumber)
  }
  process.exit(code ?? 1)
})
