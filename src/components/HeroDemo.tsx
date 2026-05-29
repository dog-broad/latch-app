import { useEffect, useState } from 'preact/hooks'

const STRIP_BLOCK_CHARS = '░▒▓ ░ ▒'
const STRIP_CELLS = 14
const STRIP_TICK_MS = 140

/**
 * the landing-page centerpiece: a live encryption demo. left box
 * holds the plaintext, right box holds the ciphertext, transformation
 * strip in the middle visually carries the bytes across.
 *
 * the strip has a 2.4 s teal-glow sweep (driven from app.css) and a
 * raf-paced character morph: every ~140 ms the cells re-roll to a
 * new mix of block glyphs, so the strip looks "alive" even when the
 * user isn't typing. the box contents themselves are still
 * placeholders here — the reactive plaintext + real aes-gcm output
 * land in subsequent commits.
 */
export function HeroDemo() {
  return (
    <div
      class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-0 items-stretch"
      aria-label="live encryption demo"
    >
      <DemoBox
        label="you type"
        body={<span class="text-fg">hello world</span>}
      />
      <CipherStrip />
      <DemoBox
        label="firebase stores"
        body={<span class="text-fg-muted font-mono break-all">9a4f2c8e7b…</span>}
      />
    </div>
  )
}

function DemoBox({ label, body }: { label: string; body: preact.ComponentChildren }) {
  return (
    <div class="border border-border bg-bg-sunk p-4 flex flex-col gap-3 min-h-32">
      <span class="text-fg-faint text-12">{label}</span>
      <div class="flex-1 text-14 font-mono">{body}</div>
    </div>
  )
}

function CipherStrip() {
  const [blocks, setBlocks] = useState(() => randomBlocks(STRIP_CELLS))

  useEffect(() => {
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
  }, [])

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
