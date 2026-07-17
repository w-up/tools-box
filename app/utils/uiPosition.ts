export type TipsPlacement = 'auto' | 'top' | 'top-left' | 'top-right' | 'bottom' | 'bottom-left' | 'bottom-right' | 'left' | 'right'
export type ResolvedTipsPlacement = Exclude<TipsPlacement, 'auto'>

interface RectLike {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

interface PlacementInput {
  requested: TipsPlacement
  trigger: RectLike
  panel: Size
  viewport: Size
  offset: number
}

export const resolveTipsPlacement = ({ requested, trigger, panel, viewport, offset }: PlacementInput): ResolvedTipsPlacement => {
  if (requested !== 'auto') return requested
  const spaces = {
    top: trigger.top - offset,
    bottom: viewport.height - trigger.bottom - offset,
    left: trigger.left - offset,
    right: viewport.width - trigger.right - offset,
  }
  if (spaces.top >= panel.height) return 'top'
  if (spaces.bottom >= panel.height) return 'bottom'
  if (spaces.right >= panel.width) return 'right'
  if (spaces.left >= panel.width) return 'left'
  return Object.entries(spaces).sort((left, right) => right[1] - left[1])[0]?.[0] as ResolvedTipsPlacement
}

export const clampToViewport = (
  left: number,
  top: number,
  panelWidth: number,
  viewportWidth: number,
  safeMargin: number,
  panelHeight = panelWidth,
  viewportHeight = viewportWidth,
) => ({
  left: Math.min(Math.max(left, safeMargin), viewportWidth - panelWidth - safeMargin),
  top: Math.min(Math.max(top, safeMargin), viewportHeight - panelHeight - safeMargin),
})
