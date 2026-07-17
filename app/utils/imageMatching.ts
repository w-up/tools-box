import type {
  ImageFingerprint,
  MatchConfidence,
  MatchResult,
  MatchableImage,
  RenameCandidate,
} from '~/types/image-matching'

const REGION_KEYS = ['TL', 'TR', 'BL', 'BR', 'C'] as const
const MATCH_THRESHOLD = 72

// 计算两个等长二进制哈希的汉明距离
export const calculateHammingDistance = (left: string, right: string) => {
  if (left.length !== right.length) {
    throw new Error('哈希长度不一致')
  }

  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1
    }
  }
  return distance
}

// 将 RGB 色彩距离归一化到 0 到 1
const calculateColorSimilarity = (
  left: [number, number, number],
  right: [number, number, number],
) => {
  const distance = Math.sqrt(
    ((left[0] - right[0]) ** 2)
    + ((left[1] - right[1]) ** 2)
    + ((left[2] - right[2]) ** 2),
  )
  return Math.max(0, 1 - (distance / Math.sqrt(3 * 255 ** 2)))
}

// 综合局部结构、颜色、透明覆盖和纵横比得到相似度
export const calculateFingerprintSimilarity = (
  left: ImageFingerprint,
  right: ImageFingerprint,
) => {
  const totalBits = REGION_KEYS.length * 64
  const structureDistance = REGION_KEYS.reduce(
    (total, key) => total + calculateHammingDistance(left.regions[key], right.regions[key]),
    0,
  )
  const structureSimilarity = 1 - (structureDistance / totalBits)
  const colorSimilarity = calculateColorSimilarity(left.averageColor, right.averageColor)
  const alphaSimilarity = 1 - Math.min(1, Math.abs(left.alphaCoverage - right.alphaCoverage))
  const aspectRatio = Math.max(left.aspectRatio, right.aspectRatio)
    / Math.min(left.aspectRatio, right.aspectRatio)
  const aspectSimilarity = Math.max(0, 1 - ((aspectRatio - 1) / 0.35))

  const score = (
    structureSimilarity * 0.46
    + colorSimilarity * 0.38
    + alphaSimilarity * 0.06
    + aspectSimilarity * 0.1
  ) * 100

  return Math.max(0, Math.min(100, Math.round(score)))
}

const getConfidence = (similarity: number): MatchConfidence => {
  if (similarity >= 90) return 'high'
  if (similarity >= 80) return 'medium'
  if (similarity >= MATCH_THRESHOLD) return 'low'
  return 'none'
}

// 使用全局候选排序生成一对一图片匹配结果
export const matchFingerprints = (filesA: MatchableImage[], filesB: MatchableImage[]): MatchResult[] => {
  const candidates = filesB.flatMap(fileB => filesA.map(fileA => ({
    fileAId: fileA.id,
    fileBId: fileB.id,
    similarity: calculateFingerprintSimilarity(fileA.fingerprint, fileB.fingerprint),
  }))).sort((left, right) => right.similarity - left.similarity)

  const usedA = new Set<string>()
  const usedB = new Set<string>()
  const selected = new Map<string, MatchResult>()

  for (const candidate of candidates) {
    if (
      candidate.similarity < MATCH_THRESHOLD
      || usedA.has(candidate.fileAId)
      || usedB.has(candidate.fileBId)
    ) {
      continue
    }

    usedA.add(candidate.fileAId)
    usedB.add(candidate.fileBId)
    selected.set(candidate.fileBId, {
      id: `match-${candidate.fileBId}`,
      fileAId: candidate.fileAId,
      fileBId: candidate.fileBId,
      similarity: candidate.similarity,
      confidence: getConfidence(candidate.similarity),
    })
  }

  return filesB.map(fileB => selected.get(fileB.id) ?? {
    id: `match-${fileB.id}`,
    fileAId: null,
    fileBId: fileB.id,
    similarity: 0,
    confidence: 'none',
  })
}

const splitFileName = (name: string) => {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) {
    return { stem: name, extension: '' }
  }
  return { stem: name.slice(0, dotIndex), extension: name.slice(dotIndex) }
}

// 沿用参考图主文件名并保留待改名图片扩展名
export const createTargetName = (sourceName: string, targetName: string) => {
  const source = splitFileName(sourceName)
  const target = splitFileName(targetName)
  return `${source.stem}${target.extension}`
}

// 为同目录冲突名称追加稳定编号
export const resolveTargetNames = (candidates: RenameCandidate[]) => {
  const usedByDirectory = new Map<string, Set<string>>()
  const resolved = new Map<string, string>()

  for (const candidate of candidates) {
    const used = usedByDirectory.get(candidate.directory) ?? new Set<string>()
    usedByDirectory.set(candidate.directory, used)

    const { stem, extension } = splitFileName(candidate.desiredName)
    let index = 1
    let targetName = candidate.desiredName
    while (used.has(targetName.toLocaleLowerCase())) {
      index += 1
      targetName = `${stem}-${index}${extension}`
    }

    used.add(targetName.toLocaleLowerCase())
    resolved.set(candidate.id, targetName)
  }

  return resolved
}

// 生成安全的 POSIX shell 单引号参数
export const quoteShellArgument = (value: string) => {
  if (/\r|\n|\0/.test(value)) {
    throw new Error('路径不能包含换行或空字符')
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

// 生成安全的 Windows BAT 双引号参数
export const quoteBatArgument = (value: string) => {
  if (/\r|\n|\0/.test(value)) {
    throw new Error('路径不能包含换行或空字符')
  }

  const escaped = value
    .replaceAll('^', '^^')
    .replaceAll('%', '%%')
    .replaceAll('!', '^^!')
    .replaceAll('&', '^&')
    .replaceAll('|', '^|')
    .replaceAll('<', '^<')
    .replaceAll('>', '^>')
    .replaceAll('"', '^"')
  return `"${escaped}"`
}

export interface RenameOperation {
  sourcePath: string
  targetPath: string
}

// 生成安全的 POSIX shell 重命名脚本
export const createShellRenameScript = (operations: RenameOperation[]) => [
  '#!/bin/sh',
  'set -eu',
  'echo "开始执行图片重命名"',
  ...operations.map(operation => (
    `mv -- ${quoteShellArgument(operation.sourcePath)} ${quoteShellArgument(operation.targetPath)}`
  )),
  'echo "图片重命名完成"',
  '',
].join('\n')

// 生成安全的 Windows BAT 重命名脚本
export const createBatRenameScript = (operations: RenameOperation[]) => [
  '@echo off',
  'setlocal DisableDelayedExpansion',
  'chcp 65001 > nul',
  'echo 开始执行图片重命名',
  ...operations.map(operation => (
    `ren ${quoteBatArgument(operation.sourcePath.replaceAll('/', '\\'))} ${quoteBatArgument(operation.targetPath.split('/').at(-1) ?? operation.targetPath)}`
  )),
  'echo 图片重命名完成',
  '',
].join('\n')

export const getDirectory = (relativePath: string) => {
  const slashIndex = relativePath.lastIndexOf('/')
  return slashIndex >= 0 ? relativePath.slice(0, slashIndex + 1) : ''
}
