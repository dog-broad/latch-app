import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * vitest config for the firebase emulator rule tests. only used by
 * `pnpm test:rules`, which boots the database + firestore emulators
 * via `firebase emulators:exec` first.
 *
 * separated from the main `vite.config.ts` test block so the default
 * `pnpm test` run stays free of any external-service dependencies.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.emulator.test.ts'],
    testTimeout: 30_000,
  },
})
