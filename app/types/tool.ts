export type ToolStatus = 'available' | 'planned'

export interface ToolItem {
  title: string
  description: string
  to: string
  category: '图片'
  status: ToolStatus
  index: string
}
