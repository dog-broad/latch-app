import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  push,
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database'
import {
  Bytes,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore'

/**
 * security-rule tests. spun up against the firebase emulator suite
 * so the rules are the deployed bytes, not a re-implementation.
 *
 * the wrapper script (`pnpm test:rules`) wraps this with
 * `firebase emulators:exec` which boots and tears down for ci.
 */

const ROOM = 'a1b2c3d4e5f60718'
const BAD_ROOM = 'wrong'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-latch-rules',
    database: {
      host: '127.0.0.1',
      port: 9000,
      rules: readFileSync(resolve(__dirname, '../../database.rules.json'), 'utf8'),
    },
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearDatabase()
  await env.clearFirestore()
})

describe('rtdb rules', () => {
  it('rejects unauthenticated reads', async () => {
    const db = env.unauthenticatedContext().database()
    await assertFails(set(ref(db, `rooms/${ROOM}/clips/x`), { ts: 1, payload: 'x' }))
  })

  it('accepts an authed text clip write with presence stamp', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const clipKey = push(ref(db, `rooms/${ROOM}/clips`)).key
    expect(clipKey).toBeTruthy()
    await assertSucceeds(
      update(ref(db), {
        [`rooms/${ROOM}/clips/${clipKey}`]: { ts: serverTimestamp(), payload: 'hello' },
        [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects a second clip write within 2s of the first', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const firstKey = push(ref(db, `rooms/${ROOM}/clips`)).key!
    await update(ref(db), {
      [`rooms/${ROOM}/clips/${firstKey}`]: { ts: serverTimestamp(), payload: 'one' },
      [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
    })

    const secondKey = push(ref(db, `rooms/${ROOM}/clips`)).key!
    await assertFails(
      update(ref(db), {
        [`rooms/${ROOM}/clips/${secondKey}`]: { ts: serverTimestamp(), payload: 'two' },
        [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects malformed room hash', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const key = push(ref(db, `rooms/${BAD_ROOM}/clips`)).key!
    await assertFails(
      update(ref(db), {
        [`rooms/${BAD_ROOM}/clips/${key}`]: { ts: serverTimestamp(), payload: 'x' },
        [`rooms/${BAD_ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects a clip whose payload exceeds 512 KiB', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const key = push(ref(db, `rooms/${ROOM}/clips`)).key!
    const oversize = 'x'.repeat(524289)
    await assertFails(
      update(ref(db), {
        [`rooms/${ROOM}/clips/${key}`]: { ts: serverTimestamp(), payload: oversize },
        [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects a clip with both payload and file fields', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const key = push(ref(db, `rooms/${ROOM}/clips`)).key!
    await assertFails(
      update(ref(db), {
        [`rooms/${ROOM}/clips/${key}`]: {
          ts: serverTimestamp(),
          payload: 'x',
          file: {
            id: 'f',
            encryptedName: 'n',
            encryptedMime: 'm',
            size: 1,
            chunkCount: 1,
            chunkPathPrefix: `rooms/${ROOM}/files/f/chunks`,
            manifest: ['h'],
          },
        },
        [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects a file clip with size over 10 MB', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    const key = push(ref(db, `rooms/${ROOM}/clips`)).key!
    await assertFails(
      update(ref(db), {
        [`rooms/${ROOM}/clips/${key}`]: {
          ts: serverTimestamp(),
          file: {
            id: 'f',
            encryptedName: 'n',
            encryptedMime: 'm',
            size: 10485761,
            chunkCount: 11,
            chunkPathPrefix: `rooms/${ROOM}/files/f/chunks`,
            manifest: ['h'],
          },
        },
        [`rooms/${ROOM}/presence/uid-alice/lastWriteTs`]: serverTimestamp(),
      }),
    )
  })

  it('rejects writing presence as a different uid', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    await assertFails(
      set(ref(db, `rooms/${ROOM}/presence/uid-bob/lastWriteTs`), serverTimestamp()),
    )
  })

  it('rejects writes outside /rooms', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const db = ctx.database()
    await assertFails(set(ref(db, 'somewhere/else'), { x: 1 }))
  })
})

describe('firestore rules', () => {
  it('accepts an authed chunk write at the right path', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await assertSucceeds(
      setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`), {
        payload: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
      }),
    )
  })

  it('rejects unauthenticated reads on chunks', async () => {
    const setupCtx = env.authenticatedContext('uid-alice')
    const setupFs = setupCtx.firestore()
    await setDoc(doc(setupFs, `rooms/${ROOM}/files/abc/chunks/0`), {
      payload: Bytes.fromUint8Array(new Uint8Array([1])),
    })

    const fs = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`)))
  })

  it('rejects a chunk write at a non-numeric path', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await assertFails(
      setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/oops`), {
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
  })

  it('rejects a chunk write with extra fields', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await assertFails(
      setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`), {
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
        secret: 'leak',
      }),
    )
  })

  it('rejects updates to an existing chunk', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`), {
      payload: Bytes.fromUint8Array(new Uint8Array([1])),
    })
    await assertFails(
      setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`), {
        payload: Bytes.fromUint8Array(new Uint8Array([2])),
      }),
    )
  })

  it('accepts authed delete on a chunk', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await setDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`), {
      payload: Bytes.fromUint8Array(new Uint8Array([1])),
    })
    await assertSucceeds(deleteDoc(doc(fs, `rooms/${ROOM}/files/abc/chunks/0`)))
  })

  it('rejects writes outside /rooms/<hex>/files/<id>/chunks', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    await assertFails(
      setDoc(doc(fs, `rooms/${BAD_ROOM}/files/abc/chunks/0`), {
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
    await assertFails(setDoc(doc(fs, 'somewhere/else'), { x: 1 }))
  })
})
