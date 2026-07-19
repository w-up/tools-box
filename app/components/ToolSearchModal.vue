<script setup lang="ts">
import { tools } from '~/data/tools'
import { searchTools } from '~/utils/toolSearch'

const open = defineModel<boolean>({ required: true })
const router = useRouter()
const query = ref('')
const activeIndex = ref(0)
const searchInput = ref<HTMLInputElement>()
const results = computed(() => searchTools(tools, query.value))

watch(query, () => {
  activeIndex.value = 0
})
watch(open, value => {
  if (!value) {
    query.value = ''
    activeIndex.value = 0
  }
})

// 选择搜索结果后关闭弹窗并直接进入对应工具页面
const navigateToTool = async (to: string) => {
  open.value = false
  await router.push(to)
}

// 使用方向键切换高亮项，Enter 直接打开当前工具
const handleKeydown = async (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (event.key === 'Enter') {
    const tool = results.value[activeIndex.value]
    if (tool) await navigateToTool(tool.to)
  }
}

const focusSearch = () => nextTick(() => searchInput.value?.focus())
</script>

<template>
  <UiModal
    v-model="open"
    title="搜索工具"
    description="按功能名称、用途或关键词模糊搜索"
    width="720px"
    panel-class="tool-search-dialog"
    @opened="focusSearch"
  >
    <div class="tool-search">
      <label class="tool-search__input-shell">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="搜索压缩、改名、去重、资源迁移…"
          aria-label="搜索项目功能"
          @keydown="handleKeydown"
        >
        <kbd>ESC</kbd>
      </label>

      <div v-if="results.length > 0" class="tool-search__results" role="listbox" aria-label="搜索结果">
        <button
          v-for="(tool, index) in results"
          :key="tool.to"
          type="button"
          :class="['tool-search__result', { 'tool-search__result--active': activeIndex === index }]"
          role="option"
          :aria-selected="activeIndex === index"
          @mouseenter="activeIndex = index"
          @click="navigateToTool(tool.to)"
        >
          <span class="tool-search__index">{{ tool.index }}</span>
          <span class="tool-search__content">
            <span><strong>{{ tool.title }}</strong><small>{{ tool.category }}工具</small></span>
            <span>{{ tool.description }}</span>
          </span>
          <span class="tool-search__enter">打开 <kbd>↵</kbd></span>
        </button>
      </div>

      <div v-else class="tool-search__empty">
        <strong>没有找到相关功能</strong>
        <span>换个更短的关键词试试，例如“图片”“改名”或“去重”。</span>
      </div>
    </div>

    <template #footer>
      <span class="tool-search__hint"><kbd>↑</kbd><kbd>↓</kbd> 选择　<kbd>Enter</kbd> 打开</span>
      <span class="tool-search__count">{{ results.length }} 个结果</span>
    </template>
  </UiModal>
</template>

<style scoped>
.tool-search { min-height:300px; padding:16px; }.tool-search__input-shell { display:flex; min-height:52px; align-items:center; gap:12px; border:1px solid var(--color-accent); border-radius:10px; padding:0 14px; background:var(--color-surface); box-shadow:0 0 0 4px var(--color-accent-soft); }.tool-search__input-shell svg { width:20px; height:20px; flex:none; stroke:var(--color-accent); stroke-linecap:round; stroke-width:1.8; }.tool-search__input-shell input { width:100%; min-width:0; border:0; outline:0; color:var(--color-text); background:transparent; font-size:15px; }.tool-search__input-shell input::placeholder { color:var(--color-muted); }.tool-search kbd { display:inline-grid; min-width:24px; min-height:22px; place-items:center; border:1px solid var(--color-line); border-radius:5px; padding-inline:5px; color:var(--color-muted); background:var(--color-bg); font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }.tool-search__results { display:grid; gap:4px; margin-top:14px; }.tool-search__result { display:grid; width:100%; min-height:80px; grid-template-columns:34px 1fr auto; align-items:center; gap:12px; border:1px solid transparent; border-radius:9px; padding:10px 12px; color:var(--color-text); background:transparent; cursor:pointer; text-align:left; }.tool-search__result--active { border-color:var(--color-line); background:var(--color-accent-soft); }.tool-search__index { color:var(--color-muted); font-size:10px; }.tool-search__content { display:grid; min-width:0; gap:6px; }.tool-search__content > span:first-child { display:flex; align-items:center; gap:9px; }.tool-search__content strong { font-size:14px; }.tool-search__content small { border-radius:999px; padding:3px 7px; color:var(--color-accent); background:var(--color-surface); font-size:9px; }.tool-search__content > span:last-child { overflow:hidden; color:var(--color-muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }.tool-search__enter { display:flex; align-items:center; gap:7px; color:var(--color-muted); font-size:10px; }.tool-search__empty { display:grid; min-height:220px; place-items:center; align-content:center; gap:8px; color:var(--color-muted); text-align:center; }.tool-search__empty strong { color:var(--color-text); font-size:14px; }.tool-search__empty span,.tool-search__hint,.tool-search__count { color:var(--color-muted); font-size:10px; }.tool-search__hint { display:flex; align-items:center; }.tool-search__hint kbd { margin-right:4px; }
@media (max-width:640px) { .tool-search { min-height:260px; padding:12px; }.tool-search__input-shell { min-height:50px; }.tool-search__input-shell > kbd,.tool-search__enter { display:none; }.tool-search__result { min-height:88px; grid-template-columns:28px 1fr; padding:10px 8px; }.tool-search__content > span:last-child { display:-webkit-box; overflow:hidden; white-space:normal; -webkit-box-orient:vertical; -webkit-line-clamp:2; }.tool-search__hint { display:none; } }
</style>
