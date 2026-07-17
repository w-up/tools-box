export const useLocalStorage = {
  // 将值序列化后写入浏览器本地存储，SSR 环境直接跳过
  set<T>(key: string, value: T) {
    if (!import.meta.client) return
    localStorage.setItem(key, JSON.stringify(value))
  },

  // 读取并反序列化浏览器本地存储，损坏数据会自动清除
  get<T>(key: string): T | null {
    if (!import.meta.client) return null
    const value = localStorage.getItem(key)
    if (value === null) return null
    try {
      return JSON.parse(value) as T
    } catch {
      localStorage.removeItem(key)
      return null
    }
  },

  // 删除指定的浏览器本地存储项
  remove(key: string) {
    if (import.meta.client) localStorage.removeItem(key)
  },
}
