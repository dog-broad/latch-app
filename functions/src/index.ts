import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getFirestore } from 'firebase-admin/firestore'
import { onValueCreated } from 'firebase-functions/v2/database'
import { logger } from 'firebase-functions/v2'

initializeApp()

type FileRef = {
  id: string
  chunkCount: number
  chunkPathPrefix: string
}

type Clip = {
  ts: number
  payload?: string
  file?: FileRef
}

const MAX_CLIPS_PER_ROOM = 10

/**
 * trims each room down to its 10 most-recent clips and cascade-deletes
 * the firestore chunk subcollection for any file clip that gets pruned.
 *
 * triggers on every new clip create under `rooms/{roomHash}/clips/{clipId}`.
 * if the room is already at or below the cap, exits without touching
 * anything.
 *
 * runs idempotently — re-invocation against an already-trimmed room
 * is a no-op. concurrent writes that briefly push the room past the
 * cap converge on the next trigger.
 */
export const trimRoomClips = onValueCreated(
  {
    ref: '/rooms/{roomHash}/clips/{clipId}',
    region: 'us-central1',
  },
  async (event) => {
    const { roomHash } = event.params
    if (!/^[0-9a-f]{16}$/.test(roomHash)) {
      logger.warn('malformed room hash; skipping', { roomHash })
      return
    }

    const db = getDatabase()
    const clipsRef = db.ref(`rooms/${roomHash}/clips`)
    const snap = await clipsRef.orderByChild('ts').get()
    if (!snap.exists()) return

    const ordered: { key: string; clip: Clip }[] = []
    snap.forEach((child) => {
      const key = child.key
      const val = child.val() as Clip | null
      if (key && val && typeof val.ts === 'number') {
        ordered.push({ key, clip: val })
      }
      return false
    })

    if (ordered.length <= MAX_CLIPS_PER_ROOM) return

    ordered.sort((a, b) => a.clip.ts - b.clip.ts)
    const stale = ordered.slice(0, ordered.length - MAX_CLIPS_PER_ROOM)

    const updates: Record<string, null> = {}
    for (const s of stale) updates[s.key] = null
    await clipsRef.update(updates)

    const fileClips = stale.filter((s) => s.clip.file)
    if (fileClips.length === 0) return

    const fs = getFirestore()
    await Promise.all(
      fileClips.flatMap((s) => {
        const file = s.clip.file
        if (!file) return []
        return Array.from({ length: file.chunkCount }, (_, i) =>
          fs.doc(`${file.chunkPathPrefix}/${i}`).delete(),
        )
      }),
    )

    logger.info('trimmed room', {
      roomHash,
      pruned: stale.length,
      fileClipsCascaded: fileClips.length,
    })
  },
)
