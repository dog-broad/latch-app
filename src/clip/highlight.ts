import type { HLJSApi } from 'highlight.js'

/**
 * highlight.js wrapper: lazy-loads the core engine + the languages we
 * support on first call, returns class-tagged html for a code block.
 *
 * highlight.js emits semantic class names (`hljs-keyword`, `hljs-string`,
 * …) and NO inline styles, so the output stays inside the strict
 * `style-src 'self'` csp — token colors live in app.css under `.hljs-*`.
 * (shiki, the previous engine, themed every token with an inline
 * `style="color:…"` attribute, which the csp silently blocked: code
 * rendered uncolored in production.)
 *
 * the import is dynamic so the landing-page bundle never pays; the core
 * + grammar chunk loads on first code-clip render. unsupported / null
 * languages return null so the caller falls back to a plain <pre>.
 */

const SUPPORTED_LANGUAGES = new Set([
  'typescript',
  'javascript',
  'python',
  'sql',
  'shell',
  'markdown',
  'css',
  'html',
  'json',
])

// our detector's language names → highlight.js grammar ids. `shell` maps
// to bash (the code grammar, not the prompt-only `shell`), `html` to xml.
const HLJS_GRAMMAR: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  python: 'python',
  sql: 'sql',
  shell: 'bash',
  markdown: 'markdown',
  css: 'css',
  html: 'xml',
  json: 'json',
}

export function isHighlightableLanguage(language: string | null): boolean {
  return language !== null && SUPPORTED_LANGUAGES.has(language)
}

let hljsPromise: Promise<HLJSApi> | null = null

function loadHljs(): Promise<HLJSApi> {
  if (hljsPromise) return hljsPromise
  hljsPromise = (async () => {
    const core = (await import('highlight.js/lib/core')).default
    const [ts, js, py, sql, bash, md, css, xml, json] = await Promise.all([
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/json'),
    ])
    core.registerLanguage('typescript', ts.default)
    core.registerLanguage('javascript', js.default)
    core.registerLanguage('python', py.default)
    core.registerLanguage('sql', sql.default)
    core.registerLanguage('bash', bash.default)
    core.registerLanguage('markdown', md.default)
    core.registerLanguage('css', css.default)
    core.registerLanguage('xml', xml.default)
    core.registerLanguage('json', json.default)
    return core
  })()
  return hljsPromise
}

/**
 * returns the highlighted inner html (token spans, hljs-* classes) for a
 * code block, or null when the language isn't one we highlight. the
 * caller wraps it in `<pre><code class="hljs">`. highlight.js escapes the
 * source text, so the returned html is safe to inject.
 */
export async function highlightCode(
  code: string,
  language: string | null,
): Promise<string | null> {
  if (!isHighlightableLanguage(language)) return null
  const grammar = HLJS_GRAMMAR[language as string]
  if (!grammar) return null
  const hljs = await loadHljs()
  return hljs.highlight(code, { language: grammar, ignoreIllegals: true }).value
}
