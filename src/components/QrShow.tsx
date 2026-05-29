import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * generate a QR for `name/passphrase` (the same shorthand the room
 * input accepts) and show it inside an overlay. anything that scans
 * the qr — a phone's camera, the QrScan component on a second
 * device — drops the user straight into the same room.
 *
 * the qrcode lib is dynamic-imported so neither the qrcode generator
 * nor the canvas ever ships unless someone clicks [ show qr ].
 *
 * trust note: the qr carries the passphrase in plaintext. the
 * receiving device is meant to be a screen the user can see, so this
 * is the same trust model as showing a passphrase on screen — fine
 * for the personal-device use case.
 */
export function QrShow({ roomName, passphrase }: { roomName: string; passphrase: string }) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const canvas = canvasRef.current
    let cancelled = false
    void (async () => {
      try {
        const { toCanvas } = await import('qrcode')
        if (cancelled) return
        await toCanvas(canvas, `${roomName}/${passphrase}`, {
          width: 280,
          margin: 1,
          color: { dark: '#0a1014', light: '#e6e1cf' },
        })
      } catch (err) {
        console.error('qr generation failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, roomName, passphrase])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        class="text-12 text-fg-muted hover:text-teal-bright transition-colors font-mono"
      >
        [ show qr ]
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          class="fixed inset-0 bg-bg/90 flex items-center justify-center z-50 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div class="bg-bg-lifted border border-border rounded p-6 max-w-sm w-full text-center">
            <h2 class="text-fg text-16 font-bold mb-1">{roomName}</h2>
            <p class="text-fg-muted text-12 mb-4">
              scan from a second device to join without typing
            </p>
            <canvas ref={canvasRef} class="mx-auto bg-fg rounded" aria-label="room qr code" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              class="mt-4 text-fg-muted text-12 hover:text-teal-bright transition-colors font-mono"
            >
              [ close ]
            </button>
          </div>
        </div>
      )}
    </>
  )
}
