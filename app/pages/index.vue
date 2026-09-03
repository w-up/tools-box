<script setup lang="ts">
import { tools } from '~/data/tools'
import { THEME_PRESETS } from '~/config/themes'

useSeoMeta({
  title: 'Web Toolbox — 网页工具箱',
  description: '面向日常前端与内容处理工作的本地优先网页工具箱。',
})

const searchOpen = useToolSearch()
const { themeId, applyTheme } = useTheme()

const statusLabel = {
  available: '可使用',
  planned: '待开发',
}

// 工具图标（按路由映射）
const toolIcons: Record<string, string> = {
  '/tools/image-compressor': 'compress',
  '/tools/image-compare-rename': 'compare',
  '/tools/image-asset-migration': 'migrate',
}

// 跑马灯文案
const marqueeItems = [
  '本地优先', '零上传', '图片压缩', '智能对比改名', '资源迁移', '隐私安全',
  '静态部署', '主题换肤', '开箱即用',
]

// 单一职责卡里的三条能力
const focusRows = [
  { icon: 'compress', text: '批量压缩，输出格式与目录结构自由控制' },
  { icon: 'compare', text: '按视觉内容匹配两组图片，统一命名' },
  { icon: 'migrate', text: '合并重复图片，并同步更新代码引用' },
]

// 三步流程
const steps = [
  {
    index: '01',
    title: '选择一个工具',
    description: '从上方工具坞点开，或直接 ⌘K 搜索，整个工具箱都在键盘边。',
  },
  {
    index: '02',
    title: '拖入文件',
    description: '所有处理都在浏览器本地进行，文件不会离开你的设备。',
  },
  {
    index: '03',
    title: '导出结果',
    description: '压缩、改名或迁移完成后，一键导出本地结果与脚本。',
  },
]

// ---------- 指令：滚动渐入 ----------
const revealObservers = new WeakMap<HTMLElement, IntersectionObserver>()
const vReveal = {
  mounted(el: HTMLElement) {
    if (!import.meta.client) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          el.classList.add('reveal--visible')
          observer.disconnect()
          revealObservers.delete(el)
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    revealObservers.set(el, observer)
    observer.observe(el)
  },
  unmounted(el: HTMLElement) {
    revealObservers.get(el)?.disconnect()
    revealObservers.delete(el)
  },
}

// ---------- 指令：鼠标聚光灯（把指针坐标写到 CSS 变量 --mx/--my） ----------
const spotlightCleanups = new WeakMap<HTMLElement, () => void>()
const vSpotlight = {
  mounted(el: HTMLElement) {
    if (!import.meta.client) return
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
      el.style.setProperty('--my', `${event.clientY - rect.top}px`)
    }
    el.addEventListener('pointermove', onMove)
    spotlightCleanups.set(el, () => el.removeEventListener('pointermove', onMove))
  },
  unmounted(el: HTMLElement) {
    spotlightCleanups.get(el)?.()
    spotlightCleanups.delete(el)
  },
}

// ---------- 指令：进入视口后数字滚动 ----------
const countObservers = new WeakMap<HTMLElement, IntersectionObserver>()
const vCountTo = {
  mounted(el: HTMLElement) {
    if (!import.meta.client) return
    const target = Number(el.dataset.countTo ?? '0')
    const suffix = el.dataset.suffix ?? ''
    const duration = 1200
    const render = (value: number) => { el.textContent = `${Math.round(value)}${suffix}` }
    // 减少动态效果偏好时直接落到终值
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(target)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration)
        const eased = 1 - (1 - progress) ** 3
        render(target * eased)
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    countObservers.set(el, observer)
    observer.observe(el)
  },
  unmounted(el: HTMLElement) {
    countObservers.get(el)?.disconnect()
    countObservers.delete(el)
  },
}
</script>

<template>
  <div class="home">
    <!-- ===== Hero：左对齐大标题 + 粒子背景 ===== -->
    <section class="hero">
      <div class="hero__backdrop" aria-hidden="true">
        <div class="hero__glow hero__glow--accent" />
        <div class="hero__glow hero__glow--muted" />
        <ParticleField />
        <div class="hero__grid" />
      </div>

      <div class="hero__inner page-container">
        <p class="hero__badge">
          <span class="hero__badge-dot" aria-hidden="true" />
          本地优先 · 文件不出浏览器
        </p>

        <h1 class="hero__title">
          <span class="hero__title-line">
            <span class="hero__title-text">把重复的小事，</span>
          </span>
          <span class="hero__title-line">
            <span class="hero__title-text hero__title-text--accent">变成顺手的工具。</span>
          </span>
        </h1>

        <p class="hero__description">
          面向图片与文件处理的网页工具集合。计算全部在浏览器本地完成，无需上传、即开即用，按真实工作场景持续扩展。
        </p>

        <div class="hero__actions">
          <button class="command-bar" type="button" @click="searchOpen = true">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
            <span>搜索全部工具…</span>
            <kbd>⌘ K</kbd>
          </button>
          <a class="hero__link" href="#why">为什么这样设计
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <div class="hero__scroll" aria-hidden="true">
        <span class="hero__scroll-track"><i /></span>
      </div>
    </section>

    <!-- ===== 悬浮工具坞：应用启动器般的直达入口 ===== -->
    <div id="tools" class="dock-zone page-container">
      <div class="dock" role="list" aria-label="工具直达">
        <div
          v-for="tool in tools"
          :key="tool.to"
          v-reveal
          class="dock-tile-wrap"
          role="listitem"
          :style="{ transitionDelay: `${(Number(tool.index) - 1) * 90}ms` }"
        >
          <NuxtLink class="dock-tile" :to="tool.to" :aria-label="`打开${tool.title}`">
            <span class="dock-tile__icon" aria-hidden="true">
            <svg v-if="toolIcons[tool.to] === 'compress'" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m9 12h6M12 9v6" />
            </svg>
            <svg v-else-if="toolIcons[tool.to] === 'compare'" viewBox="0 0 24 24" fill="none">
              <rect x="2.5" y="6" width="8" height="12" rx="1.5" />
              <rect x="13.5" y="6" width="8" height="12" rx="1.5" />
              <path d="m10 12h4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none">
              <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
              <path d="m12 11v4M10 13l2-2 2 2" />
            </svg>
          </span>
          <span class="dock-tile__copy">
            <strong>{{ tool.title }}</strong>
            <span class="dock-tile__meta">
              <i :class="['tool-status', `tool-status--${tool.status}`]">{{ statusLabel[tool.status] }}</i>
              <span class="dock-tile__arrow" aria-hidden="true">→</span>
            </span>
          </span>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- ===== 关键词跑马灯 ===== -->
    <div class="marquee" aria-hidden="true">
      <div class="marquee__track">
        <div v-for="group in 2" :key="group" class="marquee__group">
          <span v-for="item in marqueeItems" :key="`${group}-${item}`" class="marquee__item">{{ item }}</span>
        </div>
      </div>
    </div>

    <!-- ===== Bento：为什么这样设计 ===== -->
    <section id="why" class="why page-container" aria-labelledby="why-title">
      <div class="why__heading" v-reveal>
        <div>
          <p class="eyebrow">设计理念</p>
          <h2 id="why-title">少依赖，快打开，<br>数据不乱跑。</h2>
        </div>
        <p class="why__meta">围绕「本地优先」构建的四个设计取舍。</p>
      </div>

      <div class="bento">
        <!-- 本地处理（大卡，含动画可视区与计数） -->
        <article class="bento-card bento-card--local" v-reveal v-spotlight>
          <div class="bento-card__body">
            <p class="bento-card__kicker">本地处理</p>
            <h3>数据不出浏览器</h3>
            <p class="bento-card__desc">
              文件只在当前页面内被读取与计算，不经过任何服务器——速度更快，隐私也更有保障。
            </p>
          </div>
          <div class="local-visual" aria-hidden="true">
            <div class="local-visual__frame">
              <i class="local-visual__orb local-visual__orb--1" />
              <i class="local-visual__orb local-visual__orb--2" />
              <i class="local-visual__orb local-visual__orb--3" />
              <svg class="local-visual__lock" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                <circle cx="12" cy="15.5" r="1.4" />
              </svg>
            </div>
            <span class="local-visual__count">
              <b v-count-to data-count-to="100" data-suffix="%">0%</b>
              <small>本地完成率</small>
            </span>
          </div>
        </article>

        <!-- 单一职责 -->
        <article class="bento-card bento-card--focus" v-reveal v-spotlight>
          <p class="bento-card__kicker">单一职责</p>
          <h3>每个工具<br>只解决一件事</h3>
          <ul class="focus-list">
            <li v-for="row in focusRows" :key="row.text">
              <span class="focus-list__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <template v-if="row.icon === 'compress'"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m9 12h6M12 9v6" /></template>
                  <template v-else-if="row.icon === 'compare'"><rect x="2.5" y="6" width="8" height="12" rx="1.5" /><rect x="13.5" y="6" width="8" height="12" rx="1.5" /><path d="m10 12h4" /></template>
                  <template v-else><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" /><path d="m12 11v4M10 13l2-2 2 2" /></template>
                </svg>
              </span>
              <span>{{ row.text }}</span>
            </li>
          </ul>
        </article>

        <!-- 换肤（功能性：直接点击切主题） -->
        <article class="bento-card bento-card--theme" v-reveal v-spotlight>
          <p class="bento-card__kicker">换肤</p>
          <h3>五套主题，<br>点一下即刻生效</h3>
          <div class="theme-swatches" aria-label="主题色板">
            <button
              v-for="theme in THEME_PRESETS"
              :key="theme.id"
              type="button"
              :class="['theme-swatch', { 'theme-swatch--active': themeId === theme.id }]"
              :style="{ '--sw-bg': theme.colors.background, '--sw-accent': theme.colors.button }"
              :aria-label="`切换到${theme.name}`"
              :aria-pressed="themeId === theme.id"
              @click="applyTheme(theme.id)"
            />
          </div>
          <p class="bento-card__hint">点击色块立即换肤，选择自动保存在当前浏览器。</p>
        </article>

        <!-- 搜索（功能性：直接唤起弹层） -->
        <button class="bento-card bento-card--search" type="button" v-reveal v-spotlight @click="searchOpen = true">
          <span class="bento-card__content">
            <span class="bento-card__kicker">全局搜索</span>
            <span class="bento-card__title">找不到就搜，<br>一步直达工具</span>
            <span class="search-preview">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
              <span>搜索「压缩」「改名」…</span>
              <kbd>⌘K</kbd>
            </span>
          </span>
          <span class="bento-card__arrow" aria-hidden="true">↗</span>
        </button>

        <!-- 静态部署 -->
        <article class="bento-card bento-card--static" v-reveal v-spotlight>
          <p class="bento-card__kicker">静态部署</p>
          <h3>纯静态产物，<br>放在任意 CDN 即开</h3>
          <div class="static-badges" aria-hidden="true">
            <span>SSG</span><span>CDN</span><span>0 后端</span>
          </div>
          <p class="bento-card__hint">Nuxt 4 预渲染，无服务器依赖，秒级打开、极低维护。</p>
        </article>
      </div>
    </section>

    <!-- ===== 三步使用流程 ===== -->
    <section class="steps page-container" aria-labelledby="steps-title">
      <div class="steps__heading" v-reveal>
        <p class="eyebrow">使用流程</p>
        <h2 id="steps-title">三步完成一件事。</h2>
      </div>

      <ol class="steps__grid">
        <li v-for="step in steps" :key="step.index" class="step" v-reveal>
          <span class="step__number" aria-hidden="true">{{ step.index }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.description }}</p>
        </li>
      </ol>
    </section>
  </div>
</template>
