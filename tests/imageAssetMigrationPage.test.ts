import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPage = readFileSync(resolve(process.cwd(), 'app/pages/tools/image-asset-migration.vue'), 'utf8')

describe('图片资源迁移页面流程', () => {
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
})
