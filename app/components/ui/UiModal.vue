<script setup lang="ts">
interface Props {
  title?: string
  description?: string
  width?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  showClose?: boolean
  panelClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  description: '',
  width: '720px',
  closeOnBackdrop: true,
  closeOnEscape: true,
  showClose: true,
  panelClass: '',
})
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ opened: [], closed: [] }>()
const { lock, unlock } = useBodyScrollLock()
const titleId = useId()
const descriptionId = useId()

const close = () => {
  open.value = false
}

const onBackdrop = () => {
  if (props.closeOnBackdrop) close()
}

const onKeydown = (event: KeyboardEvent) => {
  if (props.closeOnEscape && event.key === 'Escape' && open.value) close()
}

watch(open, (value, previous) => {
  if (value && !previous) {
    lock()
    emit('opened')
  } else if (!value && previous) {
    unlock()
    emit('closed')
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (open.value) lock()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (open.value) unlock()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-modal-fade">
      <div v-if="open" class="ui-modal" @click.self="onBackdrop">
        <section
          :class="['ui-modal__panel', panelClass]"
          :style="{ '--ui-modal-width': width }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title || $slots.header ? titleId : undefined"
          :aria-describedby="description ? descriptionId : undefined"
        >
          <header v-if="title || description || showClose || $slots.header" class="ui-modal__header">
            <slot name="header">
              <div>
                <h2 v-if="title" :id="titleId">{{ title }}</h2>
                <p v-if="description" :id="descriptionId">{{ description }}</p>
              </div>
            </slot>
            <button v-if="showClose" type="button" class="ui-modal__close" aria-label="关闭弹窗" @click="close">×</button>
          </header>

          <div class="ui-modal__body">
            <slot :close="close" />
          </div>

          <footer v-if="$slots.footer" class="ui-modal__footer">
            <slot name="footer" :close="close" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal {
  position: fixed;
  z-index: 180;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(8 11 17 / 58%);
  backdrop-filter: blur(6px);
}

.ui-modal__panel {
  display: flex;
  width: min(var(--ui-modal-width), 100%);
  max-height: calc(100svh - 48px);
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-surface-elevated);
  box-shadow: 0 24px 80px rgb(8 10 14 / 22%);
}

.ui-modal__header,
.ui-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--color-line);
  padding: 18px 22px;
}

.ui-modal__header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 590;
  letter-spacing: -0.025em;
}

.ui-modal__header p {
  margin: 5px 0 0;
  color: var(--color-muted);
  font-size: 11px;
}

.ui-modal__close {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  font-size: 22px;
}

.ui-modal__body {
  min-height: 0;
  overflow: auto;
}

.ui-modal__footer {
  border-top: 1px solid var(--color-line);
  border-bottom: 0;
}

.ui-modal-fade-enter-active,
.ui-modal-fade-leave-active {
  transition: opacity 160ms ease;
}

.ui-modal-fade-enter-active .ui-modal__panel,
.ui-modal-fade-leave-active .ui-modal__panel {
  transition: transform 180ms ease, opacity 180ms ease;
}

.ui-modal-fade-enter-from,
.ui-modal-fade-leave-to,
.ui-modal-fade-enter-from .ui-modal__panel,
.ui-modal-fade-leave-to .ui-modal__panel {
  opacity: 0;
}

.ui-modal-fade-enter-from .ui-modal__panel,
.ui-modal-fade-leave-to .ui-modal__panel {
  transform: translateY(10px) scale(0.985);
}

@media (max-width: 640px) {
  .ui-modal {
    padding: 12px;
  }

  .ui-modal__panel {
    max-height: calc(100svh - 24px);
  }

  .ui-modal__close {
    width: 44px;
    height: 44px;
  }
}
</style>
