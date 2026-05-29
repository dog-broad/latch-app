import { useState, useEffect, useRef } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { deriveRoomKey } from '@/crypto/client'
import { deriveRoomSalt } from '@/crypto/salt'
import { setCurrentRoom } from '@/state/room'

/**
 * landing-page room input. starts as a single field with placeholder
 * "pick a room ↵". on enter the input parses what was typed:
 *
 *   - `room/passphrase` shorthand → split on the first `/`, derive
 *     immediately, navigate to /latched.
 *   - bare `room` → expand to a second field for the passphrase, focus
 *     it, wait for a second enter.
 *
 * salt is derived deterministically from the room name — same room
 * name across devices means the same argon2id input, the same
 * derived key, and the same firebase path. no out-of-band exchange
 * needed for two browsers to land in the same room. the worker
 * still does argon2id + hkdf; this component only feeds the inputs.
 *
 * once the derive resolves, the room handle (keyId + roomPath) lands
 * in the tab-scoped room state and the router routes to /latched. the
 * raw passphrase is dropped at that point — it lives only in memory
 * for the duration of the derive call.
 */

const inputClass =
  'w-full bg-bg-sunk text-fg text-16 placeholder:text-fg-faint border border-border rounded px-4 py-3 outline-none focus:border-border-hot focus:ring-2 focus:ring-teal-mid focus:ring-offset-2 focus:ring-offset-bg transition-colors disabled:opacity-50'

export function RoomInput() {
  const { route } = useLocation()
  const [name, setName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passphraseRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expanded) passphraseRef.current?.focus()
  }, [expanded])

  async function join(roomName: string, passphraseText: string): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const salt = await deriveRoomSalt(roomName)
      const { keyId, roomPath } = await deriveRoomKey(passphraseText, salt)
      setCurrentRoom({ name: roomName, keyId, roomPath, passphrase: passphraseText })
      route('/latched')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join room')
      setSubmitting(false)
    }
  }

  function handleSubmit(e: Event): void {
    e.preventDefault()
    if (submitting) return

    if (!expanded) {
      const trimmed = name.trim()
      if (!trimmed) return
      const slashIdx = trimmed.indexOf('/')
      if (slashIdx >= 0) {
        const r = trimmed.slice(0, slashIdx).trim()
        const p = trimmed.slice(slashIdx + 1).trim()
        if (r && p) {
          void join(r, p)
          return
        }
        // `name/` or `/passphrase` — keep whichever side has content as the name
        setName(r || p)
      }
      setExpanded(true)
      return
    }

    const r = name.trim()
    const p = passphrase.trim()
    if (!r || !p) return
    void join(r, p)
  }

  return (
    <form onSubmit={handleSubmit} class="flex flex-col gap-2" noValidate>
      <input
        type="text"
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
        placeholder={expanded ? 'room' : 'pick a room ↵'}
        aria-label="room name"
        autoComplete="off"
        spellcheck={false}
        disabled={submitting}
        class={inputClass}
      />
      {expanded && (
        <input
          ref={passphraseRef}
          type="password"
          value={passphrase}
          onInput={(e) => setPassphrase(e.currentTarget.value)}
          placeholder="passphrase ↵"
          aria-label="passphrase"
          autoComplete="off"
          disabled={submitting}
          class={inputClass}
        />
      )}
      {/* invisible default submit button — html only implicitly submits
          on Enter when a form has exactly one text input OR a default
          button. once the passphrase field expands we have two inputs,
          so this restores Enter-to-submit without changing the visual. */}
      <button
        type="submit"
        tabIndex={-1}
        aria-hidden="true"
        class="sr-only"
      >
        join
      </button>
      {error !== null && (
        <p class="text-error text-12 mt-1" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
