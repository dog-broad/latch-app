import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

// the firestore instance the rules-testing context hands back; the
// modular firestore functions accept it (see the chunk tests below).
type RulesFirestore = ReturnType<
  ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']
>

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
  await env.clearFirestore()
})

/**
 * mirror the client's publish: a batch that creates the clip doc and
 * stamps the writer's presence in the same commit, which the rate-limit
 * rule requires via getAfter.
 */
function publishClip(
  fs: RulesFirestore,
  room: string,
  uid: string,
  data: Record<string, unknown>,
): Promise<void> {
  const clipRef = doc(collection(fs, `rooms/${room}/clips`))
  const batch = writeBatch(fs)
  batch.set(clipRef, data)
  batch.set(doc(fs, `rooms/${room}/presence/${uid}`), { lastWriteTs: serverTimestamp() })
  return batch.commit()
}

const FILE_REF = {
  id: 'f',
  encryptedName: 'n',
  encryptedMime: 'm',
  size: 1,
  chunkCount: 1,
  chunkPathPrefix: `rooms/${ROOM}/files/f/chunks`,
  manifest: ['h'],
}

describe('firestore clip rules', () => {
  it('rejects unauthenticated reads', async () => {
    const fs = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(fs, `rooms/${ROOM}/clips/x`)))
  })

  it('accepts an authed text clip write with batched presence stamp', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertSucceeds(
      publishClip(fs, ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
      }),
    )
  })

  it('rejects a clip write that does not also stamp presence', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      setDoc(doc(collection(fs, `rooms/${ROOM}/clips`)), {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
  })

  it('rejects a second clip write within 2s of the first', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await publishClip(fs, ROOM, 'uid-alice', {
      ts: serverTimestamp(),
      payload: Bytes.fromUint8Array(new Uint8Array([1])),
    })
    await assertFails(
      publishClip(fs, ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array([2])),
      }),
    )
  })

  it('rejects malformed room hash', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      publishClip(fs, BAD_ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
  })

  it('rejects a clip whose payload exceeds 512 KiB', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      publishClip(fs, ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array(524289)),
      }),
    )
  })

  it('rejects a clip with both payload and file fields', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      publishClip(fs, ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        payload: Bytes.fromUint8Array(new Uint8Array([1])),
        file: FILE_REF,
      }),
    )
  })

  it('rejects a file clip with size over 10 MB', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      publishClip(fs, ROOM, 'uid-alice', {
        ts: serverTimestamp(),
        file: { ...FILE_REF, size: 10485761, chunkCount: 11 },
      }),
    )
  })

  it('accepts a file clip within the size cap', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertSucceeds(
      publishClip(fs, ROOM, 'uid-alice', { ts: serverTimestamp(), file: FILE_REF }),
    )
  })

  it('rejects writing presence as a different uid', async () => {
    const fs = env.authenticatedContext('uid-alice').firestore()
    await assertFails(
      setDoc(doc(fs, `rooms/${ROOM}/presence/uid-bob`), { lastWriteTs: serverTimestamp() }),
    )
  })

  it('rejects updating an existing clip (immutable)', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    // seed a clip with rules disabled so the test isolates the update rule.
    let clipPath = ''
    await env.withSecurityRulesDisabled(async (admin) => {
      const ref = doc(collection(admin.firestore(), `rooms/${ROOM}/clips`))
      clipPath = ref.path
      await setDoc(ref, { ts: serverTimestamp(), payload: Bytes.fromUint8Array(new Uint8Array([1])) })
    })
    await assertFails(
      updateDoc(doc(fs, clipPath), { payload: Bytes.fromUint8Array(new Uint8Array([2])) }),
    )
  })

  it('accepts an authed delete on a clip (prune)', async () => {
    const ctx = env.authenticatedContext('uid-alice')
    const fs = ctx.firestore()
    let clipPath = ''
    await env.withSecurityRulesDisabled(async (admin) => {
      const ref = doc(collection(admin.firestore(), `rooms/${ROOM}/clips`))
      clipPath = ref.path
      await setDoc(ref, { ts: serverTimestamp(), payload: Bytes.fromUint8Array(new Uint8Array([1])) })
    })
    await assertSucceeds(deleteDoc(doc(fs, clipPath)))
  })
})

describe('firestore chunk rules', () => {
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
