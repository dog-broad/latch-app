import { useEffect } from 'preact/hooks'

const SOURCE_URL = 'https://github.com/dog-broad/latch-app'

/**
 * `/source` is a plain redirect to the public repo. polish wires a
 * vercel-side rewrite (no client roundtrip); for now the redirect
 * fires on mount. typed `/source` and the header `src` link both
 * land at github — the header skips this route to avoid the flash.
 */
export function Source() {
  useEffect(() => {
    window.location.replace(SOURCE_URL)
  }, [])
  return (
    <div class="min-h-screen flex items-center justify-center bg-bg text-fg-muted text-14">
      <p>redirecting to source...</p>
    </div>
  )
}
