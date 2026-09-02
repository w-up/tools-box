# Web Toolbox

基于 Nuxt 4 的 SSG 网页工具箱，用于承载图片压缩、智能图片对比改名等浏览器端小工具。

## 技术基线

- Nuxt 4
- Vue 3
- TypeScript
- pnpm
- SSR prerender SSG
- PC / mobile 统一组件树，断点 1024px

## 已实现工具

### 智能图片对比改名

路由：`/tools/image-compare-rename`

- A 组文件名作为命名来源，B 组作为待改名图片。
- 使用 5 区域局部平均感知哈希，并联合比较颜色、透明覆盖率和纵横比。
- 支持人工修正匹配关系、大图对比、ZIP 导出及 macOS/Linux/Windows 重命名脚本。
- 未匹配图片在 ZIP 中保留原名，导出脚本只包含已确认的改名项。
- 文件只在当前浏览器中读取，不会上传。

### 图片资源迁移

路由：`/tools/image-asset-migration`

- 手动设置图片导出文件名，并保留导入目录结构。
- 可手动指定多个重复图片统一使用一个保留图片，并按需从导出包中移除确认重复项。
- 可选同步更新 HTML、CSS、JS、TS、Vue、JSON 等文本文件中的完整图片文件名引用。
- 导出图片、代码副本和 `migration-report.json`；不会改写用户原始文件。
- 处理设置通过 `app/utils/useLocalStorage.ts` 保存到当前浏览器，刷新后仍有效；导入文件和任务数据不会保存。

## 主题与设置

顶部导航的“设置”打开可扩展设置抽屉。当前提供 5 套全站主题：明亮白、深夜黑、樱花粉、天空蓝、嫩草绿。主题统一控制页面背景、卡片表面、文字、按钮、按钮 hover、边框和柔和强调色，并通过 `localStorage` 保存到当前浏览器。主题定义集中在 `app/config/themes.ts`，后续设置项继续放入 `AppSettingsPanel.vue` 的分类结构。

## 公共 UI 组件

通用交互组件统一放在 `app/components/ui/`：

- `UiModal.vue`：统一 `v-model`、`Teleport`、遮罩、ESC/点击遮罩关闭及保留滚动条占位的背景锁定。
- `UiTips.vue`：支持 `auto/hover/click`、自动定位、视口限制、箭头和自定义内容 slot。
- `UiToast.vue`：默认 layout 全局单例挂载，通过 `useToast()` 发送 `info/success/warning/error` 通知。

设置面板和图片大图对比已迁移到 `UiModal`；图片工具的流程说明使用 `UiTips`；导入、匹配、导出和错误状态统一使用 `UiToast`。

## 本地开发

```bash
pnpm install
pnpm dev
```

开发地址默认是 `http://localhost:3000`。

开发服务、测试、类型检查、构建、静态生成、lint 和 `postinstall` 会使用带 scope 的项目级目录，分别隔离 `.nuxt`、`.output` 和 Nuxt/Vite cache。`dev` 与 `build` 使用不同锁和不同目录，可以并行运行；`build`/`generate`/`preview` 仍通过共享输出锁保护最终 `.output` 的切换。若已有同类任务占用锁，新的任务会直接拒绝并提示占用者，不会删除或覆盖正在使用的锁。锁目录由 AI 工具和本地命令共同使用，因此通过 `pnpm build`、`pnpm generate` 启动的任务也会与其他执行入口互斥。

构建和静态生成先写入带运行标识的临时 `.output.build-*` 目录，校验 `public/index.html` 后再原子替换最终 `.output`；失败时保留上一份可用产物。隔离目录和锁均由 `.gitignore` 排除。

## 验证

```bash
pnpm test
pnpm test:concurrency
pnpm lint
pnpm typecheck
pnpm generate
```

静态产物位于 `.output/public/`，可直接部署到静态主机或 CDN。

## 项目结构

```text
app/
  assets/css/       全局样式
  components/       公共组件与工具容器
  data/             工具目录元数据
  layouts/          页面布局
  pages/            首页与各工具路由
  types/            公共 TypeScript 类型
public/              原样复制的静态文件
nuxt.config.ts       Nuxt 与 prerender 配置
```

新增工具时：

1. 在 `app/data/tools.ts` 注册工具。
2. 在 `app/pages/tools/` 创建对应页面。
3. 完成功能后将状态从 `planned` 改为 `available`。
4. 执行 `pnpm typecheck && pnpm generate`。
