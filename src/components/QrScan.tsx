import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * camera-based QR scanner. uses the native BarcodeDetector api on
 * chromium and webkit; falls back to jsqr (~30 KB gz) elsewhere.
 * both paths are dynamic-imported so the landing-page bundle never
 * pays. on a successful scan, hands the decoded string to onScan
 * — the parent wires that into the room-input parser, which already
 * speaks "room/passphrase" shorthand.
 */

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

export function QrScan({ onScan }: { onScan: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!open || !videoRef.current) return
    const video = videoRef.current
    let cancelled = false
    let stream: MediaStream | null = null
    let raf = 0

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) return
        video.srcObject = stream
        await video.play()
        const detect = await pickDetector()
        const scan = async () => {
          if (cancelled) return
          if (video.readyState >= 2) {
            try {
              const codes = await detect(video)
              const first = codes[0]
              if (first && first.rawValue) {
                onScan(first.rawValue)
                setOpen(false)
                return
              }
            } catch {
              // intermittent detection failures are fine; loop continues
            }
          }
          raf = requestAnimationFrame(() => void scan())
        }
        void scan()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'camera not available')
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open, onScan])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        class="text-12 text-fg-muted hover:text-teal-bright transition-colors font-mono"
      >
        [ scan qr ]
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          class="fixed inset-0 bg-bg/90 flex items-center justify-center z-50 px-4"
        >
          <div class="bg-bg-lifted border border-border rounded p-4 max-w-md w-full">
            <h2 class="text-fg text-14 font-bold mb-2 text-center">point at a latch qr</h2>
            <div class="aspect-square bg-bg-sunk border border-border overflow-hidden rounded">
              <video
                ref={videoRef}
                class="w-full h-full object-cover"
                muted
                playsInline
                aria-label="qr scanner viewport"
              />
            </div>
            {error !== null && (
              <p class="mt-3 text-error text-12 text-center" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              class="mt-3 block mx-auto text-fg-muted text-12 hover:text-teal-bright transition-colors font-mono"
            >
              [ cancel ]
            </button>
          </div>
        </div>
      )}
    </>
  )
}

async function pickDetector(): Promise<(video: HTMLVideoElement) => Promise<{ rawValue: string }[]>> {
  const w = globalThis as unknown as { BarcodeDetector?: new (init: { formats: string[] }) => Detector }
  if (w.BarcodeDetector) {
    const detector = new w.BarcodeDetector({ formats: ['qr_code'] })
    return (video) => detector.detect(video)
  }
  const { default: jsQR } = await import('jsqr')
  return (video) => {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return Promise.resolve([])
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(image.data, image.width, image.height)
    return Promise.resolve(result ? [{ rawValue: result.data }] : [])
  }
}
