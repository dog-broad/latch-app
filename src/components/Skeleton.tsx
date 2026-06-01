/**
 * a shimmer placeholder block, shown while the room connects so the
 * latched view can tell "still loading" apart from "empty room". the
 * shimmer animation + its reduced-motion fallback live in `app.css`
 * under `.skeleton`.
 *
 * width/height take any css length; `class` appends for layout (margins,
 * rounding) without overriding the shimmer.
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  class: className = '',
}: {
  readonly width?: string
  readonly height?: string
  readonly class?: string
}) {
  return (
    <div
      class={`skeleton rounded ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
