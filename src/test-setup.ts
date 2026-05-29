// `@vitest/web-worker` intercepts `new Worker(new URL(..., import.meta.url))`
// in node-environment tests and runs the worker code in an isolated context
// inside the same process. without this, every test that touches the crypto
// client would fail at worker construction.
//
// referenced from vite.config.ts → test.setupFiles. not part of the
// production bundle.
import '@vitest/web-worker'
