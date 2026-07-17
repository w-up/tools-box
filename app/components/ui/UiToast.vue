<script setup lang="ts">
const { toasts, remove } = useToast()

const typeLabel = {
  info: '提示',
  success: '成功',
  warning: '注意',
  error: '错误',
}
</script>

<template>
  <Teleport to="body">
    <div class="ui-toast-region" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="ui-toast-list">
        <div v-for="toast in toasts" :key="toast.id" :class="['ui-toast', `ui-toast--${toast.type}`]" role="status">
          <span class="ui-toast__dot" aria-hidden="true" />
          <div>
            <strong>{{ typeLabel[toast.type] }}</strong>
            <p>{{ toast.message }}</p>
          </div>
          <button type="button" aria-label="关闭通知" @click="remove(toast.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-toast-region {
  position: fixed;
  z-index: 240;
  top: 20px;
  right: 20px;
  display: grid;
  width: min(360px, calc(100vw - 32px));
  gap: 10px;
  pointer-events: none;
}

.ui-toast {
  --toast-color: var(--color-accent);
  display: grid;
  grid-template-columns: 8px 1fr 30px;
  align-items: start;
  gap: 11px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  padding: 13px 12px 13px 14px;
  color: var(--color-text);
  background: var(--color-surface-elevated);
  box-shadow: 0 16px 44px rgb(8 10 14 / 18%);
  pointer-events: auto;
}

.ui-toast--success { --toast-color: #2f9e6f; }
.ui-toast--warning { --toast-color: #d28a24; }
.ui-toast--error { --toast-color: #d35454; }

.ui-toast__dot {
  width: 8px;
  height: 8px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--toast-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--toast-color) 18%, transparent);
}

.ui-toast strong {
  color: var(--toast-color);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.ui-toast p {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
}

.ui-toast button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
}

.ui-toast-list-enter-active,
.ui-toast-list-leave-active,
.ui-toast-list-move {
  transition: opacity 180ms ease, transform 180ms ease;
}

.ui-toast-list-enter-from,
.ui-toast-list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

@media (max-width: 640px) {
  .ui-toast-region {
    top: 12px;
    right: 16px;
    left: 16px;
    width: auto;
  }
}
</style>
