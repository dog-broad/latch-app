import { useEffect, useState } from 'preact/hooks'
import { subscribeToRoomClips, base64ToBytes } from '@/firebase/clips'
import { decryptForRoom } from '@/crypto/client'
import { detectClipKind, type ClipKind } from '@/clip/detect'

/**
 * a clip after the worker has decrypted it. `text` is the utf-8
 * plaintext; `kind` is the auto-detected shape (url, json, code,
 * text) the renderer uses to pick the right layout. binary
 * payloads (files) get their own shape in a later commit.
 */
export type Clip = {
  readonly id: string
  readonly ts: number
  readonly text: string
  readonly kind: ClipKind
}

/**
 * subscribe to the room's clips, decrypt each via the worker, and
 * surface the sorted list (newest first) to the caller. cleanup
 * detaches the listener and prevents late-arriving decrypts from
 * touching state after unmount.
 *
 * clips that fail to decrypt (wrong key in a colliding room, tamper,
 * malformed envelope) are silently dropped — the trust contract says
 * we don't surface which clip failed or why.
 */
export function useRoomClips(keyId: number, roomPath: string): readonly Clip[] {
  const [clips, setClips] = useState<readonly Clip[]>([])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    const decoder = new TextDecoder()

    void (async () => {
      try {
        unsubscribe = await subscribeToRoomClips(roomPath, async (raw) => {
          const decrypted: Clip[] = []
          for (const [id, c] of raw) {
            try {
              const bytes = base64ToBytes(c.payload)
              const plaintext = await decryptForRoom(keyId, bytes)
              const text = decoder.decode(plaintext)
              decrypted.push({ id, ts: c.ts, text, kind: detectClipKind(text) })
            } catch {
              // wrong key, tampered payload, or unknown handle — drop silently.
            }
          }
          if (cancelled) return
          decrypted.sort((a, b) => b.ts - a.ts)
          setClips(decrypted)
        })
        if (cancelled) unsubscribe?.()
      } catch (err) {
        // surfacing subscribe failures (auth, network) on the console is
        // enough for now; a proper toast lives with the polish-phase rules.
        console.error('failed to subscribe to room clips:', err)
      }
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [keyId, roomPath])

  return clips
}
