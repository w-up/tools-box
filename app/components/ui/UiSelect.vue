<script setup lang="ts">
export interface UiSelectOption {
  label: string
  value: string
  disabled?: boolean
}

interface Props {
  options: UiSelectOption[]
  multiple?: boolean
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  multiple: false,
  placeholder: '请选择',
  disabled: false,
})
const model = defineModel<string | string[]>({ required: true })
const open = ref(false)
const rootRef = ref<HTMLElement>()

const selectedValues = computed(() => new Set(Array.isArray(model.value) ? model.value : [model.value]))
const selectedLabels = computed(() => props.options.filter(option => selectedValues.value.has(option.value)).map(option => option.label))
const displayText = computed(() => selectedLabels.value.length > 0 ? selectedLabels.value.join('、') : props.placeholder)

// 单选直接关闭菜单，多选保留菜单以支持连续勾选
const selectOption = (option: UiSelectOption) => {
  if (props.disabled || option.disabled) return
  if (!props.multiple) {
    model.value = option.value
    open.value = false
    return
  }
  const next = new Set(selectedValues.value)
  if (next.has(option.value)) next.delete(option.value)
  else next.add(option.value)
  model.value = [...next]
}

const onOutside = (event: PointerEvent) => {
  if (open.value && !rootRef.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="rootRef" :class="['ui-select', { 'ui-select--open': open, 'ui-select--disabled': disabled }]">
    <button type="button" class="ui-select__trigger" :disabled="disabled" @click="open = !open">
      <UiTips :text="displayText" placement="top" :disabled="selectedLabels.length === 0">
        <span :class="['ui-select__value', { 'ui-select__value--placeholder': selectedLabels.length === 0 }]">{{ displayText }}</span>
      </UiTips>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <div v-if="open" class="ui-select__menu" role="listbox" :aria-multiselectable="multiple">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="['ui-select__option', { 'ui-select__option--selected': selectedValues.has(option.value) }]"
        :disabled="option.disabled"
        @click="selectOption(option)"
      >
        <span v-if="multiple" class="ui-select__check" aria-hidden="true">{{ selectedValues.has(option.value) ? '✓' : '' }}</span>
        <UiTips :text="option.label" placement="right"><span>{{ option.label }}</span></UiTips>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ui-select { position:relative; min-width:0; }.ui-select__trigger { display:flex; width:100%; min-height:38px; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--color-line); border-radius:8px; padding:0 10px; color:var(--color-text); background:var(--color-surface); cursor:pointer; text-align:left; }.ui-select__trigger:hover:not(:disabled),.ui-select--open .ui-select__trigger { border-color:var(--color-accent); }.ui-select__trigger:disabled { cursor:not-allowed; }.ui-select__value { display:block; min-width:0; overflow:hidden; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }.ui-select__value--placeholder { color:var(--color-muted); }.ui-select__trigger :deep(.ui-tips-anchor) { min-width:0; flex:1; }.ui-select__trigger svg { width:14px; height:14px; flex:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.8; transition:transform 160ms ease; }.ui-select--open .ui-select__trigger svg { transform:rotate(180deg); }.ui-select__menu { position:absolute; z-index:80; width:100%; max-height:208px; margin-top:5px; overflow-y:auto; border:1px solid var(--color-line); border-radius:10px; padding:4px; background:var(--color-surface-elevated); box-shadow:0 12px 32px rgb(8 10 14 / 16%); }.ui-select__option { display:flex; width:100%; min-width:0; min-height:34px; align-items:center; gap:8px; border:0; border-radius:6px; padding:6px 8px; color:var(--color-text); background:transparent; cursor:pointer; font-size:11px; text-align:left; }.ui-select__option:hover:not(:disabled),.ui-select__option--selected { color:var(--color-accent); background:var(--color-accent-soft); }.ui-select__option:disabled { color:var(--color-muted); cursor:not-allowed; }.ui-select__option :deep(.ui-tips-anchor) { min-width:0; flex:1; }.ui-select__option :deep(.ui-tips-anchor > span) { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.ui-select__check { display:grid; width:14px; height:14px; flex:none; place-items:center; border:1px solid var(--color-line); border-radius:4px; font-size:10px; }.ui-select__option--selected .ui-select__check { color:var(--color-accent-text); border-color:var(--color-accent); background:var(--color-accent); }
</style>
