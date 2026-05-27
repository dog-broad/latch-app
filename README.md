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

## status

pre-scaffold. the static site, the crypto pipeline, and the firebase transport land in incremental commits on the `core` branch. build + run instructions arrive with the first scaffold commit.

## reproducible builds

every tagged release publishes the sha256 of the deployed `index.html`. clone, build, hash, compare. if they don't match, don't trust the deployed page. verification instructions ship with the first release.

## license

MIT. see [`LICENSE`](LICENSE).

source: <https://github.com/dog-broad/latch-app>
