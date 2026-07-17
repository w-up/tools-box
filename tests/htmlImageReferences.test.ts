import { describe, expect, it } from 'vitest'

import { findHtmlImageReferences, getImageReferenceFileName } from '../app/utils/htmlImageReferences'

describe('findHtmlImageReferences', () => {
  it('识别 HTML 静态图片属性与 CSS url 引用', () => {
    const references = findHtmlImageReferences(`
      <img src="/images/IMG_001.png">
      <source srcset="./images/IMG_002.webp 1x, ./images/IMG_002@2x.webp 2x">
      <link rel="preload" href="/images/logo.svg" as="image">
      <div style="background-image: url('/images/banner.jpg')"></div>
    `)

    expect(references.map(reference => reference.path)).toEqual([
      '/images/IMG_001.png',
      './images/IMG_002.webp',
      './images/IMG_002@2x.webp',
      '/images/logo.svg',
      '/images/banner.jpg',
    ])
  })

  it('忽略外部地址、data URL 与非图片资源', () => {
    const references = findHtmlImageReferences(`
      <img src="https://cdn.example.com/logo.png">
      <img src="data:image/png;base64,AAAA">
      <script src="/scripts/main.js"></script>
      <a href="/docs/readme.pdf">文档</a>
    `)

    expect(references).toEqual([])
  })

  it('保留查询参数与 hash 前的实际图片路径', () => {
    const references = findHtmlImageReferences('<img src="assets/hero.png?v=2#top">')

    expect(references).toEqual([expect.objectContaining({
      path: 'assets/hero.png',
      raw: 'assets/hero.png?v=2#top',
    })])
  })

  it('从图片路径中提取用于匹配的文件名', () => {
    expect(getImageReferenceFileName('/images/home/hero.png')).toBe('hero.png')
  })

  it('识别无引号的静态图片属性', () => {
    const references = findHtmlImageReferences('<img src=images/logo.png><video poster=images/cover.webp>')

    expect(references.map(reference => reference.path)).toEqual(['images/logo.png', 'images/cover.webp'])
  })

  it('忽略注释与 script 字符串中的伪图片引用', () => {
    const references = findHtmlImageReferences(`
      <!-- <img src="images/comment.png"> -->
      <script>const preview = '<img src="images/not-rendered.png">'</script>
      <img src="images/rendered.png">
    `)

    expect(references.map(reference => reference.path)).toEqual(['images/rendered.png'])
  })
})
