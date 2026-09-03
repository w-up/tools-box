<script setup lang="ts">
// 全屏装饰性粒子背景：慢速漂移的粒子 + 近距离连线 + 鼠标排斥交互。
// 颜色读取主题 CSS 变量（--color-accent / --color-text），换肤时自动跟随。
const props = withDefaults(defineProps<{
  /** 粒子密度系数，1 表示约每 16000px² 一个粒子 */
  density?: number
  /** 粒子之间绘制连线的最大距离（px） */
  linkDistance?: number
}>(), {
  density: 1,
  linkDistance: 130,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { themeId } = useTheme()

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

let particles: Particle[] = []
let rafId = 0
let running = false
let visible = true
let inViewport = true
let width = 0
let height = 0
let dpr = 1
let accentColor = '79, 91, 213'
let textColor = '24, 32, 42'
const pointer = { x: Number.NaN, y: Number.NaN }

// 解析十六进制颜色为 "r, g, b" 字符串，方便 canvas 拼接 rgba
const readColorVar = (name: string, fallback: string) => {
  if (!import.meta.client) return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '')
  if (raw.length === 6) {
    return `${parseInt(raw.slice(0, 2), 16)}, ${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}`
  }
  if (raw.length === 3) {
    const r = raw[0] ?? '0'
    const g = raw[1] ?? '0'
    const b = raw[2] ?? '0'
    return `${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}`
  }
  return fallback
}

const refreshColors = () => {
  accentColor = readColorVar('--color-accent', accentColor)
  textColor = readColorVar('--color-text', textColor)
}

// 依据面积与密度重建粒子集合，窗口尺寸变化时调用
const rebuildParticles = () => {
  const target = Math.round(Math.min(110, Math.max(24, (width * height) / 16000 * props.density)))
  particles = Array.from({ length: target }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    radius: Math.random() * 1.6 + 0.8,
  }))
}

const resize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = rect.width
  height = rect.height
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  const context = canvas.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
  rebuildParticles()
}

const drawStaticFrame = (context: CanvasRenderingContext2D) => {
  context.clearRect(0, 0, width, height)
  for (const particle of particles) {
    context.beginPath()
    context.fillStyle = `rgba(${accentColor}, 0.45)`
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    context.fill()
  }
}

const step = () => {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return

  context.clearRect(0, 0, width, height)

  const linkDistance = props.linkDistance

  for (const particle of particles) {
    // 鼠标附近的粒子被轻微推开，形成呼吸感
    if (Number.isFinite(pointer.x)) {
      const dx = particle.x - pointer.x
      const dy = particle.y - pointer.y
      const distance = Math.hypot(dx, dy)
      if (distance < 130 && distance > 0.01) {
        const force = (130 - distance) / 130
        particle.vx += (dx / distance) * force * 0.06
        particle.vy += (dy / distance) * force * 0.06
      }
    }

    // 限制速度上限，避免长时间交互后粒子飞散
    const speed = Math.hypot(particle.vx, particle.vy)
    if (speed > 0.9) {
      particle.vx = (particle.vx / speed) * 0.9
      particle.vy = (particle.vy / speed) * 0.9
    }
    // 缓慢回归基础漂移速度
    particle.vx *= 0.985
    particle.vy *= 0.985
    if (Math.abs(particle.vx) < 0.04) particle.vx += (Math.random() - 0.5) * 0.04
    if (Math.abs(particle.vy) < 0.04) particle.vy += (Math.random() - 0.5) * 0.04

    particle.x += particle.vx
    particle.y += particle.vy

    // 边缘环绕
    if (particle.x < -20) particle.x = width + 20
    if (particle.x > width + 20) particle.x = -20
    if (particle.y < -20) particle.y = height + 20
    if (particle.y > height + 20) particle.y = -20
  }

  // 粒子之间的近距离连线
  context.lineWidth = 1
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i]!
      const b = particles[j]!
      const dx = a.x - b.x
      const dy = a.y - b.y
      const distance = Math.hypot(dx, dy)
      if (distance < linkDistance) {
        const alpha = (1 - distance / linkDistance) * 0.16
        context.strokeStyle = `rgba(${accentColor}, ${alpha.toFixed(3)})`
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.lineTo(b.x, b.y)
        context.stroke()
      }
    }
  }

  // 鼠标与附近粒子的连线，突出交互反馈
  if (Number.isFinite(pointer.x)) {
    for (const particle of particles) {
      const distance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y)
      if (distance < 170) {
        const alpha = (1 - distance / 170) * 0.28
        context.strokeStyle = `rgba(${textColor}, ${alpha.toFixed(3)})`
        context.beginPath()
        context.moveTo(particle.x, particle.y)
        context.lineTo(pointer.x, pointer.y)
        context.stroke()
      }
    }
  }

  // 粒子本体
  for (const particle of particles) {
    context.beginPath()
    context.fillStyle = `rgba(${accentColor}, 0.5)`
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
    context.fill()
  }

  if (running) rafId = requestAnimationFrame(step)
}

const startLoop = () => {
  if (running) return
  running = true
  rafId = requestAnimationFrame(step)
}

const stopLoop = () => {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
}

const syncRunning = () => {
  if (visible && inViewport) startLoop()
  else stopLoop()
}

const handlePointerMove = (event: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  pointer.x = event.clientX - rect.left
  pointer.y = event.clientY - rect.top
  if (pointer.y < 0 || pointer.y > rect.height) {
    pointer.x = Number.NaN
    pointer.y = Number.NaN
  }
}

const handlePointerLeave = () => {
  pointer.x = Number.NaN
  pointer.y = Number.NaN
}

let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let reducedMotionQuery: MediaQueryList | undefined

const handleVisibilityChange = () => {
  visible = !document.hidden
  syncRunning()
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  refreshColors()
  resize()

  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (reducedMotionQuery.matches) {
    // 减少动态效果偏好下只绘制一帧静态粒子
    const context = canvas.getContext('2d')
    if (context) drawStaticFrame(context)
    return
  }

  resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(canvas)

  intersectionObserver = new IntersectionObserver((entries) => {
    inViewport = entries.some(entry => entry.isIntersecting)
    syncRunning()
  })
  intersectionObserver.observe(canvas)

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerleave', handlePointerLeave)
  syncRunning()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerleave', handlePointerLeave)
})

// 换肤后重新读取 CSS 变量颜色
watch(themeId, () => refreshColors())
</script>

<template>
  <canvas ref="canvasRef" class="particle-field" aria-hidden="true" />
</template>

<style scoped>
.particle-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
