/**
 * the single-input form on the landing page. visual-only in this
 * commit — the parsing of `room` vs `room/passphrase` shorthand,
 * the expand-to-two-fields behavior, and the post-submit derive →
 * navigate flow all land in subsequent commits.
 *
 * the `↵` glyph in the placeholder mirrors the §6.1 mock and signals
 * "press enter" without spending pixels on a button. focus ring is
 * teal-mid per the aesthetic rules.
 */
export function RoomInput() {
  return (
    <input
      type="text"
      placeholder="pick a room ↵"
      aria-label="room name"
      class="w-full bg-bg-sunk text-fg text-16 placeholder:text-fg-faint border border-border rounded px-4 py-3 outline-none focus:border-border-hot focus:ring-2 focus:ring-teal-mid focus:ring-offset-2 focus:ring-offset-bg transition-colors"
    />
  )
}
