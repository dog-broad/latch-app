import { createStore, get, set, del, entries } from 'idb-keyval'
import { getDeviceKey } from './device-key'

/**
 * "stay latched on this device" persistence. when the toggle is on
 * for a room, the user's passphrase is encrypted with the device key
 * and stored in indexeddb keyed by roomPath. on landing, the user
 * sees a list of remembered rooms — clicking one decrypts the stored
 * passphrase, re-derives the room key in the worker, and routes
 * straight to /latched without re-typing.
 *
 * the record carries the plaintext room name as a display label.
 * the actual cryptographic identifiers (roomPath, salt) are
 * regenerable from (name, passphrase); persisting them would just
 * widen the surface for a passive idb dump.
 */

const store = createStore('latch-remembered-rooms', 'rooms')

type StoredRoom = {
  readonly name: string
  readonly iv: Uint8Array
  readonly ciphertext: Uint8Array
  readonly createdAt: number
  readonly lastSeenAt: number
}

export type RememberedRoom = {
  readonly roomPath: string
  readonly name: string
  readonly createdAt: number
  readonly lastSeenAt: number
}

export async function rememberRoom(
  roomPath: string,
  name: string,
  passphrase: string,
): Promise<void> {
  const key = await getDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(passphrase)
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const existing = await get<StoredRoom>(roomPath, store)
  const record: StoredRoom = {
    name,
    iv,
    ciphertext: new Uint8Array(ciphertextBuf),
    createdAt: existing?.createdAt ?? Date.now(),
    lastSeenAt: Date.now(),
  }
  await set(roomPath, record, store)
}

export async function forgetRoom(roomPath: string): Promise<void> {
  await del(roomPath, store)
}

export async function isRemembered(roomPath: string): Promise<boolean> {
  return (await get(roomPath, store)) !== undefined
}

export async function listRememberedRooms(): Promise<RememberedRoom[]> {
  const all = await entries<string, StoredRoom>(store)
  return all
    .map(([roomPath, record]) => ({
      roomPath,
      name: record.name,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt,
    }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export async function recoverPassphrase(roomPath: string): Promise<string | null> {
  const record = await get<StoredRoom>(roomPath, store)
  if (!record) return null
  const key = await getDeviceKey()
  try {
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.ciphertext),
    )
    return new TextDecoder().decode(plaintextBuf)
  } catch {
    return null
  }
}

export async function touchRoom(roomPath: string): Promise<void> {
  const existing = await get<StoredRoom>(roomPath, store)
  if (!existing) return
  await set(roomPath, { ...existing, lastSeenAt: Date.now() }, store)
}
