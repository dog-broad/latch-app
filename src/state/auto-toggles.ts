/**
 * per-room toggle state for the two magic clipboard behaviors:
 *   - autoWatch: poll the OS clipboard and auto-send new copies
 *   - autoCopy: write the newest received text clip to the OS clipboard
 *     on tab focus
 *
 * persisted to localStorage by roomPath. opt-in per room — both flags
 * default to false. survives "stay latched" too because the storage
 * key is the same opaque path the room's already pinned to.
 */

export type AutoToggles = {
  readonly autoWatch: boolean
  readonly autoCopy: boolean
}

const DEFAULTS: AutoToggles = { autoWatch: false, autoCopy: false }
const STORAGE_KEY = 'latch:auto-toggles'

function loadAll(): Record<string, AutoToggles> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, AutoToggles>
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, AutoToggles>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // private mode, storage quota, etc. — silently accept that
    // toggles won't persist; this session still works in-memory.
  }
}

export function getToggles(roomPath: string): AutoToggles {
  return loadAll()[roomPath] ?? DEFAULTS
}

export function setToggles(roomPath: string, next: AutoToggles): void {
  const all = loadAll()
  all[roomPath] = next
  saveAll(all)
}
