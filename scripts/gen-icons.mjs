/**
 * regenerates the pwa icon set from `public/icon.svg`.
 *
 * the resulting pngs (`pwa-192x192.png`, `pwa-512x512.png`,
 * `pwa-maskable-512x512.png`, `apple-touch-icon.png`, `favicon.png`)
 * are committed to the repo so the build doesn't depend on sharp's
 * native binary. only run this when the source svg changes.
 *
 *   npx --yes sharp-cli@5 -i public/icon.svg ...   # one-shot path
 *
 * or install sharp ad-hoc and run this file:
 *
 *   pnpm dlx -p sharp@0.33 node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const svgPath = resolve(root, 'public/icon.svg')
const svg = readFileSync(svgPath)

const targets = [
  { out: 'public/pwa-192x192.png', size: 192 },
  { out: 'public/pwa-512x512.png', size: 512 },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/favicon.png', size: 32 },
]

for (const { out, size } of targets) {
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(resolve(root, out), buf)
  console.log(`wrote ${out} (${buf.length} bytes)`)
}

// maskable icon needs a safe zone — the visible mark shrinks to ~40%
// of the canvas so android can mask it into any platform shape.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#0a1014"/><circle cx="96" cy="96" r="36" fill="none" stroke="#5fd4e0" stroke-width="6" stroke-dasharray="6 4"/></svg>`
const maskable = await sharp(Buffer.from(maskableSvg), { density: 384 })
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toBuffer()
writeFileSync(resolve(root, 'public/pwa-maskable-512x512.png'), maskable)
console.log(`wrote public/pwa-maskable-512x512.png (${maskable.length} bytes)`)
