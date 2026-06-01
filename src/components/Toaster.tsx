import { useToasts } from '@/hooks/useToasts'
import { dismissToast, type ToastKind } from '@/state/toasts'

/**
 * renders the toast queue top-anchored, centered — in the eye's first
 * scan path and clear of the composer. the container is
 * pointer-events-none so it never blocks the page; each toast re-enables
 * pointer events and is click-to-dismiss. auto-dismiss timing lives in
 * the store; this only animates entry (toast-in) — removal is instant,
 * which is also the reduced-motion behavior.
 *
 * the per-kind border / tint / glow live in app.css under `.toast-*`
 * (class-based, no inline styles — stays inside `style-src 'self'`).
 * type marker is a single mono glyph, not an icon set (per the visual
 * language — no vector icons).
 */
const KIND_CLASS: Record<ToastKind, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
}

const KIND_GLYPH: Record<ToastKind, string> = {
  success: '✓',
  error: '×',
  info: '·',
}

const KIND_GLYPH_COLOR: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-teal-bright',
}

export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div
      class="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          aria-label={`dismiss: ${t.message}`}
          class={`toast-in ${KIND_CLASS[t.kind]} pointer-events-auto flex items-center gap-3 max-w-[26rem] border-2 rounded px-4 py-3 text-14 font-medium font-mono text-left`}
        >
          <span class={`${KIND_GLYPH_COLOR[t.kind]} font-bold`} aria-hidden="true">
            {KIND_GLYPH[t.kind]}
          </span>
          <span class="text-fg break-words">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
