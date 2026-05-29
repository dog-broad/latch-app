import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { listRememberedRooms, recoverPassphrase, touchRoom, type RememberedRoom } from '@/state/remembered-rooms'
import { setCurrentRoom } from '@/state/room'
import { deriveRoomSalt } from '@/crypto/salt'
import { deriveRoomKey } from '@/crypto/client'

/**
 * dropdown over the latched header that lists every "stay latched"
 * room and lets the user swap to one. click triggers the
 * decrypt-passphrase → re-derive → set-room → navigate flow with the
 * same crypto path room-input uses. closes on outside click or after
 * a swap.
 */
export function RoomSwitcher({ currentRoomPath }: { currentRoomPath: string }) {
  const [open, setOpen] = useState(false)
  const [rooms, setRooms] = useState<RememberedRoom[]>([])
  const [swapping, setSwapping] = useState<string | null>(null)
  const { route } = useLocation()

  useEffect(() => {
    if (!open) return
    void listRememberedRooms().then(setRooms)
    function close(e: MouseEvent) {
      const target = e.target as Element | null
      if (target && !target.closest('[data-room-switcher]')) setOpen(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  async function swapTo(room: RememberedRoom) {
    if (swapping) return
    setSwapping(room.roomPath)
    try {
      const passphrase = await recoverPassphrase(room.roomPath)
      if (!passphrase) throw new Error('stored passphrase missing')
      const salt = await deriveRoomSalt(room.name)
      const { keyId, roomPath } = await deriveRoomKey(passphrase, salt)
      void touchRoom(roomPath)
      setCurrentRoom({ name: room.name, keyId, roomPath, passphrase })
      setOpen(false)
      // hard-navigate via assign so the latched view re-mounts with the new state
      route('/latched')
    } catch (err) {
      console.error('failed to swap room:', err)
    } finally {
      setSwapping(null)
    }
  }

  return (
    <div data-room-switcher class="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        class="text-12 text-fg-muted hover:text-teal-bright transition-colors font-mono"
      >
        [ rooms ]
      </button>
      {open && (
        <div
          role="menu"
          class="absolute right-0 top-full mt-2 min-w-48 max-h-80 overflow-y-auto bg-bg-lifted border border-border rounded shadow z-10"
        >
          {rooms.length === 0 ? (
            <p class="px-3 py-2 text-fg-faint text-12">no remembered rooms</p>
          ) : (
            <ul class="py-1">
              {rooms.map((r) => (
                <li key={r.roomPath}>
                  <button
                    type="button"
                    onClick={() => swapTo(r)}
                    disabled={r.roomPath === currentRoomPath || swapping !== null}
                    class="block w-full text-left px-3 py-1.5 text-14 font-mono hover:bg-bg-sunk disabled:opacity-50 disabled:cursor-not-allowed text-fg"
                    aria-current={r.roomPath === currentRoomPath ? 'true' : undefined}
                  >
                    {r.name}
                    {r.roomPath === currentRoomPath && (
                      <span class="ml-2 text-fg-faint text-12">· current</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
