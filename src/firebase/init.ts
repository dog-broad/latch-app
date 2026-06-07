import { initializeApp, type FirebaseApp } from 'firebase/app'

let app: FirebaseApp | null = null

/**
 * lazy singleton — firebase only spins up when something calls
 * getFirebaseApp(). main.tsx and the landing route never call it, so
 * first paint never pays for the firebase init or the bundle weight.
 *
 * config values come from import.meta.env (VITE_FIREBASE_*). the
 * literal apiKey + projectId pair live in .env.local (gitignored) and
 * in the host's environment-variable config, never in committed source.
 *
 * no `databaseURL`: clips and file chunks both live in firestore now,
 * and nothing opens a Realtime Database handle. `storageBucket` is set
 * so firebase doesn't complain, but no code path opens a Firebase
 * Storage handle either — file chunks are firestore documents and stay
 * below storage's blaze paywall.
 */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  return app
}
