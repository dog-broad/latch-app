import { Header } from '@/components/Header'

/** stub. the real ~300-word copy lands in the polish phase. */
export function About() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold">about</h1>
        <p class="mt-4 text-fg-muted text-14">copy lands in polish.</p>
      </main>
    </div>
  )
}
