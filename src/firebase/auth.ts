import type { Auth } from 'firebase/auth'

let auth: Auth | null = null
let signInPromise: Promise<void> | null = null

/**
 * lazy anonymous auth handle. the first caller triggers the firebase
 * auth chunk to load, signs in anonymously, and caches the resulting
 * Auth instance. subsequent calls return the same instance without
 * re-signing-in.
 *
 * security rules require `auth != null` for any read or write under
 * `rooms/...`, so this needs to settle before subscribing or pushing.
 * uids rotate per browser session — they're for rate-limit attribution
 * only, not user identity.
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (auth?.currentUser) return auth

  if (!signInPromise) {
    signInPromise = (async () => {
      const [{ getAuth, signInAnonymously }, { getFirebaseApp }] = await Promise.all([
        import('firebase/auth'),
        import('./init'),
      ])
      const a = getAuth(getFirebaseApp())
      if (!a.currentUser) await signInAnonymously(a)
      auth = a
    })()
  }
  await signInPromise
  if (!auth) throw new Error('firebase auth handle missing after sign-in')
  return auth
}
