/**
 * tab-scoped singleton holding the currently-joined room. set when the
 * landing-page submit succeeds, read by the latched view to know which
 * worker key handle to reach for. cleared explicitly on leave; the
 * "stay latched on this device" persistence story is a magic-phase
 * feature and lives elsewhere.
 *
 * not a preact context — the room state is global to the tab, single-
 * room-per-tab per the architecture, and reading it from anywhere
 * shouldn't need a provider tree.
 */

export type RoomState = {
  readonly name: string
  readonly keyId: number
  readonly roomPath: string
  /** in-memory only — never persisted to localStorage. used by
   *  "stay latched" to encrypt + stash before the tab drops it. */
  readonly passphrase: string
}

let current: RoomState | null = null

export function getCurrentRoom(): RoomState | null {
  return current
}

export function setCurrentRoom(state: RoomState): void {
  current = state
}

export function clearCurrentRoom(): void {
  current = null
}
