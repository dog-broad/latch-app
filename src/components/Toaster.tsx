import { useToasts } from '@/hooks/useToasts'
import { dismissToast, type ToastKind } from '@/state/toasts'

/**
 * renders the toast queue bottom-anchored, centered. the container is
 * pointer-events-none so it never blocks the page; each toast re-enables
 * pointer events and is click-to-dismiss. auto-dismiss timing lives in
 * the store; this only animates entry (toast-in) — removal is instant,
 * which is also the reduced-motion behavior.
 *
 * type marker is a single mono glyph, not an icon set (per the visual
 * language — no vector icons).
 */
const KIND_STYLE: Record<ToastKind, string> = {
  success: 'border-success',
  error: 'border-error',
  info: 'border-border-hot',
}

const KIND_GLYPH: Record<ToastKind, string> = {
  success: '✓',
  error: '×',
  info: '·',
}

const KIND_GLYPH_COLOR: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-fg-muted',
}

export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div
      class="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          aria-label={`dismiss: ${t.message}`}
          class={`toast-in pointer-events-auto flex items-center gap-3 max-w-[26rem] border bg-bg-lifted rounded px-4 py-2 text-14 font-mono text-left ${KIND_STYLE[t.kind]}`}
        >
          <span class={KIND_GLYPH_COLOR[t.kind]} aria-hidden="true">
            {KIND_GLYPH[t.kind]}
          </span>
          <span class="text-fg break-words">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
