<script setup lang="ts">
import type { ImageAsset, MatchConfidence, MatchResult } from '~/types/image-matching'

interface Props {
  result: MatchResult
  imageA: ImageAsset | null
  imageB: ImageAsset
  allA: ImageAsset[]
  targetName: string
}

defineProps<Props>()
const emit = defineEmits<{
  compare: []
  associate: [imageAId: string | null]
}>()

const confidenceLabel: Record<MatchConfidence, string> = {
  high: '高置信',
  medium: '中置信',
  low: '需校对',
  none: '未匹配',
}
</script>

<template>
  <article class="match-item">
    <header class="match-item__header">
      <div>
        <span :class="['match-item__confidence', `match-item__confidence--${result.confidence}`]">
          {{ confidenceLabel[result.confidence] }}
        </span>
        <strong>{{ result.similarity }}%</strong>
      </div>
      <button type="button" @click="emit('compare')">打开大图对比</button>
    </header>

    <div class="match-item__images">
      <figure>
        <figcaption>参考组 A</figcaption>
        <div class="match-item__image-stage">
          <img v-if="imageA" :src="imageA.previewUrl" :alt="`参考图片 ${imageA.name}`">
          <p v-else>未找到匹配图片</p>
        </div>
        <UiTips :text="imageA?.relativePath ?? '未匹配'" placement="top">
          <small>{{ imageA?.name || '未匹配' }}</small>
        </UiTips>
      </figure>

      <figure>
        <figcaption>待改名组 B</figcaption>
        <div class="match-item__image-stage">
          <img :src="imageB.previewUrl" :alt="`待改名图片 ${imageB.name}`">
        </div>
        <UiTips :text="imageB.relativePath" placement="top">
          <small>{{ imageB.name }}</small>
        </UiTips>
      </figure>
    </div>

    <div class="match-item__rename">
      <span>输出文件名</span>
      <UiTips :text="targetName" placement="top">
        <strong :class="{ 'match-item__target--matched': imageA }">{{ targetName }}</strong>
      </UiTips>
    </div>

    <label class="match-item__association">
      手动修正匹配
      <select :value="result.fileAId ?? ''" @change="emit('associate', ($event.target as HTMLSelectElement).value || null)">
        <option value="">不重命名，保持原名</option>
        <option v-for="asset in allA" :key="asset.id" :value="asset.id">
          {{ asset.name }}
        </option>
      </select>
    </label>
  </article>
</template>

<style scoped>
.match-item {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.match-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--color-line);
  padding: 14px 16px;
}

.match-item__header > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.match-item__header strong {
  font-size: 13px;
}

.match-item__header button {
  min-height: 38px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  padding-inline: 12px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 12px;
}

.match-item__confidence {
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--color-muted);
  background: var(--color-accent-soft);
  font-size: 10px;
  font-weight: 750;
}

.match-item__confidence--high {
  color: var(--color-accent);
}

.match-item__confidence--medium {
  color: #9a650c;
  background: #fff0cb;
}

.match-item__confidence--low {
  color: #a24425;
  background: #ffebe3;
}

.match-item__images {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--color-line);
}

.match-item figure {
  min-width: 0;
  margin: 0;
  padding: 14px;
  background: var(--color-surface);
}

.match-item figcaption {
  margin-bottom: 10px;
  color: var(--color-muted);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.match-item__image-stage {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border-radius: 7px;
  background: var(--color-bg);
}

.match-item__image-stage img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.match-item__image-stage p {
  color: var(--color-muted);
  font-size: 11px;
}

.match-item figure small {
  display: block;
  margin-top: 10px;
  overflow: hidden;
  color: var(--color-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-item__rename,
.match-item__association {
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-top: 1px solid var(--color-line);
  padding: 14px 16px;
}

.match-item__rename span,
.match-item__association {
  color: var(--color-muted);
  font-size: 11px;
}

.match-item__rename strong {
  overflow: hidden;
  color: var(--color-muted);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-item__rename .match-item__target--matched {
  color: var(--color-accent);
}

.match-item select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  padding-inline: 10px;
  color: var(--color-text);
  background: var(--color-surface);
}

@media (max-width: 640px) {
  .match-item__header button {
    min-height: 44px;
  }

  .match-item__images {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
