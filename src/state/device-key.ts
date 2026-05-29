import { createStore, get, set } from 'idb-keyval'

/**
 * a per-browser-profile aes-gcm key, generated once on first
 * "stay latched" toggle and persisted to indexeddb. used to encrypt
 * the per-room passphrases that back the "stay latched" feature, so
 * neither the indexeddb dump nor any other passive observer sees a
 * plaintext passphrase.
 *
 * the key is non-extractable — browsers structured-clone CryptoKey
 * objects into idb intact, including the inaccessible-from-js
 * material. anyone with browser-profile access can still use the
 * in-page WebCrypto api to decrypt entries (we mention this in the
 * trust contract); the bar this raises is "raw idb leak" vs "active
 * malicious code running in the page", and the former is the more
 * common one.
 */

const KEY_RECORD_KEY = 'key'

const store = createStore('latch-device-key', 'device-key')

let cached: CryptoKey | null = null

export async function getDeviceKey(): Promise<CryptoKey> {
  if (cached) return cached
  const existing = (await get<CryptoKey>(KEY_RECORD_KEY, store)) ?? null
  if (existing) {
    cached = existing
    return existing
  }
  const fresh = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  await set(KEY_RECORD_KEY, fresh, store)
  cached = fresh
  return fresh
}
