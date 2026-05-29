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

function request(req: Omit<CryptoRequest, 'id'>): Promise<CryptoResponse> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ ...req, id } as CryptoRequest)
  })
}

/** smoke-test the worker channel. resolves with the worker's clock at
 *  the moment it handled the request. */
export async function ping(): Promise<{ ts: number }> {
  const res = await request({ kind: 'ping' })
  if (res.kind !== 'ping') throw new Error('protocol mismatch: expected ping response')
  if (!res.ok) throw new Error(res.error.message)
  return res.result
}
