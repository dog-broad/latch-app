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

export type CryptoResponse =
  | { kind: 'ping'; id: number; ok: true; result: { ts: number } }
  | { kind: 'ping'; id: number; ok: false; error: CryptoError }

export type CryptoError = {
  readonly message: string
}
