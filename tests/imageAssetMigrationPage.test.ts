import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPage = readFileSync(resolve(process.cwd(), 'app/pages/tools/image-asset-migration.vue'), 'utf8')

describe('图片资源迁移页面流程', () => {
  it('直接展示操作面板，不显示页面标题介绍区', () => {
    expect(migrationPage).not.toContain('class="migration-header"')
    expect(migrationPage).not.toContain('图片工具 · 本地迁移')
    expect(migrationPage).not.toContain('比对、替换和导出全部在当前浏览器完成')
  })

  it('只保留人工分组合并，不再显示或执行自动视觉重复识别', () => {
    expect(migrationPage).not.toContain('findDuplicateImageGroups')
    expect(migrationPage).not.toContain('duplicateGroups')
    expect(migrationPage).not.toContain('自动识别重复图片')
    expect(migrationPage).not.toContain('像素内容完全相同')
    expect(migrationPage).not.toContain('去除确认重复图片')
    expect(migrationPage).toContain('人工分组合并')
  })

  it('模板匹配复用智能图片对比改名的结果卡、手动修正与大图对比', () => {
    expect(migrationPage).toContain('<ImageRenameMatchResultItem')
    expect(migrationPage).toContain('<ImageRenameImageCompareModal')
    expect(migrationPage).toContain('@associate="updateAssociation')
    expect(migrationPage).toContain('@compare="compareResultId = result.id"')
    expect(migrationPage).not.toContain('class="migration-table"')
  })

  it('人工分组缩略图固定在容器内完整显示', () => {
    expect(migrationPage).toContain('.migration-duplicate-card__thumb img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:contain; object-position:center; }')
    expect(migrationPage).toContain('.migration-all-image-card__thumb img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:contain; object-position:center; }')
  })
})
