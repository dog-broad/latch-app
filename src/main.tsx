import { render } from 'preact'
import { App } from './App'
import './app.css'

const root = document.getElementById('app')
if (!root) throw new Error('mount node #app missing')
render(<App />, root)

// register the offline service worker from our own (same-origin, already-
// loaded) bundle rather than a separate injected script — the latter is a
// distinct network request that some corporate proxies rewrite to HTML,
// throwing a console SyntaxError, and an inline register would break
// `script-src 'self'`. if the proxy rewrites /sw.js too, register() just
// rejects; swallow it and run without the offline shell.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
}
