/// <reference lib="webworker" />

import type { CryptoRequest, CryptoResponse } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<CryptoRequest>) => {
  const req = event.data
  try {
    ctx.postMessage(handle(req))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    ctx.postMessage({
      kind: req.kind,
      id: req.id,
      ok: false,
      error: { message },
    } satisfies CryptoResponse)
  }
}

function handle(req: CryptoRequest): CryptoResponse {
  if (req.kind === 'ping') {
    return { kind: 'ping', id: req.id, ok: true, result: { ts: performance.now() } }
  }
  // unreachable on the current single-kind union. once a second request
  // kind ships, this throw is replaced with the canonical exhaustiveness
  // guard (`const _: never = req`) — that pattern is meaningful only when
  // there are at least two members for tsc to narrow between, and on a
  // single-member union the never-assignment is a tsc error today even
  // though every value is provably handled.
  throw new Error(`unhandled crypto request kind: ${(req as { kind: string }).kind}`)
}
