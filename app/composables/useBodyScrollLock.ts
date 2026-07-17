const lockCount = ref(0)
let previousStyles: { overflow: string, paddingRight: string } | null = null

export const useBodyScrollLock = () => {
  const lock = () => {
    if (!import.meta.client) return
    lockCount.value += 1
    if (lockCount.value !== 1) return

    previousStyles = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    }
    const gutter = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`
  }

  const unlock = () => {
    if (!import.meta.client || lockCount.value === 0) return
    lockCount.value -= 1
    if (lockCount.value !== 0 || !previousStyles) return

    document.body.style.overflow = previousStyles.overflow
    document.body.style.paddingRight = previousStyles.paddingRight
    previousStyles = null
  }

  return { lock, unlock }
}
