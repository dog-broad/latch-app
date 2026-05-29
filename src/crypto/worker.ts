/// <reference lib="webworker" />

import type { CryptoRequest, CryptoResponse } from './protocol'
import type { argon2id as Argon2idFn } from 'hash-wasm'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<CryptoRequest>) => {
  const req = event.data
  handle(req).then(
    (res) => ctx.postMessage(res),
    (err) => {
      const message = err instanceof Error ? err.message : 'unknown error'
      ctx.postMessage({
        kind: req.kind,
        id: req.id,
        ok: false,
        error: { message },
      } satisfies CryptoResponse)
    },
  )
}

async function handle(req: CryptoRequest): Promise<CryptoResponse> {
  if (req.kind === 'ping') {
    return { kind: 'ping', id: req.id, ok: true, result: { ts: performance.now() } }
  }
  if (req.kind === 'derive') {
    return derive(req)
  }
  // exhaustiveness guard — a new request kind added to CryptoRequest
  // without a branch above becomes a never-assignment compile error.
  const _exhaustive: never = req
  throw new Error(`unhandled crypto request kind: ${JSON.stringify(_exhaustive)}`)
}

// argon2id is lazy-imported on first derive so the wasm module never
// loads on first paint — the landing page sees it only when a user
// joins a room. derived material stays in `keyMaterial`, indexed by
// an opaque handle; nothing re-exports the raw bytes across the
// worker boundary.
let argon2id: typeof Argon2idFn | null = null
let nextKeyId = 1
const keyMaterial = new Map<number, Uint8Array>()

async function derive(
  req: Extract<CryptoRequest, { kind: 'derive' }>,
): Promise<CryptoResponse> {
  if (!argon2id) {
    argon2id = (await import('hash-wasm')).argon2id
  }
  const t0 = performance.now()
  // 64 MiB memory, 3 iterations, 4 parallelism, 32-byte output.
  // memory-hard against gpu brute force — passphrases are low-entropy
  // by default, and the cost-per-guess shape of argon2id is what raises
  // online brute force above worthwhile. calibrated at these settings
  // to roughly 500 ms on a mid-range laptop.
  const hash = await argon2id({
    password: req.passphrase,
    salt: req.salt,
    iterations: 3,
    parallelism: 4,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })
  const durationMs = performance.now() - t0
  const keyId = nextKeyId++
  keyMaterial.set(keyId, hash)
  return {
    kind: 'derive',
    id: req.id,
    ok: true,
    result: { keyId, durationMs },
  }
}
