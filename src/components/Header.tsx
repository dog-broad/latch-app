import { InstallButton } from '@/components/InstallButton'

/**
 * top-of-page header. shared by every route. `◌ latch` lockup on the
 * left (the open-circle is the wordmark placeholder until the real
 * icon lands in polish), `src` and `trust` on the right.
 *
 * `src` points directly at the public repo rather than the `/source`
 * route — one click, no flash of "redirecting...".
 *
 * when a `room` is supplied, the lockup becomes `◌ latch · <room>` so
 * the user always sees which room they're in. only the latched view
 * passes this; landing and subpage stubs render the bare wordmark.
 */
export function Header({ room }: { room?: string }) {
  return (
    <header class="border-b border-border">
      <div class="max-w-shell mx-auto w-full px-4 py-3 md:px-6 flex items-center justify-between">
        <a
          href="/"
          class="flex items-center gap-2 text-fg text-16 hover:text-teal-bright transition-colors"
        >
          <span aria-hidden="true">◌</span>
          <span>
            latch
            {room !== undefined && (
              <>
                <span class="text-fg-muted"> · </span>
                {room}
              </>
            )}
          </span>
        </a>
        <nav class="flex items-center gap-4 text-12 text-fg-muted">
          <InstallButton />
          <a
            href="https://github.com/dog-broad/latch-app"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-teal-bright transition-colors"
          >
            src
          </a>
          <a href="/trust" class="hover:text-teal-bright transition-colors">
            trust
          </a>
        </nav>
      </div>
    </header>
  )
}
