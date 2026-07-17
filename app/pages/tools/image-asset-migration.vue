<script setup lang="ts">
import JSZip from 'jszip'

import type { DroppedFile } from '~/components/ui/UiFileDropzone.vue'
import type { ImageAsset, ImportedFile, MatchResult } from '~/types/image-matching'
import type { ManualAssetMerge } from '~/utils/assetMigration'
import { createAssetMigrationPlan, rewriteAssetReferences } from '~/utils/assetMigration'
import { createImageAsset } from '~/utils/imageFingerprint'
import { createTargetName, getDirectory, matchFingerprints, resolveTargetNames } from '~/utils/imageMatching'

interface ProjectFile {
  file: File
  relativePath: string
  content?: string
}

interface MigrationSettings {
  updateReferences: boolean
  removeDuplicates: boolean
}

const SETTINGS_KEY = 'web-toolbox:asset-migration-settings'
const CODE_FILE_PATTERN = /\.(?:css|html?|json|jsx?|less|sass|scss|tsx?|vue)$/i
const DEFAULT_SETTINGS: MigrationSettings = {
  updateReferences: true,
  removeDuplicates: false,
}

useSeoMeta({
  title: '图片资源迁移 — Web Toolbox',
  description: '以模板图片规范项目资源命名，并在浏览器本地同步更新代码引用。',
})

const templateImages = ref<ImageAsset[]>([])
const projectFiles = ref<ProjectFile[]>([])
const projectImages = ref<ImageAsset[]>([])
const matches = ref<MatchResult[]>([])
const merges = ref<ManualAssetMerge[]>([])
const settings = reactive<MigrationSettings>({ ...DEFAULT_SETTINGS })
const settingsOpen = ref(false)
const exporting = ref(false)
const processingTemplates = ref(false)
const processingProject = ref(false)
const matching = ref(false)
const notice = ref('')
const { show: showToast } = useToast()

const templatePreviewFiles = computed<DroppedFile[]>(() => templateImages.value.map(image => ({ file: image.file, relativePath: image.relativePath })))
const projectPreviewFiles = computed<DroppedFile[]>(() => projectFiles.value.map(file => ({ file: file.file, relativePath: file.relativePath })))
const codeFiles = computed(() => projectFiles.value.filter(file => file.content !== undefined))
const templateById = computed(() => new Map(templateImages.value.map(image => [image.id, image])))
const matchByProjectId = computed(() => new Map(matches.value.map(match => [match.fileBId, match])))
const projectImageOptions = computed(() => projectImages.value.map(image => ({ label: image.relativePath, value: image.name })))

// 过滤已在其他规则中使用的源图片，避免重复合并到不同目标
const mergeSourceOptions = (index: number, targetName: string) => projectImageOptions.value.map(option => ({
  ...option,
  disabled: option.value === targetName || isSourceInOtherMerge(option.value, index),
}))

// 根据视觉匹配结果生成项目图片的规范目标名，并解决同目录名称冲突
const targetNames = computed(() => resolveTargetNames(projectImages.value.map(image => {
  const match = matchByProjectId.value.get(image.id)
  const template = match?.fileAId ? templateById.value.get(match.fileAId) : undefined
  return {
    id: image.id,
    directory: getDirectory(image.relativePath),
    desiredName: template ? createTargetName(template.name, image.name) : image.name,
  }
})))
const sourceNames = computed(() => projectImages.value.map(image => image.name))
const plan = computed(() => createAssetMigrationPlan(
  sourceNames.value,
  merges.value,
  settings.removeDuplicates,
  new Map(projectImages.value.map(image => [image.name, targetNames.value.get(image.id) ?? image.name])),
))
const planBySource = computed(() => new Map(plan.value.map(item => [item.sourceName, item])))
const targetBySource = computed(() => new Map(plan.value.map(item => [item.sourceName, item.targetName])))
const duplicateSourceNames = computed(() => {
  const counts = new Map<string, number>()
  for (const image of projectImages.value) counts.set(image.name, (counts.get(image.name) ?? 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
})
const duplicateTargets = computed(() => {
  const counts = new Map<string, number>()
  for (const image of projectImages.value) {
    const item = planBySource.value.get(image.name)
    if (item?.action !== 'keep') continue
    counts.set(item.targetName, (counts.get(item.targetName) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name)
})
const codeChangeCount = computed(() => codeFiles.value.reduce((count, file) => (
  rewriteAssetReferences(file.content ?? '', targetBySource.value) === file.content ? count : count + 1
), 0))
const matchedCount = computed(() => matches.value.filter(match => match.fileAId).length)
const canExport = computed(() => (
  templateImages.value.length > 0
  && projectImages.value.length > 0
  && matches.value.length === projectImages.value.length
  && duplicateSourceNames.value.length === 0
  && duplicateTargets.value.length === 0
))

const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}

// 保存处理偏好，但不保存浏览器无法恢复的本地 File 对象
const persistSettings = () => useLocalStorage.set(SETTINGS_KEY, settings)
onMounted(() => {
  const stored = useLocalStorage.get<Partial<MigrationSettings>>(SETTINGS_KEY)
  if (stored) Object.assign(settings, DEFAULT_SETTINGS, stored)
})
watch(settings, persistSettings, { deep: true })

// 分批提取图片指纹，避免大型目录一次性阻塞浏览器主线程
const analyzeImages = async (files: DroppedFile[], batch: 'A' | 'B') => {
  const results: ImageAsset[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++
      const imported = files[index]
      if (!imported) continue
      try {
        results[index] = await createImageAsset(imported as ImportedFile, batch, index)
      } catch {
        setNotice(`${imported.relativePath} 无法读取，已跳过`, 'warning')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(files.length, 4) }, worker))
  return results.filter(Boolean)
}

// 左侧导入模板图：它们提供视觉对比基准与最终规范文件名
const importTemplateImages = async (files: DroppedFile[]) => {
  if (files.length === 0) return setNotice('没有检测到可读取的模板图片', 'warning')
  processingTemplates.value = true
  templateImages.value = await analyzeImages(files, 'A')
  processingTemplates.value = false
  matches.value = []
  merges.value = []
  setNotice(`已导入 ${templateImages.value.length} 张模板图片`, 'success')
}

// 右侧导入完整项目目录，保留多层相对路径并自动区分图片、代码和其他文件
const importProjectDirectory = async (files: DroppedFile[]) => {
  if (files.length === 0) return setNotice('没有检测到项目文件', 'warning')
  processingProject.value = true
  projectFiles.value = await Promise.all(files.map(async item => ({
    ...item,
    content: CODE_FILE_PATTERN.test(item.file.name) ? await item.file.text() : undefined,
  })))
  projectImages.value = await analyzeImages(files.filter(item => item.file.type.startsWith('image/')), 'B')
  processingProject.value = false
  matches.value = []
  merges.value = []
  setNotice(`项目目录已导入：${projectImages.value.length} 张图片、${codeFiles.value.length} 个代码文件`, 'success')
}

// 执行模板与项目图片的一对一视觉匹配，匹配结果用于自动命名建议
const startMatching = () => {
  if (templateImages.value.length === 0 || projectImages.value.length === 0) return
  matching.value = true
  requestAnimationFrame(() => {
    matches.value = matchFingerprints(templateImages.value, projectImages.value)
    matching.value = false
    setNotice(`匹配完成：${matchedCount.value} 张项目图片已匹配到模板`, 'success')
  })
}

const addMerge = () => {
  const fallback = projectImages.value[0]?.name
  if (fallback) merges.value.push({ sourceNames: [], targetName: fallback })
}
const removeMerge = (index: number) => merges.value.splice(index, 1)
const isSourceInOtherMerge = (sourceName: string, currentIndex: number) => merges.value.some((merge, index) => index !== currentIndex && merge.sourceNames.includes(sourceName))

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// 按项目原目录导出副本：图片改名、代码引用更新，其余文件原样保留
const exportMigration = async () => {
  if (!canExport.value) return
  exporting.value = true
  try {
    const zip = new JSZip()
    const imageByPath = new Map(projectImages.value.map(image => [image.relativePath, image]))
    for (const projectFile of projectFiles.value) {
      const image = imageByPath.get(projectFile.relativePath)
      if (image) {
        const item = planBySource.value.get(image.name)
        if (!item || item.action === 'remove') continue
        zip.file(`${getDirectory(image.relativePath)}${item.targetName}`, image.file)
        continue
      }
      const content = projectFile.content === undefined || !settings.updateReferences
        ? projectFile.file
        : rewriteAssetReferences(projectFile.content, targetBySource.value)
      zip.file(projectFile.relativePath, content)
    }
    zip.file('migration-report.json', JSON.stringify({
      settings,
      templates: templateImages.value.map(image => image.relativePath),
      matches: matches.value,
      imagePlan: plan.value,
      codeFiles: codeFiles.value.map(file => ({ path: file.relativePath, changed: rewriteAssetReferences(file.content ?? '', targetBySource.value) !== file.content })),
    }, null, 2))
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `image-migration-${Date.now()}.zip`)
    setNotice('项目迁移 ZIP 已导出；原始目录未被修改', 'success')
  } catch {
    setNotice('导出失败，请减少单次文件数量后重试', 'error')
  } finally {
    exporting.value = false
  }
}

const clearAll = () => {
  templateImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl))
  projectImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl))
  templateImages.value = []
  projectFiles.value = []
  projectImages.value = []
  matches.value = []
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
        <span>用模板图片规范项目资源命名，并同步更新代码引用。</span>
      </div>
      <div class="migration-header__privacy"><i aria-hidden="true" /><strong>文件不会上传</strong><span>比对、替换和导出全部在当前浏览器完成</span></div>
    </header>

    <main class="migration-shell">
      <section class="migration-panel">
        <div class="migration-panel__heading"><div class="migration-step">01</div><div><p>导入资源</p><h2>模板图片与待整理项目</h2></div><button class="migration-button" type="button" @click="settingsOpen = true">处理设置</button></div>
        <div class="migration-imports">
          <div class="migration-import-card">
            <strong>模板图片</strong>
            <UiFileDropzone accept="image/*" title="拖拽模板图片或模板文件夹至此" description="模板文件名将作为项目图片的规范命名" dragging-text="松开即可导入模板图片" :preview-files="templatePreviewFiles" @files="importTemplateImages" />
            <small>{{ processingTemplates ? '正在分析模板图片…' : templateImages.length > 0 ? `已导入 ${templateImages.length} 张模板图片` : '尚未导入' }}</small>
          </div>
          <div class="migration-import-card">
            <strong>待整理项目目录</strong>
            <UiFileDropzone title="拖拽完整项目文件夹至此" description="会读取多层 img/、assets/ 等目录中的图片和代码文件" dragging-text="松开即可导入项目目录" :preview-files="projectPreviewFiles" @files="importProjectDirectory" />
            <small>{{ processingProject ? '正在读取项目目录…' : projectFiles.length > 0 ? `已导入 ${projectImages.length} 张图片、${codeFiles.length} 个代码文件` : '尚未导入' }}</small>
          </div>
        </div>
      </section>

      <p v-if="notice" class="migration-notice" role="status">{{ notice }}</p>

      <section class="migration-panel" aria-labelledby="match-title">
        <div class="migration-panel__heading"><div class="migration-step">02</div><div><p>模板匹配</p><h2 id="match-title">生成规范命名建议</h2></div><button class="migration-button migration-button--primary" type="button" :disabled="templateImages.length === 0 || projectImages.length === 0 || matching" @click="startMatching">{{ matching ? '正在匹配…' : '开始匹配模板' }}</button></div>
        <div v-if="projectImages.length > 0" class="migration-table-wrap">
          <table class="migration-table"><thead><tr><th>项目图片路径</th><th>匹配模板</th><th>相似度</th><th>最终文件名</th></tr></thead><tbody>
            <tr v-for="image in projectImages" :key="image.id">
              <td><UiTips :text="image.relativePath"><code>{{ image.relativePath }}</code></UiTips></td>
              <td><UiTips :text="matchByProjectId.get(image.id)?.fileAId ? templateById.get(matchByProjectId.get(image.id)?.fileAId ?? '')?.relativePath ?? '—' : '未匹配'"><code>{{ matchByProjectId.get(image.id)?.fileAId ? templateById.get(matchByProjectId.get(image.id)?.fileAId ?? '')?.name : '未匹配' }}</code></UiTips></td>
              <td>{{ matchByProjectId.get(image.id)?.fileAId ? `${matchByProjectId.get(image.id)?.similarity}%` : '—' }}</td>
              <td><code>{{ targetNames.get(image.id) ?? image.name }}</code></td>
            </tr>
          </tbody></table>
        </div>
        <div v-else class="migration-empty">先导入模板图片和待整理项目目录。</div>
        <p v-if="duplicateSourceNames.length > 0" class="migration-warning">存在同名项目图片：{{ duplicateSourceNames.join('、') }}。为避免误改引用，请先改为唯一名称后导出。</p>
        <p v-if="duplicateTargets.length > 0" class="migration-warning">最终文件名冲突：{{ duplicateTargets.join('、') }}。请调整匹配或通过合并规则处理。</p>
      </section>

      <section class="migration-panel" aria-labelledby="merge-title">
        <div class="migration-panel__heading"><div class="migration-step">03</div><div><p>重复项合并</p><h2 id="merge-title">手动确认重复图片</h2></div><button class="migration-button" type="button" :disabled="projectImages.length === 0" @click="addMerge">新增合并规则</button></div>
        <p class="migration-description">选择待移除图片和保留目标。开启“去除确认重复图片”后，导出项目会移除待处理图片，代码引用统一改为保留图片的最终规范名。</p>
        <div v-if="merges.length > 0" class="migration-merge-list">
          <div v-for="(merge, index) in merges" :key="index" class="migration-merge-row">
            <label>待移除图片<UiSelect v-model="merge.sourceNames" multiple placeholder="选择待移除图片" :options="mergeSourceOptions(index, merge.targetName)" /></label>
            <span class="migration-merge-arrow">→</span>
            <label>保留图片<UiSelect v-model="merge.targetName" placeholder="选择保留图片" :options="projectImageOptions" /></label>
            <button class="migration-button migration-button--danger" type="button" @click="removeMerge(index)">删除规则</button>
          </div>
        </div>
        <div v-else class="migration-empty">默认不自动删除相似图片；仅在你明确确认后才会合并。</div>
      </section>

      <section class="migration-panel migration-export" aria-labelledby="export-title">
        <div class="migration-panel__heading"><div class="migration-step">04</div><div><p>检查与导出</p><h2 id="export-title">导出规范化项目副本</h2></div></div>
        <div class="migration-summary"><span><strong>{{ templateImages.length }}</strong> 模板图片</span><span><strong>{{ projectImages.length }}</strong> 项目图片</span><span><strong>{{ matchedCount }}</strong> 已匹配</span><span><strong>{{ codeFiles.length }}</strong> 代码文件</span><span><strong>{{ codeChangeCount }}</strong> 将更新的代码文件</span></div>
        <p>导出包保留项目原目录结构：图片在原目录改名，HTML/CSS/JS 等代码中的旧图片引用同步更新，其他文件原样保留。</p>
        <div class="migration-export__actions"><button class="migration-button migration-button--primary" type="button" :disabled="!canExport || exporting" @click="exportMigration">{{ exporting ? '正在打包…' : '导出项目 ZIP' }}</button><button class="migration-button" type="button" :disabled="projectFiles.length === 0 && templateImages.length === 0" @click="clearAll">清空本次数据</button></div>
      </section>
    </main>

    <UiModal v-model="settingsOpen" width="620px"><template #header><div class="migration-settings-heading"><span>PROCESS SETTINGS</span><h2>处理设置</h2><p>设置会保存到当前浏览器；导入文件和匹配任务不会保存。</p></div></template><div class="migration-settings"><label><input v-model="settings.updateReferences" type="checkbox"> <span><strong>同步代码引用</strong><small>导出更新后的代码副本，不改写原始项目文件。</small></span></label><label><input v-model="settings.removeDuplicates" type="checkbox"> <span><strong>去除确认重复图片</strong><small>只对第 03 步明确指定的待移除图片生效。</small></span></label></div><template #footer="{ close }"><span class="migration-settings-footer">刷新页面后仍会保留这些设置</span><button class="migration-button migration-button--primary" type="button" @click="close">完成</button></template></UiModal>
  </div>
</template>

<style scoped>
.migration-workbench { min-height:calc(100svh - 72px); color:var(--color-text); background:var(--color-bg); }.migration-header,.migration-shell { width:min(100% - 48px,1180px); margin-inline:auto; }.migration-header { display:flex; min-height:220px; align-items:flex-end; justify-content:space-between; gap:48px; padding-block:42px 44px; }.migration-header__back { display:inline-flex; min-height:44px; align-items:center; color:var(--color-muted); font-size:12px; }.migration-header p,.migration-panel__heading p { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.1em; }.migration-header > div > p { margin-top:24px; }.migration-header h1 { margin:8px 0 0; font-size:clamp(38px,4.5vw,58px); font-weight:590; letter-spacing:-.055em; line-height:1; }.migration-header > div > span { display:block; margin-top:16px; color:var(--color-muted); font-size:14px; }.migration-header__privacy { display:grid; min-width:310px; grid-template-columns:10px 1fr; gap:4px 10px; border:1px solid var(--color-line); border-radius:10px; padding:16px 18px; background:var(--color-surface); }.migration-header__privacy i { width:8px; height:8px; margin-top:4px; border-radius:50%; background:var(--color-accent); box-shadow:0 0 0 4px var(--color-accent-soft); }.migration-header__privacy strong { font-size:12px; }.migration-header__privacy span { grid-column:2; margin:0; font-size:10px; }.migration-shell { padding-bottom:90px; }.migration-panel { margin-top:14px; border:1px solid var(--color-line); border-radius:16px; padding:26px; background:var(--color-surface-elevated); box-shadow:0 1px 3px rgb(15 23 42 / 4%); }.migration-panel:first-child { margin-top:0; }.migration-panel__heading { display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:14px; margin-bottom:20px; }.migration-panel__heading h2 { margin:4px 0 0; font-size:20px; font-weight:590; letter-spacing:-.025em; }.migration-step { display:grid; width:40px; height:40px; place-items:center; border-radius:10px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; font-weight:700; }.migration-imports { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.migration-import-card { display:flex; min-width:0; flex-direction:column; gap:10px; }.migration-import-card strong { font-size:14px; }.migration-import-card small { color:var(--color-muted); font-size:10px; }.migration-button { min-height:42px; border:1px solid var(--color-line); border-radius:8px; padding-inline:14px; color:var(--color-text); background:var(--color-surface); cursor:pointer; font-size:11px; font-weight:650; }.migration-button:hover:not(:disabled) { border-color:var(--color-accent); }.migration-button:disabled { color:var(--color-muted); cursor:not-allowed; }.migration-button--primary { color:var(--color-accent-text); border-color:var(--color-accent); background:var(--color-accent); }.migration-button--danger { color:#a24425; }.migration-notice,.migration-warning { margin:14px 0 0; border:1px solid var(--color-line); border-radius:9px; padding:11px 14px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; }.migration-warning { color:#a24425; background:#ffebe3; }.migration-table-wrap { overflow-x:auto; border:1px solid var(--color-line); border-radius:10px; }.migration-table { width:100%; min-width:720px; border-collapse:collapse; font-size:11px; }.migration-table th,.migration-table td { border-bottom:1px solid var(--color-line); padding:12px 14px; text-align:left; }.migration-table th { color:var(--color-muted); background:var(--color-bg); font-size:10px; }.migration-table tr:last-child td { border:0; }.migration-table code,.migration-export code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }.migration-table code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.migration-description,.migration-export > p { color:var(--color-muted); font-size:11px; line-height:1.65; }.migration-merge-list { display:grid; gap:10px; margin-top:16px; }.migration-merge-row { display:grid; grid-template-columns:1fr 24px 1fr auto; align-items:center; gap:12px; border:1px solid var(--color-line); border-radius:10px; padding:14px; background:var(--color-bg); }.migration-merge-row label { display:flex; flex-direction:column; gap:7px; color:var(--color-muted); font-size:10px; }.migration-merge-arrow { color:var(--color-accent); font-size:18px; text-align:center; }.migration-empty { border:1px dashed var(--color-line); border-radius:10px; padding:18px; color:var(--color-muted); background:var(--color-bg); font-size:11px; }.migration-summary { display:flex; flex-wrap:wrap; gap:8px; }.migration-summary span { border:1px solid var(--color-line); border-radius:8px; padding:8px 10px; color:var(--color-muted); background:var(--color-surface); font-size:10px; }.migration-summary strong { margin-right:4px; color:var(--color-text); font-size:13px; }.migration-export > p { margin-top:16px; }.migration-export__actions { display:flex; gap:8px; margin-top:16px; }.migration-settings-heading span { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.16em; }.migration-settings-heading h2 { margin:4px 0 0; font-size:24px; }.migration-settings-heading p,.migration-settings-footer { color:var(--color-muted); font-size:11px; }.migration-settings { display:grid; gap:10px; }.migration-settings label { display:flex; gap:12px; align-items:flex-start; border:1px solid var(--color-line); border-radius:10px; padding:15px; cursor:pointer; }.migration-settings input { width:18px; height:18px; accent-color:var(--color-accent); }.migration-settings strong,.migration-settings small { display:block; }.migration-settings strong { font-size:13px; }.migration-settings small { margin-top:4px; color:var(--color-muted); font-size:11px; line-height:1.5; }
@media (max-width:1024px) { .migration-header { align-items:flex-start; flex-direction:column; gap:24px; }.migration-header__privacy { width:100%; min-width:0; }.migration-imports { grid-template-columns:1fr; } }.migration-table :deep(.ui-tips-anchor) { display:block; max-width:260px; }
@media (max-width:640px) { .migration-header,.migration-shell { width:calc(100% - 28px); }.migration-header { min-height:0; padding-block:28px 30px; }.migration-header h1 { font-size:36px; }.migration-panel { border-radius:12px; padding:16px; }.migration-panel__heading { grid-template-columns:36px 1fr; }.migration-panel__heading > .migration-button { grid-column:2; justify-self:start; }.migration-step { width:36px; height:36px; }.migration-merge-row { grid-template-columns:1fr; }.migration-merge-arrow { transform:rotate(90deg); }.migration-export__actions { flex-direction:column; }.migration-export__actions .migration-button { width:100%; min-height:46px; } }
</style>
