import type { Firestore } from 'firebase/firestore'

let db: Firestore | null = null
let promise: Promise<Firestore> | null = null

/**
 * lazy firestore handle. the firestore sdk + grpc lite chunks are
 * tier-3 in the bundle hierarchy — they don't ship until a file
 * send-or-receive actually needs them. text-only users never trigger
 * this fetch.
 */
export async function getFirestoreDb(): Promise<Firestore> {
  if (db) return db
  if (!promise) {
    promise = (async () => {
      const [{ getFirestore }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
        import('firebase/firestore'),
        import('./init'),
        import('./auth'),
      ])
      await getFirebaseAuth()
      db = getFirestore(getFirebaseApp())
      return db
    })()
  }
  return promise
}
