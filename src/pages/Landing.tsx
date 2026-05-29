import { Header } from '@/components/Header'
import { RoomInput } from '@/components/RoomInput'
import { DemoSlot } from '@/components/DemoSlot'

/**
 * the entry route. headline, room input, manifesto, the encryption
 * demo, a closing paragraph, and four anchor links to the longer-form
 * pages. single column from 320 px up; container caps at 680 px so
 * the prose stays comfortable on wide screens.
 */
export function Landing() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-copy mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-48 md:text-56 lg:text-64 font-bold leading-tight">
          your clipboard.<br />
          both machines.<br />
          one room.
        </h1>

        <div class="mt-8 md:mt-12">
          <RoomInput />
        </div>

        <p class="mt-8 text-fg-muted text-14">
          end-to-end encrypted · open source · built for developers on locked-down networks
        </p>

        <hr class="border-0 border-t border-border my-16" />

        <p class="text-fg-muted text-14 mb-6">see for yourself</p>
        <DemoSlot />

        <hr class="border-0 border-t border-border my-16" />

        <p class="text-fg-muted text-16 leading-normal">
          built for developers whose work laptop won't talk to their personal one. clipboards shouldn't care about firewalls. latch doesn't.
        </p>

        <nav class="flex flex-wrap gap-x-6 gap-y-2 mt-12 text-fg-muted text-14">
          <a
            href="https://github.com/dog-broad/latch-app"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-teal-bright transition-colors"
          >
            audit ↗
          </a>
          <a href="/trust" class="hover:text-teal-bright transition-colors">
            threat model ↗
          </a>
          <a href="/privacy" class="hover:text-teal-bright transition-colors">
            privacy ↗
          </a>
          <a href="/changelog" class="hover:text-teal-bright transition-colors">
            changelog ↗
          </a>
        </nav>
      </main>
    </div>
  )
}
