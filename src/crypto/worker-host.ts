// `?worker&inline` bundles the worker (and its statically-imported
// hash-wasm) into a base64 blob embedded in THIS module. `client.ts`
// imports this module dynamically, so the heavy blob lands in a lazy
// chunk fetched on the first crypto call (room-join), never on first
// paint. spawning from the resulting blob: URL means the worker script
// is never fetched as a separate network asset — a corporate proxy that
// rewrites worker-script responses to HTML has nothing to intercept.
import CryptoWorker from './worker.ts?worker&inline'

export function createCryptoWorker(): Worker {
  return new CryptoWorker()
}
