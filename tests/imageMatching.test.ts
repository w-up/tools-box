import { describe, expect, it } from 'vitest'

import {
  calculateFingerprintSimilarity,
  createTargetName,
  matchFingerprints,
  quoteBatArgument,
  quoteShellArgument,
  resolveTargetNames,
  createBatRenameScript,
  createShellRenameScript,
} from '../app/utils/imageMatching'
import type { ImageFingerprint, MatchableImage } from '../app/types/image-matching'

const hash = (value: '0' | '1') => value.repeat(64)

const createFingerprint = (
  structure: '0' | '1',
  color: [number, number, number],
): ImageFingerprint => ({
  regions: {
    TL: hash(structure),
    TR: hash(structure),
    BL: hash(structure),
    BR: hash(structure),
    C: hash(structure),
  },
  averageColor: color,
  colorVariance: 0,
  alphaCoverage: 1,
  aspectRatio: 1,
})

const image = (id: string, name: string, fingerprint: ImageFingerprint): MatchableImage => ({
  id,
  name,
  relativePath: name,
  fingerprint,
})

describe('calculateFingerprintSimilarity', () => {
  it('相同指纹返回 100 分', () => {
    const fingerprint = createFingerprint('1', [220, 30, 30])
    expect(calculateFingerprintSimilarity(fingerprint, fingerprint)).toBe(100)
  })

  it('纯红和纯蓝结构相同也不能判为高相似', () => {
    const red = createFingerprint('1', [255, 0, 0])
    const blue = createFingerprint('1', [0, 0, 255])
    expect(calculateFingerprintSimilarity(red, blue)).toBeLessThan(70)
  })
})

describe('matchFingerprints', () => {
  it('对两组图片执行一对一匹配并保留未匹配项', () => {
    const red = createFingerprint('1', [240, 20, 20])
    const blue = createFingerprint('0', [20, 20, 240])
    const green = createFingerprint('1', [20, 240, 20])

    const results = matchFingerprints(
      [image('a-red', 'red.png', red), image('a-blue', 'blue.png', blue)],
      [
        image('b-blue', 'IMG_2.png', blue),
        image('b-red', 'IMG_1.png', red),
        image('b-green', 'IMG_3.png', green),
      ],
    )

    expect(results).toEqual([
      expect.objectContaining({ fileBId: 'b-blue', fileAId: 'a-blue', similarity: 100 }),
      expect.objectContaining({ fileBId: 'b-red', fileAId: 'a-red', similarity: 100 }),
      expect.objectContaining({ fileBId: 'b-green', fileAId: null }),
    ])
  })
})

describe('命名与导出安全', () => {
  it('沿用参考图主文件名并保留 B 图扩展名', () => {
    expect(createTargetName('hero.final.webp', 'IMG_1001.png')).toBe('hero.final.png')
  })

  it('自动处理同目录下的目标名称冲突', () => {
    const resolved = resolveTargetNames([
      { id: '1', directory: 'nested/', desiredName: 'hero.png' },
      { id: '2', directory: 'nested/', desiredName: 'hero.png' },
      { id: '3', directory: '', desiredName: 'hero.png' },
    ])

    expect(resolved).toEqual(new Map([
      ['1', 'hero.png'],
      ['2', 'hero-2.png'],
      ['3', 'hero.png'],
    ]))
  })

  it('正确转义 POSIX shell 参数', () => {
    expect(quoteShellArgument(`a'b $HOME.png`)).toBe(`'a'"'"'b $HOME.png'`)
  })

  it('拒绝 BAT 参数中的换行并转义危险字符', () => {
    expect(() => quoteBatArgument('bad\nname.png')).toThrow('换行')
    expect(quoteBatArgument('100% & done.png')).toBe('"100%% ^& done.png"')
  })

  it('脚本对所有重命名参数执行平台级转义', () => {
    const operations = [{ sourcePath: `folder/a'b $HOME.png`, targetPath: 'folder/100% & done.png' }]
    expect(createShellRenameScript(operations)).toContain(
      `mv -- 'folder/a'"'"'b $HOME.png' 'folder/100% & done.png'`,
    )
    expect(createBatRenameScript(operations)).toContain(
      `ren "folder\\a'b $HOME.png" "100%% ^& done.png"`,
    )
  })
})
