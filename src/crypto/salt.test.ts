import { describe, it, expect } from 'vitest'
import { deriveRoomSalt } from './salt'

function toHex(u8: Uint8Array): string {
  let s = ''
  for (const b of u8) s += b.toString(16).padStart(2, '0')
  return s
}

describe('deriveRoomSalt', () => {
  it('produces exactly 16 bytes', async () => {
    const salt = await deriveRoomSalt('study')
    expect(salt.length).toBe(16)
  })

  it('is deterministic for the same room name', async () => {
    const a = await deriveRoomSalt('study')
    const b = await deriveRoomSalt('study')
    expect(toHex(a)).toBe(toHex(b))
  })

  it('produces different salts for different room names', async () => {
    const a = await deriveRoomSalt('study')
    const b = await deriveRoomSalt('scratch')
    expect(toHex(a)).not.toBe(toHex(b))
  })

  it('handles utf-8 room names correctly', async () => {
    const a = await deriveRoomSalt('кабинет')
    const b = await deriveRoomSalt('кабинет')
    const c = await deriveRoomSalt('study')
    expect(toHex(a)).toBe(toHex(b))
    expect(toHex(a)).not.toBe(toHex(c))
    expect(a.length).toBe(16)
  })

  it('is domain-separated from raw sha-256 of the room name', async () => {
    // a salt produced by our helper must not equal a naive sha-256(roomName)[:16]
    // — anyone hashing the bare room name should land somewhere else.
    const roomName = 'study'
    const salt = await deriveRoomSalt(roomName)
    const rawHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roomName)),
    ).slice(0, 16)
    expect(toHex(salt)).not.toBe(toHex(rawHash))
  })

  it('produces different salts when the prefix would matter', async () => {
    // room name "v1:study" without our prefix would hash to the same input
    // as our derivation of "study". the prefix prevents that collision.
    const safeSalt = await deriveRoomSalt('study')
    const adversarial = await deriveRoomSalt('latch-room-salt-v1:study')
    expect(toHex(safeSalt)).not.toBe(toHex(adversarial))
  })
})
