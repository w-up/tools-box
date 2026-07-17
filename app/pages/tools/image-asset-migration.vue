<script setup lang="ts">
import JSZip from 'jszip'

import type { ManualAssetMerge } from '~/utils/assetMigration'
import { createAssetMigrationPlan, rewriteAssetReferences } from '~/utils/assetMigration'

interface ImportedAsset {
  id: string
  file: File
  relativePath: string
  name: string
  targetName: string
}

interface ImportedCodeFile {
  file: File
  relativePath: string
  content: string
}

interface MigrationSettings {
  renameImages: boolean
  updateReferences: boolean
  removeDuplicates: boolean
}

const SETTINGS_KEY = 'web-toolbox:asset-migration-settings'
const DEFAULT_SETTINGS: MigrationSettings = {
  renameImages: true,
  updateReferences: true,
  removeDuplicates: false,
}

useSeoMeta({
  title: '图片资源迁移 — Web Toolbox',
  description: '本地重命名图片、手动合并重复资源并同步更新代码引用。',
})

const assets = ref<ImportedAsset[]>([])
const codeFiles = ref<ImportedCodeFile[]>([])
const merges = ref<ManualAssetMerge[]>([])
const settings = reactive<MigrationSettings>({ ...DEFAULT_SETTINGS })
const settingsOpen = ref(false)
const exporting = ref(false)
const notice = ref('')
const imageInput = ref<HTMLInputElement>()
const codeInput = ref<HTMLInputElement>()
const { show: showToast } = useToast()

const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}

const assetNames = computed(() => assets.value.map(asset => asset.name))
// 将手工命名与合并规则组合为最终资源迁移计划
const plan = computed(() => createAssetMigrationPlan(
  assetNames.value,
  merges.value,
  settings.removeDuplicates,
  new Map(assets.value.map(asset => [asset.name, asset.targetName])),
))
const targetBySource = computed(() => new Map(plan.value.map(item => [item.sourceName, item.targetName])))
const codeChangeCount = computed(() => codeFiles.value.reduce((count, codeFile) => (
  rewriteAssetReferences(codeFile.content, targetBySource.value) === codeFile.content ? count : count + 1
), 0))
const duplicateTargets = computed(() => {
  const counts = new Map<string, number>()
  for (const asset of assets.value) {
    const item = plan.value.find(candidate => candidate.sourceName === asset.name)
    if (item?.action !== 'keep') continue
    counts.set(asset.targetName, (counts.get(asset.targetName) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
})
const duplicateSourceNames = computed(() => {
  const counts = new Map<string, number>()
  for (const asset of assets.value) counts.set(asset.name, (counts.get(asset.name) ?? 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
})
const canExport = computed(() => (
  assets.value.length > 0
  && duplicateTargets.value.length === 0
  && duplicateSourceNames.value.length === 0
))

// 保存本工具的处理偏好，但不保存用户导入的本地文件和临时任务数据
const persistSettings = () => {
  useLocalStorage.set(SETTINGS_KEY, settings)
}

// 读取同一浏览器中上次使用的处理偏好
onMounted(() => {
  const stored = useLocalStorage.get<Partial<MigrationSettings>>(SETTINGS_KEY)
  if (!stored) return
  Object.assign(settings, DEFAULT_SETTINGS, stored)
})

watch(settings, () => {
  // 未导出图片时不能同步到新的文件名，自动关闭依赖项以避免产生失效引用
  if (!settings.renameImages) settings.updateReferences = false
  persistSettings()
}, { deep: true })

// 保留文件夹相对路径，确保导出的图片与代码目录结构可对应
const importImages = (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []).filter(file => file.type.startsWith('image/'))
  input.value = ''
  if (files.length === 0) {
    setNotice('没有检测到可读取的图片', 'warning')
    return
  }

  assets.value = files.map((file, index) => ({
    id: `${file.name}-${file.lastModified}-${index}`,
    file,
    relativePath: file.webkitRelativePath || file.name,
    name: file.name,
    targetName: file.name,
  }))
  merges.value = []
  setNotice(`已导入 ${assets.value.length} 张图片`, 'success')
}

// 读取 HTML、CSS、JS 等文本代码文件，以便在导出包中同步改写资源引用
const importCodeFiles = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return

  codeFiles.value = await Promise.all(files.map(async file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
    content: await file.text(),
  })))
  setNotice(`已导入 ${codeFiles.value.length} 个代码文件`, 'success')
}

// 新增一条手动合并规则，例如 image-1、image-2 统一使用 image-3
const addMerge = () => {
  const fallback = assets.value[0]?.name
  if (!fallback) return
  merges.value.push({ sourceNames: [], targetName: fallback })
}

const removeMerge = (index: number) => {
  merges.value.splice(index, 1)
}

const isSourceInOtherMerge = (sourceName: string, currentIndex: number) => merges.value.some((merge, index) => (
  index !== currentIndex && merge.sourceNames.includes(sourceName)
))

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// 导出重命名后的图片和按配置更新过引用的代码副本，不会修改用户的原始文件
const exportMigration = async () => {
  if (!canExport.value) return
  exporting.value = true
  try {
    const zip = new JSZip()
    const planBySource = new Map(plan.value.map(item => [item.sourceName, item]))

    if (settings.renameImages) {
      for (const asset of assets.value) {
        const item = planBySource.get(asset.name)
        if (!item || item.action === 'remove') continue
        const directory = asset.relativePath.slice(0, asset.relativePath.length - asset.name.length)
        zip.file(`images/${directory}${asset.targetName}`, asset.file)
      }
    }

    if (settings.updateReferences) {
      for (const codeFile of codeFiles.value) {
        const content = rewriteAssetReferences(codeFile.content, targetBySource.value)
        zip.file(`code/${codeFile.relativePath}`, content)
      }
    }

    zip.file('migration-report.json', JSON.stringify({
      settings,
      imagePlan: plan.value,
      codeFiles: codeFiles.value.map(file => ({
        path: file.relativePath,
        changed: rewriteAssetReferences(file.content, targetBySource.value) !== file.content,
      })),
    }, null, 2))

    downloadBlob(await zip.generateAsync({ type: 'blob' }), `image-migration-${Date.now()}.zip`)
    setNotice('迁移 ZIP 已导出；原始文件未被修改', 'success')
  } catch {
    setNotice('导出失败，请减少单次文件数量后重试', 'error')
  } finally {
    exporting.value = false
  }
}

const clearAll = () => {
  assets.value = []
  codeFiles.value = []
  merges.value = []
  setNotice('本次任务数据已清空，处理设置会继续保留')
}
</script>

<template>
  <div class="migration-workbench">
    <header class="migration-header">
      <div>
        <NuxtLink class="migration-header__back" to="/">← 全部工具</NuxtLink>
        <p>图片工具 · 本地迁移</p>
        <h1>图片资源迁移</h1>
        <span>重命名图片、手动合并重复项，并按需同步代码引用。</span>
      </div>
      <div class="migration-header__privacy">
        <i aria-hidden="true" />
        <strong>文件不会上传</strong>
        <span>导入、替换和导出全部在当前浏览器完成</span>
      </div>
    </header>

    <main class="migration-shell">
      <section class="migration-panel">
        <div class="migration-panel__heading">
          <div class="migration-step">01</div>
          <div><p>导入资源</p><h2>图片与代码文件</h2></div>
          <button class="migration-button" type="button" @click="settingsOpen = true">处理设置</button>
        </div>
        <div class="migration-imports">
          <div class="migration-import-card">
            <strong>待处理图片</strong>
            <span>支持选择图片或整个图片目录</span>
            <button class="migration-button migration-button--primary" type="button" @click="imageInput?.click()">选择图片目录</button>
            <input ref="imageInput" class="visually-hidden" type="file" accept="image/*" multiple webkitdirectory @change="importImages">
            <small>{{ assets.length > 0 ? `已导入 ${assets.length} 张图片` : '尚未导入' }}</small>
          </div>
          <div class="migration-import-card">
            <strong>代码文件</strong>
            <span>可选导入 HTML、CSS、JS、TS、Vue 等文本文件</span>
            <button class="migration-button migration-button--primary" type="button" :disabled="!settings.updateReferences" @click="codeInput?.click()">选择代码文件</button>
            <input ref="codeInput" class="visually-hidden" type="file" accept=".html,.htm,.css,.scss,.sass,.less,.js,.jsx,.ts,.tsx,.vue,.json" multiple @change="importCodeFiles">
            <small>{{ settings.updateReferences ? (codeFiles.length > 0 ? `已导入 ${codeFiles.length} 个文件` : '尚未导入') : '已在设置中关闭同步引用' }}</small>
          </div>
        </div>
      </section>

      <p v-if="notice" class="migration-notice" role="status">{{ notice }}</p>

      <section class="migration-panel" aria-labelledby="rename-title">
        <div class="migration-panel__heading">
          <div class="migration-step">02</div>
          <div><p>图片命名</p><h2 id="rename-title">设置导出文件名</h2></div>
          <span>{{ assets.length }} 张图片</span>
        </div>
        <div v-if="assets.length > 0" class="migration-table-wrap">
          <table class="migration-table">
            <thead><tr><th>原始路径</th><th>导出文件名</th><th>处理结果</th></tr></thead>
            <tbody>
              <tr v-for="asset in assets" :key="asset.id">
                <td><code>{{ asset.relativePath }}</code></td>
                <td><input v-model.trim="asset.targetName" :disabled="!settings.renameImages" aria-label="导出文件名"></td>
                <td>{{ targetBySource.get(asset.name) === asset.name ? '保留' : `统一使用 ${targetBySource.get(asset.name)}` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="migration-empty">先导入待处理图片。</div>
        <p v-if="duplicateSourceNames.length > 0" class="migration-warning">存在同名图片：{{ duplicateSourceNames.join('、') }}。当前版本按文件名更新代码引用，请先拆分为唯一文件名后再迁移。</p>
        <p v-if="duplicateTargets.length > 0" class="migration-warning">导出文件名冲突：{{ duplicateTargets.join('、') }}。请修改文件名或通过手动合并指定保留文件。</p>
      </section>

      <section class="migration-panel" aria-labelledby="merge-title">
        <div class="migration-panel__heading">
          <div class="migration-step">03</div>
          <div><p>重复项合并</p><h2 id="merge-title">手动指定删除项与保留项</h2></div>
          <button class="migration-button" type="button" :disabled="assets.length === 0" @click="addMerge">新增合并规则</button>
        </div>
        <p class="migration-description">例如选择图片 1、2 为“待移除”，选择图片 3 为“保留目标”；开启“去除确认重复图片”时，导出包不含图片 1、2，代码中的引用会统一更新为图片 3。</p>
        <div v-if="merges.length > 0" class="migration-merge-list">
          <div v-for="(merge, index) in merges" :key="index" class="migration-merge-row">
            <label>待移除图片
              <select v-model="merge.sourceNames" multiple size="4">
                <option v-for="asset in assets" :key="asset.id" :value="asset.name" :disabled="isSourceInOtherMerge(asset.name, index) || asset.name === merge.targetName">{{ asset.relativePath }}</option>
              </select>
            </label>
            <span class="migration-merge-arrow">→</span>
            <label>保留并统一引用为
              <select v-model="merge.targetName">
                <option v-for="asset in assets" :key="asset.id" :value="asset.name">{{ asset.relativePath }}</option>
              </select>
            </label>
            <button class="migration-button migration-button--danger" type="button" @click="removeMerge(index)">删除规则</button>
          </div>
        </div>
        <div v-else class="migration-empty">暂无手动合并规则；只有你明确指定时才会把多个图片合并为一个。</div>
      </section>

      <section class="migration-panel migration-export" aria-labelledby="export-title">
        <div class="migration-panel__heading">
          <div class="migration-step">04</div>
          <div><p>检查与导出</p><h2 id="export-title">生成迁移副本</h2></div>
        </div>
        <div class="migration-summary">
          <span><strong>{{ assets.length }}</strong> 图片</span>
          <span><strong>{{ merges.reduce((count, merge) => count + merge.sourceNames.length, 0) }}</strong> 手动合并项</span>
          <span><strong>{{ codeFiles.length }}</strong> 代码文件</span>
          <span><strong>{{ codeChangeCount }}</strong> 将更新的代码文件</span>
        </div>
        <p>导出包包含按设置处理后的 <code>images/</code>、可选的 <code>code/</code> 和可审计的 <code>migration-report.json</code>。不会删除或改写你的原始文件。</p>
        <div class="migration-export__actions">
          <button class="migration-button migration-button--primary" type="button" :disabled="!canExport || exporting" @click="exportMigration">{{ exporting ? '正在打包…' : '导出迁移 ZIP' }}</button>
          <button class="migration-button" type="button" :disabled="assets.length === 0" @click="clearAll">清空本次数据</button>
        </div>
      </section>
    </main>

    <UiModal v-model="settingsOpen" width="620px">
      <template #header><div class="migration-settings-heading"><span>PROCESS SETTINGS</span><h2>处理设置</h2><p>设置会保存到当前浏览器；导入文件和匹配任务不会保存。</p></div></template>
      <div class="migration-settings">
        <label><input v-model="settings.renameImages" type="checkbox"> <span><strong>重命名图片</strong><small>按“导出文件名”生成图片副本。</small></span></label>
        <label><input v-model="settings.updateReferences" type="checkbox" :disabled="!settings.renameImages"> <span><strong>同步代码引用</strong><small>导出更新后的代码副本，不改写原代码。</small></span></label>
        <label><input v-model="settings.removeDuplicates" type="checkbox"> <span><strong>去除确认重复图片</strong><small>只对第 03 步明确指定的待移除图片生效。</small></span></label>
      </div>
      <template #footer="{ close }"><span class="migration-settings-footer">刷新页面后仍会保留这些设置</span><button class="migration-button migration-button--primary" type="button" @click="close">完成</button></template>
    </UiModal>
  </div>
</template>

<style scoped>
.migration-workbench { min-height: calc(100svh - 72px); color: var(--color-text); background: var(--color-bg); }
.migration-header, .migration-shell { width: min(100% - 48px, 1180px); margin-inline: auto; }
.migration-header { display:flex; min-height:220px; align-items:flex-end; justify-content:space-between; gap:48px; padding-block:42px 44px; }
.migration-header__back { display:inline-flex; min-height:44px; align-items:center; color:var(--color-muted); font-size:12px; }
.migration-header p, .migration-panel__heading p { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.1em; }
.migration-header > div > p { margin-top:24px; }
.migration-header h1 { margin:8px 0 0; font-size:clamp(38px,4.5vw,58px); font-weight:590; letter-spacing:-.055em; line-height:1; }
.migration-header > div > span { display:block; margin-top:16px; color:var(--color-muted); font-size:14px; }
.migration-header__privacy { display:grid; min-width:310px; grid-template-columns:10px 1fr; gap:4px 10px; border:1px solid var(--color-line); border-radius:10px; padding:16px 18px; background:var(--color-surface); }
.migration-header__privacy i { width:8px; height:8px; margin-top:4px; border-radius:50%; background:var(--color-accent); box-shadow:0 0 0 4px var(--color-accent-soft); }
.migration-header__privacy strong { font-size:12px; }
.migration-header__privacy span { grid-column:2; margin:0; font-size:10px; }
.migration-shell { padding-bottom:90px; }
.migration-panel { margin-top:14px; border:1px solid var(--color-line); border-radius:16px; padding:26px; background:var(--color-surface-elevated); box-shadow:0 1px 3px rgb(15 23 42 / 4%); }
.migration-panel:first-child { margin-top:0; }
.migration-panel__heading { display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:14px; margin-bottom:20px; }
.migration-panel__heading h2 { margin:4px 0 0; font-size:20px; font-weight:590; letter-spacing:-.025em; }
.migration-panel__heading > span { color:var(--color-muted); font-size:11px; }
.migration-step { display:grid; width:40px; height:40px; place-items:center; border-radius:10px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; font-weight:700; }
.migration-imports { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.migration-import-card { display:flex; min-height:168px; flex-direction:column; align-items:flex-start; border:1px dashed var(--color-line); border-radius:10px; padding:18px; background:var(--color-bg); }
.migration-import-card strong { font-size:14px; }.migration-import-card span { margin-top:8px; color:var(--color-muted); font-size:11px; line-height:1.5; }.migration-import-card .migration-button { margin-top:auto; }.migration-import-card small { margin-top:10px; color:var(--color-muted); font-size:10px; }
.migration-button { min-height:42px; border:1px solid var(--color-line); border-radius:8px; padding-inline:14px; color:var(--color-text); background:var(--color-surface); cursor:pointer; font-size:11px; font-weight:650; }.migration-button:hover:not(:disabled) { border-color:var(--color-accent); }.migration-button:disabled { color:var(--color-muted); cursor:not-allowed; }.migration-button--primary { color:var(--color-accent-text); border-color:var(--color-accent); background:var(--color-accent); }.migration-button--danger { color:#a24425; }
.migration-notice,.migration-warning { margin:14px 0 0; border:1px solid var(--color-line); border-radius:9px; padding:11px 14px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; }.migration-warning { color:#a24425; background:#ffebe3; }
.migration-table-wrap { overflow-x:auto; border:1px solid var(--color-line); border-radius:10px; }.migration-table { width:100%; min-width:720px; border-collapse:collapse; font-size:11px; }.migration-table th,.migration-table td { border-bottom:1px solid var(--color-line); padding:12px 14px; text-align:left; }.migration-table th { color:var(--color-muted); background:var(--color-bg); font-size:10px; }.migration-table tr:last-child td { border:0; }.migration-table code,.migration-export code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }.migration-table input { width:100%; min-height:36px; border:1px solid var(--color-line); border-radius:6px; padding-inline:8px; color:var(--color-text); background:var(--color-surface); }
.migration-description,.migration-export > p { color:var(--color-muted); font-size:11px; line-height:1.65; }.migration-merge-list { display:grid; gap:10px; margin-top:16px; }.migration-merge-row { display:grid; grid-template-columns:1fr 24px 1fr auto; align-items:center; gap:12px; border:1px solid var(--color-line); border-radius:10px; padding:14px; background:var(--color-bg); }.migration-merge-row label { display:flex; flex-direction:column; gap:7px; color:var(--color-muted); font-size:10px; }.migration-merge-row select { min-height:42px; border:1px solid var(--color-line); border-radius:7px; padding:7px; color:var(--color-text); background:var(--color-surface); font-size:11px; }.migration-merge-arrow { color:var(--color-accent); font-size:18px; text-align:center; }.migration-empty { border:1px dashed var(--color-line); border-radius:10px; padding:18px; color:var(--color-muted); background:var(--color-bg); font-size:11px; }
.migration-summary { display:flex; flex-wrap:wrap; gap:8px; }.migration-summary span { border:1px solid var(--color-line); border-radius:8px; padding:8px 10px; color:var(--color-muted); background:var(--color-surface); font-size:10px; }.migration-summary strong { margin-right:4px; color:var(--color-text); font-size:13px; }.migration-export > p { margin-top:16px; }.migration-export__actions { display:flex; gap:8px; margin-top:16px; }
.migration-settings-heading span { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.16em; }.migration-settings-heading h2 { margin:4px 0 0; font-size:24px; }.migration-settings-heading p,.migration-settings-footer { color:var(--color-muted); font-size:11px; }.migration-settings { display:grid; gap:10px; }.migration-settings label { display:flex; gap:12px; align-items:flex-start; border:1px solid var(--color-line); border-radius:10px; padding:15px; cursor:pointer; }.migration-settings input { width:18px; height:18px; accent-color:var(--color-accent); }.migration-settings strong,.migration-settings small { display:block; }.migration-settings strong { font-size:13px; }.migration-settings small { margin-top:4px; color:var(--color-muted); font-size:11px; line-height:1.5; }
@media (max-width:1024px) { .migration-header { align-items:flex-start; flex-direction:column; gap:24px; }.migration-header__privacy { width:100%; min-width:0; }.migration-imports { grid-template-columns:1fr; } }
@media (max-width:640px) { .migration-header,.migration-shell { width:calc(100% - 28px); }.migration-header { min-height:0; padding-block:28px 30px; }.migration-header h1 { font-size:36px; }.migration-panel { border-radius:12px; padding:16px; }.migration-panel__heading { grid-template-columns:36px 1fr; }.migration-panel__heading > .migration-button,.migration-panel__heading > span { grid-column:2; justify-self:start; }.migration-step { width:36px; height:36px; }.migration-merge-row { grid-template-columns:1fr; }.migration-merge-arrow { transform:rotate(90deg); }.migration-export__actions { flex-direction:column; }.migration-export__actions .migration-button { width:100%; min-height:46px; } }
</style>
