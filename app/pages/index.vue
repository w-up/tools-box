<script setup lang="ts">
import { tools } from '~/data/tools'

useSeoMeta({
  title: 'Web Toolbox — 网页工具箱',
  description: '面向日常前端与内容处理工作的本地优先网页工具箱。',
})

const statusLabel = {
  available: '可使用',
  planned: '待开发',
}
</script>

<template>
  <div>
    <section class="hero page-container">
      <p class="eyebrow hero__eyebrow">Browser-first utilities · SSG</p>
      <h1>
        <span>把重复的小事，</span><br>
        <span>变成顺手的工具。</span>
      </h1>
      <p class="hero__description">
        面向图片与文件处理的网页工具集合。默认本地运行、无需上传，持续按真实工作场景扩展。
      </p>
      <a class="primary-link" href="#image-tools">浏览工具 <span aria-hidden="true">↓</span></a>
    </section>

    <section id="image-tools" class="tool-section page-container" aria-labelledby="tool-section-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">工具目录</p>
          <h2 id="tool-section-title">图片工具</h2>
        </div>
        <p>{{ tools.length.toString().padStart(2, '0') }} 个工具</p>
      </div>

      <div class="tool-list">
        <NuxtLink v-for="tool in tools" :key="tool.to" class="tool-row" :to="tool.to">
          <span class="tool-row__index">{{ tool.index }}</span>
          <div class="tool-row__content">
            <div class="tool-row__title-line">
              <h3>{{ tool.title }}</h3>
              <span :class="['tool-status', `tool-status--${tool.status}`]">
                {{ statusLabel[tool.status] }}
              </span>
            </div>
            <p>{{ tool.description }}</p>
          </div>
          <span class="tool-row__arrow" aria-hidden="true">↗</span>
        </NuxtLink>
      </div>
    </section>

    <section class="principles page-container" aria-labelledby="principles-title">
      <p class="eyebrow">项目原则</p>
      <h2 id="principles-title">少依赖，快打开，<br>数据不乱跑。</h2>
      <div class="principles__list">
        <p><strong>01</strong> 文件优先在浏览器本地处理</p>
        <p><strong>02</strong> 每个工具只解决一个明确问题</p>
        <p><strong>03</strong> 静态生成，便于部署到任意 CDN</p>
      </div>
    </section>
  </div>
</template>
