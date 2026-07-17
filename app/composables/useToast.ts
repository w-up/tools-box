import { createToastRecord, type ToastInput, type ToastRecord, type ToastType } from '~/utils/uiToast'

let toastSequence = 0

export const useToast = () => {
  const toasts = useState<ToastRecord[]>('ui-toasts', () => [])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const remove = (id: string) => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  const show = (input: ToastInput | string, type: ToastType = 'info') => {
    toastSequence += 1
    const record = createToastRecord(
      typeof input === 'string' ? { message: input, type } : input,
      `toast-${Date.now()}-${toastSequence}`,
    )
    toasts.value = [...toasts.value, record]
    if (record.duration > 0 && import.meta.client) {
      timers.set(record.id, setTimeout(() => remove(record.id), record.duration))
    }
    return record.id
  }

  const clear = () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    toasts.value = []
  }

  return { toasts, show, remove, clear }
}
