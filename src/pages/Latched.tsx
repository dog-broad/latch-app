import { useEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Header } from '@/components/Header'
import { getCurrentRoom } from '@/state/room'
import { useRoomClips, type Clip, type FileClip as FileClipType, type TextClip } from '@/hooks/useRoomClips'
import { encryptForRoom } from '@/crypto/client'
import { publishClipToRoom, publishFileClipToRoom } from '@/firebase/clips'
import { highlightCode } from '@/clip/highlight'
import { canFormat, formatCode } from '@/clip/format'
import {
  uploadFileClip,
  downloadFileChunks,
  MAX_FILE_BYTES,
  type UploadProgress,
} from '@/clip/file-pipeline'
import { startClipboardWatch } from '@/clip/clipboard-watch'
import { startClipboardPaste } from '@/clip/clipboard-paste'
import { getToggles, setToggles, type AutoToggles } from '@/state/auto-toggles'
import {
  rememberRoom,
  forgetRoom,
  isRemembered,
  touchRoom,
} from '@/state/remembered-rooms'
import { RoomSwitcher } from '@/components/RoomSwitcher'
import { QrShow } from '@/components/QrShow'

function formatTime(ts: number): string {
  const ageMs = Date.now() - ts
  if (ageMs < 60_000) return 'just now'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function Latched() {
  const { route } = useLocation()
  const room = getCurrentRoom()

  useEffect(() => {
    if (!room) route('/')
  }, [room, route])

  if (!room) return null
  const { keyId, roomPath, name, passphrase } = room

  const clips = useRoomClips(keyId, roomPath)
  const newest = clips[0]
  const earlier = clips.slice(1)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [upload, setUpload] = useState<UploadProgress | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toggles, setLocalToggles] = useState<AutoToggles>(() => getToggles(roomPath))
  const [stayLatched, setStayLatched] = useState(false)
  const recentlySeenRef = useRef<Set<string>>(new Set())

  // hydrate "stay latched" status on mount + refresh lastSeenAt if remembered
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const remembered = await isRemembered(roomPath)
      if (cancelled) return
      setStayLatched(remembered)
      if (remembered) void touchRoom(roomPath)
    })()
    return () => {
      cancelled = true
    }
  }, [roomPath])

  async function flipStayLatched() {
    const next = !stayLatched
    setStayLatched(next)
    try {
      if (next) await rememberRoom(roomPath, name, passphrase)
      else await forgetRoom(roomPath)
    } catch (err) {
      console.error('stay-latched persistence failed:', err)
      setStayLatched(!next) // revert on error
    }
  }

  function markRecentlySeen(text: string): void {
    recentlySeenRef.current.add(text)
    window.setTimeout(() => recentlySeenRef.current.delete(text), 10_000)
  }

  // remember every text clip that arrives so auto-watch doesn't echo
  // it back at the OS clipboard layer (or vice versa for auto-copy).
  useEffect(() => {
    for (const c of clips) {
      if (c.type === 'text') markRecentlySeen(c.text.trim())
    }
  }, [clips])

  useEffect(() => {
    if (!toggles.autoWatch) return
    return startClipboardWatch(roomPath, keyId, (t) => recentlySeenRef.current.has(t))
  }, [toggles.autoWatch, keyId, roomPath])

  useEffect(() => {
    if (!toggles.autoCopy) return
    return startClipboardPaste(
      () => {
        const latest = clips.find((c): c is TextClip => c.type === 'text')
        return latest?.text ?? null
      },
      markRecentlySeen,
    )
  }, [toggles.autoCopy, clips])

  function flipToggle(key: keyof AutoToggles): void {
    const next: AutoToggles = { ...toggles, [key]: !toggles[key] }
    setLocalToggles(next)
    setToggles(roomPath, next)
  }

  async function sendText() {
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

  async function sendFile(file: File) {
    if (sending) return
    if (file.size > MAX_FILE_BYTES) {
      setSendError(`file too large — ${formatSize(file.size)} exceeds the ${formatSize(MAX_FILE_BYTES)} cap`)
      return
    }
    setSending(true)
    setSendError(null)
    setUpload({
      chunksUploaded: 0,
      chunkCount: Math.max(1, Math.ceil(file.size / (1024 * 1024))),
      bytesUploaded: 0,
      bytesTotal: file.size,
    })
    try {
      const meta = await uploadFileClip(roomPath, keyId, file, (p) => setUpload(p))
      await publishFileClipToRoom(roomPath, {
        id: meta.fileId,
        encryptedName: meta.encryptedName,
        encryptedMime: meta.encryptedMime,
        size: meta.size,
        chunkCount: meta.chunkCount,
        chunkPathPrefix: meta.chunkPathPrefix,
        manifest: meta.manifest,
      })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'failed to send file')
    } finally {
      setSending(false)
      setUpload(null)
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    void sendText()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void sendText()
    }
  }

  function handleFilePick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]
    if (f) void sendFile(f)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) void sendFile(f)
  }

  const canSend = draft.trim().length > 0 && !sending

  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header room={name} />
      <main class="flex-1 max-w-shell mx-auto w-full px-4 py-8 md:px-6 md:py-12">
        <article class="border border-border bg-bg-lifted rounded p-6 md:p-8">
          <header class="flex flex-wrap items-center justify-between text-fg-muted text-12 gap-3">
            <span class="truncate">latched · {name}</span>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <AutoToggle
                enabled={toggles.autoWatch}
                onClick={() => flipToggle('autoWatch')}
                label="auto-watch"
                tooltip="poll your clipboard and auto-send new copies to the room. needs clipboard read permission."
              />
              <AutoToggle
                enabled={toggles.autoCopy}
                onClick={() => flipToggle('autoCopy')}
                label="auto-copy"
                tooltip="write the newest clip to your clipboard when this tab regains focus. needs clipboard write permission."
              />
              <AutoToggle
                enabled={stayLatched}
                onClick={() => void flipStayLatched()}
                label="stay latched"
                tooltip="remember this room on this device. the passphrase is encrypted with a device-local key before it lands in indexeddb."
              />
            </div>
          </header>
          <div class="mt-3 flex items-center justify-end gap-4">
            <QrShow roomName={name} passphrase={passphrase} />
            <RoomSwitcher currentRoomPath={roomPath} />
          </div>
          <div class="mt-8 md:mt-12 min-h-[6rem]">
            {newest ? <HeroClip clip={newest} keyId={keyId} /> : <EmptyState />}
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

        <form
          class="mt-12"
          onSubmit={handleSubmit}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            class={`border rounded bg-bg-sunk transition-colors ${
              dragOver ? 'border-teal-mid' : 'border-border'
            }`}
          >
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
            {upload && (
              <div class="px-4 pb-3" aria-live="polite">
                <div class="text-fg-muted text-12 mb-1">
                  uploading · {upload.chunksUploaded} / {upload.chunkCount} chunks ·{' '}
                  {formatSize(upload.bytesUploaded)} / {formatSize(upload.bytesTotal)}
                </div>
                <div class="h-1 bg-bg-lifted rounded overflow-hidden">
                  <div
                    class="h-full bg-teal-mid transition-all"
                    style={{
                      width: `${upload.bytesTotal > 0 ? (upload.bytesUploaded / upload.bytesTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div class="flex items-center justify-between border-t border-border px-4 py-2 gap-3">
              <span class="text-fg-muted text-12 flex-1 truncate" role={sendError ? 'alert' : undefined}>
                {sendError ?? ''}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label="attach file"
                class="text-fg-muted text-14 font-mono hover:text-teal-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                [ attach ]
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFilePick}
                class="hidden"
                aria-hidden="true"
              />
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

function AutoToggle({
  enabled,
  onClick,
  label,
  tooltip,
}: {
  enabled: boolean
  onClick: () => void
  label: string
  tooltip: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={`${label} ${enabled ? 'on' : 'off'}`}
      aria-pressed={enabled}
      class={`font-mono transition-colors ${
        enabled ? 'text-teal-bright' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label} {enabled ? '●' : '◯'}
    </button>
  )
}

function HeroClip({ clip, keyId }: { clip: Clip; keyId: number }) {
  if (clip.type === 'file') {
    return <HeroFileClip clip={clip} keyId={keyId} />
  }
  return <HeroTextClip clip={clip} />
}

function HeroTextClip({ clip }: { clip: TextClip }) {
  return (
    <>
      <TextClipBody clip={clip} />
      <div class="mt-6 flex items-center gap-3 text-fg-muted text-12">
        <span aria-hidden="true">────</span>
        <span>{clip.kind.type}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTime(clip.ts)}</span>
      </div>
    </>
  )
}

function HeroFileClip({ clip, keyId }: { clip: FileClipType; keyId: number }) {
  const isImage = clip.mime.startsWith('image/')
  return (
    <>
      {isImage ? (
        <ImagePreview clip={clip} keyId={keyId} />
      ) : (
        <DownloadButton clip={clip} keyId={keyId} />
      )}
      <div class="mt-6 flex items-center gap-3 text-fg-muted text-12">
        <span aria-hidden="true">────</span>
        <span>file · {clip.name}</span>
        <span aria-hidden="true">·</span>
        <span>{formatSize(clip.size)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTime(clip.ts)}</span>
      </div>
    </>
  )
}

function ImagePreview({ clip, keyId }: { clip: FileClipType; keyId: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let revokeUrl: string | null = null
    void (async () => {
      try {
        const bytes = await downloadFileChunks(clip.meta, keyId)
        if (cancelled) return
        const blob = new Blob([new Uint8Array(bytes)], { type: clip.mime })
        const objectUrl = URL.createObjectURL(blob)
        revokeUrl = objectUrl
        setUrl(objectUrl)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'image fetch failed')
      }
    })()
    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [clip.meta, keyId, clip.mime])

  if (error) {
    return <p class="text-error text-14">image: {error}</p>
  }
  if (!url) {
    return <p class="text-fg-faint text-14">decrypting image…</p>
  }
  return (
    <img
      src={url}
      alt={clip.name}
      class="max-w-full max-h-96 rounded border border-border"
    />
  )
}

function DownloadButton({ clip, keyId }: { clip: FileClipType; keyId: number }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    if (downloading) return
    setDownloading(true)
    setError(null)
    try {
      const bytes = await downloadFileChunks(clip.meta, keyId)
      const blob = new Blob([new Uint8Array(bytes)], { type: clip.mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = clip.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <div class="text-fg text-14 font-mono break-all">{clip.name}</div>
      <div class="mt-2 text-fg-muted text-12">{clip.mime || 'unknown type'}</div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        class="mt-4 bg-teal-mid text-bg text-14 font-medium px-4 py-2 rounded hover:bg-teal-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-mid"
      >
        {downloading ? 'downloading…' : 'download'}
      </button>
      {error !== null && (
        <p class="mt-2 text-error text-12" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function TextClipBody({ clip }: { clip: TextClip }) {
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
  const [displayed, setDisplayed] = useState(code)
  const [html, setHtml] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)
  const formattable = canFormat(language)

  useEffect(() => {
    setDisplayed(code)
  }, [code])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await highlightCode(displayed, language)
        if (!cancelled) setHtml(result)
      } catch {
        // shiki failed or chunk fetch died; raw <pre> fallback keeps rendering
      }
    })()
    return () => {
      cancelled = true
    }
  }, [displayed, language])

  async function onFormat() {
    if (!formattable || language === null || formatting) return
    setFormatting(true)
    try {
      const next = await formatCode(displayed, language)
      setDisplayed(next.replace(/\n+$/, ''))
    } catch (err) {
      console.error('format failed:', err)
    } finally {
      setFormatting(false)
    }
  }

  const tooltip = formattable
    ? formatting
      ? 'formatting…'
      : 'format with prettier'
    : `no formatter for ${language ?? 'unknown'}`

  return (
    <div>
      {html ? (
        <div
          class="shiki-host text-14 font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre class="text-fg text-14 whitespace-pre-wrap break-words font-mono">
          {displayed}
        </pre>
      )}
      <button
        type="button"
        onClick={onFormat}
        disabled={!formattable || formatting}
        title={tooltip}
        aria-label={tooltip}
        class="mt-3 text-12 text-fg-muted font-mono hover:text-teal-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-fg-muted"
      >
        [ {formatting ? 'formatting…' : 'format'} ]
      </button>
    </div>
  )
}

function EarlierClip({ clip }: { clip: Clip }) {
  const summary = clip.type === 'file' ? `${clip.name} · ${formatSize(clip.size)}` : clip.text
  const badge = clip.type === 'file' ? 'file' : clip.kind.type
  return (
    <li class="flex items-baseline gap-3 text-14">
      <span class="text-fg-muted text-12 shrink-0">{formatTime(clip.ts)}</span>
      <span class="text-fg-faint text-12 shrink-0 w-12 truncate">{badge}</span>
      <span class="text-fg truncate font-mono">{summary}</span>
    </li>
  )
}
