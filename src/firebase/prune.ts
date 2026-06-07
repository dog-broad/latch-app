import type { FirebaseFileRef } from '@/firebase/clips'

/**
 * client-side prune-on-write. fires after a successful clip publish to
 * keep each room bounded at 10 items. this is the v1 trim mechanism
 * while cloud functions require blaze — the cloud-function code in
 * `functions/` does the same work server-side and is the right
 * long-term path; this fallback covers the spark-plan window.
 *
 * mechanism:
 *
 * 1. read the room's clips ordered by `ts` descending (single-field
 *    auto-index; no composite index needed).
 * 2. anything past the 10th item is removed in one batched delete so
 *    concurrent prunes don't half-finish.
 * 3. for each pruned file clip, the firestore chunk subcollection is
 *    cascade-deleted in parallel.
 *
 * a write race where two clients both publish their 11th and 12th clips
 * at the same time can briefly land 12 items in the room, but the next
 * prune call cleans it up. the cap is a soft ceiling on spark, a hard
 * ceiling once the cloud function is deployed.
 */
export async function pruneRoomToTenLatest(roomPath: string): Promise<void> {
  const [{ collection, query, orderBy, getDocs, doc, writeBatch }, { getFirestoreDb }] =
    await Promise.all([import('firebase/firestore'), import('./firestore')])

  const db = await getFirestoreDb()
  const clipsRef = query(collection(db, `rooms/${roomPath}/clips`), orderBy('ts', 'desc'))
  const snap = await getDocs(clipsRef)
  if (snap.size <= 10) return

  const stale = snap.docs.slice(10)
  const batch = writeBatch(db)
  for (const docSnap of stale) batch.delete(doc(db, `rooms/${roomPath}/clips/${docSnap.id}`))
  await batch.commit()

  const fileRefs: FirebaseFileRef[] = []
  for (const docSnap of stale) {
    const file = (docSnap.data() as { file?: FirebaseFileRef }).file
    if (file) fileRefs.push(file)
  }
  if (fileRefs.length > 0) {
    await Promise.all(fileRefs.map((file) => deleteFileChunks(file)))
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
