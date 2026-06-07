import type { Unsubscribe } from 'firebase/firestore'

/**
 * shape of a clip as it lives in firestore at `rooms/<hash>/clips/<id>`.
 * text clips carry `payload` (the raw `iv || aes-gcm ciphertext+tag`
 * from encryptForRoom, stored as a firestore `Bytes` value). file clips
 * replace `payload` with a `file` record pointing at the firestore chunk
 * path and carrying the (encrypted) filename / mime, plain size + chunk
 * count, and the manifest of sha-256 hashes for integrity verification.
 * `ts` is the firestore server timestamp at write time, surfaced to
 * callers as epoch millis.
 */
export type FirebaseFileRef = {
  readonly id: string
  readonly encryptedName: string
  readonly encryptedMime: string
  readonly size: number
  readonly chunkCount: number
  readonly chunkPathPrefix: string
  readonly manifest: readonly string[]
}

export type FirebaseClip =
  | { readonly ts: number; readonly payload: Uint8Array }
  | { readonly ts: number; readonly file: FirebaseFileRef }

/**
 * the realtime subscription surfaces the room's clips alongside
 * firestore's snapshot metadata, which stands in for connection state:
 * - `fromCache`: served from the local cache (offline, or pre-first-sync)
 *   rather than server-confirmed.
 * - `hasPendingWrites`: this snapshot is the optimistic local echo of
 *   our own un-acked write. it makes `fromCache` briefly true even while
 *   online, so the hook must not read that transient as a disconnect.
 * the hook turns these into the connecting/ready/reconnecting status.
 */
export type RoomSnapshot = {
  readonly clips: ReadonlyMap<string, FirebaseClip>
  readonly fromCache: boolean
  readonly hasPendingWrites: boolean
}

/**
 * encrypt+envelope and push a clip into the room. `payload` is the raw
 * aes-gcm output from encryptForRoom (iv prepended to ciphertext); this
 * helper stores it as a firestore `Bytes` value under an auto-id doc
 * with a server timestamp so receivers sort consistently.
 *
 * the write is a batch that also stamps the writer's presence record.
 * the security rule requires the batch bump `presence/<uid>/lastWriteTs`
 * to `request.time` AND that the prior stamp is older than 2 s, so two
 * clip writes from the same uid within 2 s fail atomically (the batch
 * is rejected as a whole, so the clip never lands either). that gives a
 * ~30/min ceiling without an out-of-band rate-limit table.
 *
 * anonymous auth must already be settled; subscribe and publish both
 * await `getFirebaseAuth()` via `getFirestoreDb()` so concurrent calls
 * share the sign-in.
 */
export async function publishClipToRoom(
  roomPath: string,
  payload: Uint8Array,
): Promise<void> {
  const [{ collection, doc, writeBatch, serverTimestamp, Bytes }, { getFirestoreDb }, { getFirebaseAuth }] =
    await Promise.all([import('firebase/firestore'), import('./firestore'), import('./auth')])

  const auth = await getFirebaseAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('no anonymous uid; auth not ready')

  const db = await getFirestoreDb()
  const clipRef = doc(collection(db, `rooms/${roomPath}/clips`))
  const batch = writeBatch(db)
  batch.set(clipRef, { ts: serverTimestamp(), payload: Bytes.fromUint8Array(payload) })
  batch.set(doc(db, `rooms/${roomPath}/presence/${uid}`), { lastWriteTs: serverTimestamp() })
  await batch.commit()

  schedulePrune(roomPath)
}

/**
 * publish a file-clip metadata record. the binary chunks have already
 * landed in firestore; this writes only the small clip doc that tells
 * receivers where to find them and how to verify them. carries the same
 * batched presence stamp as `publishClipToRoom` so the rate-limit rule
 * treats text and file writes uniformly.
 */
export async function publishFileClipToRoom(
  roomPath: string,
  file: FirebaseFileRef,
): Promise<void> {
  const [{ collection, doc, writeBatch, serverTimestamp }, { getFirestoreDb }, { getFirebaseAuth }] =
    await Promise.all([import('firebase/firestore'), import('./firestore'), import('./auth')])

  const auth = await getFirebaseAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('no anonymous uid; auth not ready')

  const db = await getFirestoreDb()
  const clipRef = doc(collection(db, `rooms/${roomPath}/clips`))
  const batch = writeBatch(db)
  batch.set(clipRef, { ts: serverTimestamp(), file })
  batch.set(doc(db, `rooms/${roomPath}/presence/${uid}`), { lastWriteTs: serverTimestamp() })
  await batch.commit()

  schedulePrune(roomPath)
}

/**
 * fire prune asynchronously after a publish. errors are intentionally
 * swallowed — a failing prune (e.g., a racing client got there first
 * and the second prune sees fewer than 10) must not block the user's
 * actual clip write from succeeding.
 */
function schedulePrune(roomPath: string): void {
  void import('./prune').then(({ pruneRoomToTenLatest }) =>
    pruneRoomToTenLatest(roomPath).catch(() => {}),
  )
}

/**
 * subscribe to the last 10 clips for `roomPath`. the returned
 * unsubscribe handle detaches the listener; it doesn't sign out of
 * firebase or touch any other room. anonymous auth is awaited first
 * (inside `getFirestoreDb`) so the security rules don't bounce the
 * read. `includeMetadataChanges` so the hook sees the cache→server
 * transition that stands in for connection state.
 */
export async function subscribeToRoomClips(
  roomPath: string,
  onUpdate: (snapshot: RoomSnapshot) => void,
): Promise<Unsubscribe> {
  const [{ collection, query, orderBy, limit, onSnapshot }, { getFirestoreDb }] = await Promise.all([
    import('firebase/firestore'),
    import('./firestore'),
  ])

  const db = await getFirestoreDb()
  const clipsQuery = query(collection(db, `rooms/${roomPath}/clips`), orderBy('ts', 'desc'), limit(10))
  return onSnapshot(clipsQuery, { includeMetadataChanges: true }, (snap) => {
    const clips = new Map<string, FirebaseClip>()
    for (const docSnap of snap.docs) {
      const val = docSnap.data() as {
        ts?: { toMillis(): number }
        payload?: { toUint8Array(): Uint8Array }
        file?: FirebaseFileRef
      }
      // a freshly-added doc has a null server timestamp locally until the
      // write is server-confirmed — skip it until `ts` resolves so order
      // and `formatTime` stay sane.
      if (!val.ts) continue
      const ts = val.ts.toMillis()
      if (val.payload) {
        clips.set(docSnap.id, { ts, payload: val.payload.toUint8Array() })
      } else if (val.file && typeof val.file.id === 'string' && typeof val.file.chunkCount === 'number') {
        clips.set(docSnap.id, { ts, file: val.file })
      }
    }
    onUpdate({
      clips,
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    })
  })
}
