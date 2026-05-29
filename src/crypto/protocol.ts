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
 * the 32-byte argon2id output stays inside the worker and is referenced
 * by handle from future operations (hkdf split, encrypt, decrypt). a
 * later commit extends this shape with `roomPath` once hkdf domain
 * separation lands.
 */
export type DeriveResult = {
  readonly keyId: number
  readonly durationMs: number
}

export type CryptoError = {
  readonly message: string
}
