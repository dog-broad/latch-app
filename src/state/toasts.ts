/**
 * transient notification queue. a module-level singleton in the same
 * shape as the other app-wide stores (room, device-key, auto-toggles):
 * direct function calls, no context provider. that lets any code path
 * raise a toast — including catch blocks that aren't inside a component
 * (a failed publish, a persistence error) — and a single <Toaster/>
 * mounted at the app root renders them.
 *
 * the store owns the auto-dismiss timers so the timing is testable
 * without a rendered component. ids come from a monotonic counter (no
 * Date.now()/Math.random(), which the build environment forbids).
 */
export type ToastKind = 'success' | 'error' | 'info'

export type Toast = {
  readonly id: number
  readonly kind: ToastKind
  readonly message: string
}

const DEFAULT_DURATION_MS = 3200
// a burst (e.g. several auto-actions failing) shouldn't fill the screen.
// oldest beyond the cap is evicted.
const MAX_TOASTS = 4

let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<(toasts: readonly Toast[]) => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const listener of listeners) listener(toasts)
}

function clearTimer(id: number): void {
  const t = timers.get(id)
  if (t !== undefined) {
    clearTimeout(t)
    timers.delete(id)
  }
}

export function getToasts(): readonly Toast[] {
  return toasts
}

export function subscribe(listener: (toasts: readonly Toast[]) => void): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}

export function pushToast(
  kind: ToastKind,
  message: string,
  durationMs: number = DEFAULT_DURATION_MS,
): number {
  const id = nextId++
  let next = [...toasts, { id, kind, message }]
  while (next.length > MAX_TOASTS) {
    const evicted = next[0]
    if (evicted) clearTimer(evicted.id)
    next = next.slice(1)
  }
  toasts = next
  emit()
  if (durationMs > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), durationMs),
    )
  }
  return id
}

export function dismissToast(id: number): void {
  clearTimer(id)
  const next = toasts.filter((t) => t.id !== id)
  if (next.length !== toasts.length) {
    toasts = next
    emit()
  }
}
