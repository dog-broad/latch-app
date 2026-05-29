import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    // the crypto worker does `await import('hash-wasm')` for the argon2id
    // wasm chunk; that's code-splitting inside the worker, which only
    // works with the esm output format. vite's default `iife` rejects
    // multi-chunk worker builds, so opt the worker pipeline into esm.
    format: 'es',
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    // argon2id derives at the spec parameters take ~400 ms each, and
    // a single test can derive multiple times. raise the default so
    // ci doesn't false-fail on cold-start wasm init.
    testTimeout: 15_000,
  },
})
