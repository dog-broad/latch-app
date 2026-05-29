import { encryptForRoom } from '@/crypto/client'
import { publishClipToRoom } from '@/firebase/clips'

/**
 * poll the OS clipboard while the tab is visible. when a fresh text
 * value shows up — not equal to what we last polled, not in the
 * caller's "self-seen" filter (which avoids the auto-watch /
 * auto-copy ping-pong) — encrypt it and publish to the room.
 *
 * browsers don't fire events on clipboard changes, so polling is the
 * floor. 1.5 s is fast enough to feel live, slow enough not to thrash
 * the read permission gate on chromium.
 *
 * the focus / permission errors are swallowed silently per the trust
 * contract — we don't pop dialogs the user didn't ask for.
 */

const POLL_MS = 1500

export function startClipboardWatch(
  roomPath: string,
  keyId: number,
  isRecentlySeen: (text: string) => boolean,
): () => void {
  let lastSeen: string | null = null
  let cancelled = false
  let inFlight = false

  async function tick(): Promise<void> {
    if (cancelled || inFlight) return
    if (document.visibilityState !== 'visible') return
    inFlight = true
    try {
      const text = await navigator.clipboard.readText()
      const trimmed = text.trim()
      if (!trimmed || trimmed === lastSeen) return
      lastSeen = trimmed
      if (isRecentlySeen(trimmed)) return
      const plaintext = new TextEncoder().encode(text)
      const payload = await encryptForRoom(keyId, plaintext)
      await publishClipToRoom(roomPath, payload)
    } catch {
      // permission denied, tab unfocused, network died — retry next tick.
    } finally {
      inFlight = false
    }
  }

  const interval = window.setInterval(() => void tick(), POLL_MS)
  return () => {
    cancelled = true
    window.clearInterval(interval)
  }
}
