import { useState } from 'preact/hooks'
import { pushToast } from '@/state/toasts'

/**
 * one-click copy. writes `text` to the OS clipboard, flips its bracket
 * label to a brief `copied` state, and announces success through the
 * shared toast channel so copy and send speak the same confirmation
 * language. failure (no permission / insecure context) surfaces as an
 * error toast rather than a silent no-op.
 *
 * styled as a mono bracket-label to match the app's other inline
 * actions (`[ attach ]`, `[ format ]`); class-based only, no inline
 * styles, so it stays inside `style-src 'self'`.
 */
export function CopyButton({
  text,
  label = 'copy',
}: {
  readonly text: string
  readonly label?: string
}) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
      pushToast('success', 'copied')
    } catch {
      pushToast('error', "couldn't reach the clipboard")
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={copied ? 'copied' : `copy ${label}`}
      class="text-12 text-fg-muted font-mono hover:text-teal-bright transition-colors"
    >
      [ {copied ? 'copied' : label} ]
    </button>
  )
}
