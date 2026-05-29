/**
 * serves `dist/` over http with the headers from `vercel.json` applied
 * so the production csp + permissions-policy can be sanity-checked
 * locally without deploying. `pnpm preview` does not apply vercel
 * headers; this script does.
 *
 *   pnpm build
 *   pnpm preview:csp   # listens on http://localhost:5050
 *
 * useful for catching csp violations against the live firebase
 * backend in a browser console before pushing a tag.
 */
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = resolve(fileURLToPath(import.meta.url), '..')
const root = resolve(here, '..')
const dist = resolve(root, 'dist')

const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
const headerEntries = config.headers
  ?.filter((h) => h.source === '/(.*)')
  ?.flatMap((h) => h.headers ?? [])
  ?.map((h) => [h.key, h.value])

if (!headerEntries?.length) {
  console.error('no /(.*) headers found in vercel.json')
  process.exit(1)
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const joined = normalize(join(dist, decoded))
  if (!joined.startsWith(dist)) return null
  return joined
}

const port = Number(process.env.PORT) || 5050
const server = createServer((req, res) => {
  for (const [k, v] of headerEntries) res.setHeader(k, v)

  if (!req.url) {
    res.statusCode = 400
    res.end('no url')
    return
  }

  let target = safePath(req.url)
  if (!target) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }

  try {
    const stat = statSync(target)
    if (stat.isDirectory()) target = join(target, 'index.html')
  } catch {
    // spa fallback: anything that isn't a real file becomes index.html
    target = join(dist, 'index.html')
  }

  try {
    const ext = extname(target).toLowerCase()
    if (mime[ext]) res.setHeader('Content-Type', mime[ext])
    createReadStream(target).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})

server.listen(port, () => {
  console.log(`serving ${dist} on http://localhost:${port} with vercel.json headers`)
})
