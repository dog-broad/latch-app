/**
 * derive a 16-byte argon2id salt from a room name, deterministically.
 *
 * the same room name produces the same salt on every device — that's
 * the foundation for two browsers landing at the same firebase path
 * from the same (room name, passphrase) without out-of-band
 * coordination. memory-hardness of argon2id still does the per-guess
 * brute-force work; the deterministic salt just removes the
 * per-device divergence.
 *
 * the `latch-room-salt-v1:` prefix is the domain-separation tag —
 * future room-name-derived values (a v2 protocol, a different
 * per-room derivation) get their own prefix and can't collide with
 * this one.
 */
const SALT_DOMAIN_PREFIX = 'latch-room-salt-v1:'
const encoder = new TextEncoder()

export async function deriveRoomSalt(roomName: string): Promise<Uint8Array> {
  const input = encoder.encode(SALT_DOMAIN_PREFIX + roomName)
  const hash = await crypto.subtle.digest('SHA-256', input)
  return new Uint8Array(hash).slice(0, 16)
}
