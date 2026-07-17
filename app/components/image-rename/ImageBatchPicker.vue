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


</script>

<template>
  <section :class="['batch-picker', `batch-picker--${accent}`]">
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

    <UiFileDropzone
      accept="image/*"
      :title="assets.length > 0 ? '拖拽新图片或文件夹以重新导入' : '拖拽图片、多个图片或文件夹至此'"
      description="或点击选择图片文件"
      dragging-text="松开即可导入图片或图片文件夹"
      :preview-files="assets"
      @files="emit('files', $event)"
    />
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

}
</style>
