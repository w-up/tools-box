export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastInput {
  message: string
  type?: ToastType
  duration?: number
}

export interface ToastRecord {
  id: string
  message: string
  type: ToastType
  duration: number
}

export const DEFAULT_TOAST_DURATION = 3200

export const createToastRecord = (input: ToastInput, id: string): ToastRecord => ({
  id,
  message: input.message,
  type: input.type ?? 'info',
  duration: input.duration ?? DEFAULT_TOAST_DURATION,
})
