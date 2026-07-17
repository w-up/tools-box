<script setup lang="ts">
import type { ImageAsset } from '~/types/image-matching'

interface Props {
  open: boolean
  imageA: ImageAsset | null
  imageB: ImageAsset | null
  similarity: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()
const modalOpen = computed({
  get: () => props.open,
  set: value => {
    if (!value) emit('close')
  },
})
const zoom = ref(1)

watch(() => props.open, () => {
  zoom.value = 1
})
</script>

<template>
  <UiModal
    v-if="imageB"
    v-model="modalOpen"
    title="图片匹配对比"
    description="并排校对参考图与待改名图片"
    width="1120px"
    panel-class="compare-dialog"
  >
    <div class="compare-dialog__score">
      <span>综合相似度 <strong>{{ similarity }}%</strong></span>
      <label>
        缩放
        <input v-model.number="zoom" type="range" min="0.5" max="3" step="0.1">
      </label>
    </div>

    <div class="compare-dialog__images">
      <figure>
        <figcaption>参考组 A · {{ imageA?.name || '未匹配' }}</figcaption>
        <div class="compare-dialog__image-stage">
          <img v-if="imageA" :src="imageA.previewUrl" :alt="`参考图片 ${imageA.name}`" :style="{ transform: `scale(${zoom})` }">
          <p v-else>没有自动匹配的参考图片</p>
        </div>
      </figure>
      <figure>
        <figcaption>待改名组 B · {{ imageB.name }}</figcaption>
        <div class="compare-dialog__image-stage">
          <img :src="imageB.previewUrl" :alt="`待改名图片 ${imageB.name}`" :style="{ transform: `scale(${zoom})` }">
        </div>
      </figure>
    </div>

    <template #footer="{ close }">
      <span class="compare-dialog__footer-hint">拖动滑杆可同步缩放两张图片</span>
      <button class="compare-dialog__close" type="button" @click="close">关闭对比</button>
    </template>
  </UiModal>
</template>

<style scoped>
.compare-dialog__score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid var(--color-line);
  padding: 14px 22px;
  color: var(--color-muted);
  font-size: 12px;
}

.compare-dialog__score strong {
  color: var(--color-accent);
}

.compare-dialog__score label {
  display: flex;
  align-items: center;
  gap: 12px;
}

.compare-dialog__images {
  display: grid;
  min-height: 0;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--color-line);
}

.compare-dialog figure {
  display: flex;
  min-width: 0;
  margin: 0;
  flex-direction: column;
  background: var(--color-surface);
}

.compare-dialog figcaption {
  overflow: hidden;
  border-bottom: 1px solid var(--color-line);
  padding: 14px 18px;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compare-dialog__image-stage {
  display: grid;
  min-height: 380px;
  place-items: center;
  overflow: auto;
  padding: 24px;
  background-color: var(--color-bg);
  background-image: linear-gradient(45deg, var(--color-line) 25%, transparent 25%), linear-gradient(-45deg, var(--color-line) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-line) 75%), linear-gradient(-45deg, transparent 75%, var(--color-line) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}

.compare-dialog img {
  display: block;
  max-width: 100%;
  max-height: 54vh;
  object-fit: contain;
  transform-origin: center;
  transition: transform 120ms ease;
}

.compare-dialog__image-stage p,
.compare-dialog__footer-hint {
  color: var(--color-muted);
  font-size: 11px;
}

.compare-dialog__close {
  min-width: 110px;
  min-height: 42px;
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  color: var(--color-accent-text);
  background: var(--color-accent);
  cursor: pointer;
  font-weight: 650;
}

@media (max-width: 1024px) {
  .compare-dialog__score {
    align-items: flex-start;
    flex-direction: column;
  }

  .compare-dialog__score label,
  .compare-dialog__score input {
    width: 100%;
  }

  .compare-dialog__images {
    grid-template-columns: 1fr;
  }

  .compare-dialog__image-stage {
    min-height: 260px;
  }

  .compare-dialog__close {
    width: 100%;
    min-height: 48px;
  }
}
</style>
