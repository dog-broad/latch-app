import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Header } from '@/components/Header'
import { getCurrentRoom } from '@/state/room'
import { useRoomClips, type Clip } from '@/hooks/useRoomClips'
import { encryptForRoom } from '@/crypto/client'
import { publishClipToRoom } from '@/firebase/clips'
import { highlightCode } from '@/clip/highlight'

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
  const { keyId, roomPath, name } = room

  const clips = useRoomClips(keyId, roomPath)
  const newest = clips[0]
  const earlier = clips.slice(1)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      const plaintext = new TextEncoder().encode(text)
      const payload = await encryptForRoom(keyId, plaintext)
      await publishClipToRoom(roomPath, payload)
      setDraft('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'failed to send')
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    void send()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  const canSend = draft.trim().length > 0 && !sending

  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header room={name} />
      <main class="flex-1 max-w-shell mx-auto w-full px-4 py-8 md:px-6 md:py-12">
        <article class="border border-border bg-bg-lifted rounded p-6 md:p-8">
          <header class="flex items-center justify-between text-fg-muted text-12">
            <span>latched · {name}</span>
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

        <form class="mt-12" onSubmit={handleSubmit}>
          <div class="border border-border rounded bg-bg-sunk">
            <textarea
              placeholder="paste · drop · type · ⌘↵ to send"
              aria-label="new clip"
              rows={4}
              spellcheck={false}
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              class="w-full bg-transparent text-fg text-14 placeholder:text-fg-faint p-4 outline-none focus:ring-2 focus:ring-teal-mid focus:ring-inset resize-none disabled:opacity-50"
            />
            <div class="flex items-center justify-between border-t border-border px-4 py-2">
              <span class="text-fg-muted text-12" role={sendError ? 'alert' : undefined}>
                {sendError ?? ''}
              </span>
              <button
                type="submit"
                disabled={!canSend}
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
      <ClipBody clip={clip} />
      <div class="mt-6 flex items-center gap-3 text-fg-muted text-12">
        <span aria-hidden="true">────</span>
        <span>{clip.kind.type}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTime(clip.ts)}</span>
      </div>
    </>
  )
}

function ClipBody({ clip }: { clip: Clip }) {
  if (clip.kind.type === 'url') {
    return <UrlBody href={clip.kind.href} text={clip.text} />
  }
  if (clip.kind.type === 'json') {
    return (
      <pre class="text-fg text-14 whitespace-pre-wrap break-words font-mono">
        {clip.kind.pretty}
      </pre>
    )
  }
  if (clip.kind.type === 'code') {
    return <CodeBlock code={clip.text} language={clip.kind.language} />
  }
  return (
    <pre class="text-fg text-14 whitespace-pre-wrap break-words font-mono">{clip.text}</pre>
  )
}

function UrlBody({ href, text }: { href: string; text: string }) {
  // hostname extracted client-side — no outbound fetch for favicon
  // or title, since that'd contradict the trust contract's
  // exactly-two-outbound-categories rule.
  let hostname: string
  try {
    hostname = new URL(href).hostname
  } catch {
    hostname = ''
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      class="block group transition-colors"
    >
      {hostname && (
        <span class="block text-fg-faint text-12 font-mono mb-1 group-hover:text-teal-bright transition-colors">
          {hostname}
        </span>
      )}
      <span class="block text-teal-bright text-14 font-mono break-all group-hover:text-teal-mid transition-colors">
        {text}
      </span>
    </a>
  )
}

function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await highlightCode(code, language)
        if (!cancelled) setHtml(result)
      } catch {
        // shiki failed or chunk fetch died; raw <pre> fallback keeps rendering
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (!html) {
    return (
      <pre class="text-fg text-14 whitespace-pre-wrap break-words font-mono">{code}</pre>
    )
  }
  return (
    <div
      class="shiki-host text-14 font-mono"
      // shiki's html is a sanitized <pre><code>...</code></pre> tree —
      // it does not include any user-controlled attributes that could
      // execute scripts, and the input it formats is already trusted
      // plaintext from the decrypt path.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function EarlierClip({ clip }: { clip: Clip }) {
  return (
    <li class="flex items-baseline gap-3 text-14">
      <span class="text-fg-muted text-12 shrink-0">{formatTime(clip.ts)}</span>
      <span class="text-fg-faint text-12 shrink-0 w-12 truncate">{clip.kind.type}</span>
      <span class="text-fg truncate font-mono">{clip.text}</span>
    </li>
  )
}
