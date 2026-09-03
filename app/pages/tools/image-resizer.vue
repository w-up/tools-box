<script setup lang="ts">
import JSZip from 'jszip'

import type { DroppedFile } from '~/components/ui/UiFileDropzone.vue'
import type { ResizeFormat, ResizeSettings, ResizeTask } from '~/utils/imageResize'
import {
  computeResizeDimensions,
  createResizeTasks,
  getResizeOutputPath,
  isSupportedResizeFile,
  normalizeResizeTarget,
  resolveImageDimensions,
  resolveResizeTargetMimeType,
} from '~/utils/imageResize'
import { formatCompressionFileSize, resolveUniqueOutputPath } from '~/utils/imageCompression'

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
  { label: '保持原格式', value: 'original' },
  { label: '输出 WebP', value: 'webp' },
  { label: '输出 JPEG', value: 'jpeg' },
  { label: '输出 PNG', value: 'png' },
]
const WASM_MIME_TYPES = new Set(['image/avif', 'image/jpeg', 'image/webp'])
const SETTINGS_KEY = 'web-toolbox-image-resizer-settings'
const DEFAULT_SETTINGS: ResizeSettings = {
  targetWidth: 500,
  targetHeight: 500,
  keepAspectRatio: true,
  format: 'original',
  quality: 90,
}
// 无 MIME 的拖入文件按扩展名推断类型，保证「保持原格式」链路可用
const EXTENSION_MIME_MAP: Array<[RegExp, string]> = [
  [/\.jpe?g$/i, 'image/jpeg'],
  [/\.png$/i, 'image/png'],
  [/\.webp$/i, 'image/webp'],
  [/\.avif$/i, 'image/avif'],
]

useSeoMeta({
  title: '图片批量缩放 — Web Toolbox',
  description: '在浏览器本地按自定义像素批量缩放图片，支持锁定原始比例、WebP/JPEG/PNG 输出与原目录结构 ZIP 导出。',
})

const settings = reactive<ResizeSettings>({ ...DEFAULT_SETTINGS })
const files = ref<ResizeTask[]>([])
const processing = ref(false)
const exporting = ref(false)
const processedCount = ref(0)
const notice = ref('')
const workerAvailable = ref(false)
const { show: showToast } = useToast()
let resizeWorker: Worker | null = null
let taskSequence = 0
const pendingWorkerTasks = new Map<string, PendingWorkerTask>()

const completedFiles = computed(() => files.value.filter(file => file.status === 'success'))
const failedCount = computed(() => files.value.filter(file => file.status === 'failed').length)
const totalOriginalSize = computed(() => completedFiles.value.reduce((total, file) => total + file.originalSize, 0))
const totalOutputSize = computed(() => completedFiles.value.reduce((total, file) => total + file.outputSize, 0))
const progressPercent = computed(() => files.value.length > 0 ? Math.round((processedCount.value / files.value.length) * 100) : 0)
const dimsHint = computed(() => settings.keepAspectRatio
  ? '等比缩放到目标框内，如 2000×1000 在 1000×500 框内输出 1000×500'
  : '强制拉伸为精确的目标宽高，画面比例可能改变')

const setNotice = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  notice.value = message
  showToast({ message, type })
}

// 校验当前目标设置，非法时抛出可提示的错误
const resolveValidatedTarget = () => normalizeResizeTarget(settings.targetWidth, settings.targetHeight)

// 按当前设置预览每张图片的输出尺寸；设置或源尺寸变化时自动跟随
const outputDimsById = computed(() => {
  const map = new Map<string, { width: number, height: number }>()
  let target: { width: number, height: number }
  try {
    target = resolveValidatedTarget()
  } catch {
    return map
  }
  for (const item of files.value) {
    if (item.sourceWidth && item.sourceHeight) {
      map.set(item.id, computeResizeDimensions(
        { width: item.sourceWidth, height: item.sourceHeight },
        target,
        settings.keepAspectRatio,
      ))
    }
  }
  return map
})

// 保存处理偏好，但不保存浏览器无法恢复的本地 File 对象
const persistSettings = () => useLocalStorage.set(SETTINGS_KEY, settings)
onMounted(() => {
  const stored = useLocalStorage.get<Partial<ResizeSettings>>(SETTINGS_KEY)
  if (stored) {
    settings.targetWidth = stored.targetWidth ?? DEFAULT_SETTINGS.targetWidth
    settings.targetHeight = stored.targetHeight ?? DEFAULT_SETTINGS.targetHeight
    settings.keepAspectRatio = stored.keepAspectRatio ?? DEFAULT_SETTINGS.keepAspectRatio
    settings.format = stored.format ?? DEFAULT_SETTINGS.format
    settings.quality = stored.quality ?? DEFAULT_SETTINGS.quality
  }
  initResizeWorker()
})
watch(settings, persistSettings, { deep: true })

// 初始化一个复用 Worker，并把异步编码响应分发回对应图片任务
const initResizeWorker = () => {
  try {
    resizeWorker = new Worker(new URL('../../workers/imageCompression.worker.ts', import.meta.url), { type: 'module' })
    resizeWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
    resizeWorker.onerror = () => {
      workerAvailable.value = false
      for (const pending of pendingWorkerTasks.values()) pending.reject(new Error('WASM Worker 运行失败'))
      pendingWorkerTasks.clear()
    }
    workerAvailable.value = true
  } catch {
    workerAvailable.value = false
  }
}

onBeforeUnmount(() => {
  resizeWorker?.terminate()
  for (const pending of pendingWorkerTasks.values()) pending.reject(new Error('页面已关闭'))
  pendingWorkerTasks.clear()
  for (const file of files.value) URL.revokeObjectURL(file.previewUrl)
})

const resolveSourceMimeType = (file: File) => {
  if (file.type) return file.type
  return EXTENSION_MIME_MAP.find(([pattern]) => pattern.test(file.name))?.[1] ?? ''
}

// 导入图片时保留目录层级、去重并异步补齐源图尺寸
const importImages = (importedFiles: DroppedFile[]) => {
  const images = importedFiles.filter(item => isSupportedResizeFile(item.file))
  if (images.length === 0) return setNotice('没有检测到可读取的图片', 'warning')
  for (const file of files.value) URL.revokeObjectURL(file.previewUrl)
  files.value = createResizeTasks(images).map((file, index) => ({ ...file, id: `resize-${Date.now()}-${index}` }))
  processedCount.value = 0
  setNotice(`已导入 ${files.value.length} 张图片`, 'success')

  for (const item of files.value) {
    resolveImageDimensions(item.file).then((dims) => {
      item.sourceWidth = dims.width
      item.sourceHeight = dims.height
    }).catch(() => {
      item.status = 'failed'
      item.error = '无法读取图片尺寸'
    })
  }
}

// 将异步编码请求提交给本地 WASM Worker，并通过 transferable 避免复制大块 RGBA 数据
const encodeWithWorker = (imageData: ImageData, mimeType: string) => new Promise<{ blob: Blob, mimeType: string }>((resolve, reject) => {
  if (!resizeWorker || !workerAvailable.value || !WASM_MIME_TYPES.has(mimeType)) return reject(new Error('WASM Worker 不可用'))
  taskSequence += 1
  const id = `resize-${taskSequence}`
  pendingWorkerTasks.set(id, { resolve, reject })
  resizeWorker.postMessage({ id, imageData, quality: settings.quality, mimeType }, [imageData.data.buffer])
})

// 使用 Canvas 完成浏览器原生编码（PNG 及 Worker 不可用时的回退路径）
const encodeWithCanvas = (imageData: ImageData, mimeType: string) => new Promise<{ blob: Blob, mimeType: string }>((resolve, reject) => {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  if (!context) return reject(new Error('无法创建 Canvas context'))
  context.putImageData(imageData, 0, 0)
  canvas.toBlob(blob => {
    if (!blob) return reject(new Error('浏览器不支持该输出格式'))
    resolve({ blob, mimeType: blob.type || mimeType })
  }, mimeType, settings.quality / 100)
})

// 按目标尺寸重采样并编码单张图片
const resizeFile = async (item: ResizeTask, target: { width: number, height: number }) => {
  item.status = 'resizing'
  item.error = undefined
  try {
    const bitmap = await createImageBitmap(item.file)
    const dims = computeResizeDimensions(
      { width: bitmap.width, height: bitmap.height },
      target,
      settings.keepAspectRatio,
    )
    item.sourceWidth = bitmap.width
    item.sourceHeight = bitmap.height
    item.outputWidth = dims.width
    item.outputHeight = dims.height

    const canvas = document.createElement('canvas')
    canvas.width = dims.width
    canvas.height = dims.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法创建 Canvas context')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, dims.width, dims.height)
    bitmap.close()

    const imageData = context.getImageData(0, 0, dims.width, dims.height)
    const targetMimeType = resolveResizeTargetMimeType(resolveSourceMimeType(item.file), settings.format)
    if (!targetMimeType) throw new Error('无法识别图片格式')

    let encoded: { blob: Blob, mimeType: string }
    if (WASM_MIME_TYPES.has(targetMimeType) && workerAvailable.value) {
      try {
        encoded = await encodeWithWorker(imageData, targetMimeType)
      } catch {
        workerAvailable.value = false
        encoded = await encodeWithCanvas(imageData, targetMimeType)
      }
    } else {
      encoded = await encodeWithCanvas(imageData, targetMimeType)
    }

    item.outputBlob = encoded.blob
    item.outputSize = encoded.blob.size
    item.outputType = encoded.mimeType
    item.outputPath = getResizeOutputPath(item.relativePath, encoded.mimeType)
    item.status = 'success'
  } catch (error) {
    item.status = 'failed'
    item.error = error instanceof Error ? error.message : '图片缩放失败'
  } finally {
    processedCount.value += 1
  }
}

// 以有限并发处理任务，避免大量高清图片同时占用主线程与内存
const startResize = async () => {
  if (files.value.length === 0 || processing.value) return
  let target: { width: number, height: number }
  try {
    target = resolveValidatedTarget()
  } catch (error) {
    return setNotice(error instanceof Error ? error.message : '目标尺寸无效', 'error')
  }

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
      if (item) await resizeFile(item, target)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.value.length) }, runner))
  processing.value = false
  const message = failedCount.value > 0
    ? `处理完成：${completedFiles.value.length} 张成功，${failedCount.value} 张失败`
    : `批量缩放完成：${completedFiles.value.length} 张图片已调整为 ${target.width}×${target.height} 内`
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

const downloadSingle = (item: ResizeTask) => {
  if (item.status === 'success' && item.outputBlob) downloadBlob(item.outputBlob, item.outputPath.split('/').pop() || item.file.name)
}

// 按导入相对路径重建 ZIP，同名文件通过序号避免互相覆盖
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
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `resized-images-${Date.now()}.zip`)
    setNotice('缩放结果 ZIP 已导出，并保留原目录结构', 'success')
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
  <div class="resizer-workbench">
    <header class="resizer-header">
      <NuxtLink to="/">← 全部工具</NuxtLink>
    </header>

    <main class="resizer-shell">
      <aside class="resizer-sidebar">
        <section class="resizer-panel resizer-settings">
          <div class="resizer-panel__heading">
            <span>01</span>
            <div><p>目标尺寸</p><h2>缩放参数</h2></div>
          </div>

          <div class="resizer-field">
            <strong>目标像素</strong>
            <div class="resizer-dims">
              <input
                v-model.number="settings.targetWidth"
                type="number"
                min="1"
                max="16384"
                step="1"
                aria-label="目标宽度（像素）"
                :disabled="processing"
              >
              <i aria-hidden="true">×</i>
              <input
                v-model.number="settings.targetHeight"
                type="number"
                min="1"
                max="16384"
                step="1"
                aria-label="目标高度（像素）"
                :disabled="processing"
              >
            </div>
            <small>{{ dimsHint }}</small>
          </div>

          <label class="resizer-check">
            <input v-model="settings.keepAspectRatio" type="checkbox" :disabled="processing">
            <span>
              <strong>保持原始图片比例</strong>
              <small>勾选后等比缩放、不拉伸变形；取消则强制输出目标宽高</small>
            </span>
          </label>

          <label class="resizer-field">
            <strong>输出图片格式</strong>
            <UiSelect v-model="settings.format" :options="FORMAT_OPTIONS" :disabled="processing" />
          </label>

          <label v-if="settings.format !== 'png'" class="resizer-field resizer-field--quality">
            <span><strong>编码质量</strong><b>{{ settings.quality }}%</b></span>
            <input v-model.number="settings.quality" type="range" min="5" max="100" :disabled="processing">
          </label>

          <button class="resizer-button resizer-button--primary" type="button" :disabled="files.length === 0 || processing" @click="startResize">
            {{ processing ? `正在处理 ${processedCount} / ${files.length}` : '开始批量缩放' }}
          </button>
          <button class="resizer-button" type="button" :disabled="completedFiles.length === 0 || processing || exporting" @click="downloadAll">
            {{ exporting ? '正在打包…' : '按原目录导出 ZIP' }}
          </button>
          <button class="resizer-button" type="button" :disabled="files.length === 0 || processing" @click="clearAll">清空文件列表</button>
        </section>

        <section v-if="completedFiles.length > 0" class="resizer-panel resizer-summary">
          <div><p>输出总体积</p><strong>{{ formatCompressionFileSize(totalOutputSize) }}</strong></div>
          <dl>
            <div><dt>原始体积</dt><dd>{{ formatCompressionFileSize(totalOriginalSize) }}</dd></div>
            <div><dt>成功处理</dt><dd>{{ completedFiles.length }} 张</dd></div>
            <div><dt>目标框</dt><dd>{{ settings.targetWidth }}×{{ settings.targetHeight }}</dd></div>
          </dl>
        </section>
      </aside>

      <div class="resizer-main">
        <section class="resizer-panel">
          <div class="resizer-panel__heading">
            <span>02</span>
            <div><p>导入图片</p><h2>文件或完整目录</h2></div>
          </div>
          <UiFileDropzone
            allow-directory-picker
            accept="image/*,.avif"
            :disabled="processing"
            title="拖拽图片或文件夹至此"
            description="支持 WebP、JPEG、PNG、AVIF，点击可选择多张图片或完整目录"
            dragging-text="松开即可导入图片"
            @files="importImages"
          />
        </section>

        <section v-if="processing" class="resizer-progress" aria-live="polite">
          <div><strong>正在批量缩放</strong><span>{{ processedCount }} / {{ files.length }}</span></div>
          <div><i :style="{ width: `${progressPercent}%` }" /></div>
        </section>

        <p v-if="notice" class="resizer-notice" role="status">{{ notice }}</p>

        <section class="resizer-panel resizer-results">
          <div class="resizer-panel__heading">
            <span>03</span>
            <div><p>处理结果</p><h2>{{ files.length > 0 ? `${files.length} 张图片` : '等待导入' }}</h2></div>
          </div>

          <div v-if="files.length > 0" class="resizer-grid">
            <article v-for="(item, index) in files" :key="item.id" class="resizer-card">
              <div class="resizer-card__thumb"><img :src="item.previewUrl" :alt="item.file.name"></div>
              <div class="resizer-card__body">
                <UiTips :text="item.relativePath" placement="top"><strong>{{ item.file.name }}</strong></UiTips>
                <code class="resizer-card__path">{{ item.relativePath }}</code>
                <code v-if="item.sourceWidth" class="resizer-card__dims">
                  {{ item.sourceWidth }}×{{ item.sourceHeight }}
                  <template v-if="outputDimsById.get(item.id)">→ <b>{{ outputDimsById.get(item.id)!.width }}×{{ outputDimsById.get(item.id)!.height }}</b></template>
                </code>
                <p>
                  <span>{{ formatCompressionFileSize(item.originalSize) }}</span>
                  <template v-if="item.status === 'success'">→ <b>{{ formatCompressionFileSize(item.outputSize) }}</b></template>
                </p>
                <div class="resizer-card__footer">
                  <span :class="`resizer-status resizer-status--${item.status}`">
                    <template v-if="item.status === 'pending'">等待处理</template>
                    <template v-else-if="item.status === 'resizing'">正在缩放</template>
                    <template v-else-if="item.status === 'failed'">处理失败</template>
                    <template v-else-if="item.outputWidth">已输出 {{ item.outputWidth }}×{{ item.outputHeight }}</template>
                    <template v-else>已完成</template>
                  </span>
                  <div>
                    <button v-if="item.status === 'success'" type="button" aria-label="下载单张图片" @click="downloadSingle(item)">↓</button>
                    <button v-if="item.status !== 'resizing'" type="button" aria-label="移除图片" @click="removeFile(index)">×</button>
                  </div>
                </div>
                <UiTips v-if="item.error" :text="item.error"><small class="resizer-card__error">{{ item.error }}</small></UiTips>
              </div>
            </article>
          </div>

          <div v-else class="resizer-empty">
            <span aria-hidden="true">⇔</span>
            <strong>暂无待缩放图片</strong>
            <p>从上方导入图片或目录，设置目标像素后一键批量缩放。</p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.resizer-workbench { min-height: calc(100svh - 72px); color: var(--color-text); background: var(--color-bg); }
.resizer-header, .resizer-shell { width: min(100% - 48px, 1180px); margin-inline: auto; }
.resizer-header { display: flex; min-height: 92px; align-items: center; gap: 24px; padding-block: 24px; }
.resizer-header a { display: inline-flex; min-height: 42px; align-items: center; color: var(--color-muted); font-size: 12px; }
.resizer-shell { display: grid; grid-template-columns: 310px minmax(0, 1fr); align-items: start; gap: 14px; padding-bottom: 90px; }
.resizer-sidebar { display: grid; position: sticky; top: 88px; gap: 14px; }
.resizer-main { display: grid; min-width: 0; gap: 14px; }
.resizer-panel { border: 1px solid var(--color-line); border-radius: 16px; padding: 24px; background: var(--color-surface-elevated); box-shadow: 0 1px 3px rgb(15 23 42 / 4%); }
.resizer-panel__heading { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 12px; margin-bottom: 20px; }
.resizer-panel__heading > span { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 10px; color: var(--color-accent); background: var(--color-accent-soft); font-size: 11px; font-weight: 700; }
.resizer-panel__heading p { color: var(--color-accent); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }
.resizer-panel__heading h2 { margin: 4px 0 0; font-size: 19px; font-weight: 590; letter-spacing: -0.025em; }
.resizer-settings { display: grid; gap: 14px; }
.resizer-settings > .resizer-panel__heading { margin-bottom: 4px; }
.resizer-field { display: grid; gap: 9px; }
.resizer-field > strong { font-size: 12px; }
.resizer-field small { color: var(--color-muted); font-size: 10px; line-height: 1.55; }
.resizer-dims { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
.resizer-dims i { color: var(--color-muted); font-style: normal; }
.resizer-dims input { min-width: 0; min-height: 40px; border: 1px solid var(--color-line); border-radius: 8px; padding-inline: 10px; color: var(--color-text); background: var(--color-surface); font-size: 14px; font-variant-numeric: tabular-nums; }
.resizer-dims input:focus-visible { border-color: var(--color-accent); outline: 0; }
.resizer-check { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--color-line); border-radius: 10px; padding: 11px 12px; cursor: pointer; background: var(--color-surface); transition: border-color 160ms ease, background-color 160ms ease; }
.resizer-check:hover { border-color: var(--color-accent); }
.resizer-check input { width: 16px; height: 16px; margin: 1px 0 0; accent-color: var(--color-accent); cursor: pointer; }
.resizer-check span { display: grid; gap: 3px; }
.resizer-check strong { font-size: 12px; }
.resizer-check small { color: var(--color-muted); font-size: 10px; line-height: 1.5; }
.resizer-field--quality > span { display: flex; align-items: center; justify-content: space-between; }
.resizer-field--quality b { border-radius: 6px; padding: 4px 7px; color: var(--color-accent); background: var(--color-accent-soft); font-size: 11px; }
.resizer-field--quality input { width: 100%; accent-color: var(--color-accent); }
.resizer-button { min-height: 42px; border: 1px solid var(--color-line); border-radius: 8px; padding-inline: 14px; color: var(--color-text); background: var(--color-surface); cursor: pointer; font-size: 11px; font-weight: 650; }
.resizer-button:hover:not(:disabled) { border-color: var(--color-accent); }
.resizer-button:disabled { color: var(--color-muted); cursor: not-allowed; }
.resizer-button--primary { color: var(--color-accent-text); border-color: var(--color-accent); background: var(--color-accent); }
.resizer-button--primary:hover:not(:disabled) { border-color: var(--color-accent); filter: brightness(1.06); }
.resizer-summary > div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.resizer-summary p { color: var(--color-muted); font-size: 10px; }
.resizer-summary strong { font-size: 22px; font-weight: 680; letter-spacing: -0.03em; }
.resizer-summary dl { display: grid; gap: 7px; margin: 14px 0 0; }
.resizer-summary dl div { display: flex; justify-content: space-between; font-size: 10px; }
.resizer-summary dt { color: var(--color-muted); }
.resizer-summary dd { margin: 0; font-weight: 650; }
.resizer-progress { display: grid; gap: 9px; border: 1px solid var(--color-line); border-radius: 12px; padding: 14px 16px; background: var(--color-surface-elevated); }
.resizer-progress > div:first-child { display: flex; justify-content: space-between; font-size: 10px; }
.resizer-progress > div:last-child { height: 7px; overflow: hidden; border-radius: 999px; background: var(--color-line); }
.resizer-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-accent); transition: width 160ms ease; }
.resizer-notice { border: 1px solid var(--color-line); border-radius: 9px; padding: 11px 14px; color: var(--color-accent); background: var(--color-accent-soft); font-size: 11px; }
.resizer-results { min-height: 300px; }
.resizer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.resizer-card { display: flex; min-width: 0; gap: 12px; border: 1px solid var(--color-line); border-radius: 11px; padding: 11px; background: var(--color-bg); }
.resizer-card__thumb { display: grid; width: 82px; height: 82px; flex: none; place-items: center; overflow: hidden; border-radius: 8px; background-color: var(--color-surface); background-image: linear-gradient(45deg, var(--color-line) 25%, transparent 25%), linear-gradient(-45deg, var(--color-line) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-line) 75%), linear-gradient(-45deg, transparent 75%, var(--color-line) 75%); background-position: 0 0, 0 8px, 8px -8px, -8px 0; background-size: 16px 16px; }
.resizer-card__thumb img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
.resizer-card__body { display: grid; min-width: 0; flex: 1; align-content: start; gap: 5px; }
.resizer-card__body :deep(.ui-tips-anchor) { min-width: 0; }
.resizer-card__body strong, .resizer-card__body code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resizer-card__body strong { font-size: 12px; }
.resizer-card__path { color: var(--color-muted); font-size: 9px; }
.resizer-card__dims { color: var(--color-muted); font-size: 10px; }
.resizer-card__dims b { color: var(--color-accent); font-weight: 650; }
.resizer-card__body p { display: flex; gap: 5px; align-items: baseline; color: var(--color-muted); font-size: 10px; }
.resizer-card__body p b { color: var(--color-text); }
.resizer-card__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.resizer-card__footer > div { display: flex; gap: 6px; }
.resizer-card__footer button { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid var(--color-line); border-radius: 7px; color: var(--color-muted); background: var(--color-surface); cursor: pointer; font-size: 12px; }
.resizer-card__footer button:hover { color: var(--color-accent); border-color: var(--color-accent); }
.resizer-status { border-radius: 999px; padding: 4px 8px; color: var(--color-muted); background: color-mix(in srgb, var(--color-muted) 12%, transparent); font-size: 9px; white-space: nowrap; }
.resizer-status--resizing { color: var(--color-accent); background: var(--color-accent-soft); }
.resizer-status--failed { color: var(--color-text); border: 1px solid var(--color-line); background: var(--color-surface); }
.resizer-card__error { display: block !important; overflow: hidden !important; max-width: 100%; color: var(--color-muted); font-size: 9px !important; text-overflow: ellipsis; white-space: nowrap !important; }
.resizer-empty { display: grid; min-height: 240px; place-content: center; justify-items: center; gap: 7px; color: var(--color-muted); text-align: center; }
.resizer-empty span { display: grid; width: 46px; height: 46px; place-items: center; border: 1px dashed var(--color-line); border-radius: 50%; font-size: 18px; }
.resizer-empty strong { color: var(--color-text); font-size: 14px; }
.resizer-empty p { font-size: 11px; }

@media (max-width: 1024px) {
  .resizer-shell { grid-template-columns: 1fr; }
  .resizer-sidebar { position: static; grid-template-columns: 1fr 1fr; }
  .resizer-settings { grid-row: span 2; }
}

@media (max-width: 640px) {
  .resizer-header, .resizer-shell { width: calc(100% - 28px); }
  .resizer-sidebar { grid-template-columns: 1fr; }
  .resizer-settings { grid-row: auto; }
  .resizer-panel { border-radius: 12px; padding: 16px; }
  .resizer-panel__heading > span { width: 36px; height: 36px; }
  .resizer-grid { grid-template-columns: 1fr; }
  .resizer-card__thumb { width: 72px; height: 72px; }
  .resizer-button { min-height: 46px; }
  .resizer-results { min-height: 260px; }
}
</style>
