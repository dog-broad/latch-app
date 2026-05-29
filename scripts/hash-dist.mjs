/**
 * emits the sha256 of `dist/index.html` on stdout.
 *
 * `pnpm build` already produces a byte-identical `index.html` across
 * runs (and across machines, given the same source tree + node + pnpm
 * versions). this script makes the hash trivially scriptable: ci pipes
 * it into release notes, and a verifier reproduces the build locally
 * and compares output.
 *
 *   pnpm build
 *   node scripts/hash-dist.mjs   # prints "<sha256>  dist/index.html"
 *
 * matches the format `sha256sum` would emit, so a downstream
 * `sha256sum -c` works against the printed line.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const target = resolve(root, 'dist/index.html')

const bytes = readFileSync(target)
const sum = createHash('sha256').update(bytes).digest('hex')
const rel = relative(root, target).replaceAll('\\', '/')
process.stdout.write(`${sum}  ${rel}\n`)
