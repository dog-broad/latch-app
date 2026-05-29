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

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  // `new URL(..., import.meta.url)` is the form vite statically analyzes
  // to emit the worker as its own chunk. lazy on first call — the
  // import-graph reference is here, but the chunk fetch waits for need.
  worker = new Worker(new URL('../crypto/worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<CryptoResponse>) => {
    const res = event.data
    const slot = pending.get(res.id)
    if (!slot) return
    pending.delete(res.id)
    slot.resolve(res)
  }
  worker.onerror = (event) => {
    const err = new Error(`crypto worker error: ${event.message || 'unknown'}`)
    for (const slot of pending.values()) slot.reject(err)
    pending.clear()
  }
  return worker
}

/**
 * post a `(kind, payload)` to the worker and return the per-kind narrowed
 * response. taking kind and payload separately (vs `Omit<CryptoRequest,
 * 'id'>`) sidesteps the well-known ts gotcha that `Omit` doesn't
 * distribute across discriminated unions — `Omit<...>` would collapse
 * to the intersection of fields and drop everything kind-specific.
 */
function request<K extends CryptoRequest['kind']>(
  kind: K,
  payload: Omit<Extract<CryptoRequest, { kind: K }>, 'kind' | 'id'>,
): Promise<Extract<CryptoResponse, { kind: K }>> {
  const w = getWorker()
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
 * derive 32 bytes of argon2id key material for a room from the user's
 * passphrase and the room's salt. the raw bytes stay inside the worker —
 * the returned `keyId` is an opaque handle that later operations
 * (hkdf split, encrypt, decrypt) use to reach the stored material.
 *
 * argon2id parameters live on the worker side so the cost calibration
 * is one place to tune; the client only carries the inputs. first call
 * lazy-loads hash-wasm — first paint never pays.
 */
export async function deriveRoomKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<{ keyId: number; durationMs: number }> {
  const res = await request('derive', { passphrase, salt })
  if (!res.ok) throw new Error(res.error.message)
  return res.result
}
