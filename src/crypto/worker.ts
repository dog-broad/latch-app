/// <reference lib="webworker" />

import type { CryptoRequest, CryptoResponse } from './protocol'
import { argon2id } from 'hash-wasm'

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
  if (req.kind === 'encrypt') {
    return encrypt(req)
  }
  if (req.kind === 'decrypt') {
    return decrypt(req)
  }
  // exhaustiveness guard — a new request kind added to CryptoRequest
  // without a branch above becomes a never-assignment compile error.
  const _exhaustive: never = req
  throw new Error(`unhandled crypto request kind: ${JSON.stringify(_exhaustive)}`)
}

// hash-wasm is statically imported and bundled into this worker (its
// wasm ships as base64 inside the js, so there's no separate .wasm
// fetch). the whole worker is then inlined as a blob at the call site,
// so no crypto asset is ever fetched over the network as a separate
// url — nothing for a hostile corporate proxy to rewrite. derived
// material stays in `keyMaterial`, indexed by an opaque handle; the
// aes-gcm key is non-extractable and the raw argon2id output is
// discarded once hkdf has split it.
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

/**
 * aes-gcm-256 encrypt against the stored roomKey for `keyId`. wire
 * format is the 12-byte iv prepended to the ciphertext+tag; one buffer,
 * one postMessage. per-message random iv is the nonce-misuse rule made
 * explicit — never reuse an iv under the same key. aad (when present)
 * is authenticated but not encrypted; the file path will pass the
 * chunk index there so reorderings get rejected on decrypt.
 */
async function encrypt(
  req: Extract<CryptoRequest, { kind: 'encrypt' }>,
): Promise<CryptoResponse> {
  const material = keyMaterial.get(req.keyId)
  if (!material) {
    return {
      kind: 'encrypt',
      id: req.id,
      ok: false,
      error: { message: 'unknown keyId' },
    }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const params: AesGcmParams = req.aad
    ? { name: 'AES-GCM', iv, additionalData: new Uint8Array(req.aad) }
    : { name: 'AES-GCM', iv }
  const plaintextCopy = new Uint8Array(req.plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(params, material.roomKey, plaintextCopy),
  )
  const payload = new Uint8Array(iv.length + ciphertext.length)
  payload.set(iv, 0)
  payload.set(ciphertext, iv.length)
  return {
    kind: 'encrypt',
    id: req.id,
    ok: true,
    result: { payload },
  }
}

/**
 * aes-gcm-256 decrypt. webcrypto throws on tag-check failure — that
 * surface is collapsed to a single opaque "decryption failed" error so
 * callers can't distinguish tamper from aad mismatch from mitm
 * substitution. the payload's first 12 bytes are the iv; everything
 * after is ciphertext+tag.
 */
async function decrypt(
  req: Extract<CryptoRequest, { kind: 'decrypt' }>,
): Promise<CryptoResponse> {
  const material = keyMaterial.get(req.keyId)
  if (!material) {
    return {
      kind: 'decrypt',
      id: req.id,
      ok: false,
      error: { message: 'unknown keyId' },
    }
  }
  // 12-byte iv + 16-byte gcm tag is the floor; smaller can't be a
  // well-formed payload regardless of plaintext length.
  if (req.payload.length < 12 + 16) {
    return {
      kind: 'decrypt',
      id: req.id,
      ok: false,
      error: { message: 'payload too short' },
    }
  }
  const iv = new Uint8Array(req.payload.slice(0, 12))
  const ciphertext = new Uint8Array(req.payload.slice(12))
  const params: AesGcmParams = req.aad
    ? { name: 'AES-GCM', iv, additionalData: new Uint8Array(req.aad) }
    : { name: 'AES-GCM', iv }
  try {
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(params, material.roomKey, ciphertext),
    )
    return {
      kind: 'decrypt',
      id: req.id,
      ok: true,
      result: { plaintext },
    }
  } catch {
    return {
      kind: 'decrypt',
      id: req.id,
      ok: false,
      error: { message: 'decryption failed' },
    }
  }
}
