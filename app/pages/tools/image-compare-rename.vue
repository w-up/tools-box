<script setup lang="ts">
import JSZip from 'jszip'

import type { ImageAsset, ImportedFile, MatchResult } from '~/types/image-matching'
import { createImageAsset } from '~/utils/imageFingerprint'
import {
  calculateFingerprintSimilarity,
  createBatRenameScript,
  createShellRenameScript,
  createTargetName,
  getDirectory,
  matchFingerprints,
  resolveTargetNames,
} from '~/utils/imageMatching'


useSeoMeta({
  title: '智能图片对比改名 — Web Toolbox',
  description: '在浏览器本地比较两组图片，校正匹配关系并导出改名结果。',
})

const filesA = ref<ImageAsset[]>([])
const filesB = ref<ImageAsset[]>([])
const results = ref<MatchResult[]>([])
const processingA = ref(false)
const processingB = ref(false)
const matching = ref(false)
const exporting = ref(false)
const notice = ref('')
const { show: showToast } = useToast()
const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}
const compareResultId = ref<string | null>(null)


const canMatch = computed(() => filesA.value.length > 0 && filesB.value.length > 0)
const matchedCount = computed(() => results.value.filter(result => result.fileAId).length)
const unmatchedCount = computed(() => results.value.length - matchedCount.value)
const assetsAById = computed(() => new Map(filesA.value.map(asset => [asset.id, asset])))
const assetsBById = computed(() => new Map(filesB.value.map(asset => [asset.id, asset])))

const targetNames = computed(() => {
  const candidates = results.value.map(result => {
    const imageB = assetsBById.value.get(result.fileBId)
    const imageA = result.fileAId ? assetsAById.value.get(result.fileAId) : null
    if (!imageB) return null
    return {
      id: result.id,
      directory: getDirectory(imageB.relativePath),
      desiredName: imageA ? createTargetName(imageA.name, imageB.name) : imageB.name,
    }
  }).filter(candidate => candidate !== null)
  return resolveTargetNames(candidates)
})

const selectedCompare = computed(() => results.value.find(result => result.id === compareResultId.value) ?? null)
const compareImageA = computed(() => selectedCompare.value?.fileAId
  ? assetsAById.value.get(selectedCompare.value.fileAId) ?? null
  : null)
const compareImageB = computed(() => selectedCompare.value
  ? assetsBById.value.get(selectedCompare.value.fileBId) ?? null
  : null)



const releaseAssets = (assets: ImageAsset[]) => {
  for (const asset of assets) URL.revokeObjectURL(asset.previewUrl)
}

// 以有限并发分析图片，避免大量文件同时占满内存
const analyzeFiles = async (files: ImportedFile[], batch: 'A' | 'B') => {
  const unique = files.filter((item, index, all) => all.findIndex(other => (
    other.relativePath === item.relativePath
    && other.file.size === item.file.size
    && other.file.lastModified === item.file.lastModified
  )) === index)
  const assets: ImageAsset[] = []
  let cursor = 0
  const workerCount = Math.min(4, unique.length)

  const worker = async () => {
    while (cursor < unique.length) {
      const index = cursor
      cursor += 1
      const imported = unique[index]
      if (!imported) continue
      try {
        assets[index] = await createImageAsset(imported, batch, index)
      } catch {
        setNotice(`${imported.relativePath} 无法读取，已跳过`, 'warning')
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  return assets.filter(Boolean)
}

const importBatch = async (imported: ImportedFile[], batch: 'A' | 'B') => {
  if (imported.length === 0) {
    setNotice('没有检测到可读取的图片', 'warning')
    return
  }

  const processing = batch === 'A' ? processingA : processingB
  processing.value = true
  notice.value = `正在分析批次 ${batch}…`
  try {
    const next = await analyzeFiles(imported, batch)
    if (batch === 'A') {
      releaseAssets(filesA.value)
      filesA.value = next
    } else {
      releaseAssets(filesB.value)
      filesB.value = next
    }
    results.value = []
    setNotice(`批次 ${batch} 已导入 ${next.length} 张图片`, 'success')
  } finally {
    processing.value = false
  }
}

const startMatching = () => {
  if (!canMatch.value) return
  matching.value = true
  notice.value = '正在计算局部结构与颜色相似度…'
  requestAnimationFrame(() => {
    results.value = matchFingerprints(filesA.value, filesB.value)
    matching.value = false
    setNotice(`匹配完成：${results.value.filter(result => result.fileAId).length} 项已关联，${results.value.filter(result => !result.fileAId).length} 项待校对`, 'success')
    document.querySelector('#match-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

const updateAssociation = (resultId: string, imageAId: string | null) => {
  const result = results.value.find(item => item.id === resultId)
  if (!result) return
  result.fileAId = imageAId
  if (!imageAId) {
    result.similarity = 0
    result.confidence = 'none'
    return
  }

  const imageA = assetsAById.value.get(imageAId)
  const imageB = assetsBById.value.get(result.fileBId)
  if (!imageA || !imageB) return
  result.similarity = calculateFingerprintSimilarity(imageA.fingerprint, imageB.fingerprint)
  result.confidence = result.similarity >= 90
    ? 'high'
    : result.similarity >= 80
      ? 'medium'
      : 'low'
}

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

const exportZip = async () => {
  if (results.value.length === 0) return
  exporting.value = true
  try {
    const zip = new JSZip()
    for (const result of results.value) {
      const imageB = assetsBById.value.get(result.fileBId)
      if (!imageB) continue
      const directory = getDirectory(imageB.relativePath)
      const targetName = targetNames.value.get(result.id) ?? imageB.name
      zip.file(`${directory}${targetName}`, imageB.file)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `renamed-images-${Date.now()}.zip`)
    setNotice('ZIP 已导出', 'success')
  } catch {
    setNotice('ZIP 导出失败，请减少单次图片数量后重试', 'error')
  } finally {
    exporting.value = false
  }
}

const createRenameScript = (platform: 'shell' | 'bat') => {
  const operations = results.value.flatMap(result => {
    if (!result.fileAId) return []
    const imageB = assetsBById.value.get(result.fileBId)
    if (!imageB) return []
    const directory = getDirectory(imageB.relativePath)
    return [{
      sourcePath: imageB.relativePath,
      targetPath: `${directory}${targetNames.value.get(result.id) ?? imageB.name}`,
    }]
  })
  const content = platform === 'shell'
    ? createShellRenameScript(operations)
    : createBatRenameScript(operations)
  const extension = platform === 'shell' ? 'sh' : 'bat'
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `rename-images.${extension}`)
  setNotice(`${extension.toUpperCase()} 脚本已导出`, 'success')
}



const clearAll = () => {
  releaseAssets(filesA.value)
  releaseAssets(filesB.value)
  filesA.value = []
  filesB.value = []
  results.value = []
  compareResultId.value = null

  setNotice('数据已清空')
}

onBeforeUnmount(() => {
  releaseAssets(filesA.value)
  releaseAssets(filesB.value)
})
</script>

<template>
  <div class="rename-workbench">
    <header class="workbench-header">
      <div>
        <NuxtLink class="workbench-header__back" to="/">← 全部工具</NuxtLink>
        <p>图片工具 · 本地处理</p>
        <h1>智能图片对比改名</h1>
        <span>导入两组图片，自动匹配并沿用参考组文件名。</span>
      </div>
      <div class="workbench-header__privacy">
        <i aria-hidden="true" />
        <strong>文件不会上传</strong>
        <span>所有分析与导出均在当前浏览器中完成</span>
      </div>
    </header>

    <div class="workbench-shell">
      <section class="workbench-step" aria-labelledby="import-title">
        <div class="workbench-step__heading">
          <div class="workbench-step__number">01</div>
          <div>
            <p>导入图片</p>
            <h2 id="import-title">准备参考组与待改名组</h2>
          </div>
          <span>A 组提供名称，B 组接受新名称</span>
        </div>

        <div class="workbench-batches">
          <ImageRenameImageBatchPicker
            batch="A"
            title="标准命名参考组"
            description="图片文件名将成为匹配成功后的命名来源。"
            accent="blue"
            :assets="filesA"
            :processing="processingA"
            @files="importBatch($event, 'A')"
          />
          <ImageRenameImageBatchPicker
            batch="B"
            title="待改名图片组"
            description="数量可以不同，未匹配图片会保留原名。"
            accent="violet"
            :assets="filesB"
            :processing="processingB"
            @files="importBatch($event, 'B')"
          />
        </div>
      </section>

      <section class="workbench-engine" aria-label="匹配控制">
        <div class="workbench-engine__icon" aria-hidden="true">⌁</div>
        <div class="workbench-engine__copy">
          <p>02 · 智能匹配</p>
          <h2>局部结构与颜色联合比对</h2>
          <span>使用 5 区域局部平均感知哈希，结合透明覆盖率和纵横比。</span>
        </div>
        <div class="workbench-engine__stats">
          <span><strong>{{ filesA.length }}</strong>A 组</span>
          <span><strong>{{ filesB.length }}</strong>B 组</span>
        </div>
        <div class="workbench-engine__actions">
          <button type="button" class="workbench-button workbench-button--primary" :disabled="!canMatch || matching" @click="startMatching">
            {{ matching ? '正在匹配…' : '开始匹配' }}
          </button>
          <button type="button" class="workbench-button" :disabled="filesA.length + filesB.length === 0" @click="clearAll">清空数据</button>
        </div>
      </section>

      <p v-if="notice" class="workbench-notice" role="status">{{ notice }}</p>

      <section id="match-results" class="workbench-results" aria-labelledby="results-title">
        <div class="workbench-step__heading workbench-results__heading">
          <div class="workbench-step__number">03</div>
          <div>
            <p>校对与导出</p>
            <h2 id="results-title">匹配结果</h2>
          </div>
          <div v-if="results.length > 0" class="workbench-result-counts">
            <span><strong>{{ matchedCount }}</strong> 已匹配</span>
            <span><strong>{{ unmatchedCount }}</strong> 待校对</span>
          </div>
        </div>

        <div v-if="results.length > 0" class="workbench-exportbar">
          <p>未匹配图片按原名进入 ZIP；脚本只包含已确认的改名项。</p>
          <div>
            <button type="button" class="workbench-button workbench-button--primary" :disabled="exporting" @click="exportZip">
              {{ exporting ? '正在打包…' : '导出 ZIP' }}
            </button>
            <button type="button" class="workbench-button" @click="createRenameScript('shell')">macOS / Linux 脚本</button>
            <button type="button" class="workbench-button" @click="createRenameScript('bat')">Windows 脚本</button>
          </div>
        </div>

        <div v-if="results.length > 0" class="workbench-result-grid">
          <ImageRenameMatchResultItem
            v-for="result in results"
            :key="result.id"
            :result="result"
            :image-a="result.fileAId ? assetsAById.get(result.fileAId) ?? null : null"
            :image-b="assetsBById.get(result.fileBId)!"
            :all-a="filesA"
            :target-name="targetNames.get(result.id) ?? assetsBById.get(result.fileBId)?.name ?? ''"
            @compare="compareResultId = result.id"
            @associate="updateAssociation(result.id, $event)"
          />
        </div>

        <div v-else class="workbench-empty">
          <span aria-hidden="true">↔</span>
          <strong>等待匹配结果</strong>
          <p>导入 A、B 两组图片并点击“开始匹配”，结果会显示在这里。</p>
        </div>
      </section>


    </div>

    <ImageRenameImageCompareModal
      :open="Boolean(compareResultId)"
      :image-a="compareImageA"
      :image-b="compareImageB"
      :similarity="selectedCompare?.similarity ?? 0"
      @close="compareResultId = null"
    />
  </div>
</template>

<style scoped>
.rename-workbench {
  min-height: calc(100svh - 72px);
  color: var(--color-text);
  background: var(--color-bg);
}

.workbench-header,
.workbench-shell {
  width: min(100% - 48px, 1180px);
  margin-inline: auto;
}

.workbench-header {
  display: flex;
  min-height: 220px;
  align-items: flex-end;
  justify-content: space-between;
  gap: 56px;
  padding-block: 42px 44px;
}

.workbench-header__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--color-muted);
  font-size: 12px;
}

.workbench-header p {
  margin-top: 24px;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.workbench-header h1 {
  margin: 8px 0 0;
  font-size: clamp(38px, 4.5vw, 58px);
  font-weight: 590;
  letter-spacing: -0.055em;
  line-height: 1;
}

.workbench-header > div > span {
  display: block;
  margin-top: 16px;
  color: var(--color-muted);
  font-size: 14px;
}

.workbench-header__privacy {
  display: grid;
  min-width: 310px;
  grid-template-columns: 10px 1fr;
  gap: 4px 10px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  padding: 16px 18px;
  background: var(--color-surface);
}

.workbench-header__privacy i {
  width: 8px;
  height: 8px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-soft);
}

.workbench-header__privacy strong {
  font-size: 12px;
  font-weight: 650;
}

.workbench-header__privacy span {
  grid-column: 2;
  color: var(--color-muted);
  font-size: 10px;
}

.workbench-shell {
  padding-bottom: 90px;
}

.workbench-step,
.workbench-results {
  border: 1px solid var(--color-line);
  border-radius: 16px;
  padding: 26px;
  background: var(--color-surface-elevated);
  box-shadow: 0 1px 3px rgb(15 23 42 / 4%);
}

.workbench-step__heading {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
}

.workbench-step__number {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 10px;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  font-size: 11px;
  font-weight: 700;
}

.workbench-step__heading p,
.workbench-engine__copy p {
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.workbench-step__heading h2,
.workbench-engine__copy h2 {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 590;
  letter-spacing: -0.025em;
}

.workbench-step__heading > span {
  color: var(--color-muted);
  font-size: 11px;
}

.workbench-batches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.workbench-engine {
  display: grid;
  margin-block: 14px;
  grid-template-columns: 46px 1fr auto auto;
  align-items: center;
  gap: 18px;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  padding: 20px 22px;
  background: var(--color-surface-elevated);
  box-shadow: 0 1px 3px rgb(15 23 42 / 4%);
}

.workbench-engine__icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  color: var(--color-accent-text);
  background: var(--color-accent);
  font-size: 26px;
}

.workbench-engine__copy span {
  display: block;
  margin-top: 5px;
  color: var(--color-muted);
  font-size: 11px;
}

.workbench-engine__stats {
  display: flex;
  gap: 8px;
}

.workbench-engine__stats span {
  display: flex;
  min-width: 58px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 1px solid var(--color-line);
  border-radius: 9px;
  color: var(--color-muted);
  background: var(--color-surface);
  font-size: 9px;
}

.workbench-engine__stats strong {
  color: var(--color-text);
  font-size: 16px;
}

.workbench-engine__actions,
.workbench-exportbar > div {
  display: flex;
  gap: 8px;
}

.workbench-button {
  min-height: 42px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  padding-inline: 15px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.workbench-button:hover:not(:disabled) {
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

.workbench-button:disabled {
  color: var(--color-muted);
  border-color: var(--color-line);
  background: color-mix(in srgb, var(--color-line) 28%, var(--color-surface));
  cursor: not-allowed;
}

.workbench-button--primary {
  color: var(--color-accent-text);
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.workbench-button--primary:hover:not(:disabled) {
  border-color: var(--color-accent-hover);
  background: var(--color-accent-hover);
}

.workbench-notice {
  margin: 0 0 14px;
  border: 1px solid var(--color-line);
  border-radius: 9px;
  padding: 11px 14px;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  font-size: 11px;
}

.workbench-results {
  scroll-margin-top: 20px;
}


.workbench-results__heading {
  margin-bottom: 18px;
}

.workbench-result-counts {
  display: flex;
  gap: 8px;
}

.workbench-result-counts span {
  min-width: 74px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--color-muted);
  background: var(--color-surface);
  font-size: 10px;
  text-align: center;
}

.workbench-result-counts strong {
  margin-right: 4px;
  color: var(--color-text);
  font-size: 13px;
}

.workbench-exportbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--color-bg);
}

.workbench-exportbar p {
  color: var(--color-muted);
  font-size: 10px;
}

.workbench-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.workbench-empty {
  display: grid;
  min-height: 190px;
  place-items: center;
  align-content: center;
  border: 1px dashed color-mix(in srgb, var(--color-line) 72%, var(--color-text));
  border-radius: 12px;
  color: var(--color-muted);
  background: var(--color-bg);
  text-align: center;
}

.workbench-empty span {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  font-size: 22px;
}

.workbench-empty strong {
  margin-top: 12px;
  color: var(--color-text);
  font-size: 14px;
}

.workbench-empty p {
  max-width: 360px;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 1024px) {
  .workbench-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 24px;
  }

  .workbench-header__privacy {
    width: 100%;
    min-width: 0;
  }

  .workbench-batches {
    grid-template-columns: 1fr;
  }

  .workbench-engine {
    grid-template-columns: 46px 1fr;
  }

  .workbench-engine__stats,
  .workbench-engine__actions {
    grid-column: 2;
    justify-content: flex-start;
  }

  .workbench-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }


}

@media (max-width: 640px) {
  .workbench-header,
  .workbench-shell {
    width: calc(100% - 28px);
  }

  .workbench-header {
    min-height: 0;
    padding-block: 28px 30px;
  }

  .workbench-header p {
    margin-top: 18px;
  }

  .workbench-header h1 {
    font-size: 36px;
  }

  .workbench-step,
  .workbench-results {
    border-radius: 12px;
    padding: 16px;
  }

  .workbench-step__heading {
    grid-template-columns: 36px 1fr auto;
  }

  .workbench-step__number {
    width: 36px;
    height: 36px;
  }

  .workbench-step__heading > span,
  .workbench-result-counts {
    grid-column: 2 / -1;
  }

  .workbench-engine {
    grid-template-columns: 40px 1fr;
    gap: 12px;
    padding: 16px;
  }

  .workbench-engine__icon {
    width: 40px;
    height: 40px;
  }

  .workbench-engine__actions,
  .workbench-exportbar,
  .workbench-exportbar > div {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench-engine__actions .workbench-button,
  .workbench-exportbar .workbench-button {
    width: 100%;
    min-height: 46px;
  }

  .workbench-result-grid {
    grid-template-columns: 1fr;
  }
}
</style>
