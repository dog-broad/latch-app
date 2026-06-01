import { useEffect, useState } from 'preact/hooks'
import {
  subscribeToRoomClips,
  subscribeToConnection,
  base64ToBytes,
  type FirebaseFileRef,
} from '@/firebase/clips'
import { decryptForRoom } from '@/crypto/client'
import { detectClipKind, type ClipKind } from '@/clip/detect'
import { decryptFileMetadata, type FileMetadata } from '@/clip/file-pipeline'

/**
 * a clip after the worker has decrypted the small metadata. text clips
 * carry the plaintext + the auto-detected kind. file clips carry the
 * decrypted filename and mime plus the metadata needed to fetch and
 * verify the firestore chunks on demand. silently dropped if decrypt
 * fails — trust contract says we don't surface which clip failed.
 */
export type TextClip = {
  readonly type: 'text'
  readonly id: string
  readonly ts: number
  readonly text: string
  readonly kind: ClipKind
}

export type FileClip = {
  readonly type: 'file'
  readonly id: string
  readonly ts: number
  readonly name: string
  readonly mime: string
  readonly size: number
  readonly meta: FileMetadata
}

export type Clip = TextClip | FileClip

/**
 * connection lifecycle for the room.
 *
 * - `connecting`: mounted, first clip callback not yet received.
 * - `ready`: at least one clip callback has fired (even with zero clips).
 * - `reconnecting`: the realtime-db socket dropped after we'd reached
 *   `ready` — distinguishes a dead network mid-session from an empty
 *   room. `.info/connected` reports false transiently during the
 *   initial connect, so the flip to `reconnecting` is gated on having
 *   reached `ready` once.
 */
export type RoomStatus = 'connecting' | 'ready' | 'reconnecting'

export type RoomClipsState = {
  readonly status: RoomStatus
  readonly clips: readonly Clip[]
  /**
   * raw clips arrived but none decrypted — a room-level wrong-passphrase
   * signal. aggregate-only by design: the trust contract says we never
   * surface *which* clip failed, but "every clip in a non-empty room
   * failed" is a safe room-level inference that leaks nothing per-clip.
   */
  readonly undecryptable: boolean
}

export function useRoomClips(keyId: number, roomPath: string): RoomClipsState {
  const [clips, setClips] = useState<readonly Clip[]>([])
  const [ready, setReady] = useState(false)
  const [connected, setConnected] = useState(true)
  const [undecryptable, setUndecryptable] = useState(false)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    let unsubscribeConn: (() => void) | null = null
    const decoder = new TextDecoder()

    // reset per-room: a room swap re-enters `connecting` cleanly.
    setClips([])
    setReady(false)
    setConnected(true)
    setUndecryptable(false)

    void (async () => {
      try {
        unsubscribe = await subscribeToRoomClips(roomPath, async (raw) => {
          const decrypted: Clip[] = []
          for (const [id, c] of raw) {
            try {
              if ('payload' in c) {
                const plaintext = await decryptForRoom(keyId, base64ToBytes(c.payload))
                const text = decoder.decode(plaintext)
                decrypted.push({
                  type: 'text',
                  id,
                  ts: c.ts,
                  text,
                  kind: detectClipKind(text),
                })
              } else {
                const meta = firebaseRefToMeta(c.file)
                const { name, mime } = await decryptFileMetadata(meta, keyId)
                decrypted.push({
                  type: 'file',
                  id,
                  ts: c.ts,
                  name,
                  mime,
                  size: meta.size,
                  meta,
                })
              }
            } catch {
              // wrong key, tampered metadata, or malformed envelope — drop silently
            }
          }
          if (cancelled) return
          decrypted.sort((a, b) => b.ts - a.ts)
          setClips(decrypted)
          setUndecryptable(raw.size > 0 && decrypted.length === 0)
          setReady(true)
        })
        if (cancelled) {
          unsubscribe?.()
          return
        }
        unsubscribeConn = await subscribeToConnection((isConnected) => {
          if (!cancelled) setConnected(isConnected)
        })
        if (cancelled) unsubscribeConn?.()
      } catch (err) {
        console.error('failed to subscribe to room clips:', err)
      }
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
      unsubscribeConn?.()
    }
  }, [keyId, roomPath])

  const status: RoomStatus = !ready ? 'connecting' : connected ? 'ready' : 'reconnecting'
  return { status, clips, undecryptable }
}

function firebaseRefToMeta(file: FirebaseFileRef): FileMetadata {
  return {
    fileId: file.id,
    encryptedName: file.encryptedName,
    encryptedMime: file.encryptedMime,
    size: file.size,
    chunkCount: file.chunkCount,
    chunkPathPrefix: file.chunkPathPrefix,
    manifest: file.manifest,
  }
}
