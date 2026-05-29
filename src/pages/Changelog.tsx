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
          <span class="font-mono text-fg-muted text-14">pnpm install --frozen-lockfile &amp;&amp; pnpm build &amp;&amp; pnpm hash</span>,
          compare the printed line with the entry below. if they
          don't match, don't trust the deployed page.
        </p>

        <p class="mt-4 text-fg-muted text-14">
          the same hash is in the{' '}
          <a
            href="https://github.com/dog-broad/latch-app/releases"
            target="_blank"
            rel="noopener noreferrer"
            class="text-teal-bright hover:text-teal-mid transition-colors"
          >
            github release notes ↗
          </a>{' '}
          for each tag.
        </p>

        <p class="mt-12 text-fg-muted text-14">no releases yet.</p>
      </main>
    </div>
  )
}
