import type { ToolItem } from '~/types/tool'

export const tools: ToolItem[] = [
  {
    index: '01',
    title: '图片压缩',
    description: '在浏览器中压缩图片，后续支持质量、尺寸和输出格式设置。',
    to: '/tools/image-compressor',
    category: '图片',
    status: 'planned',
  },
  {
    index: '02',
    title: '智能图片对比改名',
    description: '比较两组图片的视觉内容，生成匹配关系与统一命名建议。',
    to: '/tools/image-compare-rename',
    category: '图片',
    status: 'available',
  },
  {
    index: '03',
    title: '图片资源迁移',
    description: '手动重命名、合并重复图片，并可同步更新代码中的资源引用。',
    to: '/tools/image-asset-migration',
    category: '图片',
    status: 'available',
  },
]
