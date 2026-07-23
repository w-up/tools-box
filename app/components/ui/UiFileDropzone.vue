<script setup lang="ts">
export interface DroppedFile {
  file: File
  relativePath: string
}

interface FileTreeRow {
  id: string
  depth: number
  kind: 'directory' | 'file'
  label: string
  item?: DroppedFile
}

type DirectoryReader = {
  readEntries: (success: (entries: DroppedEntry[]) => void, error?: () => void) => void
}

type DroppedEntry = {
  isFile: boolean
  isDirectory: boolean
  fullPath: string
  file?: (success: (file: File) => void, error?: () => void) => void
  createReader?: () => DirectoryReader
}

interface Props {
  accept?: string
  disabled?: boolean
  directory?: boolean
  allowDirectoryPicker?: boolean
  title?: string
  description?: string
  draggingText?: string
  previewFiles?: DroppedFile[]
}

const props = withDefaults(defineProps<Props>(), {
  accept: '',
  disabled: false,
  directory: false,
  allowDirectoryPicker: false,
  title: '拖拽文件或文件夹至此',
  description: '或点击选择文件',
  draggingText: '松开即可导入',
  previewFiles: () => [],
})

const emit = defineEmits<{
  files: [files: DroppedFile[]]
}>()

const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const detailFile = ref<DroppedFile | null>(null)
const detailOpen = ref(false)
const detailContent = ref('')
const detailLoading = ref(false)
const detailUrl = ref('')

const isImage = (file: File) => file.type.startsWith('image/')
const detailTitle = computed(() => detailFile.value?.relativePath ?? '')
const detailKind = computed(() => detailFile.value && isImage(detailFile.value.file) ? 'image' : 'code')

// 根据 accept 属性过滤文件，目录导入和拖拽导入使用同一规则
const acceptsFile = (file: File) => {
  if (!props.accept) return true
  return props.accept.split(',').some(rule => {
    const normalized = rule.trim().toLowerCase()
    if (!normalized) return false
    if (normalized.endsWith('/*')) return file.type.startsWith(normalized.slice(0, -1))
    if (normalized.startsWith('.')) return file.name.toLowerCase().endsWith(normalized)
    return file.type === normalized
  })
}

// 递归读取 Chromium 文件夹拖放条目，同时保留相对路径
const readEntry = async (entry: DroppedEntry): Promise<DroppedFile[]> => {
  if (entry.isFile && entry.file) {
    return await new Promise(resolve => {
      entry.file?.(file => resolve(acceptsFile(file) ? [{
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
      if (batch.length === 0) return resolve()
      entries.push(...batch)
      readBatch()
    }, resolve)
    readBatch()
  })
  return (await Promise.all(entries.map(readEntry))).flat()
}

// 将文件选择结果转换为可导出的文件和相对路径记录
const normalizeFiles = (files: File[]) => files.filter(acceptsFile).map(file => ({
  file,
  relativePath: file.webkitRelativePath || file.name,
}))

// 生成稳定的目录树行，方便核对批量或文件夹导入结果
const treeRows = computed<FileTreeRow[]>(() => {
  const rows: FileTreeRow[] = []
  const directories = new Set<string>()
  for (const item of [...props.previewFiles].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    const segments = item.relativePath.split('/').filter(Boolean)
    const fileName = segments.pop() ?? item.file.name
    let parent = ''
    for (const [index, directory] of segments.entries()) {
      parent = parent ? `${parent}/${directory}` : directory
      if (directories.has(parent)) continue
      directories.add(parent)
      rows.push({ id: `directory-${parent}`, depth: index, kind: 'directory', label: directory })
    }
    rows.push({ id: `file-${item.relativePath}`, depth: segments.length, kind: 'file', label: fileName, item })
  }
  return rows
})

const emitInputFiles = (event: Event) => {
  const input = event.target as HTMLInputElement
  emit('files', normalizeFiles(Array.from(input.files ?? [])))
  input.value = ''
}

const handleDrop = async (event: DragEvent) => {
  isDragging.value = false
  if (props.disabled || !event.dataTransfer) return

  const entries = Array.from(event.dataTransfer.items)
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry?.() as DroppedEntry | null)
    .filter((entry): entry is DroppedEntry => entry !== null)

  if (entries.length > 0) {
    emit('files', (await Promise.all(entries.map(readEntry))).flat())
    return
  }
  emit('files', normalizeFiles(Array.from(event.dataTransfer.files)))
}

const openFilePicker = () => {
  if (!props.disabled) fileInput.value?.click()
}

const openFolderPicker = () => {
  if (!props.disabled) folderInput.value?.click()
}

// 在统一弹窗中展示图片像素或文本源码，便于导入前核对文件
const openDetails = async (item: DroppedFile) => {
  detailFile.value = item
  detailOpen.value = true
  detailLoading.value = true
  detailContent.value = ''
  if (detailUrl.value) URL.revokeObjectURL(detailUrl.value)
  detailUrl.value = ''
  try {
    if (isImage(item.file)) detailUrl.value = URL.createObjectURL(item.file)
    else detailContent.value = await item.file.text()
  } finally {
    detailLoading.value = false
  }
}

watch(detailOpen, open => {
  if (!open && detailUrl.value) {
    URL.revokeObjectURL(detailUrl.value)
    detailUrl.value = ''
  }
})

onBeforeUnmount(() => {
  if (detailUrl.value) URL.revokeObjectURL(detailUrl.value)
})

// 目录专用模式改造主入口，混合模式则保留独立文件与文件夹按钮
onMounted(() => {
  if (props.directory && fileInput.value) fileInput.value.setAttribute('webkitdirectory', '')
})
</script>

<template>
  <div class="ui-file-dropzone-shell">
    <div
      :class="['ui-file-dropzone', { 'ui-file-dropzone--dragging': isDragging, 'ui-file-dropzone--disabled': disabled }]"
      role="group"
      aria-label="文件上传区域"
      :aria-disabled="disabled"
      @click="openFilePicker"
      @dragenter.prevent="!disabled && (isDragging = true)"
      @dragover.prevent="!disabled && (isDragging = true)"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <div class="ui-file-dropzone__icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M5 15.5C5 12.46 7.46 10 10.5 10h9.17l4.17 4.5H37.5c3.04 0 5.5 2.46 5.5 5.5v14.5c0 3.04-2.46 5.5-5.5 5.5h-27C7.46 40 5 37.54 5 34.5v-19Z" />
          <path d="M24 31V19m0 0-5 5m5-5 5 5" />
        </svg>
      </div>
      <strong>{{ isDragging ? draggingText : title }}</strong>
      <span>{{ description }}</span>
      <button v-if="allowDirectoryPicker" type="button" class="ui-file-dropzone__folder-button" :disabled="disabled" @click.stop="openFolderPicker">选择文件夹</button>
      <input ref="fileInput" hidden type="file" :accept="accept" multiple @change="emitInputFiles">
      <input v-if="allowDirectoryPicker" ref="folderInput" hidden type="file" :accept="accept" multiple webkitdirectory @change="emitInputFiles">
    </div>

    <div v-if="treeRows.length > 0" class="ui-file-dropzone__tree" aria-label="已导入文件">
      <div v-for="row in treeRows" :key="row.id" class="ui-file-dropzone__tree-row" :style="{ '--tree-depth': row.depth }">
        <span class="ui-file-dropzone__tree-icon" aria-hidden="true">{{ row.kind === 'directory' ? '⌁' : '·' }}</span>
        <UiTips :text="row.kind === 'file' ? row.item?.relativePath ?? row.label : row.label" placement="top">
          <span class="ui-file-dropzone__tree-label">{{ row.label }}</span>
        </UiTips>
        <button
          v-if="row.item"
          type="button"
          class="ui-file-dropzone__preview"
          :aria-label="`查看 ${row.item.relativePath}`"
          @click="openDetails(row.item)"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
        </button>
      </div>
    </div>
  </div>

  <UiModal v-model="detailOpen" :title="detailTitle" description="导入文件详情" width="960px">
    <div v-if="detailLoading" class="ui-file-dropzone__detail-state">正在读取文件…</div>
    <div v-else-if="detailKind === 'image'" class="ui-file-dropzone__image-preview">
      <img v-if="detailUrl" :src="detailUrl" :alt="detailTitle">
    </div>
    <pre v-else class="ui-file-dropzone__code-preview"><code>{{ detailContent }}</code></pre>
  </UiModal>
</template>

<style scoped>
.ui-file-dropzone-shell { min-width:0; }.ui-file-dropzone { display:flex; min-height:174px; flex-direction:column; align-items:center; justify-content:center; border:2px dashed var(--color-accent); border-radius:12px; padding:26px 24px; color:var(--color-text); background:var(--color-surface); cursor:pointer; text-align:center; transition:border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }.ui-file-dropzone:hover,.ui-file-dropzone:focus-visible { border-color:var(--color-accent-hover); background:var(--color-accent-soft); box-shadow:0 0 0 4px color-mix(in srgb, var(--color-accent) 14%, transparent); outline:0; }.ui-file-dropzone--dragging { border-style:solid; border-color:var(--color-accent-hover); background:var(--color-accent-soft); box-shadow:0 0 0 5px color-mix(in srgb, var(--color-accent) 18%, transparent); transform:translateY(-1px); }.ui-file-dropzone--disabled { border-color:var(--color-line); color:var(--color-muted); background:var(--color-bg); cursor:not-allowed; }.ui-file-dropzone__icon { width:44px; height:44px; margin-bottom:13px; color:var(--color-accent); transition:transform 160ms ease; }.ui-file-dropzone:hover .ui-file-dropzone__icon,.ui-file-dropzone--dragging .ui-file-dropzone__icon { transform:translateY(-2px) scale(1.06); }.ui-file-dropzone__icon svg { width:100%; height:100%; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:3; }.ui-file-dropzone strong { color:var(--color-text); font-size:15px; font-weight:650; line-height:1.45; }.ui-file-dropzone span { margin-top:5px; color:var(--color-muted); font-size:12px; line-height:1.5; }.ui-file-dropzone__folder-button { min-height:34px; margin-top:12px; border:1px solid var(--color-line); border-radius:8px; padding-inline:12px; color:var(--color-accent); background:var(--color-surface-elevated); cursor:pointer; font-size:10px; font-weight:650; }.ui-file-dropzone__folder-button:hover:not(:disabled) { border-color:var(--color-accent); background:var(--color-accent-soft); }.ui-file-dropzone__folder-button:disabled { color:var(--color-muted); cursor:not-allowed; }
.ui-file-dropzone__tree { overflow:auto; max-height:220px; margin-top:10px; border:1px solid var(--color-line); border-radius:10px; background:var(--color-bg); }.ui-file-dropzone__tree-row { display:flex; min-width:0; min-height:34px; align-items:center; gap:7px; padding:0 10px 0 calc(10px + var(--tree-depth) * 16px); border-bottom:1px solid var(--color-line); }.ui-file-dropzone__tree-row:last-child { border-bottom:0; }.ui-file-dropzone__tree-icon { width:14px; flex:none; color:var(--color-accent); font-size:12px; text-align:center; }.ui-file-dropzone__tree-label { display:block; overflow:hidden; flex:1; color:var(--color-text); font-size:11px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }.ui-file-dropzone__tree-row :deep(.ui-tips-anchor) { min-width:0; flex:1; }.ui-file-dropzone__preview { display:grid; width:28px; height:28px; flex:none; place-items:center; border:0; border-radius:6px; color:var(--color-muted); background:transparent; cursor:pointer; }.ui-file-dropzone__preview:hover { color:var(--color-accent); background:var(--color-accent-soft); }.ui-file-dropzone__preview svg { width:16px; height:16px; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.8; }
.ui-file-dropzone__detail-state { display:grid; min-height:240px; place-items:center; color:var(--color-muted); font-size:12px; }.ui-file-dropzone__image-preview { display:grid; min-height:360px; place-items:center; overflow:auto; padding:24px; background-color:var(--color-bg); background-image:linear-gradient(45deg,var(--color-line) 25%,transparent 25%),linear-gradient(-45deg,var(--color-line) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--color-line) 75%),linear-gradient(-45deg,transparent 75%,var(--color-line) 75%); background-position:0 0,0 8px,8px -8px,-8px 0; background-size:16px 16px; }.ui-file-dropzone__image-preview img { display:block; max-width:100%; max-height:60vh; object-fit:contain; }.ui-file-dropzone__code-preview { max-height:60vh; margin:0; overflow:auto; padding:20px; color:var(--color-text); background:var(--color-bg); font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre; }
@media (max-width:640px) { .ui-file-dropzone { min-height:164px; padding:22px 18px; }.ui-file-dropzone__tree { max-height:190px; }.ui-file-dropzone__image-preview { min-height:260px; padding:14px; } }
</style>
