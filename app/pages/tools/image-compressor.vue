<script setup lang="ts">
import JSZip from 'jszip'

import type { DroppedFile } from '~/components/ui/UiFileDropzone.vue'
import type { CompressionFormat, CompressionTask } from '~/utils/imageCompression'
import {
  chooseCompressionOutput,
  createCompressionTasks,
  formatCompressionFileSize,
  isSupportedCompressionFile,
  resolveTargetMimeType,
  resolveUniqueOutputPath,
} from '~/utils/imageCompression'

interface WorkerResponse {
  id: string
  success: boolean
  buffer?: ArrayBuffer
  mimeType?: string
  error?: string
}

interface PendingWorkerTask {
  resolve: (result: { blob: Blob, mimeType: string }) => void
  reject: (error: Error) => void
}

const FORMAT_OPTIONS = [
  { label: '输出 WebP', value: 'webp' },
  { label: '输出 JPEG', value: 'jpeg' },
  { label: '输出 AVIF', value: 'avif' },
  { label: '保持原格式', value: 'original' },
]
const WASM_MIME_TYPES = new Set(['image/avif', 'image/jpeg', 'image/webp'])

useSeoMeta({
  title: '图片压缩 — Web Toolbox',
  description: '在浏览器本地批量压缩图片，支持 WebP、JPEG、AVIF 与原目录结构 ZIP 导出。',
})

const quality = ref(90)
const targetFormat = ref<CompressionFormat>('webp')
const files = ref<CompressionTask[]>([])
const processing = ref(false)
const exporting = ref(false)
const processedCount = ref(0)
const notice = ref('')
const workerAvailable = ref(false)
const { show: showToast } = useToast()
let compressionWorker: Worker | null = null
let taskSequence = 0
const pendingWorkerTasks = new Map<string, PendingWorkerTask>()

const completedFiles = computed(() => files.value.filter(file => file.status === 'success'))
const failedCount = computed(() => files.value.filter(file => file.status === 'failed').length)
const totalOriginalSize = computed(() => completedFiles.value.reduce((total, file) => total + file.originalSize, 0))
const totalOutputSize = computed(() => completedFiles.value.reduce((total, file) => total + file.outputSize, 0))
const totalSavingsPercent = computed(() => totalOriginalSize.value > 0
  ? Math.max(0, Math.round(((totalOriginalSize.value - totalOutputSize.value) / totalOriginalSize.value) * 100))
  : 0)
const progressPercent = computed(() => files.value.length > 0 ? Math.round((processedCount.value / files.value.length) * 100) : 0)

const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}

// 初始化一个复用 Worker，并把异步编码响应分发回对应图片任务
const initCompressionWorker = () => {
  try {
    compressionWorker = new Worker(new URL('../../workers/imageCompression.worker.ts', import.meta.url), { type: 'module' })
    compressionWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = pendingWorkerTasks.get(response.id)
      if (!pending) return
      pendingWorkerTasks.delete(response.id)
      if (response.success && response.buffer && response.mimeType) {
        pending.resolve({ blob: new Blob([response.buffer], { type: response.mimeType }), mimeType: response.mimeType })
      } else {
        pending.reject(new Error(response.error || 'WASM 编码失败'))
      }
    }
    compressionWorker.onerror = () => {
      workerAvailable.value = false
      for (const pending of pendingWorkerTasks.values()) pending.reject(new Error('WASM Worker 运行失败'))
      pendingWorkerTasks.clear()
    }
    workerAvailable.value = true
  } catch {
    workerAvailable.value = false
  }
}

onMounted(initCompressionWorker)
onBeforeUnmount(() => {
  compressionWorker?.terminate()
  for (const pending of pendingWorkerTasks.values()) pending.reject(new Error('页面已关闭'))
  pendingWorkerTasks.clear()
  for (const file of files.value) URL.revokeObjectURL(file.previewUrl)
})

// 导入图片时保留目录层级、去重并释放上一批预览资源
const importImages = (importedFiles: DroppedFile[]) => {
  const images = importedFiles.filter(item => isSupportedCompressionFile(item.file))
  if (images.length === 0) return setNotice('没有检测到可读取的图片', 'warning')
  for (const file of files.value) URL.revokeObjectURL(file.previewUrl)
  files.value = createCompressionTasks(images).map((file, index) => ({ ...file, id: `image-${Date.now()}-${index}` }))
  processedCount.value = 0
  setNotice(`已导入 ${files.value.length} 张图片`, 'success')
}

// 把浏览器可解码图片绘制到 Canvas，得到编码器需要的 RGBA 像素
const readImageData = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法创建 Canvas context')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

// 将像素提交给本地 WASM Worker，并通过 transferable 避免复制大块 RGBA 数据
const encodeWithWorker = (imageData: ImageData, mimeType: string) => new Promise<{ blob: Blob, mimeType: string }>((resolve, reject) => {
  if (!compressionWorker || !workerAvailable.value || !WASM_MIME_TYPES.has(mimeType)) return reject(new Error('WASM Worker 不可用'))
  taskSequence += 1
  const id = `compression-${taskSequence}`
  pendingWorkerTasks.set(id, { resolve, reject })
  compressionWorker.postMessage({ id, imageData, quality: quality.value, mimeType }, [imageData.data.buffer])
})

// 使用 Canvas 完成浏览器原生编码；AVIF 不受支持时回退为 WebP
const encodeWithCanvas = (imageData: ImageData, requestedMimeType: string) => new Promise<{ blob: Blob, mimeType: string }>((resolve, reject) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  if (!context) return reject(new Error('无法创建 Canvas context'))
  context.putImageData(imageData, 0, 0)
  const mimeType = requestedMimeType === 'image/avif' ? 'image/webp' : requestedMimeType
  canvas.toBlob(blob => {
    if (!blob) return reject(new Error('浏览器不支持该输出格式'))
    resolve({ blob, mimeType: blob.type || mimeType })
  }, mimeType, quality.value / 100)
})

// 优先使用 WASM 编码 JPEG、WebP、AVIF，失败后自动交给 Canvas 继续处理
const encodeImage = async (file: File, mimeType: string) => {
  const imageData = await readImageData(file)
  if (WASM_MIME_TYPES.has(mimeType) && workerAvailable.value) {
    try {
      return await encodeWithWorker(imageData, mimeType)
    } catch {
      workerAvailable.value = false
      return await encodeWithCanvas(await readImageData(file), mimeType)
    }
  }
  return await encodeWithCanvas(imageData, mimeType)
}

// 压缩单张图片并只接收真正变小的结果，失败时保留可追踪错误
const compressFile = async (item: CompressionTask) => {
  item.status = 'compressing'
  item.error = undefined
  try {
    const targetMimeType = resolveTargetMimeType(item.file.type, targetFormat.value)
    const encoded = await encodeImage(item.file, targetMimeType)
    const decision = chooseCompressionOutput({
      originalSize: item.originalSize,
      encodedSize: encoded.blob.size,
      originalType: item.file.type,
      encodedType: encoded.mimeType,
      relativePath: item.relativePath,
    })
    item.outputBlob = decision.useOriginal ? item.file : encoded.blob
    item.outputSize = decision.outputSize
    item.outputType = decision.outputType
    item.outputPath = decision.outputPath
    item.savingsPercent = decision.savingsPercent
    item.useOriginal = decision.useOriginal
    item.status = 'success'
  } catch (error) {
    item.status = 'failed'
    item.error = error instanceof Error ? error.message : '图片处理失败'
  } finally {
    processedCount.value += 1
  }
}

// 以有限并发处理任务，避免大量高清图片同时占用主线程与内存
const startCompression = async () => {
  if (files.value.length === 0 || processing.value) return
  processing.value = true
  processedCount.value = 0
  for (const file of files.value) {
    file.status = 'pending'
    file.outputBlob = null
    file.outputSize = 0
    file.outputPath = file.relativePath
    file.error = undefined
  }

  let cursor = 0
  const runner = async () => {
    while (cursor < files.value.length) {
      const item = files.value[cursor]
      cursor += 1
      if (item) await compressFile(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.value.length) }, runner))
  processing.value = false
  const message = failedCount.value > 0
    ? `处理完成：${completedFiles.value.length} 张成功，${failedCount.value} 张失败`
    : `批量压缩完成，总体积减少 ${totalSavingsPercent.value}%`
  setNotice(message, failedCount.value > 0 ? 'warning' : 'success')
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const downloadSingle = (item: CompressionTask) => {
  if (item.status === 'success' && item.outputBlob) downloadBlob(item.outputBlob, item.outputPath.split('/').pop() || item.file.name)
}

// 按导入相对路径重建 ZIP，转换后同名文件通过序号避免互相覆盖
const downloadAll = async () => {
  if (completedFiles.value.length === 0 || exporting.value) return
  exporting.value = true
  try {
    const zip = new JSZip()
    const usedPaths = new Set<string>()
    for (const item of completedFiles.value) {
      if (!item.outputBlob) continue
      const uniquePath = resolveUniqueOutputPath(item.outputPath, usedPaths)
      usedPaths.add(uniquePath)
      zip.file(uniquePath, item.outputBlob)
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `compressed-images-${Date.now()}.zip`)
    setNotice('压缩结果 ZIP 已导出，并保留原目录结构', 'success')
  } catch {
    setNotice('ZIP 导出失败，请减少单次图片数量后重试', 'error')
  } finally {
    exporting.value = false
  }
}

const removeFile = (index: number) => {
  const item = files.value[index]
  if (item) URL.revokeObjectURL(item.previewUrl)
  files.value.splice(index, 1)
}

const clearAll = () => {
  for (const file of files.value) URL.revokeObjectURL(file.previewUrl)
  files.value = []
  processedCount.value = 0
  notice.value = ''
  setNotice('本次图片任务已清空')
}
</script>

<template>
  <div class="compressor-workbench">
    <header class="compressor-header">
      <NuxtLink to="/">← 全部工具</NuxtLink>
    </header>

    <main class="compressor-shell">
      <aside class="compressor-sidebar">
        <section class="compressor-panel compressor-settings">
          <div class="compressor-panel__heading">
            <span>01</span>
            <div><p>压缩设置</p><h2>输出参数</h2></div>
          </div>

          <label class="compressor-quality">
            <span><strong>压缩质量</strong><b>{{ quality }}%</b></span>
            <input v-model.number="quality" type="range" min="5" max="100" :disabled="processing">
            <small>默认 90%。质量越低，通常体积越小。</small>
          </label>

          <label class="compressor-format">
            <strong>输出图片格式</strong>
            <UiSelect v-model="targetFormat" :options="FORMAT_OPTIONS" :disabled="processing" />
          </label>

          <button class="compressor-button compressor-button--primary" type="button" :disabled="files.length === 0 || processing" @click="startCompression">
            {{ processing ? `正在处理 ${processedCount} / ${files.length}` : '开始批量压缩' }}
          </button>
          <button class="compressor-button" type="button" :disabled="completedFiles.length === 0 || processing || exporting" @click="downloadAll">
            {{ exporting ? '正在打包…' : '按原目录导出 ZIP' }}
          </button>
          <button class="compressor-button" type="button" :disabled="files.length === 0 || processing" @click="clearAll">清空文件列表</button>
        </section>

        <section v-if="completedFiles.length > 0" class="compressor-panel compressor-summary">
          <div><p>总体积减少</p><strong>{{ totalSavingsPercent }}%</strong></div>
          <dl>
            <div><dt>原始体积</dt><dd>{{ formatCompressionFileSize(totalOriginalSize) }}</dd></div>
            <div><dt>输出体积</dt><dd>{{ formatCompressionFileSize(totalOutputSize) }}</dd></div>
            <div><dt>成功处理</dt><dd>{{ completedFiles.length }} 张</dd></div>
          </dl>
        </section>
      </aside>

      <div class="compressor-main">
        <section class="compressor-panel">
          <div class="compressor-panel__heading">
            <span>02</span>
            <div><p>导入图片</p><h2>文件或完整目录</h2></div>
          </div>
          <UiFileDropzone
            allow-directory-picker
            accept="image/*,.avif"
            :disabled="processing"
            title="拖拽图片或文件夹至此"
            description="点击可选择多张图片或完整目录"
            dragging-text="松开即可导入图片"
            @files="importImages"
          />
        </section>

        <section v-if="processing" class="compressor-progress" aria-live="polite">
          <div><strong>正在批量压缩</strong><span>{{ processedCount }} / {{ files.length }}</span></div>
          <div><i :style="{ width: `${progressPercent}%` }" /></div>
        </section>

        <p v-if="notice" class="compressor-notice" role="status">{{ notice }}</p>

        <section class="compressor-panel compressor-results">
          <div class="compressor-panel__heading">
            <span>03</span>
            <div><p>处理结果</p><h2>{{ files.length > 0 ? `${files.length} 张图片` : '等待导入' }}</h2></div>
          </div>

          <div v-if="files.length > 0" class="compressor-grid">
            <article v-for="(item, index) in files" :key="item.id" class="compressor-card">
              <div class="compressor-card__thumb"><img :src="item.previewUrl" :alt="item.file.name"></div>
              <div class="compressor-card__body">
                <UiTips :text="item.relativePath" placement="top"><strong>{{ item.file.name }}</strong></UiTips>
                <code>{{ item.relativePath }}</code>
                <p>
                  <span>{{ formatCompressionFileSize(item.originalSize) }}</span>
                  <template v-if="item.status === 'success'">→ <b>{{ formatCompressionFileSize(item.outputSize) }}</b></template>
                </p>
                <div class="compressor-card__footer">
                  <span :class="`compressor-status compressor-status--${item.status}`">
                    <template v-if="item.status === 'pending'">等待处理</template>
                    <template v-else-if="item.status === 'compressing'">正在编码</template>
                    <template v-else-if="item.status === 'failed'">处理失败</template>
                    <template v-else-if="item.useOriginal">原图已较小</template>
                    <template v-else>减少 {{ item.savingsPercent }}%</template>
                  </span>
                  <div>
                    <button v-if="item.status === 'success'" type="button" aria-label="下载单张图片" @click="downloadSingle(item)">↓</button>
                    <button v-if="item.status !== 'compressing'" type="button" aria-label="移除图片" @click="removeFile(index)">×</button>
                  </div>
                </div>
                <UiTips v-if="item.error" :text="item.error"><small class="compressor-card__error">{{ item.error }}</small></UiTips>
              </div>
            </article>
          </div>

          <div v-else class="compressor-empty">
            <span aria-hidden="true">⇩</span>
            <strong>暂无待压缩图片</strong>
            <p>从上方导入图片或目录后，可统一设置质量和输出格式。</p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.compressor-workbench { min-height:calc(100svh - 72px); color:var(--color-text); background:var(--color-bg); }.compressor-header,.compressor-shell { width:min(100% - 48px,1180px); margin-inline:auto; }.compressor-header { display:flex; min-height:92px; align-items:center; justify-content:space-between; gap:24px; padding-block:24px; }.compressor-header a { display:inline-flex; min-height:42px; align-items:center; color:var(--color-muted); font-size:12px; }.compressor-panel__heading p { color:var(--color-accent); font-size:10px; font-weight:700; letter-spacing:.1em; }
.compressor-shell { display:grid; grid-template-columns:310px minmax(0,1fr); align-items:start; gap:14px; padding-bottom:90px; }.compressor-sidebar { display:grid; position:sticky; top:88px; gap:14px; }.compressor-main { display:grid; min-width:0; gap:14px; }.compressor-panel { border:1px solid var(--color-line); border-radius:16px; padding:24px; background:var(--color-surface-elevated); box-shadow:0 1px 3px rgb(15 23 42 / 4%); }.compressor-panel__heading { display:grid; grid-template-columns:40px 1fr; align-items:center; gap:12px; margin-bottom:20px; }.compressor-panel__heading > span { display:grid; width:40px; height:40px; place-items:center; border-radius:10px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; font-weight:700; }.compressor-panel__heading h2 { margin:4px 0 0; font-size:19px; font-weight:590; letter-spacing:-.025em; }.compressor-panel__heading > small { color:var(--color-muted); font-size:10px; }.compressor-settings { display:grid; gap:12px; }.compressor-settings > .compressor-panel__heading { margin-bottom:4px; }.compressor-quality,.compressor-format { display:grid; gap:9px; }.compressor-quality > span { display:flex; align-items:center; justify-content:space-between; }.compressor-quality strong,.compressor-format > strong { font-size:12px; }.compressor-quality b { border-radius:6px; padding:4px 7px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; }.compressor-quality input { width:100%; accent-color:var(--color-accent); }.compressor-quality small { color:var(--color-muted); font-size:10px; line-height:1.5; }.compressor-button { min-height:42px; border:1px solid var(--color-line); border-radius:8px; padding-inline:14px; color:var(--color-text); background:var(--color-surface); cursor:pointer; font-size:11px; font-weight:650; }.compressor-button:hover:not(:disabled) { border-color:var(--color-accent); }.compressor-button:disabled { color:var(--color-muted); cursor:not-allowed; }.compressor-button--primary { color:var(--color-accent-text); border-color:var(--color-accent); background:var(--color-accent); }.compressor-summary > div { display:flex; align-items:flex-end; justify-content:space-between; }.compressor-summary p { color:var(--color-muted); font-size:10px; }.compressor-summary > div strong { color:var(--color-accent); font-size:34px; }.compressor-summary dl { display:grid; gap:8px; margin:16px 0 0; border-top:1px solid var(--color-line); padding-top:14px; }.compressor-summary dl div { display:flex; justify-content:space-between; font-size:10px; }.compressor-summary dt { color:var(--color-muted); }.compressor-summary dd { font-weight:650; }
.compressor-progress { display:grid; gap:9px; border:1px solid var(--color-line); border-radius:12px; padding:14px 16px; background:var(--color-surface-elevated); }.compressor-progress > div:first-child { display:flex; justify-content:space-between; font-size:10px; }.compressor-progress > div:last-child { height:7px; overflow:hidden; border-radius:999px; background:var(--color-line); }.compressor-progress i { display:block; height:100%; border-radius:inherit; background:var(--color-accent); transition:width 160ms ease; }.compressor-notice { border:1px solid var(--color-line); border-radius:9px; padding:11px 14px; color:var(--color-accent); background:var(--color-accent-soft); font-size:11px; }.compressor-results { min-height:300px; }.compressor-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.compressor-card { display:flex; min-width:0; gap:12px; border:1px solid var(--color-line); border-radius:11px; padding:11px; background:var(--color-bg); }.compressor-card__thumb { display:grid; width:82px; height:82px; flex:none; place-items:center; overflow:hidden; border-radius:8px; background-color:var(--color-surface); background-image:linear-gradient(45deg,var(--color-line) 25%,transparent 25%),linear-gradient(-45deg,var(--color-line) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--color-line) 75%),linear-gradient(-45deg,transparent 75%,var(--color-line) 75%); background-position:0 0,0 8px,8px -8px,-8px 0; background-size:16px 16px; }.compressor-card__thumb img { display:block; width:100%; height:100%; object-fit:contain; object-position:center; }.compressor-card__body { display:grid; min-width:0; flex:1; align-content:start; gap:5px; }.compressor-card__body :deep(.ui-tips-anchor) { min-width:0; }.compressor-card__body strong,.compressor-card__body code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.compressor-card__body strong { font-size:12px; }.compressor-card__body code { color:var(--color-muted); font-size:9px; }.compressor-card__body p { display:flex; gap:5px; color:var(--color-muted); font-size:9px; }.compressor-card__body p b { color:var(--color-text); }.compressor-card__footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:3px; }.compressor-status { border-radius:999px; padding:4px 7px; color:var(--color-muted); background:var(--color-surface); font-size:9px; font-weight:650; }.compressor-status--compressing { color:var(--color-accent); background:var(--color-accent-soft); }.compressor-status--success { color:var(--color-accent); background:var(--color-accent-soft); }.compressor-status--failed { color:var(--color-text); border:1px solid var(--color-line); }.compressor-card__footer > div { display:flex; gap:4px; }.compressor-card__footer button { display:grid; width:28px; height:28px; place-items:center; border:1px solid var(--color-line); border-radius:7px; color:var(--color-text); background:var(--color-surface); cursor:pointer; }.compressor-card__footer button:hover { color:var(--color-accent); border-color:var(--color-accent); }.compressor-card__error { display:block; overflow:hidden; color:var(--color-muted); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }.compressor-empty { display:grid; min-height:220px; place-items:center; align-content:center; border:1px dashed color-mix(in srgb,var(--color-line) 72%,var(--color-text)); border-radius:12px; color:var(--color-muted); background:var(--color-bg); text-align:center; }.compressor-empty span { display:grid; width:48px; height:48px; place-items:center; border-radius:50%; color:var(--color-accent); background:var(--color-accent-soft); font-size:24px; }.compressor-empty strong { margin-top:12px; color:var(--color-text); font-size:13px; }.compressor-empty p { margin-top:5px; font-size:10px; }
@media (max-width:1024px) { .compressor-shell { grid-template-columns:1fr; }.compressor-sidebar { position:static; grid-template-columns:1fr 1fr; }.compressor-settings { grid-row:span 2; }.compressor-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:640px) { .compressor-header,.compressor-shell { width:calc(100% - 28px); }.compressor-sidebar { grid-template-columns:1fr; }.compressor-settings { grid-row:auto; }.compressor-panel { border-radius:12px; padding:16px; }.compressor-panel__heading > span { width:36px; height:36px; }.compressor-panel__heading > small { grid-column:2 / -1; }.compressor-grid { grid-template-columns:1fr; }.compressor-card__thumb { width:72px; height:72px; }.compressor-button { min-height:46px; }.compressor-results { min-height:260px; } }
</style>
