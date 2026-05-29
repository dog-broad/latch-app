/**
 * shiki wrapper: lazy-loads the highlighter on first call, returns the
 * themed html for a code block. unsupported / null languages fall back
 * to `text` so the output still wraps in shiki's <pre><code> shell —
 * the caller renders the result via dangerouslySetInnerHTML.
 *
 * the import is dynamic so the landing-page bundle never pays. first
 * code-clip render takes ~200 ms in cold-start (chunk fetch + wasm
 * init); subsequent highlights reuse the cached highlighter.
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

export function isHighlightableLanguage(language: string | null): boolean {
  return language !== null && SUPPORTED_LANGUAGES.has(language)
}

export async function highlightCode(
  code: string,
  language: string | null,
): Promise<string> {
  const lang = isHighlightableLanguage(language) ? (language as string) : 'text'
  const { codeToHtml } = await import('shiki')
  return codeToHtml(code, { lang, theme: 'github-dark' })
}
