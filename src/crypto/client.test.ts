import { describe, it, expect, beforeAll } from 'vitest'
import { deriveRoomKey, encryptForRoom, decryptForRoom } from './client'

const enc = new TextEncoder()
const dec = new TextDecoder()
const HEX16 = /^[0-9a-f]{16}$/

function toHex(u8: Uint8Array): string {
  let s = ''
  for (const b of u8) s += b.toString(16).padStart(2, '0')
  return s
}

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

describe('deriveRoomKey', () => {
  it('produces a 16-char lowercase hex roomPath', async () => {
    const r = await deriveRoomKey('passphrase', randomSalt())
    expect(r.roomPath).toMatch(HEX16)
    expect(r.keyId).toBeGreaterThan(0)
    expect(r.durationMs).toBeGreaterThan(0)
  })

  it('is deterministic for the same passphrase + salt', async () => {
    const salt = randomSalt()
    const a = await deriveRoomKey('determinism-test', salt)
    const b = await deriveRoomKey('determinism-test', salt)
    expect(a.roomPath).toBe(b.roomPath)
    // each call still gets a fresh handle into the worker's key map
    expect(a.keyId).not.toBe(b.keyId)
  })

  it('produces a different roomPath when the salt changes', async () => {
    const a = await deriveRoomKey('same-passphrase', randomSalt())
    const b = await deriveRoomKey('same-passphrase', randomSalt())
    expect(a.roomPath).not.toBe(b.roomPath)
  })

  it('produces a different roomPath when the passphrase changes', async () => {
    const salt = randomSalt()
    const a = await deriveRoomKey('passphrase-one', salt)
    const b = await deriveRoomKey('passphrase-two', salt)
    expect(a.roomPath).not.toBe(b.roomPath)
  })
})

describe('encrypt / decrypt round-trip', () => {
  let keyId: number

  beforeAll(async () => {
    keyId = (await deriveRoomKey('round-trip-suite', randomSalt())).keyId
  })

  it('round-trips a utf-8 text payload', async () => {
    const plaintext = enc.encode('the quick brown fox jumps over the lazy dog')
    const payload = await encryptForRoom(keyId, plaintext)
    const recovered = await decryptForRoom(keyId, payload)
    expect(dec.decode(recovered)).toBe('the quick brown fox jumps over the lazy dog')
  })

  it('round-trips arbitrary binary plaintext', async () => {
    const plaintext = crypto.getRandomValues(new Uint8Array(1024))
    const payload = await encryptForRoom(keyId, plaintext)
    const recovered = await decryptForRoom(keyId, payload)
    expect(recovered.length).toBe(plaintext.length)
    expect(toHex(recovered)).toBe(toHex(plaintext))
  })

  it('encrypts empty plaintext to exactly 28 bytes (12 iv + 16 gcm tag)', async () => {
    const payload = await encryptForRoom(keyId, new Uint8Array(0))
    expect(payload.length).toBe(28)
    const recovered = await decryptForRoom(keyId, payload)
    expect(recovered.length).toBe(0)
  })
})

describe('iv uniqueness', () => {
  it('32 encrypts of the same plaintext under the same key yield 32 distinct payloads', async () => {
    const { keyId } = await deriveRoomKey('iv-uniqueness-suite', randomSalt())
    const plaintext = enc.encode('repeated plaintext')
    const seen = new Set<string>()
    for (let i = 0; i < 32; i++) {
      seen.add(toHex(await encryptForRoom(keyId, plaintext)))
    }
    // an iv repeat under the same key + plaintext would produce a duplicate
    // payload — aes-gcm is deterministic given (key, iv, plaintext, aad).
    expect(seen.size).toBe(32)
  })
})

describe('authentication failures', () => {
  let keyA: number
  let keyB: number
  let plaintext: Uint8Array

  beforeAll(async () => {
    keyA = (await deriveRoomKey('room-a', randomSalt())).keyId
    keyB = (await deriveRoomKey('room-b', randomSalt())).keyId
    plaintext = enc.encode('authenticated payload')
  })

  it('rejects mitm substitution (cross-key decrypt) opaquely', async () => {
    const payload = await encryptForRoom(keyA, plaintext)
    await expect(decryptForRoom(keyB, payload)).rejects.toThrow('decryption failed')
  })

  it('rejects a tampered ciphertext byte opaquely', async () => {
    const payload = await encryptForRoom(keyA, plaintext)
    const mid = Math.floor(payload.length / 2)
    payload[mid] = (payload[mid] ?? 0) ^ 0x01
    await expect(decryptForRoom(keyA, payload)).rejects.toThrow('decryption failed')
  })

  it('rejects a tampered iv byte opaquely', async () => {
    const payload = await encryptForRoom(keyA, plaintext)
    // the iv lives in the first 12 bytes of the payload
    payload[0] = (payload[0] ?? 0) ^ 0x01
    await expect(decryptForRoom(keyA, payload)).rejects.toThrow('decryption failed')
  })
})

describe('aad', () => {
  let keyId: number
  let plaintext: Uint8Array

  beforeAll(async () => {
    keyId = (await deriveRoomKey('aad-suite', randomSalt())).keyId
    plaintext = enc.encode('aad-bound payload')
  })

  it('round-trips when encrypt and decrypt aad match', async () => {
    const aad = enc.encode('chunk-0')
    const payload = await encryptForRoom(keyId, plaintext, aad)
    const recovered = await decryptForRoom(keyId, payload, aad)
    expect(dec.decode(recovered)).toBe('aad-bound payload')
  })

  it('rejects when the decrypt aad differs from the encrypt aad', async () => {
    const aadEnc = enc.encode('chunk-0')
    const aadDec = enc.encode('chunk-1')
    const payload = await encryptForRoom(keyId, plaintext, aadEnc)
    await expect(decryptForRoom(keyId, payload, aadDec)).rejects.toThrow('decryption failed')
  })

  it('rejects when an aad-encrypted payload is decrypted with no aad', async () => {
    const aad = enc.encode('chunk-0')
    const payload = await encryptForRoom(keyId, plaintext, aad)
    await expect(decryptForRoom(keyId, payload)).rejects.toThrow('decryption failed')
  })

  it('rejects when a no-aad payload is decrypted with an aad supplied', async () => {
    const aad = enc.encode('chunk-0')
    const payload = await encryptForRoom(keyId, plaintext)
    await expect(decryptForRoom(keyId, payload, aad)).rejects.toThrow('decryption failed')
  })
})

describe('error surfaces', () => {
  it('encrypt with an unknown keyId surfaces a distinct error', async () => {
    await expect(encryptForRoom(999_999, new Uint8Array(4))).rejects.toThrow('unknown keyId')
  })

  it('decrypt with an unknown keyId surfaces a distinct error', async () => {
    await expect(decryptForRoom(999_999, new Uint8Array(28))).rejects.toThrow('unknown keyId')
  })

  it('decrypt with a too-short payload surfaces a distinct error', async () => {
    const { keyId } = await deriveRoomKey('short-payload', randomSalt())
    // anything below 12-byte iv + 16-byte gcm tag = 28 bytes is rejected
    // before webcrypto sees it.
    await expect(decryptForRoom(keyId, new Uint8Array(16))).rejects.toThrow('payload too short')
  })
})
