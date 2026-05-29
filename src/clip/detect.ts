/**
 * classify a decrypted clip's plaintext into one of four kinds so the
 * renderer can pick the right shape: a clickable link for urls, a
 * prettyprint for json, a monospace pre for code (with a best-guess
 * language for the future syntax-highlight pass), and a plain pre
 * fallback for text.
 *
 * the file kind isn't in this commit — file uploads land their own
 * detection path under magic's files section.
 *
 * cheap, regex-only. no parsing libraries on first paint.
 */

export type ClipKind =
  | { readonly type: 'text' }
  | { readonly type: 'url'; readonly href: string }
  | { readonly type: 'json'; readonly pretty: string }
  | { readonly type: 'code'; readonly language: string | null }

const URL_SCHEME = /^(https?|ftp):\/\//i

export function detectClipKind(text: string): ClipKind {
  const trimmed = text.trim()
  if (!trimmed) return { type: 'text' }

  const url = tryUrl(trimmed)
  if (url) return { type: 'url', href: url }

  const json = tryJson(trimmed)
  if (json) return { type: 'json', pretty: json }

  if (looksLikeCode(text)) {
    return { type: 'code', language: guessLanguage(text) }
  }

  return { type: 'text' }
}

/**
 * the trimmed input must be exactly one http/https/ftp url —
 * `look at https://x.com later` fails because new URL() rejects
 * the leading words, which is the behavior we want.
 */
function tryUrl(trimmed: string): string | null {
  if (!URL_SCHEME.test(trimmed)) return null
  try {
    return new URL(trimmed).href
  } catch {
    return null
  }
}

/**
 * accepts only object/array literals — bare json numbers / strings /
 * booleans / null are parseable but visually indistinguishable from
 * prose, so they read better as plain text.
 */
function tryJson(trimmed: string): string | null {
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object') return null
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

/**
 * code needs at least one structural character (braces / semicolons /
 * arrow) AND one common code keyword on a multi-line body. multi-line
 * prose that happens to mention `const` or `function` won't trigger
 * because there's no `{`/`}`/`;`/`=>` to back it up.
 */
const CODE_STRUCTURE = /[{};]|=>/
const CODE_KEYWORDS =
  /\b(function|const|let|var|import|export|return|class|def|print|require|interface|type|enum|public|private|async|await|struct|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b|console\.log/

function looksLikeCode(text: string): boolean {
  if (!text.includes('\n')) return false
  return CODE_STRUCTURE.test(text) && CODE_KEYWORDS.test(text)
}

function guessLanguage(text: string): string | null {
  // typescript before javascript — ts is js with extra type signals
  if (/\b(interface\s+\w+|type\s+\w+\s*=|enum\s+\w+)\b|:\s*(string|number|boolean)\b/.test(text)) return 'typescript'
  if (/\b(const|let|var|=>|console\.log|require\()\b|import\s+.+from\b/.test(text)) return 'javascript'
  if (/\b(def\s+\w+|from\s+\w+\s+import|print\(|self\.|__name__|elif)\b/.test(text)) return 'python'
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN)\b/im.test(text)) return 'sql'
  if (/^#!.*\b(sh|bash|zsh)/m.test(text) || /\b(echo|grep|awk|sed|cat|cd)\s+/.test(text)) return 'shell'
  return null
}
