import type { FirebaseFileRef } from '@/firebase/clips'

/**
 * client-side prune-on-write. fires after a successful clip publish
 * to keep each room bounded at 10 items. this is the v1 trim mechanism
 * while cloud functions require blaze — the cloud-function code in
 * `functions/` does the same work server-side and is the right
 * long-term path; this fallback covers the spark-plan window.
 *
 * mechanism:
 *
 * 1. read the room's clip index ordered by ts (rtdb-side; `ts` is
 *    `.indexOn`-declared in `database.rules.json`).
 * 2. anything past the 10th item is removed in a single multi-path
 *    update so concurrent prunes don't half-finish.
 * 3. for each pruned file clip, the firestore chunk subcollection is
 *    cascade-deleted in parallel.
 *
 * a write race where two clients both publish their 11th and 12th
 * clips at the same time can briefly land 12 items in the room, but
 * the next prune call cleans it up. the cap is a soft ceiling on
 * spark, a hard ceiling once the cloud function is deployed.
 */
export async function pruneRoomToTenLatest(roomPath: string): Promise<void> {
  const [
    { getDatabase, ref, query, orderByChild, get, update },
    { getFirebaseApp },
    { getFirebaseAuth },
  ] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  await getFirebaseAuth()
  const db = getDatabase(getFirebaseApp())

  const clipsRef = query(ref(db, `rooms/${roomPath}/clips`), orderByChild('ts'))
  const snap = await get(clipsRef)
  if (!snap.exists()) return

  const ordered: { key: string; ts: number; file?: FirebaseFileRef }[] = []
  snap.forEach((child) => {
    const key = child.key
    const val = child.val() as { ts?: number; file?: FirebaseFileRef } | null
    if (key && val && typeof val.ts === 'number') {
      const entry: { key: string; ts: number; file?: FirebaseFileRef } = { key, ts: val.ts }
      if (val.file) entry.file = val.file
      ordered.push(entry)
    }
    return false
  })
  if (ordered.length <= 10) return

  ordered.sort((a, b) => a.ts - b.ts)
  const stale = ordered.slice(0, ordered.length - 10)

  const updates: Record<string, null> = {}
  for (const s of stale) {
    updates[`rooms/${roomPath}/clips/${s.key}`] = null
  }
  await update(ref(db), updates)

  const fileClips = stale.filter((s): s is typeof s & { file: FirebaseFileRef } => !!s.file)
  if (fileClips.length > 0) {
    await Promise.all(fileClips.map((s) => deleteFileChunks(s.file)))
  }
}

async function deleteFileChunks(file: FirebaseFileRef): Promise<void> {
  const [{ doc, deleteDoc }, { getFirestoreDb }] = await Promise.all([
    import('firebase/firestore'),
    import('./firestore'),
  ])
  const db = await getFirestoreDb()
  await Promise.all(
    Array.from({ length: file.chunkCount }, (_, i) =>
      deleteDoc(doc(db, `${file.chunkPathPrefix}/${i}`)),
    ),
  )
}
