import { Header } from '@/components/Header'

export function Privacy() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold leading-tight">privacy</h1>

        <ul class="mt-8 space-y-4 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>no analytics. no telemetry. no error reporting service.</li>
          <li>
            anonymous auth only. firebase issues a uid per browser tab; latch
            never asks who you are.
          </li>
          <li>
            the room name is hashed before it leaves your browser. firebase
            sees{' '}
            <span class="font-mono text-fg-muted text-14">sha-256("latch-room-salt-v1:" + roomName)[:16]</span>,
            not the name.
          </li>
          <li>
            clips and files are end-to-end encrypted with aes-gcm-256. firebase
            carries ciphertext; latch's operator can't read it either.
          </li>
          <li>
            "stay latched" stores your passphrase locally in indexeddb,
            encrypted with a non-extractable device-local key. anyone with
            access to your browser profile can re-derive the room key — that's
            the trade for not retyping.
          </li>
          <li>
            the page touches exactly two outbound connection categories: firebase
            (the five hosts enumerated on{' '}
            <a href="/trust" class="text-teal-bright hover:text-teal-mid underline underline-offset-4 transition-colors">trust</a>
            ) and the cdn serving this page. nothing else.
          </li>
        </ul>

        <p class="mt-8 text-fg text-16 leading-normal">
          if any of this changes, the page will say so before it ships, not
          after.
        </p>

        <p class="mt-12 text-fg-muted text-14">
          <a href="/trust" class="text-teal-bright hover:text-teal-mid underline underline-offset-4 transition-colors">
            trust →
          </a>{' '}
          covers the threat model in full.
        </p>
      </main>
    </div>
  )
}
