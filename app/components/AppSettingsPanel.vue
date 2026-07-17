<script setup lang="ts">
import { THEME_PRESETS } from '~/config/themes'

const open = defineModel<boolean>({ required: true })
const { themeId, applyTheme } = useTheme()
</script>

<template>
  <UiModal v-model="open" width="820px" panel-class="settings-modal">
    <template #header>
      <div class="settings-heading">
        <span>SETTINGS</span>
        <h2>设置</h2>
        <p>统一管理 Web Toolbox 的外观与后续偏好。</p>
      </div>
    </template>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <a class="settings-nav__item settings-nav__item--active" href="#appearance">外观</a>
        <span class="settings-nav__item settings-nav__item--soon">更多设置后续加入</span>
      </nav>

      <section id="appearance" class="settings-content">
        <div class="settings-content__title">
          <div>
            <p>主题</p>
            <h3>选择工作区配色</h3>
          </div>
          <small>按钮、边框、背景和文字会同步切换</small>
        </div>

        <div class="theme-grid">
          <button
            v-for="theme in THEME_PRESETS"
            :key="theme.id"
            type="button"
            :class="['theme-option', { 'theme-option--active': themeId === theme.id }]"
            :aria-pressed="themeId === theme.id"
            @click="applyTheme(theme.id)"
          >
            <span class="theme-option__preview" :style="{ background: theme.colors.background, borderColor: theme.colors.border }">
              <i :style="{ background: theme.colors.surface, borderColor: theme.colors.border }" />
              <i :style="{ background: theme.colors.button }" />
              <i :style="{ background: theme.colors.text }" />
            </span>
            <span class="theme-option__copy">
              <strong>{{ theme.name }}</strong>
              <UiTips :text="theme.description" placement="top">
                <small>{{ theme.description }}</small>
              </UiTips>
            </span>
            <span v-if="themeId === theme.id" class="theme-option__check" aria-hidden="true">✓</span>
          </button>
        </div>
      </section>
    </div>

    <template #footer="{ close }">
      <span class="settings-footer__hint">选择会自动保存到当前浏览器</span>
      <button class="settings-footer__button" type="button" @click="close">完成</button>
    </template>
  </UiModal>
</template>

<style scoped>
.settings-heading span {
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.settings-heading h2 {
  margin: 3px 0 0;
  font-size: 24px;
  font-weight: 590;
  letter-spacing: -0.04em;
}

.settings-heading p {
  margin: 5px 0 0;
  color: var(--color-muted);
  font-size: 11px;
}

.settings-layout {
  display: grid;
  min-height: 470px;
  grid-template-columns: 150px 1fr;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid var(--color-line);
  padding: 22px 16px;
  background: var(--color-bg);
}

.settings-nav__item {
  min-height: 38px;
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--color-muted);
  font-size: 12px;
}

.settings-nav__item--active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
  font-weight: 650;
}

.settings-nav__item--soon {
  margin-top: auto;
  font-size: 10px;
  line-height: 1.45;
}

.settings-content {
  padding: 28px 30px 36px;
}

.settings-content__title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.settings-content__title p {
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 700;
}

.settings-content__title h3 {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 590;
  letter-spacing: -0.025em;
}

.settings-content__title small {
  max-width: 210px;
  color: var(--color-muted);
  font-size: 11px;
  line-height: 1.5;
  text-align: right;
}

.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.theme-option {
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  padding: 12px;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.theme-option:hover {
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

.theme-option--active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 14%, transparent);
}

.theme-option__preview {
  position: relative;
  display: block;
  width: 72px;
  height: 58px;
  overflow: hidden;
  border: 1px solid;
  border-radius: 8px;
}

.theme-option__preview i {
  position: absolute;
  display: block;
  border: 1px solid transparent;
}

.theme-option__preview i:nth-child(1) {
  top: 9px;
  right: 8px;
  bottom: 9px;
  left: 8px;
  border-radius: 5px;
}

.theme-option__preview i:nth-child(2) {
  right: 13px;
  bottom: 14px;
  width: 24px;
  height: 8px;
  border-radius: 3px;
}

.theme-option__preview i:nth-child(3) {
  top: 17px;
  left: 13px;
  width: 26px;
  height: 4px;
  border: 0;
  border-radius: 2px;
}

.theme-option__copy {
  min-width: 0;
}

.theme-option__copy strong,
.theme-option__copy small {
  display: block;
}

.theme-option__copy strong {
  font-size: 13px;
  font-weight: 650;
}

.theme-option__copy :deep(.ui-tips-anchor) {
  display: block;
  margin-top: 5px;
  overflow: hidden;
}

.theme-option__copy small {
  display: block;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 10px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-option__check {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  color: var(--color-accent-text);
  background: var(--color-accent);
  font-size: 10px;
}

.settings-footer__hint {
  color: var(--color-muted);
  font-size: 11px;
}

.settings-footer__button {
  min-width: 96px;
  min-height: 42px;
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  color: var(--color-accent-text);
  background: var(--color-accent);
  cursor: pointer;
  font-weight: 650;
}

@media (max-width: 640px) {
  .settings-layout {
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .settings-nav {
    flex-direction: row;
    border-right: 0;
    border-bottom: 1px solid var(--color-line);
    padding: 12px 16px;
  }

  .settings-nav__item--soon {
    margin-top: 0;
    margin-left: auto;
  }

  .settings-content {
    padding: 22px 18px 28px;
  }

  .settings-content__title {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .settings-content__title small {
    max-width: none;
    text-align: left;
  }

  .theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
