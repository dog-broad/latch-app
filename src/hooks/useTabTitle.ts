import { useCallback, useEffect, useRef } from 'preact/hooks'

/**
 * owns the tab title for the latched view. sets `latch · <room>` on
 * mount and restores `latch` on unmount. returns a `notifyNewClip`
 * trigger the page calls when a fresh clip arrives: if the tab is
 * backgrounded, the title alternates `latch · <room>` ↔ `(•) latch ·
 * <room>` every 1.5 s until the tab is refocused, then resets.
 *
 * the flicker is an attention signal, not decorative motion, so it
 * runs regardless of prefers-reduced-motion — it conveys "new content
 * arrived while you were away," which a static title can't.
 */
export function useTabTitle(roomName: string): () => void {
  const base = `latch · ${roomName}`
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    document.title = base

    function stop(): void {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      document.title = base
    }
    function onVisible(): void {
      if (document.visibilityState === 'visible') stop()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (timerRef.current !== null) clearInterval(timerRef.current)
      timerRef.current = null
      document.title = 'latch'
    }
  }, [base])

  return useCallback(() => {
    if (document.visibilityState === 'visible') return
    if (timerRef.current !== null) return // already flickering
    let on = false
    timerRef.current = window.setInterval(() => {
      on = !on
      document.title = on ? `(•) ${base}` : base
    }, 1500)
  }, [base])
}
