import { Header } from '@/components/Header'

/**
 * stub. the hero-newest-item layout, the last-10 list, and the
 * composer all land in subsequent commits — this placeholder just
 * proves the route exists and the post-derive navigation has
 * somewhere to land.
 */
export function Latched() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-shell mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold">latched</h1>
        <p class="mt-4 text-fg-muted text-14">app shell lands separately.</p>
      </main>
    </div>
  )
}
