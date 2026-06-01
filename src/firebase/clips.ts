import type { Unsubscribe } from 'firebase/database'

/**
 * shape of a clip as it lives in realtime database. text clips carry
 * `payload` (base64 of `iv || aes-gcm ciphertext+tag` from
 * encryptForRoom). file clips replace `payload` with a `file` record
 * pointing at the firestore chunk path and carrying the (encrypted)
 * filename / mime, plain size + chunk count, and the manifest of
 * sha-256 hashes for integrity verification. `ts` is the firebase
 * server timestamp at write time.
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
  | { readonly ts: number; readonly payload: string }
  | { readonly ts: number; readonly file: FirebaseFileRef }

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * encrypt+envelope and push a clip into the room. `payload` is the
 * raw aes-gcm output from encryptForRoom (iv prepended to ciphertext);
 * this helper base64-wraps it and posts under a firebase auto-id with
 * a server-side timestamp so receivers sort consistently.
 *
 * the write is a multi-path update that also stamps the writer's
 * presence record — the security rule requires `now > lastWriteTs +
 * 2000` so two clip writes from the same uid within 2 s fail
 * atomically (the multi-path update is rejected as a whole, so the
 * clip never lands either). that pattern gives a ~30/min ceiling
 * without an out-of-band rate-limit table.
 *
 * anonymous auth must already be settled; subscribe and publish both
 * await `getFirebaseAuth()` so concurrent calls share the sign-in.
 */
export async function publishClipToRoom(
  roomPath: string,
  payload: Uint8Array,
): Promise<void> {
  const [{ getDatabase, ref, push, update, serverTimestamp }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  const auth = await getFirebaseAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('no anonymous uid; auth not ready')

  const db = getDatabase(getFirebaseApp())
  const clipKey = push(ref(db, `rooms/${roomPath}/clips`)).key
  if (!clipKey) throw new Error('push failed to generate a key')

  await update(ref(db), {
    [`rooms/${roomPath}/clips/${clipKey}`]: {
      ts: serverTimestamp(),
      payload: bytesToBase64(payload),
    },
    [`rooms/${roomPath}/presence/${uid}/lastWriteTs`]: serverTimestamp(),
  })

  schedulePrune(roomPath)
}

/**
 * publish a file-clip metadata record. the binary chunks have already
 * landed in firestore; this writes only the small rtdb record that
 * tells receivers where to find them and how to verify them. carries
 * the same presence-timestamp update as `publishClipToRoom` so the
 * rate-limit rule treats text and file writes uniformly.
 */
export async function publishFileClipToRoom(
  roomPath: string,
  file: FirebaseFileRef,
): Promise<void> {
  const [{ getDatabase, ref, push, update, serverTimestamp }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  const auth = await getFirebaseAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('no anonymous uid; auth not ready')

  const db = getDatabase(getFirebaseApp())
  const clipKey = push(ref(db, `rooms/${roomPath}/clips`)).key
  if (!clipKey) throw new Error('push failed to generate a key')

  await update(ref(db), {
    [`rooms/${roomPath}/clips/${clipKey}`]: {
      ts: serverTimestamp(),
      file,
    },
    [`rooms/${roomPath}/presence/${uid}/lastWriteTs`]: serverTimestamp(),
  })

  schedulePrune(roomPath)
}

/**
 * fire prune asynchronously after a publish. errors are intentionally
 * swallowed — a failing prune (e.g., a racing client got there first
 * and the second prune sees fewer than 10) must not block the user's
 * actual clip write from succeeding. lazy-import keeps the publish
 * path off the prune chunk on first write.
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
 * so the security rules don't bounce the connection.
 */
export async function subscribeToRoomClips(
  roomPath: string,
  onUpdate: (clips: ReadonlyMap<string, FirebaseClip>) => void,
): Promise<Unsubscribe> {
  const [{ getDatabase, ref, query, limitToLast, onValue }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  await getFirebaseAuth()

  const db = getDatabase(getFirebaseApp())
  const clipsRef = query(ref(db, `rooms/${roomPath}/clips`), limitToLast(10))
  return onValue(clipsRef, (snap) => {
    const result = new Map<string, FirebaseClip>()
    snap.forEach((child) => {
      const val = child.val() as { ts?: number; payload?: string; file?: FirebaseFileRef } | null
      const key = child.key
      if (!key || !val || typeof val.ts !== 'number') return false
      if (typeof val.payload === 'string') {
        result.set(key, { ts: val.ts, payload: val.payload })
      } else if (val.file && typeof val.file.id === 'string' && typeof val.file.chunkCount === 'number') {
        result.set(key, { ts: val.ts, file: val.file })
      }
      return false
    })
    onUpdate(result)
  })
}

/**
 * subscribe to the realtime database connection state via the built-in
 * `.info/connected` path. fires `true` once the websocket is live and
 * `false` whenever it drops — used to tell a mid-session network loss
 * apart from an empty room. anonymous auth is awaited first so the
 * subscription rides the same connection the clip listener uses.
 */
export async function subscribeToConnection(
  onChange: (connected: boolean) => void,
): Promise<Unsubscribe> {
  const [{ getDatabase, ref, onValue }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  await getFirebaseAuth()

  const db = getDatabase(getFirebaseApp())
  return onValue(ref(db, '.info/connected'), (snap) => {
    onChange(snap.val() === true)
  })
}
