import type { Firestore } from 'firebase/firestore'

let db: Firestore | null = null
let promise: Promise<Firestore> | null = null

/**
 * lazy firestore handle. firestore now carries the realtime clip
 * channel as well as file chunks, so this loads at room-join (the first
 * subscribe/publish), not just on a file op.
 *
 * `experimentalAutoDetectLongPolling` is the reason latch reaches
 * websocket-hostile corporate networks: where a proxy blocks streaming,
 * firestore falls back to XHR long-polling over `firestore.googleapis.com`
 * — covered by the CSP `connect-src`, with no `script-src` exception
 * (unlike realtime-db, whose long-poll injected JSONP scripts). On good
 * networks it still streams. If a proxy defeats auto-detection, swap to
 * `experimentalForceLongPolling: true` to long-poll unconditionally.
 *
 * No on-disk persistence: the default memory cache means clips never
 * land in IndexedDB, even encrypted — nothing survives the tab.
 */
export async function getFirestoreDb(): Promise<Firestore> {
  if (db) return db
  if (!promise) {
    promise = (async () => {
      const [{ initializeFirestore }, { getFirebaseApp }, { getFirebaseAuth }] = await Promise.all([
        import('firebase/firestore'),
        import('./init'),
        import('./auth'),
      ])
      await getFirebaseAuth()
      db = initializeFirestore(getFirebaseApp(), {
        experimentalAutoDetectLongPolling: true,
      })
      return db
    })()
  }
  return promise
}
