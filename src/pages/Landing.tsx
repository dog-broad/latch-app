import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Header } from '@/components/Header'
import { RoomInput } from '@/components/RoomInput'
import { HeroDemo } from '@/components/HeroDemo'
import { QrScan } from '@/components/QrScan'
import {
  listRememberedRooms,
  recoverPassphrase,
  touchRoom,
  type RememberedRoom,
} from '@/state/remembered-rooms'
import { deriveRoomSalt } from '@/crypto/salt'
import { deriveRoomKey } from '@/crypto/client'
import { setCurrentRoom } from '@/state/room'

/**
 * the entry route. headline, room input, manifesto, the encryption
 * demo, a closing paragraph, and four anchor links to the longer-form
 * pages. single column from 320 px up; container caps at 680 px so
 * the prose stays comfortable on wide screens.
 */
export function Landing() {
  const { route } = useLocation()
  const [rooms, setRooms] = useState<RememberedRoom[]>([])
  const [resuming, setResuming] = useState<string | null>(null)

  useEffect(() => {
    void listRememberedRooms().then(setRooms)
  }, [])

  async function resume(room: RememberedRoom) {
    if (resuming) return
    setResuming(room.roomPath)
    try {
      const passphrase = await recoverPassphrase(room.roomPath)
      if (!passphrase) throw new Error('stored passphrase missing')
      const salt = await deriveRoomSalt(room.name)
      const { keyId, roomPath } = await deriveRoomKey(passphrase, salt)
      void touchRoom(roomPath)
      setCurrentRoom({ name: room.name, keyId, roomPath, passphrase })
      route('/latched')
    } catch (err) {
      console.error('resume failed:', err)
    } finally {
      setResuming(null)
    }
  }

  function joinFromScan(text: string) {
    const slash = text.indexOf('/')
    if (slash < 0) return
    const r = text.slice(0, slash).trim()
    const p = text.slice(slash + 1).trim()
    if (!r || !p) return
    void (async () => {
      const salt = await deriveRoomSalt(r)
      const { keyId, roomPath } = await deriveRoomKey(p, salt)
      setCurrentRoom({ name: r, keyId, roomPath, passphrase: p })
      route('/latched')
    })()
  }

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

        {rooms.length > 0 && (
          <div class="mt-8">
            <p class="text-fg-muted text-12 mb-2">remembered on this device</p>
            <ul class="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <li key={r.roomPath}>
                  <button
                    type="button"
                    onClick={() => void resume(r)}
                    disabled={resuming !== null}
                    class="text-14 font-mono px-3 py-1 border border-border rounded text-fg hover:text-teal-bright hover:border-border-hot transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div class="mt-6">
          <QrScan onScan={joinFromScan} />
        </div>

        <hr class="border-0 border-t border-border my-16" />

        <p class="text-fg-muted text-14 mb-6">see for yourself</p>
        <HeroDemo />

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
