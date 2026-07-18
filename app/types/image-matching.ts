export type SamplingRegionKey = 'TL' | 'TR' | 'BL' | 'BR' | 'C'

export interface ImageFingerprint {
  regions: Record<SamplingRegionKey, string>
  averageColor: [number, number, number]
  colorVariance: number
  alphaCoverage: number
  aspectRatio: number
}

export interface MatchableImage {
  id: string
  name: string
  relativePath: string
  fingerprint: ImageFingerprint
}

export interface ImportedFile {
  file: File
  relativePath: string
}

export interface ImageAsset extends MatchableImage {
  file: File
  width: number
  height: number
  size: number
  contentHash: string
  previewUrl: string
}

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none'

export interface MatchResult {
  id: string
  fileAId: string | null
  fileBId: string
  similarity: number
  confidence: MatchConfidence
}

export interface RenameCandidate {
  id: string
  directory: string
  desiredName: string
}
