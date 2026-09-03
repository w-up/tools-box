<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner page-container">
      <p>© {{ year }} Web Toolbox · 本地优先的网页工具箱</p>
      <p>文件默认仅在本地浏览器中处理，不会上传。</p>
    </div>
  </footer>
</template>
