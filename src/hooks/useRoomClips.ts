import { useEffect, useState } from 'preact/hooks'
import { subscribeToRoomClips, base64ToBytes, type FirebaseFileRef } from '@/firebase/clips'
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
        })
        if (cancelled) unsubscribe?.()
      } catch (err) {
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
