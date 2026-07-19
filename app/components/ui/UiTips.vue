<script setup lang="ts">
import { clampToViewport, resolveTipsPlacement, type ResolvedTipsPlacement, type TipsPlacement } from '~/utils/uiPosition'

interface Props {
  text?: string
  placement?: TipsPlacement
  trigger?: 'auto' | 'hover' | 'click'
  maxWidth?: number
  maxHeight?: number
  offset?: number
  arrowSize?: number
  disabled?: boolean
  anchorClass?: string
  contentClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  placement: 'auto',
  trigger: 'auto',
  maxWidth: 320,
  maxHeight: 280,
  offset: 10,
  arrowSize: 10,
  disabled: false,
  anchorClass: '',
  contentClass: '',
})
const anchorRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()
const open = ref(false)
const resolvedPlacement = ref<ResolvedTipsPlacement>('top')
const panelStyle = ref<Record<string, string>>({})
const arrowStyle = ref<Record<string, string>>({})
let resizeObserver: ResizeObserver | null = null

const isTouch = () => import.meta.client && (window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0)
const effectiveTrigger = computed(() => props.trigger === 'auto' ? (isTouch() ? 'click' : 'hover') : props.trigger)

const updatePosition = async () => {
  await nextTick()
  const anchor = anchorRef.value
  const panel = panelRef.value
  if (!anchor || !panel || !open.value) return

  const trigger = anchor.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const placement = resolveTipsPlacement({
    requested: props.placement,
    trigger,
    panel: { width: panelRect.width, height: panelRect.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    offset: props.offset,
  })
  resolvedPlacement.value = placement

  let left = trigger.left + trigger.width / 2 - panelRect.width / 2
  let top = trigger.top - panelRect.height - props.offset
  if (placement.startsWith('bottom')) top = trigger.bottom + props.offset
  if (placement === 'left') {
    left = trigger.left - panelRect.width - props.offset
    top = trigger.top + trigger.height / 2 - panelRect.height / 2
  }
  if (placement === 'right') {
    left = trigger.right + props.offset
    top = trigger.top + trigger.height / 2 - panelRect.height / 2
  }
  if (placement.endsWith('-left')) left = trigger.left
  if (placement.endsWith('-right')) left = trigger.right - panelRect.width

  const clamped = clampToViewport(left, top, panelRect.width, window.innerWidth, 8, panelRect.height, window.innerHeight)
  panelStyle.value = {
    left: `${clamped.left}px`,
    top: `${clamped.top}px`,
    maxWidth: `${props.maxWidth}px`,
    '--ui-tips-arrow-size': `${props.arrowSize}px`,
  }

  const triggerCenterX = trigger.left + trigger.width / 2
  const triggerCenterY = trigger.top + trigger.height / 2
  const arrowHalf = props.arrowSize / 2
  arrowStyle.value = placement === 'left' || placement === 'right'
    ? { top: `${Math.min(Math.max(triggerCenterY - clamped.top - arrowHalf, props.arrowSize), panelRect.height - props.arrowSize * 2)}px` }
    : { left: `${Math.min(Math.max(triggerCenterX - clamped.left - arrowHalf, props.arrowSize), panelRect.width - props.arrowSize * 2)}px` }
}

const show = () => {
  if (props.disabled) return
  open.value = true
  requestAnimationFrame(updatePosition)
}
const hide = () => {
  if (effectiveTrigger.value === 'hover') open.value = false
}
const toggle = () => {
  if (props.disabled || effectiveTrigger.value !== 'click') return
  open.value = !open.value
  if (open.value) requestAnimationFrame(updatePosition)
}

const onOutside = (event: PointerEvent) => {
  const target = event.target as Node
  if (open.value && !anchorRef.value?.contains(target) && !panelRef.value?.contains(target)) open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  resizeObserver = new ResizeObserver(updatePosition)
  if (panelRef.value) resizeObserver.observe(panelRef.value)
})

watch(panelRef, panel => {
  resizeObserver?.disconnect()
  if (panel) resizeObserver?.observe(panel)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  resizeObserver?.disconnect()
})
</script>

<template>
  <span
    ref="anchorRef"
    :class="['ui-tips-anchor', anchorClass]"
    @mouseenter="effectiveTrigger === 'hover' && show()"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @click="toggle"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="ui-tips-fade">
      <div
        v-if="open"
        ref="panelRef"
        :class="['ui-tips-panel', `ui-tips-panel--${resolvedPlacement}`, contentClass]"
        :style="panelStyle"
        role="tooltip"
        @mouseenter="effectiveTrigger === 'hover' && show()"
        @mouseleave="hide"
      >
        <div class="ui-tips-body" :style="{ maxHeight: `${maxHeight}px` }">
          <slot name="content">{{ text }}</slot>
        </div>
        <span class="ui-tips-arrow" :style="arrowStyle" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-tips-anchor {
  display: inline-flex;
  line-height: normal;
}

.ui-tips-panel {
  position: fixed;
  z-index: 320;
  box-sizing: border-box;
  color: var(--color-text);
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface-elevated);
  box-shadow: 0 12px 36px rgb(8 10 14 / 18%);
  font-size: 12px;
  line-height: 1.5;
}

.ui-tips-body {
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
  overscroll-behavior: contain;
}

.ui-tips-body :deep(img),
.ui-tips-body :deep(video) {
  display: block;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.ui-tips-arrow {
  position: absolute;
  width: var(--ui-tips-arrow-size);
  height: var(--ui-tips-arrow-size);
  border: 1px solid var(--color-line);
  background: var(--color-surface-elevated);
  transform: rotate(45deg);
}

.ui-tips-panel--top .ui-tips-arrow,
.ui-tips-panel--top-left .ui-tips-arrow,
.ui-tips-panel--top-right .ui-tips-arrow {
  bottom: calc(var(--ui-tips-arrow-size) / -2);
  border-top: 0;
  border-left: 0;
}

.ui-tips-panel--bottom .ui-tips-arrow,
.ui-tips-panel--bottom-left .ui-tips-arrow,
.ui-tips-panel--bottom-right .ui-tips-arrow {
  top: calc(var(--ui-tips-arrow-size) / -2);
  border-right: 0;
  border-bottom: 0;
}

.ui-tips-panel--left .ui-tips-arrow {
  right: calc(var(--ui-tips-arrow-size) / -2);
  border-left: 0;
  border-bottom: 0;
}

.ui-tips-panel--right .ui-tips-arrow {
  left: calc(var(--ui-tips-arrow-size) / -2);
  border-top: 0;
  border-right: 0;
}

.ui-tips-fade-enter-active,
.ui-tips-fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.ui-tips-fade-enter-from,
.ui-tips-fade-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
