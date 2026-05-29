import { Header } from '@/components/Header'

/** stub. the threat model in plain english lands in polish. */
export function Trust() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold">trust</h1>
        <p class="mt-4 text-fg-muted text-14">threat model lands in polish.</p>
      </main>
    </div>
  )
}
