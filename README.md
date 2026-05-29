# latch

your clipboard. both machines. one room.

end-to-end encrypted in the browser. firebase is the transport — google's domains stay reachable on locked-down corporate networks, and the server never sees what you typed.

## what latch is

a web-based clipboard that bridges two devices through firewalls that would otherwise sever them. both machines join a room with a shared passphrase; content moves between them as ciphertext, decrypted only in the browser. firebase can't read content, can't identify rooms (the database path is a hash of the passphrase), and can't link users across devices.

aimed at developers on networks that block dynamic-dns and uncategorized domains. anyone else who needs a clipboard that crosses devices is welcome.

## what firebase sees vs. doesn't

| sees                                 | doesn't see                    |
| ------------------------------------ | ------------------------------ |
| ciphertext blobs                     | plaintext content              |
| random per-message ivs               | passphrase or derived key      |
| opaque room paths (16-hex hashes)    | actual room names              |
| anonymous uids (per-tab, rotated)    | stable user identity           |

a full threat model lives at the `/trust` route once the app is up.

## crypto

- argon2id key derivation (memory-hard, gpu-resistant). 64 mib / 3 iterations / 4 parallelism.
- hkdf-sha256 derives two domain-separated keys: one for aes-gcm content encryption, one for the firebase database path.
- aes-gcm-256 with a fresh 12-byte iv per message.
- chunked encryption for files (1 mib chunks, fresh iv each, chunk index in aad).
- all crypto runs inside a web worker; the ui thread never sees key material.

## build

prerequisites: node 22, pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm build          # emits dist/
pnpm preview        # serve dist/ on localhost
```

dev loop:

```sh
pnpm dev            # vite dev server with hmr
pnpm test           # unit + integration
pnpm test:rules     # firebase emulator-based rule tests (needs java 11+)
```

## reproducible builds

`pnpm build` produces a byte-identical `dist/index.html` across runs and machines given the same source tree, node version, and pnpm version. every tagged release publishes the sha256 of that file. anyone can clone the matching tag, build locally, hash, and compare.

```sh
git clone https://github.com/dog-broad/latch-app.git
cd latch-app
git checkout v1.0.0   # any released tag
pnpm install --frozen-lockfile
pnpm build
pnpm hash             # prints "<sha256>  dist/index.html"
```

the printed line should match the hash in the github release notes for that tag and the entry on `/changelog`. if they don't match — even one byte off — the deployed page contains something the source tree didn't, and you shouldn't trust it.

verify the production page itself the same way:

```sh
curl -s https://latch.rushyendra.dev/ | sha256sum
```

the value should equal the released hash. (the cdn serves identical bytes; if it doesn't, the cdn is doing something we didn't ship.)

## license

MIT. see [`LICENSE`](LICENSE).

source: <https://github.com/dog-broad/latch-app>
