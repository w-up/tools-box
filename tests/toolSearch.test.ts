import { describe, expect, it } from 'vitest'

import type { ToolItem } from '../app/types/tool'
import { searchTools } from '../app/utils/toolSearch'

const tools: ToolItem[] = [
  {
    index: '01',
    title: '图片压缩',
    description: '压缩图片并调整输出格式。',
    to: '/tools/image-compressor',
    category: '图片',
    status: 'planned',
    keywords: ['体积', '质量', 'compress'],
  },
  {
    index: '02',
    title: '智能图片对比改名',
    description: '比较两组图片并生成统一命名建议。',
    to: '/tools/image-compare-rename',
    category: '图片',
    status: 'available',
    keywords: ['匹配', '重命名', 'rename'],
  },
  {
    index: '03',
    title: '图片资源迁移',
    description: '识别重复图片并更新代码引用。',
    to: '/tools/image-asset-migration',
    category: '图片',
    status: 'available',
    keywords: ['去重', '引用替换', 'duplicate'],
  },
]

describe('searchTools', () => {
  it('空查询返回全部工具', () => {
    expect(searchTools(tools, '').map(tool => tool.to)).toEqual(tools.map(tool => tool.to))
  })

  it('支持标题、描述和关键词搜索，并优先显示标题命中', () => {
    expect(searchTools(tools, '图片改名').map(tool => tool.title)).toEqual(['智能图片对比改名'])
    expect(searchTools(tools, '去重').map(tool => tool.title)).toEqual(['图片资源迁移'])
    expect(searchTools(tools, 'compress').map(tool => tool.title)).toEqual(['图片压缩'])
  })

  it('支持字符顺序一致但不连续的模糊搜索', () => {
    expect(searchTools(tools, '图迁').map(tool => tool.title)).toEqual(['图片资源迁移'])
    expect(searchTools(tools, '智改').map(tool => tool.title)).toEqual(['智能图片对比改名'])
  })

  it('忽略查询中的空格和英文大小写', () => {
    expect(searchTools(tools, ' Re Name ').map(tool => tool.title)).toEqual(['智能图片对比改名'])
  })
})
