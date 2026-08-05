import { useSyncExternalStore } from 'react'

/**
 * GUIモード(設定でボタン/タブを出す)。表示の好みなので data.json ではなく localStorage に置く
 * (tool:pinned と同じ扱い)。data.json に入れるとバックアップの検証まで巻き込むため。
 */
const KEY = 'tool:gui'

let on = localStorage.getItem(KEY) === '1'
const listeners = new Set<() => void>()

// CSS側(index.css の scroll-margin 上書き)から見るため、mode.tsx の dataset.mode と同じ手口で書く
document.documentElement.dataset.gui = on ? 'on' : 'off'

export function setGuiMode(next: boolean): void {
  if (on === next) return
  on = next
  localStorage.setItem(KEY, next ? '1' : '0')
  document.documentElement.dataset.gui = next ? 'on' : 'off'
  for (const listener of listeners) listener()
}

export function isGuiMode(): boolean {
  return on
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function useGuiMode(): boolean {
  return useSyncExternalStore(subscribe, () => on)
}
