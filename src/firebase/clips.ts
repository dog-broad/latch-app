import type { Unsubscribe } from 'firebase/database'

/**
 * shape of a clip as it lives in realtime database. `payload` is
 * base64 of `(12-byte iv || aes-gcm ciphertext+tag)` — what
 * `encryptForRoom` returns, packaged for json transport. `ts` is the
 * firebase server timestamp at write time, so clients sort the same
 * way regardless of their own clock skew.
 */
export type FirebaseClip = {
  readonly ts: number
  readonly payload: string
}

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
 * anonymous auth must already be settled; subscribe and publish both
 * await `getFirebaseAuth()` so concurrent calls share the sign-in.
 */
export async function publishClipToRoom(
  roomPath: string,
  payload: Uint8Array,
): Promise<void> {
  const [{ getDatabase, ref, push, serverTimestamp }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/database'),
    import('./init'),
    import('./auth'),
  ])

  await getFirebaseAuth()

  const db = getDatabase(getFirebaseApp())
  await push(ref(db, `rooms/${roomPath}/clips`), {
    ts: serverTimestamp(),
    payload: bytesToBase64(payload),
  })
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
      const val = child.val() as Partial<FirebaseClip> | null
      const key = child.key
      if (key && val && typeof val.payload === 'string' && typeof val.ts === 'number') {
        result.set(key, { ts: val.ts, payload: val.payload })
      }
      return false
    })
    onUpdate(result)
  })
}
