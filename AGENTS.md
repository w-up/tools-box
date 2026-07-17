# AGENTS.md

## 项目定位

这是一个 Nuxt 4 SSG 网页工具箱。工具默认优先在浏览器本地处理文件，避免无必要上传。

## 工程约定

- 包管理器只使用 `pnpm`。
- 使用 Nuxt 4 的 `app/` 目录结构与 TypeScript。
- 生产交付以 `pnpm generate` 生成的 `.output/public/` 为准。
- PC / mobile 共用组件树，响应式断点统一为 `1024px`。
- 页面局部状态优先使用 `ref` / `computed`，出现跨组件复杂业务后再引入 composable 或状态库。
- 新增依赖前先确认浏览器原生 API 是否已足够，避免过度设计。
- 方法和复杂逻辑使用中文单行注释，技术术语、API、config key 保持英文。

## 工具页面约定

- 每个工具只解决一个明确问题。
- 工具元数据统一维护在 `app/data/tools.ts`。
- 工具路由统一放在 `app/pages/tools/`。
- 文件处理功能优先使用 Web APIs，并明确说明文件是否离开本机。
- 文件名、相对路径等用户输入只允许通过 Vue 文本/属性绑定渲染，禁止拼入 `innerHTML`。
- 重命名脚本必须按 POSIX shell 与 Windows BAT 分别转义，并拒绝换行或空字符。
- 工具完成后将状态从 `planned` 更新为 `available`。
- 主题颜色统一维护在 `app/config/themes.ts`，业务组件只消费 `--color-*` CSS 变量，禁止新增固定页面主题色。
- Modal、Tips、Toast 分别统一使用 `app/components/ui/UiModal.vue`、`UiTips.vue`、`UiToast.vue`；业务页面不得重复实现 `Teleport`、遮罩、滚动锁或自制通知。
- 全局通知通过 `useToast()` 调用，`UiToast` 只在默认 layout 挂载一次。
- 新设置项统一扩展 `AppSettingsPanel.vue` 的分类结构，不能散落到各工具页面。

## 验证

```bash
pnpm test
pnpm typecheck
pnpm generate
```

页面或交互变更还需在桌面与移动端浏览器进行 smoke test。
