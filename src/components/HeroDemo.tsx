/**
 * the landing-page centerpiece: a live encryption demo. left box
 * holds the plaintext, right box holds the ciphertext, transformation
 * strip in the middle visually carries the bytes across.
 *
 * this commit lays the layout shell — three sharp-edged boxes side by
 * side on desktop, stacked on mobile. boxes hold placeholder content
 * for now; subsequent commits add the glow animation on the strip,
 * the reactive plaintext input, and the real aes-gcm encryption that
 * drives the ciphertext side.
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
  return (
    <div
      class="border-y md:border-y md:border-x-0 border-x md:border-l md:border-r border-border-hot bg-teal-deep flex items-center justify-center px-6 md:px-8 py-4 md:py-0 min-h-16"
      aria-hidden="true"
    >
      <span class="text-teal-bright text-14 font-mono whitespace-nowrap">
        encrypting
      </span>
    </div>
  )
}
