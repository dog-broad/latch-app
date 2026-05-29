import { Header } from '@/components/Header'

/** stub. release notes + reproducible-build sha256s land at the
 *  first tagged release in polish. */
export function Changelog() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold">changelog</h1>
        <p class="mt-4 text-fg-muted text-14">no releases yet.</p>
      </main>
    </div>
  )
}
