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
// an opaque handle; the aes-gcm key is non-extractable and the raw
// argon2id output is discarded once hkdf has split it.
let argon2id: typeof Argon2idFn | null = null
let nextKeyId = 1

type RoomMaterial = {
  readonly roomKey: CryptoKey
  readonly roomPath: string
}
const keyMaterial = new Map<number, RoomMaterial>()

const encoder = new TextEncoder()
const HKDF_INFO_ROOM_KEY = encoder.encode('latch-room-key-v1')
const HKDF_INFO_ROOM_PATH = encoder.encode('latch-room-path-v1')
const EMPTY_SALT = new Uint8Array(0)

async function derive(
  req: Extract<CryptoRequest, { kind: 'derive' }>,
): Promise<CryptoResponse> {
  if (!argon2id) {
    argon2id = (await import('hash-wasm')).argon2id
  }
  const t0 = performance.now()
  // argon2id parameters: 64 MiB memory, 3 iterations, 4 parallelism,
  // 32-byte output. memory-hard against gpu brute force — passphrases
  // are low-entropy by default, and the cost-per-guess shape of
  // argon2id is what raises online brute force above worthwhile.
  // calibrated at these settings to roughly 500 ms on a mid-range laptop.
  const argonOutput = await argon2id({
    password: req.passphrase,
    salt: req.salt,
    iterations: 3,
    parallelism: 4,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })
  const { roomKey, roomPath } = await hkdfSplit(argonOutput)
  // discard the raw 32-byte argon2id output — neither aes-gcm nor the
  // path needs it again, and leaving it in scope is needless lifetime
  // for sensitive material.
  argonOutput.fill(0)
  const durationMs = performance.now() - t0
  const keyId = nextKeyId++
  keyMaterial.set(keyId, { roomKey, roomPath })
  return {
    kind: 'derive',
    id: req.id,
    ok: true,
    result: { keyId, roomPath, durationMs },
  }
}

/**
 * split the argon2id output into two domain-separated branches via
 * hkdf-sha256. the same input key material produces:
 *   - `roomKey`: a non-extractable aes-gcm-256 CryptoKey used for content
 *     encryption. never leaves the worker.
 *   - `roomPath`: 64 bits expressed as 16 lowercase hex chars, used as
 *     the firebase database path so the server only ever sees a hash,
 *     never the room name the user typed.
 * different `info` labels are the domain separation — anyone with the
 * path can't derive the content key, and vice versa.
 */
async function hkdfSplit(ikmBytes: Uint8Array): Promise<RoomMaterial> {
  // copy into a plain ArrayBuffer-backed view — webcrypto's BufferSource
  // excludes SharedArrayBuffer-backed views, and hash-wasm types its
  // output generically. the copy is 32 bytes; negligible.
  const ikmCopy = new Uint8Array(ikmBytes)
  const ikm = await crypto.subtle.importKey(
    'raw',
    ikmCopy,
    'HKDF',
    false,
    ['deriveBits', 'deriveKey'],
  )
  const roomKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY_SALT, info: HKDF_INFO_ROOM_KEY },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const pathBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY_SALT, info: HKDF_INFO_ROOM_PATH },
    ikm,
    64,
  )
  return { roomKey, roomPath: toHex(pathBits) }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}
