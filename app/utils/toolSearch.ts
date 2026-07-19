import type { ToolItem } from '~/types/tool'

const normalizeSearchText = (value: string) => value.toLocaleLowerCase().replaceAll(/\s+/g, '')

// 为字符顺序一致但不连续的模糊命中计算紧凑度分数
const scoreSubsequence = (text: string, query: string) => {
  let queryIndex = 0
  let firstIndex = -1
  let lastIndex = -1
  for (let index = 0; index < text.length && queryIndex < query.length; index += 1) {
    if (text[index] !== query[queryIndex]) continue
    if (firstIndex < 0) firstIndex = index
    lastIndex = index
    queryIndex += 1
  }
  if (queryIndex !== query.length) return 0
  return 200 - Math.max(0, lastIndex - firstIndex - query.length)
}

// 综合标题、关键词与描述，对工具目录执行本地模糊搜索和相关性排序
export const searchTools = (tools: ToolItem[], rawQuery: string) => {
  const query = normalizeSearchText(rawQuery)
  if (!query) return tools

  return tools.map((tool, order) => {
    const title = normalizeSearchText(tool.title)
    const keywords = normalizeSearchText(tool.keywords.join(' '))
    const description = normalizeSearchText(tool.description)
    let score = 0
    if (title === query) score = 1000
    else if (title.startsWith(query)) score = 900
    else if (title.includes(query)) score = 800
    else if (keywords.includes(query)) score = 700
    else if (description.includes(query)) score = 600
    else score = Math.max(
      scoreSubsequence(title, query) + 300,
      scoreSubsequence(keywords, query) + 200,
      scoreSubsequence(description, query) + 100,
    )
    return { tool, order, score }
  }).filter(result => result.score > 300)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(result => result.tool)
}