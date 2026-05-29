import { useEffect, useState } from 'preact/hooks'

const STRIP_BLOCK_CHARS = '░▒▓ ░ ▒'
const STRIP_CELLS = 14
const STRIP_TICK_MS = 140
const DEFAULT_PLAINTEXT = 'hello world'
const STATIC_BLOCKS = '░▒░▓░ ▒▓░▒▓░ '

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * the landing-page centerpiece: a live encryption demo. left box
 * holds the plaintext (editable), right box holds the actual
 * aes-gcm-256 ciphertext of whatever the left box contains, in hex.
 * the transformation strip between them shows a 2.4 s teal sweep
 * with raf-paced block-glyph morph.
 *
 * the demo key is generated fresh per page-load via
 * crypto.subtle.generateKey, non-extractable, never stored or
 * displayed. the demonstration value lives in observable
 * properties — same plaintext under different page-loads yields
 * different ciphertext (random iv), identical lengths track input
 * size + 16-byte gcm tag, and the page makes zero outbound requests
 * during the demo (visible in devtools).
 */
export function HeroDemo() {
  const [plaintext, setPlaintext] = useState(DEFAULT_PLAINTEXT)
  const ciphertext = useDemoCiphertext(plaintext)

  return (
    <div
      class="grid grid-cols-1 md:grid-cols-[1fr_16rem_1fr] gap-4 md:gap-0 items-stretch"
      aria-label="live encryption demo"
    >
      <DemoBox label="you type">
        <textarea
          value={plaintext}
          onInput={(e) => setPlaintext(e.currentTarget.value)}
          aria-label="demo plaintext"
          rows={3}
          spellcheck={false}
          class="w-full bg-transparent text-fg text-14 font-mono outline-none focus:ring-2 focus:ring-teal-mid focus:ring-inset resize-none placeholder:text-fg-faint"
        />
      </DemoBox>
      <CipherStrip />
      <DemoBox label="firebase stores">
        <span class="text-fg-muted text-12 font-mono break-all">
          {ciphertext || '…'}
        </span>
      </DemoBox>
    </div>
  )
}

function DemoBox({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="border border-border bg-bg-sunk p-4 flex flex-col gap-3 min-h-32">
      <span class="text-fg-faint text-12">{label}</span>
      <div class="flex-1">{children}</div>
    </div>
  )
}

function CipherStrip() {
  const reduced = prefersReducedMotion()
  const [blocks, setBlocks] = useState(() =>
    reduced ? STATIC_BLOCKS.slice(0, STRIP_CELLS) : randomBlocks(STRIP_CELLS),
  )

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let last = 0
    function tick(now: number) {
      if (now - last >= STRIP_TICK_MS) {
        setBlocks(randomBlocks(STRIP_CELLS))
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <div
      class="cipher-strip border-y md:border-y md:border-x-0 border-x md:border-l md:border-r border-border-hot flex flex-col items-center justify-center gap-1 px-6 md:px-8 py-4 md:py-3 min-h-16"
      aria-hidden="true"
    >
      <span class="text-bg-sunk text-12 font-mono tracking-widest">{blocks}</span>
      <span class="text-bg text-14 font-mono">encrypting</span>
    </div>
  )
}

function randomBlocks(n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) {
    const ch = STRIP_BLOCK_CHARS.charAt(Math.floor(Math.random() * STRIP_BLOCK_CHARS.length))
    s += ch
  }
  return s
}

/**
 * fresh non-extractable aes-gcm-256 key per page-load; re-encrypts
 * the plaintext (with a fresh random iv) every time it changes. the
 * key never leaves memory and is never displayed. all native
 * webcrypto — no library dependency on first paint.
 */
function useDemoCiphertext(plaintext: string): string {
  const [hex, setHex] = useState('')
  const [key, setKey] = useState<CryptoKey | null>(null)

  useEffect(() => {
    let cancelled = false
    void crypto.subtle
      .generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt'])
      .then((k) => {
        if (!cancelled) setKey(k)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = new TextEncoder().encode(plaintext)
    void crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data).then((buf) => {
      if (cancelled) return
      const bytes = new Uint8Array(buf)
      let s = ''
      for (const b of bytes) s += b.toString(16).padStart(2, '0')
      setHex(s)
    })
    return () => {
      cancelled = true
    }
  }, [plaintext, key])

  return hex
}
