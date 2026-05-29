import { useEffect } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Header } from '@/components/Header'
import { getCurrentRoom } from '@/state/room'
import { useRoomClips, type Clip } from '@/hooks/useRoomClips'

function formatTime(ts: number): string {
  const ageMs = Date.now() - ts
  if (ageMs < 60_000) return 'just now'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/**
 * the app shell once a room is joined. structure follows the §6.2
 * mock: header with the room name, a hero card for the newest clip,
 * an "earlier" list of one-liners below, and a composer at the foot.
 *
 * clips arrive via useRoomClips, which lazy-loads firebase auth +
 * database the first time this view mounts. the composer is still
 * non-functional in this commit — the encrypt-then-publish pipeline
 * lands separately.
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

  const clips = useRoomClips(room.keyId, room.roomPath)
  const newest = clips[0]
  const earlier = clips.slice(1)

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
            {newest ? <HeroClip clip={newest} /> : <EmptyState />}
          </div>
        </article>

        {earlier.length > 0 && (
          <section class="mt-12">
            <h2 class="text-fg-muted text-12">earlier ────</h2>
            <ul class="mt-4 space-y-2">
              {earlier.map((c) => (
                <EarlierClip key={c.id} clip={c} />
              ))}
            </ul>
          </section>
        )}

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

function EmptyState() {
  return <p class="text-fg-faint text-14">no clips yet. paste anything.</p>
}

function HeroClip({ clip }: { clip: Clip }) {
  return (
    <>
      <pre class="text-fg text-14 whitespace-pre-wrap break-words font-mono">{clip.text}</pre>
      <div class="mt-6 flex items-center gap-3 text-fg-muted text-12">
        <span aria-hidden="true">────</span>
        <span>{formatTime(clip.ts)}</span>
      </div>
    </>
  )
}

function EarlierClip({ clip }: { clip: Clip }) {
  return (
    <li class="flex items-baseline gap-3 text-14">
      <span class="text-fg-muted text-12 shrink-0">{formatTime(clip.ts)}</span>
      <span class="text-fg truncate font-mono">{clip.text}</span>
    </li>
  )
}
