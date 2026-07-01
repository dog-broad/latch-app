import type { CryptoRequest, CryptoResponse } from './protocol'

/**
 * main-thread client for the crypto worker.
 *
 * the worker is spawned lazily on the first call — first paint never pays
 * the worker boot cost, and a page that never joins a room never loads
 * the crypto module. each request gets a unique `id` and a slot in the
 * pending map; the worker echoes that `id` back so responses route to
 * the right awaiter even when several calls are in flight.
 *
 * crypto operations themselves are added in subsequent commits as new
 * request kinds; `ping` exists to prove the channel is wired.
 */

type Pending = {
  resolve: (response: CryptoResponse) => void
  reject: (error: Error) => void
}

let workerPromise: Promise<Worker> | null = null
let nextId = 1
const pending = new Map<number, Pending>()

/**
 * lazily import + spawn the crypto worker. the worker (with its inlined
 * hash-wasm) lives in `worker-host`, imported dynamically so its weight
 * lands in a room-join chunk, not first paint. cached as a promise; a
 * failed load clears the cache so a later call can retry.
 */
function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise
  workerPromise = import('./worker-host')
    .then(({ createCryptoWorker }) => {
      const w = createCryptoWorker()
      w.onmessage = (event: MessageEvent<CryptoResponse>) => {
        const res = event.data
        const slot = pending.get(res.id)
        if (!slot) return
        pending.delete(res.id)
        slot.resolve(res)
      }
      w.onerror = (event) => {
        const err = new Error(`crypto worker error: ${event.message || 'unknown'}`)
        for (const slot of pending.values()) slot.reject(err)
        pending.clear()
      }
      return w
    })
    .catch((err) => {
      workerPromise = null
      throw err
    })
  return workerPromise
}

/**
 * post a `(kind, payload)` to the worker and return the per-kind narrowed
 * response. taking kind and payload separately (vs `Omit<CryptoRequest,
 * 'id'>`) sidesteps the well-known ts gotcha that `Omit` doesn't
 * distribute across discriminated unions — `Omit<...>` would collapse
 * to the intersection of fields and drop everything kind-specific.
 */
async function request<K extends CryptoRequest['kind']>(
  kind: K,
  payload: Omit<Extract<CryptoRequest, { kind: K }>, 'kind' | 'id'>,
): Promise<Extract<CryptoResponse, { kind: K }>> {
  const w = await getWorker()
  const id = nextId++
  return new Promise<Extract<CryptoResponse, { kind: K }>>((resolve, reject) => {
    pending.set(id, {
      resolve: (response) => resolve(response as Extract<CryptoResponse, { kind: K }>),
      reject,
    })
    w.postMessage({ kind, id, ...payload } as CryptoRequest)
  })
}

/** smoke-test the worker channel. resolves with the worker's clock at
 *  the moment it handled the request. */
export async function ping(): Promise<{ ts: number }> {
  const res = await request('ping', {})
  if (!res.ok) throw new Error(res.error.message)
  return res.result
}

/**
 * derive a room's content key and firebase path from the user's
 * passphrase and a per-room salt. the chain is argon2id → hkdf-split:
 *   - argon2id raises cost per guess for low-entropy passphrases
 *   - hkdf splits that output into two domain-separated branches
 *
 * the aes-gcm content key (`roomKey`, non-extractable) stays inside
 * the worker; the client receives only the opaque `keyId` handle and
 * the 16-hex `roomPath` for firebase. the cost calibration lives on
 * the worker side so the client carries only the inputs. first call
 * lazy-loads hash-wasm — first paint never pays.
 */
export async function deriveRoomKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<{ keyId: number; roomPath: string; durationMs: number }> {
  const res = await request('derive', { passphrase, salt })
  if (!res.ok) throw new Error(res.error.message)
  return res.result
}

/**
 * aes-gcm-256 encrypt the plaintext against the room key referenced
 * by `keyId`. returns iv || ciphertext+tag as a single buffer — the
 * 12-byte iv lives at the front of the payload, the receiver pulls
 * it back off in decryptForRoom. iv is fresh-random per call; never
 * reuse a payload under the same key.
 *
 * `aad` is authenticated but not encrypted. text clips don't need
 * one; the file-chunk path will pass the chunk index so reordering
 * gets rejected on decrypt.
 *
 * the raw aes-gcm key never crosses the boundary — only the keyId
 * handle does. text-vs-file serialization lives at the call site
 * via TextEncoder/TextDecoder; this layer is binary-agnostic.
 */
export async function encryptForRoom(
  keyId: number,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const res = await request('encrypt', aad ? { keyId, plaintext, aad } : { keyId, plaintext })
  if (!res.ok) throw new Error(res.error.message)
  return res.result.payload
}

/**
 * aes-gcm-256 decrypt of an iv-prefixed payload against the room
 * key referenced by `keyId`. authentication failures (tampered
 * payload, wrong aad, wrong key) all surface as the same opaque
 * error so callers can't distinguish them — the decision to keep
 * webcrypto's tag-check failure mode opaque lives on the worker side.
 */
export async function decryptForRoom(
  keyId: number,
  payload: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const res = await request('decrypt', aad ? { keyId, payload, aad } : { keyId, payload })
  if (!res.ok) throw new Error(res.error.message)
  return res.result.plaintext
}
