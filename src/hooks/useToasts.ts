import { useEffect, useState } from 'preact/hooks'
import { subscribe, getToasts, type Toast } from '@/state/toasts'

/**
 * live view of the toast queue. `subscribe` fires the listener once
 * with the current list on registration, so initial render is in sync
 * without a separate read.
 */
export function useToasts(): readonly Toast[] {
  const [toasts, setToasts] = useState<readonly Toast[]>(getToasts())
  useEffect(() => subscribe(setToasts), [])
  return toasts
}
