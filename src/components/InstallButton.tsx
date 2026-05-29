import { useEffect, useState } from 'preact/hooks'

/**
 * captures the browser's `beforeinstallprompt` event and surfaces it as
 * a header-level `install` link. only renders when the browser deems
 * the page install-eligible — chromium fires the event automatically
 * after a manifest, a service worker, and a user engagement threshold;
 * safari and firefox don't fire it (users install via os menu instead).
 *
 * after the user accepts, the `appinstalled` event clears the cached
 * prompt and hides the button. the dom keeps the button rendered until
 * either path resolves — clicking re-uses the original event object,
 * which the spec only allows once.
 */

type BeforeInstallPromptEvent = Event & {
  readonly platforms: ReadonlyArray<string>
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!prompt) return null

  async function onClick() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setPrompt(null)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      class="text-12 text-fg-muted hover:text-teal-bright transition-colors cursor-pointer"
    >
      install
    </button>
  )
}
