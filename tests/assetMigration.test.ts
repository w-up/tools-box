import { describe, expect, it } from 'vitest'

import { createAssetMigrationPlan, rewriteAssetReferences } from '../app/utils/assetMigration'

describe('createAssetMigrationPlan', () => {
  it('将多个旧文件合并到指定保留文件，并为其他文件保留原名', () => {
    const plan = createAssetMigrationPlan(
      ['image-1.png', 'image-2.png', 'image-3.png', 'banner.png'],
      [{ sourceNames: ['image-1.png', 'image-2.png'], targetName: 'image-3.png' }],
      true,
    )

    expect(plan).toEqual([
      { sourceName: 'image-1.png', targetName: 'image-3.png', action: 'remove' },
      { sourceName: 'image-2.png', targetName: 'image-3.png', action: 'remove' },
      { sourceName: 'image-3.png', targetName: 'image-3.png', action: 'keep' },
      { sourceName: 'banner.png', targetName: 'banner.png', action: 'keep' },
    ])
  })

  it('关闭去重时保留源图片但仍生成代码引用替换映射', () => {
    const plan = createAssetMigrationPlan(
      ['image-1.png', 'image-3.png'],
      [{ sourceNames: ['image-1.png'], targetName: 'image-3.png' }],
      false,
    )

    expect(plan[0]).toEqual({ sourceName: 'image-1.png', targetName: 'image-3.png', action: 'keep' })
  })

  it('保留手动重命名的图片实体，不将其误判为重复删除', () => {
    const plan = createAssetMigrationPlan(
      ['image-1.png'],
      [],
      true,
      new Map([['image-1.png', 'banner.png']]),
    )

    expect(plan).toEqual([{ sourceName: 'image-1.png', targetName: 'banner.png', action: 'keep' }])
  })

  it('合并目标被重命名时，所有旧引用指向最终导出文件名', () => {
    const plan = createAssetMigrationPlan(
      ['image-1.png', 'image-3.png'],
      [{ sourceNames: ['image-1.png'], targetName: 'image-3.png' }],
      true,
      new Map([['image-3.png', 'hero.png']]),
    )

    expect(plan).toEqual([
      { sourceName: 'image-1.png', targetName: 'hero.png', action: 'remove' },
      { sourceName: 'image-3.png', targetName: 'hero.png', action: 'keep' },
    ])
  })
})

describe('rewriteAssetReferences', () => {
  it('同步替换 HTML 与 CSS 中的旧文件名，同时保留路径和查询参数', () => {
    const result = rewriteAssetReferences(
      `<img src="./img/image-1.png?v=2"><div style="background:url('./img/image-2.png')"></div>`,
      new Map([['image-1.png', 'image-3.png'], ['image-2.png', 'image-3.png']]),
    )

    expect(result).toBe(`<img src="./img/image-3.png?v=2"><div style="background:url('./img/image-3.png')"></div>`)
  })

  it('不替换更长文件名中的局部文本', () => {
    expect(rewriteAssetReferences('image-1.png image-10.png', new Map([['image-1.png', 'image-3.png']]))).toBe('image-3.png image-10.png')
  })
})
