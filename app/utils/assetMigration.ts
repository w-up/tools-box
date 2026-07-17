export type AssetMigrationAction = 'keep' | 'remove'

export interface ManualAssetMerge {
  sourceNames: string[]
  targetName: string
}

export interface AssetMigrationPlanItem {
  sourceName: string
  targetName: string
  action: AssetMigrationAction
}

// 根据手动合并规则生成图片保留和删除计划
export const createAssetMigrationPlan = (
  sourceNames: string[],
  merges: ManualAssetMerge[],
  removeDuplicates: boolean,
  renamedTargets = new Map<string, string>(),
): AssetMigrationPlanItem[] => {
  const targetBySource = new Map<string, string>()
  for (const merge of merges) {
    for (const sourceName of merge.sourceNames) targetBySource.set(sourceName, merge.targetName)
  }

  return sourceNames.map(sourceName => {
    const mergeTarget = targetBySource.get(sourceName)
    const targetName = mergeTarget
      ? renamedTargets.get(mergeTarget) ?? mergeTarget
      : renamedTargets.get(sourceName) ?? sourceName
    return {
      sourceName,
      targetName,
      action: removeDuplicates && mergeTarget ? 'remove' : 'keep',
    }
  })
}

// 按完整文件名替换代码文本中的资源引用，同时避免误改相似文件名
export const rewriteAssetReferences = (content: string, replacements: Map<string, string>) => {
  let result = content
  for (const [sourceName, targetName] of replacements) {
    if (sourceName === targetName) continue
    const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g'), targetName)
  }
  return result
}
