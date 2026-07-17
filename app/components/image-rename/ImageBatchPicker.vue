<script setup lang="ts">
import type { ImageAsset, ImportedFile } from '~/types/image-matching'

interface Props {
  batch: 'A' | 'B'
  title: string
  description: string
  accent: 'blue' | 'violet'
  assets: ImageAsset[]
  processing: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  files: [files: ImportedFile[]]
}>()

const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const isDragging = ref(false)

type DirectoryReader = {
  readEntries: (
    success: (entries: DroppedEntry[]) => void,
    error?: () => void,
  ) => void
}

type DroppedEntry = {
  isFile: boolean
  isDirectory: boolean
  fullPath: string
  file?: (success: (file: File) => void, error?: () => void) => void
  createReader?: () => DirectoryReader
}

// 将文件选择结果转换为带相对路径的数据
const normalizeFiles = (files: File[]) => files
  .filter(file => file.type.startsWith('image/'))
  .map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }))

const handleInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  emit('files', normalizeFiles(Array.from(input.files ?? [])))
  input.value = ''
}

// 递归读取 Chromium 文件夹拖放条目
const readEntry = async (entry: DroppedEntry): Promise<ImportedFile[]> => {
  if (entry.isFile && entry.file) {
    return await new Promise(resolve => {
      entry.file?.(file => resolve(file.type.startsWith('image/') ? [{
        file,
        relativePath: entry.fullPath.replace(/^\//, ''),
      }] : []), () => resolve([]))
    })
  }

  if (!entry.isDirectory || !entry.createReader) return []
  const reader = entry.createReader()
  const entries: DroppedEntry[] = []

  await new Promise<void>(resolve => {
    const readBatch = () => reader.readEntries(batch => {
      if (batch.length === 0) {
        resolve()
        return
      }
      entries.push(...batch)
      readBatch()
    }, resolve)
    readBatch()
  })

  return (await Promise.all(entries.map(readEntry))).flat()
}

const handleDrop = async (event: DragEvent) => {
  isDragging.value = false
  const transfer = event.dataTransfer
  if (!transfer) return

  const entries = Array.from(transfer.items)
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry?.() as DroppedEntry | null)
    .filter((entry): entry is DroppedEntry => entry !== null)

  if (entries.length > 0) {
    emit('files', (await Promise.all(entries.map(readEntry))).flat())
    return
  }

  emit('files', normalizeFiles(Array.from(transfer.files)))
}

const visibleAssets = computed(() => props.assets.slice(0, 6))
</script>

<template>
  <section :class="['batch-picker', `batch-picker--${accent}`, { 'batch-picker--dragging': isDragging }]">
    <div class="batch-picker__heading">
      <div>
        <p class="batch-picker__label">批次 {{ batch }}</p>
        <h2>{{ title }}</h2>
      </div>
      <span class="batch-picker__count">
        {{ processing ? '分析中…' : assets.length > 0 ? `${assets.length} 张图片` : '未导入' }}
      </span>
    </div>
    <p class="batch-picker__description">{{ description }}</p>

    <div
      class="batch-picker__dropzone"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <strong>{{ assets.length > 0 ? '重新导入图片' : '选择或拖入图片 / 文件夹' }}</strong>
      <span>图片仅在当前浏览器中处理，不会上传</span>
      <div class="batch-picker__actions">
        <button type="button" @click="fileInput?.click()">选择图片</button>
        <button type="button" class="batch-picker__secondary" @click="folderInput?.click()">选择文件夹</button>
      </div>
    </div>

    <input
      ref="fileInput"
      :data-batch="batch"
      data-kind="files"
      class="visually-hidden"
      type="file"
      accept="image/*"
      multiple
      @change="handleInput"
    >
    <input
      ref="folderInput"
      :data-batch="batch"
      data-kind="folder"
      class="visually-hidden"
      type="file"
      accept="image/*"
      multiple
      webkitdirectory
      @change="handleInput"
    >

    <ul v-if="assets.length > 0" class="batch-picker__files">
      <li v-for="asset in visibleAssets" :key="asset.id">
        <span :title="asset.relativePath">{{ asset.relativePath }}</span>
        <small>{{ asset.width }}×{{ asset.height }}</small>
      </li>
      <li v-if="assets.length > visibleAssets.length" class="batch-picker__more">
        还有 {{ assets.length - visibleAssets.length }} 张图片
      </li>
    </ul>
  </section>
</template>

<style scoped>
.batch-picker {
  --batch-accent: var(--color-accent);
  --batch-soft: var(--color-accent-soft);
  min-width: 0;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  padding: 22px;
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
}

.batch-picker--violet {
  --batch-accent: var(--color-accent);
  --batch-soft: var(--color-accent-soft);
}

.batch-picker--dragging {
  border-color: var(--batch-accent);
  background: var(--batch-soft);
}

.batch-picker__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.batch-picker__label {
  color: var(--batch-accent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.batch-picker h2 {
  margin-top: 8px;
  color: var(--color-text);
  font-size: 20px;
  font-weight: 590;
  letter-spacing: -0.035em;
}

.batch-picker__count {
  border-radius: 999px;
  padding: 6px 10px;
  color: var(--batch-accent);
  background: var(--batch-soft);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.batch-picker__description {
  min-height: 38px;
  margin-top: 14px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.6;
}

.batch-picker__dropzone {
  display: flex;
  min-height: 154px;
  margin-top: 18px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed color-mix(in srgb, var(--color-line) 72%, var(--color-text));
  border-radius: 10px;
  padding: 22px;
  background: color-mix(in srgb, var(--color-accent-soft) 22%, var(--color-surface));
  text-align: center;
  transition: 180ms ease;
}

.batch-picker__dropzone strong {
  font-size: 16px;
}

.batch-picker__dropzone > span {
  margin-top: 8px;
  color: var(--color-muted);
  font-size: 12px;
}

.batch-picker__actions {
  display: flex;
  margin-top: 24px;
  gap: 10px;
}

.batch-picker button {
  min-height: 42px;
  border: 1px solid var(--batch-accent);
  padding: 0 16px;
  border-radius: 7px;
  color: var(--color-accent-text);
  background: var(--batch-accent);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.batch-picker .batch-picker__secondary {
  color: var(--batch-accent);
  background: var(--color-surface);
}

.batch-picker__files {
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.batch-picker__files li {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-line);
  color: var(--color-text);
  font-size: 12px;
}

.batch-picker__files span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-picker__files small {
  flex: none;
  color: var(--color-muted);
}

.batch-picker__files .batch-picker__more {
  justify-content: flex-start;
  color: var(--batch-accent);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

@media (max-width: 640px) {
  .batch-picker {
    padding: 20px;
  }

  .batch-picker__description {
    min-height: auto;
  }

  .batch-picker__dropzone {
    min-height: 164px;
    padding: 20px 12px;
  }

  .batch-picker__actions {
    width: 100%;
    flex-direction: column;
  }

  .batch-picker button {
    width: 100%;
    min-height: 46px;
  }
}
</style>
