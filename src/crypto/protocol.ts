/**
 * shared types between the main thread and the crypto worker.
 *
 * `kind` is the operation tag. `id` correlates a response back to the
 * request that produced it, so several in-flight calls don't cross-resolve
 * when the worker pipelines replies. errors travel as structured payloads
 * in the response envelope — nothing throws across the worker boundary.
 *
 * a new request kind is added by extending both unions plus a `case` arm
 * in the worker switch. the `never` exhaustiveness guard in the switch
 * makes a missing arm a compile error rather than a silent pass-through.
 */

export type CryptoRequest =
  | { kind: 'ping'; id: number }
  | { kind: 'derive'; id: number; passphrase: string; salt: Uint8Array }

export type CryptoResponse =
  | { kind: 'ping'; id: number; ok: true; result: { ts: number } }
  | { kind: 'ping'; id: number; ok: false; error: CryptoError }
  | { kind: 'derive'; id: number; ok: true; result: DeriveResult }
  | { kind: 'derive'; id: number; ok: false; error: CryptoError }

/**
 * `keyId` is an opaque handle into the worker's local key-material store;
 * the underlying aes-gcm `CryptoKey` is non-extractable and stays inside
 * the worker — future operations (encrypt, decrypt) reach it by handle.
 *
 * `roomPath` is the 16-hex firebase path for the room. it's derived
 * from a domain-separated hkdf branch off the same key material as the
 * content key, so two rooms with the same name and different
 * passphrases land at different paths and never cross-talk. firebase
 * never sees the room name itself — only this opaque hash.
 */
export type DeriveResult = {
  readonly keyId: number
  readonly roomPath: string
  readonly durationMs: number
}

export type CryptoError = {
  readonly message: string
}
