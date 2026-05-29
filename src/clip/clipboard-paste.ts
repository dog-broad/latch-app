/**
 * write the newest text clip to the OS clipboard whenever the latch
 * tab regains focus. the act of switching to latch is the user's
 * "use this" gesture, and most browsers gate writeText() on a user
 * activation event — focus from another window typically satisfies
 * this on chromium and webkit.
 *
 * file clips aren't auto-pasted: blobs don't fit the text clipboard
 * shape, and forcing a download on focus is too aggressive.
 *
 * the caller supplies `getLatest` so this module doesn't need to
 * subscribe — it pulls the freshest text snapshot at focus time and
 * compares against what it last wrote, so a focus event without
 * new content is a no-op.
 */

export function startClipboardPaste(
  getLatest: () => string | null,
  markSelfWritten: (text: string) => void,
): () => void {
  let lastWritten: string | null = null

  async function onFocus(): Promise<void> {
    const text = getLatest()
    if (!text || text === lastWritten) return
    try {
      await navigator.clipboard.writeText(text)
      lastWritten = text
      markSelfWritten(text)
    } catch {
      // permission denied or no user activation — silent fallback.
    }
  }

  const handler = (): void => void onFocus()
  window.addEventListener('focus', handler)
  return () => {
    window.removeEventListener('focus', handler)
  }
}
