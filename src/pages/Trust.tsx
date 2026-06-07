import { Header } from '@/components/Header'

export function Trust() {
  return (
    <div class="min-h-screen flex flex-col bg-bg text-fg">
      <Header />
      <main class="flex-1 max-w-prose mx-auto w-full px-4 py-12 md:px-6 md:py-16">
        <h1 class="text-32 font-bold leading-tight">trust</h1>

        <p class="mt-8 text-fg text-16 leading-normal">
          latch's pitch is that the server can't read your content. this page
          is the long version of why, and the explicit edges where the claim
          stops being true.
        </p>

        <h2 class="mt-12 text-24 font-bold leading-tight">what firebase sees</h2>
        <ul class="mt-4 space-y-2 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>ciphertext blobs</li>
          <li>random per-message ivs</li>
          <li>the opaque 16-hex room path</li>
          <li>anonymous uids (per-tab, rotated)</li>
          <li>connection metadata: ip, browser fingerprint, write frequency</li>
        </ul>

        <h2 class="mt-12 text-24 font-bold leading-tight">what firebase doesn't see</h2>
        <ul class="mt-4 space-y-2 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>plaintext content (encrypted in your browser via aes-gcm-256)</li>
          <li>passphrases or derived keys (never leave the page; key material never crosses the web worker boundary)</li>
          <li>
            the room name you typed (firebase only sees{' '}
            <span class="font-mono text-fg-muted text-14">sha-256("latch-room-salt-v1:" + roomName)[:16]</span>)
          </li>
          <li>stable user identity (uids rotate per tab; nothing links sessions to a person)</li>
          <li>room membership across devices (firebase sees connections, not who's behind them)</li>
        </ul>

        <h2 class="mt-12 text-24 font-bold leading-tight">what we protect against</h2>
        <ul class="mt-4 space-y-2 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>latch's operator reading content. we have no decryption keys.</li>
          <li>google / firebase reading content. same reason.</li>
          <li>network proxies on your corporate gateway: zscaler, netskope, cloudflare gateway.</li>
          <li>passive replay of older ciphertext. per-message ivs plus aad include the chunk index for files.</li>
          <li>an attacker who guesses the room path but not the passphrase.</li>
        </ul>

        <h2 class="mt-12 text-24 font-bold leading-tight">what we don't protect against</h2>
        <ul class="mt-4 space-y-2 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>
            compromise of your device. if "stay latched" is on, the local key
            is in indexeddb. anyone with browser-profile access can re-derive
            the room key.
          </li>
          <li>voluntary disclosure. if you paste your passphrase into a chat, latch can't help.</li>
          <li>
            online brute force of low-entropy passphrases beyond the firebase
            rate-limit ceiling. mitigated by argon2id cost (~500 ms per guess
            at 64 mib memory) and per-uid rate limits, not by being uncrackable.
          </li>
          <li>
            traffic analysis. firebase logs connection metadata that could
            reveal usage patterns to anyone with access to those logs.
          </li>
        </ul>

        <h2 class="mt-12 text-24 font-bold leading-tight">the trust contract</h2>
        <ul class="mt-4 space-y-2 text-fg text-16 leading-normal list-disc list-outside pl-6">
          <li>
            exactly two outbound connection categories. firebase, enumerated
            in csp <span class="font-mono text-fg-muted text-14">connect-src</span> as{' '}
            <span class="font-mono text-fg-muted text-14">firestore.googleapis.com</span>,{' '}
            <span class="font-mono text-fg-muted text-14">identitytoolkit.googleapis.com</span>,{' '}
            <span class="font-mono text-fg-muted text-14">securetoken.googleapis.com</span>,{' '}
            <span class="font-mono text-fg-muted text-14">firebaseinstallations.googleapis.com</span>.
            and the cdn serving this page. no analytics. no telemetry. no error
            reporting service. no preview-link unfurling. no favicon fetches.
          </li>
          <li>
            non-extractable keys. the per-room aes-gcm key lives inside the web
            worker. the device-local key that wraps "stay latched" passphrases
            is also non-extractable. javascript can use them but can't read
            their bytes.
          </li>
          <li>
            reproducible build. every release publishes the sha256 of the
            deployed <span class="font-mono text-fg-muted text-14">index.html</span>. clone the
            repo at the matching tag, run{' '}
            <span class="font-mono text-fg-muted text-14">pnpm install &amp;&amp; pnpm build</span>,
            hash <span class="font-mono text-fg-muted text-14">dist/index.html</span>, compare.
            they should be identical. if they're not, don't trust the deployed
            page.
          </li>
        </ul>

        <p class="mt-12 text-fg-muted text-14">
          <a href="https://github.com/dog-broad/latch-app" target="_blank" rel="noopener noreferrer" class="text-teal-bright hover:text-teal-mid underline underline-offset-4 transition-colors">
            source ↗
          </a>{' '}
          takes you to the github repo.
        </p>
      </main>
    </div>
  )
}
