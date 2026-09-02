import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrapperPath = join(repoRoot, 'scripts/with-project-lock.mjs')

const runWrapper = (cwd, args, env = {}) => new Promise((resolveResult, reject) => {
  const child = spawn(process.execPath, [wrapperPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.once('error', reject)
  child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr }))
})

const createFixture = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tools-box-project-lock-'))
  return {
    cwd,
    lockDir: join(cwd, '.lock'),
    env: { TOOLS_BOX_PROCESS_LOCK_DIR: join(cwd, '.lock') },
  }
}

const commandFor = script => [process.execPath, '-e', script]
const cleanupFixture = fixture => rm(fixture.cwd, { recursive: true, force: true })

test('并发 contender 只有一个可以获得项目锁', async () => {
  const fixture = await createFixture()
  try {
    const contenders = Array.from({ length: 20 }, () => runWrapper(fixture.cwd, [
      '--label',
      'concurrent contender',
      '--',
      ...commandFor('setTimeout(() => process.exit(0), 300)'),
    ], fixture.env))
    const results = await Promise.all(contenders)
    assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results))
    assert.equal(results.filter(result => result.code === 75).length, 19, JSON.stringify(results))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('缺少 owner 的初始化锁保持 fail-closed', async () => {
  const fixture = await createFixture()
  try {
    await mkdir(fixture.lockDir, { recursive: true })
    const result = await runWrapper(fixture.cwd, [
      '--label',
      'incomplete lock contender',
      '--',
      ...commandFor('process.exit(0)'),
    ], fixture.env)
    assert.equal(result.code, 75, result.stderr)
    assert.match(result.stderr, /项目已有其他写入任务运行/)
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('PID 启动时间不匹配时可以安全接管 stale lock', async () => {
  const fixture = await createFixture()
  try {
    await mkdir(fixture.lockDir, { recursive: true })
    await writeFile(join(fixture.lockDir, 'owner.json'), JSON.stringify({
      pid: process.pid,
      label: 'stale owner',
      command: 'old command',
      processStartedAt: 'not-the-current-process-start-time',
      lockCreatedAt: new Date(0).toISOString(),
      cwd: fixture.cwd,
      token: 'old-token',
    }))
    const result = await runWrapper(fixture.cwd, [
      '--label',
      'stale recovery',
      '--',
      ...commandFor('process.exit(0)'),
    ], fixture.env)
    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual((await readdir(fixture.cwd)).filter(name => name.includes('.stale-')), [])
    await assert.rejects(access(fixture.lockDir))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('嵌套命令可以复用顶层项目锁', async () => {
  const fixture = await createFixture()
  try {
    const result = await runWrapper(fixture.cwd, [
      '--label',
      'top-level command',
      '--',
      process.execPath,
      wrapperPath,
      '--label',
      'nested command',
      '--',
      ...commandFor('process.exit(0)'),
    ], fixture.env)
    assert.equal(result.code, 0, result.stderr)
    await assert.rejects(access(fixture.lockDir))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('需要写入项目状态的 package scripts 全部接入项目锁', async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  const unlockedScripts = new Set(['lock', 'test:concurrency'])
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (unlockedScripts.has(name)) continue
    assert.match(command, /^pnpm lock --label ".+" -- /, `${name} 未接入项目锁：${command}`)
  }
})
