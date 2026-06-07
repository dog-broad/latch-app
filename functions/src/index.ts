import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'

initializeApp()

type FileRef = {
  id: string
  chunkCount: number
  chunkPathPrefix: string
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
 * runs idempotently — re-invocation against an already-trimmed room is
 * a no-op. concurrent writes that briefly push the room past the cap
 * converge on the next trigger.
 */
export const trimRoomClips = onDocumentCreated(
  {
    document: 'rooms/{roomHash}/clips/{clipId}',
    region: 'us-central1',
  },
  async (event) => {
    const { roomHash } = event.params
    if (!/^[0-9a-f]{16}$/.test(roomHash)) {
      logger.warn('malformed room hash; skipping', { roomHash })
      return
    }

    const db = getFirestore()
    const clipsRef = db.collection(`rooms/${roomHash}/clips`)
    const snap = await clipsRef.orderBy('ts', 'desc').get()
    if (snap.size <= MAX_CLIPS_PER_ROOM) return

    const stale = snap.docs.slice(MAX_CLIPS_PER_ROOM)

    const batch = db.batch()
    for (const doc of stale) batch.delete(doc.ref)
    await batch.commit()

    const fileRefs = stale
      .map((doc) => (doc.data() as { file?: FileRef }).file)
      .filter((file): file is FileRef => !!file)
    if (fileRefs.length === 0) return

    await Promise.all(
      fileRefs.flatMap((file) =>
        Array.from({ length: file.chunkCount }, (_, i) =>
          db.doc(`${file.chunkPathPrefix}/${i}`).delete(),
        ),
      ),
    )

    logger.info('trimmed room', {
      roomHash,
      pruned: stale.length,
      fileClipsCascaded: fileRefs.length,
    })
  },
)
