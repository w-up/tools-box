import { describe, expect, it } from 'vitest'

import {
  applyDuplicateTargetNames,
  createAssetMigrationPlan,
  createManualGroupMerges,
  formatFileSize,
  getManualGroupRemovedImageIds,
  resolveAssetOutputPath,
  shouldUseTemplateAsset,
  resolveTemplateTargetName,
  rewriteAssetReferences,
} from '../app/utils/assetMigration'

describe('applyDuplicateTargetNames', () => {
  it('把保留图片的最终名称同步给同组图片，不让已排除项占用编号', () => {
    expect(applyDuplicateTargetNames(
      new Map([['b', 'hero.png'], ['c', 'unique.png']]),
      [{ id: 'group-1', imageIds: ['a', 'b'] }],
      { 'group-1': 'b' },
    )).toEqual(new Map([['b', 'hero.png'], ['c', 'unique.png'], ['a', 'hero.png']]))
  })
})

describe('formatFileSize', () => {
  it('使用易读单位显示图片文件大小', () => {
    expect(formatFileSize(900)).toBe('900 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2 MB')
  })
})

describe('手动合并组', () => {
  const groups = [
    { id: 'manual-1', imageIds: ['a', 'b', 'c'], keepImageId: 'a' },
    { id: 'manual-2', imageIds: ['d', 'e'], keepImageId: 'e' },
  ]
  const images = [
    { id: 'a', relativePath: 'project/img/a.png' },
    { id: 'b', relativePath: 'project/img/b.png' },
    { id: 'c', relativePath: 'project/img/c.png' },
    { id: 'd', relativePath: 'project/img/d.png' },
    { id: 'e', relativePath: 'project/img/e.png' },
  ]

  it('两组分别将组内删除图片映射到各自保留图片，不会串组', () => {
    expect(createManualGroupMerges(groups, images)).toEqual([
      { sourceNames: ['project/img/b.png', 'project/img/c.png'], targetName: 'project/img/a.png' },
      { sourceNames: ['project/img/d.png'], targetName: 'project/img/e.png' },
    ])
  })

  it('取得两组中除保留图片外的全部真实删除项', () => {
    expect(getManualGroupRemovedImageIds(groups)).toEqual(new Set(['b', 'c', 'd']))
  })

  it('两组删除图片在迁移计划和代码引用中分别指向各自保留图片', () => {
    const merges = createManualGroupMerges(groups, images)
    const removedPaths = new Set([...getManualGroupRemovedImageIds(groups)].map(imageId => (
      images.find(image => image.id === imageId)?.relativePath ?? ''
    )))
    const plan = createAssetMigrationPlan(
      images.map(image => image.relativePath),
      merges,
      false,
      new Map(),
      removedPaths,
    )
    const replacements = new Map(plan.map(item => [item.sourceName, item.targetName]))

    expect(plan.filter(item => item.action === 'remove')).toEqual([
      { sourceName: 'project/img/b.png', targetName: 'project/img/a.png', action: 'remove' },
      { sourceName: 'project/img/c.png', targetName: 'project/img/a.png', action: 'remove' },
      { sourceName: 'project/img/d.png', targetName: 'project/img/e.png', action: 'remove' },
    ])
    expect(rewriteAssetReferences(
      '<img src="./img/b.png"><img src="./img/c.png"><img src="./img/d.png">',
      replacements,
      'project/index.html',
    )).toBe('<img src="./img/a.png"><img src="./img/a.png"><img src="./img/e.png">')
  })

  it('组内未选择有效保留图片时不生成不安全的合并规则', () => {
    expect(createManualGroupMerges([
      { id: 'manual-1', imageIds: ['a', 'b'], keepImageId: '' },
    ], images)).toEqual([])
  })
})


describe('resolveTemplateTargetName', () => {
  it('手动启用模板文件替换时使用模板文件完整名称和真实扩展名', () => {
    expect(resolveTemplateTargetName('hero.webp', 'IMG_1001.png', true)).toBe('hero.webp')
    expect(resolveTemplateTargetName('hero.webp', 'IMG_1001.png', false)).toBe('hero.png')
  })
})

describe('resolveAssetOutputPath', () => {
  it('关闭删除重复项时保留源图片自身导出路径，但引用仍可指向保留图片', () => {
    expect(resolveAssetOutputPath(
      { sourceName: 'project/mobile/c.png', targetName: 'project/pc/keep.png', action: 'keep' },
      'project/pc/keep.png',
      false,
      true,
    )).toBe('project/mobile/c.png')
  })

  it('开启删除重复项或普通重命名时使用迁移计划目标路径', () => {
    expect(resolveAssetOutputPath(
      { sourceName: 'project/pc/logo.png', targetName: 'project/pc/brand.png', action: 'keep' },
      'project/pc/brand.png',
      true,
      false,
    )).toBe('project/pc/brand.png')
  })
})

describe('shouldUseTemplateAsset', () => {
  it('未删除的非保留重复图片沿用原文件，避免模板格式与旧扩展名不一致', () => {
    expect(shouldUseTemplateAsset(
      { sourceName: 'project/b.png', targetName: 'project/hero.webp', action: 'keep' },
      'project/hero.webp',
      'project/b.png',
      true,
      true,
    )).toBe(false)
  })

  it('正常匹配并按模板扩展名输出时使用模板文件', () => {
    expect(shouldUseTemplateAsset(
      { sourceName: 'project/a.png', targetName: 'project/hero.webp', action: 'keep' },
      'project/hero.webp',
      'project/hero.webp',
      true,
      false,
    )).toBe(true)
  })
})

describe('createAssetMigrationPlan 路径映射', () => {
  it('使用相对路径作为唯一标识，允许不同目录存在同名图片', () => {
    const plan = createAssetMigrationPlan(
      ['project/pc/logo.png', 'project/mobile/logo.png'],
      [{ sourceNames: ['project/mobile/logo.png'], targetName: 'project/pc/logo.png' }],
      true,
      new Map([['project/pc/logo.png', 'project/pc/brand.png']]),
    )

    expect(plan).toEqual([
      { sourceName: 'project/pc/logo.png', targetName: 'project/pc/brand.png', action: 'keep' },
      { sourceName: 'project/mobile/logo.png', targetName: 'project/pc/brand.png', action: 'remove' },
    ])
  })
})

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

  it('无替换目标的手动删除图片仍从导出物移除，但不生成错误引用映射', () => {
    expect(createAssetMigrationPlan(
      ['project/img/orphan.png', 'project/img/keep.png'],
      [],
      true,
      new Map(),
      new Set(['project/img/orphan.png']),
    )).toEqual([
      { sourceName: 'project/img/orphan.png', targetName: 'project/img/orphan.png', action: 'remove' },
      { sourceName: 'project/img/keep.png', targetName: 'project/img/keep.png', action: 'keep' },
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

  it('按代码文件位置把跨目录重复图片引用改为保留图片路径', () => {
    expect(rewriteAssetReferences(
      `<img src="./mobile/c.png"><img src="/mobile/c.png">`,
      new Map([['project/mobile/c.png', 'project/pc/keep.png']]),
      'project/index.html',
    )).toBe(`<img src="./pc/keep.png"><img src="/pc/keep.png">`)
  })

  it('同名图片位于不同目录时只改写当前代码实际引用的资源', () => {
    expect(rewriteAssetReferences(
      `background:url('./logo.png')`,
      new Map([
        ['project/pc/logo.png', 'project/pc/brand.png'],
        ['project/mobile/logo.png', 'project/mobile/mobile-brand.png'],
      ]),
      'project/pc/style.css',
    )).toBe(`background:url('./brand.png')`)
  })

  it('嵌套代码中的根路径引用仍从项目根目录解析并保持根路径风格', () => {
    expect(rewriteAssetReferences(
      `<img src="/img/a.png?v=1">`,
      new Map([['project/img/a.png', 'project/assets/keep.png']]),
      'project/pages/index.html',
    )).toBe(`<img src="/assets/keep.png?v=1">`)
  })
})
