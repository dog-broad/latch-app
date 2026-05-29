import { Header } from '@/components/Header'

export function NotFound() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 flex items-center justify-center px-4">
        <div class="text-center">
          <p class="text-48 md:text-56 font-bold">404</p>
          <p class="mt-4 text-fg-muted text-14">that path doesn't exist.</p>
          <a
            href="/"
            class="inline-block mt-6 text-teal-mid text-14 hover:text-teal-bright transition-colors"
          >
            back to latch
          </a>
        </div>
      </main>
    </div>
  )
}
