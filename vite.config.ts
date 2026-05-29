import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'latch',
        short_name: 'latch',
        description: 'your clipboard. both machines. one room.',
        theme_color: '#0a1014',
        background_color: '#0a1014',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // narrow precache: only the assets needed for the shell to render
        // (html, css, fonts, the entry chunk, icons). lazy chunks
        // (shiki languages, firebase sdk, hash-wasm) are excluded — they
        // load on demand and would bloat the precache to ~12 mib otherwise.
        // online users get them from the network; fully-offline users see
        // the shell but can't open features that require them.
        globPatterns: [
          'index.html',
          'assets/index-*.js',
          'assets/index-*.css',
          'assets/jetbrains-mono-latin-*.woff2',
          '*.svg',
          '*.png',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // never cache firebase responses — clip data must be live.
        runtimeCaching: [],
      },
      devOptions: {
        // disabled in dev to avoid sw caching during hot reload.
        enabled: false,
      },
    }),
  ],
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
