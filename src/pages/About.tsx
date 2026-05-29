import { Header } from '@/components/Header'

export function About() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold leading-tight">what latch is</h1>

        <p class="mt-8 text-fg text-16 leading-normal">
          latch is a clipboard that crosses devices. two browsers join a room with
          a shared passphrase; content moves between them, end-to-end encrypted
          in the browser. firebase carries the ciphertext but can't read it.
        </p>

        <p class="mt-6 text-fg text-16 leading-normal">
          it was built for one specific frustration. corporate networks block
          almost everything — dynamic-dns, newly-registered domains, anything
          uncategorized. zscaler, netskope, cloudflare gateway all default-deny.
          your work laptop won't talk to your personal one. you end up emailing
          yourself, or pasting through a chat that captures everything you copy,
          or just retyping.
        </p>

        <p class="mt-6 text-fg text-16 leading-normal">
          latch rides google's domain reputation. <span class="font-mono text-fg-muted">*.firebaseio.com</span>{' '}
          and <span class="font-mono text-fg-muted">*.googleapis.com</span> stay
          reachable on every locked-down network because too much enterprise
          software depends on them — gmail, drive, calendar, third-party sso.
          latch borrows that reachability without trusting firebase with your
          content.
        </p>

        <p class="mt-6 text-fg text-16 leading-normal">
          the encryption happens entirely in your browser. argon2id derives a
          key from your passphrase; aes-gcm-256 encrypts each clip with a fresh
          random iv. the room name is hashed before it ever hits firebase, so
          the server can't enumerate "what rooms exist." anonymous auth rotates
          uids per tab so firebase can't link your devices.
        </p>

        <p class="mt-6 text-fg text-16 leading-normal">
          it's open source from commit one, mit licensed, and reproducibly
          built. every release publishes the sha256 of the deployed{' '}
          <span class="font-mono text-fg-muted">index.html</span> — clone the
          repo, run the build, hash the output, compare. if they don't match,
          don't trust the deployed page.
        </p>

        <p class="mt-6 text-fg text-16 leading-normal">
          text, code with syntax highlighting, urls, json, and files up to 10
          mb all work. file chunks live encrypted in firestore; the rtdb
          metadata carries an opaque path so the server doesn't see filenames
          either.
        </p>

        <p class="mt-12 text-fg-muted text-14">
          <a href="/trust" class="text-teal-bright hover:text-teal-mid transition-colors">
            trust →
          </a>{' '}
          goes into what firebase sees vs. doesn't, the threat model in detail.
        </p>
      </main>
    </div>
  )
}
