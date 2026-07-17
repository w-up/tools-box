<script setup lang="ts">
interface Props {
  eyebrow: string
  title: string
  description: string
  steps: string[]
}

defineProps<Props>()
</script>

<template>
  <section class="tool-intro page-container">
    <NuxtLink class="back-link" to="/">← 返回全部工具</NuxtLink>

    <div class="tool-intro__heading">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p class="tool-intro__description">{{ description }}</p>
    </div>

    <div class="tool-workspace" aria-label="工具开发状态">
      <div class="tool-workspace__status">
        <span class="status-dot" aria-hidden="true" />
        工具模块待实现
      </div>
      <p>Nuxt 4 SSG 页面、路由与工具容器已经就绪。</p>
    </div>

    <section class="tool-plan" aria-labelledby="tool-plan-title">
      <p class="eyebrow">实现计划</p>
      <h2 id="tool-plan-title">接下来要完成的核心流程</h2>
      <ol>
        <li v-for="step in steps" :key="step">{{ step }}</li>
      </ol>
    </section>
  </section>
</template>
