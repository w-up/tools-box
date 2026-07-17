export type HtmlImageReferenceKind = 'attribute' | 'srcset' | 'css-url'

export interface HtmlImageReference {
  kind: HtmlImageReferenceKind
  path: string
  raw: string
}

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i
const REFERENCE_PATTERN = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))|\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))|\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"')]+))\s*\)/gi

// 去除查询参数和 hash，取得用于判断资源类型的实际路径
const getPathWithoutSuffix = (value: string) => value.split(/[?#]/, 1)[0] ?? ''

// 只保留可随项目迁移的本地静态图片路径
const normalizeImageReference = (raw: string) => {
  const value = raw.trim()
  const path = getPathWithoutSuffix(value)
  if (!path || /^(?:[a-z][a-z\d+.-]*:|\/\/|data:|#)/i.test(path)) return null
  if (!IMAGE_EXTENSION_PATTERN.test(path)) return null
  return { path, raw: value }
}

// 从图片引用路径中提取文件名，供重命名映射关联使用
export const getImageReferenceFileName = (path: string) => path.split('/').at(-1) ?? path

// 扫描 HTML 中常见的静态图片属性、srcset 与 CSS url 引用
export const findHtmlImageReferences = (content: string): HtmlImageReference[] => {
  const references: HtmlImageReference[] = []
  // 先移除不会参与页面渲染的注释和 script 内容，避免扫描到字符串里的伪标签
  const scanContent = content
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')

  for (const match of scanContent.matchAll(REFERENCE_PATTERN)) {
    const srcsetValue = match[1] ?? match[2] ?? match[3]
    if (srcsetValue !== undefined) {
      const candidates = srcsetValue.split(',')
      for (const candidate of candidates) {
        const normalized = normalizeImageReference(candidate.trim().split(/\s+/, 1)[0] ?? '')
        if (normalized) references.push({ kind: 'srcset', ...normalized })
      }
      continue
    }

    const attributeValue = match[4] ?? match[5] ?? match[6]
    if (attributeValue !== undefined) {
      const normalized = normalizeImageReference(attributeValue)
      if (normalized) references.push({ kind: 'attribute', ...normalized })
      continue
    }

    const cssUrlValue = match[7] ?? match[8] ?? match[9]
    if (cssUrlValue !== undefined) {
      const normalized = normalizeImageReference(cssUrlValue)
      if (normalized) references.push({ kind: 'css-url', ...normalized })
    }
  }

  return references
}
