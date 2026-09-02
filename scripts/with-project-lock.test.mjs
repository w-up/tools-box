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
      ...commandFor('setTimeout(() => process.exit(0), 2000)'),
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
      scope: 'stale',
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

test('任务退出码会原样传递并释放锁', async () => {
  const fixture = await createFixture()
  try {
    const result = await runWrapper(fixture.cwd, [
      '--label',
      'exit code fixture',
      '--',
      ...commandFor('process.exit(23)'),
    ], fixture.env)
    assert.equal(result.code, 23, result.stderr)
    await assert.rejects(access(fixture.lockDir))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('构建成功后原子替换最终产物并清理临时目录', async () => {
  const fixture = await createFixture()
  const outputDir = join(fixture.cwd, '.output')
  try {
    await mkdir(join(outputDir, 'public'), { recursive: true })
    await writeFile(join(outputDir, 'public/index.html'), 'old-version')
    const result = await runWrapper(fixture.cwd, [
      '--scope',
      'build',
      '--label',
      'output promotion fixture',
      '--promote-output',
      '--',
      ...commandFor("const fs = require('node:fs'); fs.mkdirSync(process.env.NITRO_OUTPUT_DIR + '/public', { recursive: true }); fs.writeFileSync(process.env.NITRO_OUTPUT_DIR + '/public/index.html', 'new-version')"),
    ], fixture.env)
    assert.equal(result.code, 0, result.stderr)
    assert.equal(await readFile(join(outputDir, 'public/index.html'), 'utf8'), 'new-version')
    const entries = await readdir(fixture.cwd)
    assert.deepEqual(entries.filter(name => name.includes('.backup-') || name.includes('.build-')), [])
    await assert.rejects(access(fixture.lockDir))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('构建失败时保留旧产物并清理临时目录', async () => {
  const fixture = await createFixture()
  const outputDir = join(fixture.cwd, '.output')
  try {
    await mkdir(join(outputDir, 'public'), { recursive: true })
    await writeFile(join(outputDir, 'public/index.html'), 'old-version')
    const result = await runWrapper(fixture.cwd, [
      '--scope',
      'build',
      '--label',
      'failed output fixture',
      '--promote-output',
      '--',
      ...commandFor("const fs = require('node:fs'); fs.mkdirSync(process.env.NITRO_OUTPUT_DIR + '/public', { recursive: true }); fs.writeFileSync(process.env.NITRO_OUTPUT_DIR + '/public/index.html', 'failed-version'); process.exit(7)"),
    ], fixture.env)
    assert.equal(result.code, 7, result.stderr)
    assert.equal(await readFile(join(outputDir, 'public/index.html'), 'utf8'), 'old-version')
    const entries = await readdir(fixture.cwd)
    assert.deepEqual(entries.filter(name => name.includes('.backup-') || name.includes('.build-')), [])
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('dev/build/test/generate scope 使用独立 Nuxt 和 Vite 目录', async () => {
  const fixture = await createFixture()
  try {
    const scopes = ['dev', 'build', 'test', 'generate']
    const results = await Promise.all(scopes.map(scope => runWrapper(fixture.cwd, [
      '--scope',
      scope,
      '--lock-dir',
      join(fixture.cwd, `${scope}.lock`),
      '--label',
      `${scope} scope fixture`,
      '--',
      ...commandFor(`const fs = require('node:fs'); fs.writeFileSync(process.cwd() + '/${scope}.paths', JSON.stringify({ buildDir: process.env.NUXT_BUILD_DIR, cacheDir: process.env.VITE_CACHE_DIR, outputDir: process.env.NITRO_OUTPUT_DIR })); process.exit(0)`),
    ], fixture.env)))
    assert.deepEqual(results.map(result => result.code), [0, 0, 0, 0])
    const paths = await Promise.all(scopes.map(scope => readFile(join(fixture.cwd, `${scope}.paths`), 'utf8').then(JSON.parse)))
    assert.equal(new Set(paths.map(path => path.buildDir)).size, scopes.length)
    assert.equal(new Set(paths.map(path => path.cacheDir)).size, scopes.length)
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('SIGTERM 会结束后代进程并在退出后释放锁', async () => {
  const fixture = await createFixture()
  try {
    const descendantPidPath = join(fixture.cwd, 'descendant.pid')
    const childScript = [
      "const { spawn } = require('node:child_process')",
      "const fs = require('node:fs')",
      "const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
      "fs.writeFileSync(process.argv[1], String(descendant.pid))",
      'setInterval(() => {}, 1000)',
    ].join(';')
    const wrapper = spawn(process.execPath, [
      wrapperPath,
      '--scope',
      'signal',
      '--lock-dir',
      fixture.lockDir,
      '--label',
      'signal fixture',
      '--',
      ...commandFor(childScript),
      descendantPidPath,
    ], {
      cwd: fixture.cwd,
      env: { ...process.env, ...fixture.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await access(descendantPidPath)
        break
      }
      catch {
        await new Promise(resolveDelay => setTimeout(resolveDelay, 25))
      }
    }
    const descendantPid = Number(await readFile(descendantPidPath, 'utf8'))
    const closed = new Promise(resolveClosed => wrapper.once('close', (code, signal) => resolveClosed({ code, signal })))
    wrapper.kill('SIGTERM')
    const result = await closed
    assert.equal(result.code, 143)
    await assert.rejects(access(fixture.lockDir))
    assert.throws(() => process.kill(descendantPid, 0))
  }
  finally {
    await cleanupFixture(fixture)
  }
})

test('dev/watch 与 build 并行时使用独立目录且不覆盖 dev 状态', async () => {
  const fixture = await createFixture()
  try {
    const devResultPromise = runWrapper(fixture.cwd, [
      '--scope',
      'dev',
      '--lock-dir',
      join(fixture.cwd, 'dev.lock'),
      '--label',
      'dev watch fixture',
      '--',
      ...commandFor("const fs = require('node:fs'); fs.mkdirSync(process.env.NUXT_BUILD_DIR, { recursive: true }); fs.writeFileSync(process.env.NUXT_BUILD_DIR + '/dev-state', 'dev'); fs.writeFileSync(process.cwd() + '/dev.marker', 'alive'); setTimeout(() => process.exit(0), 500)"),
    ], fixture.env)
    const buildResultPromise = runWrapper(fixture.cwd, [
      '--scope',
      'build',
      '--lock-dir',
      join(fixture.cwd, 'build.lock'),
      '--label',
      'AI build fixture',
      '--promote-output',
      '--',
      ...commandFor("const fs = require('node:fs'); fs.mkdirSync(process.env.NUXT_BUILD_DIR, { recursive: true }); fs.writeFileSync(process.env.NUXT_BUILD_DIR + '/build-state', 'build'); fs.mkdirSync(process.env.NITRO_OUTPUT_DIR + '/public', { recursive: true }); fs.writeFileSync(process.env.NITRO_OUTPUT_DIR + '/public/index.html', 'build'); setTimeout(() => process.exit(0), 150)"),
    ], fixture.env)
    const [devResult, buildResult] = await Promise.all([devResultPromise, buildResultPromise])
    assert.equal(devResult.code, 0, devResult.stderr)
    assert.equal(buildResult.code, 0, buildResult.stderr)
    assert.equal(await readFile(join(fixture.cwd, '.nuxt-dev/dev-state'), 'utf8'), 'dev')
    assert.equal(await readFile(join(fixture.cwd, '.nuxt-build/build-state'), 'utf8'), 'build')
    assert.equal(await readFile(join(fixture.cwd, '.output/public/index.html'), 'utf8'), 'build')
    assert.equal(await readFile(join(fixture.cwd, 'dev.marker'), 'utf8'), 'alive')
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
    assert.match(command, /^pnpm lock --scope \S+ --lock-dir \S+ --label ".+"(?: --[a-z-]+(?: \S+)?)?(?: --[a-z-]+)? -- /, `${name} 未配置 scope 锁：${command}`)
    assert.match(command, / -- /, `${name} 未配置锁命令分隔符：${command}`)
  }
})
