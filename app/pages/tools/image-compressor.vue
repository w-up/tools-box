<script setup lang="ts">
useSeoMeta({
  title: '图片压缩 — Web Toolbox',
  description: '在浏览器本地压缩图片。',
})

const steps = [
  '拖入或选择一张、多张图片',
  '设置压缩质量、目标尺寸与输出格式',
  '预览体积变化并批量下载结果',
]
</script>

<template>
  <ToolIntro
    eyebrow="图片工具 · 01"
    title="图片压缩"
    description="在不上传原文件的前提下，完成图片体积压缩与格式转换。"
    :steps="steps"
  />
</template>
