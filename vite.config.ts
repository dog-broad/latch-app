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
