import { useEffect } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Header } from '@/components/Header'
import { getCurrentRoom } from '@/state/room'

/**
 * the app shell once a room is joined. structure follows the §6.2
 * mock: header with the room name, a hero card for the newest clip,
 * an "earlier" list of one-liners below, and a composer at the foot.
 *
 * this commit lays the surface. the hero card sits empty (the voice
 * sample "no clips yet. paste anything." occupies the body until
 * firebase subscriptions land). the earlier list is absent while
 * there's nothing to list. the composer renders a textarea + send
 * button but the submit pipeline (encrypt-then-write) lands in a
 * subsequent commit.
 *
 * unauthenticated landing: visiting /latched without a current room
 * routes back to / on mount.
 */
export function Latched() {
  const { route } = useLocation()
  const room = getCurrentRoom()

  useEffect(() => {
    if (!room) route('/')
  }, [room, route])

  if (!room) return null

  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header room={room.name} />
      <main class="flex-1 max-w-shell mx-auto w-full px-4 py-8 md:px-6 md:py-12">
        <article class="border border-border bg-bg-lifted rounded p-6 md:p-8">
          <header class="flex items-center justify-between text-fg-muted text-12">
            <span>latched · {room.name}</span>
            <span aria-label="auto-copy off">auto-copy ◯</span>
          </header>
          <div class="mt-8 md:mt-12 min-h-[6rem]">
            <p class="text-fg-faint text-14">no clips yet. paste anything.</p>
          </div>
        </article>

        <form class="mt-12" onSubmit={(e) => e.preventDefault()}>
          <div class="border border-border rounded bg-bg-sunk">
            <textarea
              placeholder="paste · drop · type · ⌘↵ to send"
              aria-label="new clip"
              rows={4}
              spellcheck={false}
              class="w-full bg-transparent text-fg text-14 placeholder:text-fg-faint p-4 outline-none focus:ring-2 focus:ring-teal-mid focus:ring-inset resize-none"
            />
            <div class="flex items-center justify-end border-t border-border px-4 py-2">
              <button
                type="submit"
                disabled
                aria-label="send clip"
                class="bg-teal-mid text-bg text-14 font-medium px-4 py-2 rounded hover:bg-teal-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-mid"
              >
                send
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
