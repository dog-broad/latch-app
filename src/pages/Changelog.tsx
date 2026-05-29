import { Header } from '@/components/Header'

export function Changelog() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold leading-tight">changelog</h1>

        <p class="mt-8 text-fg text-16 leading-normal">
          every tagged release publishes the sha256 of the deployed{' '}
          <span class="font-mono text-fg-muted text-14">dist/index.html</span>.
          clone the repo at the matching tag, run{' '}
          <span class="font-mono text-fg-muted text-14">pnpm install &amp;&amp; pnpm build</span>,
          hash the output, compare. if they don't match, don't trust the
          deployed page.
        </p>

        <p class="mt-12 text-fg-muted text-14">no releases yet.</p>
      </main>
    </div>
  )
}
