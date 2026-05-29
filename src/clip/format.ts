/**
 * format a code block via prettier (or sql-formatter for sql). everything
 * is dynamic-imported on demand so the landing bundle never pays — the
 * format button click is the trigger that pulls prettier (~50 KB gz)
 * and the relevant parser plugin into a separate chunk.
 *
 * supported per the spec: javascript, typescript, css, html, json,
 * markdown, sql. anything else returns null from `canFormat` and the
 * caller disables the button with a tooltip.
 */

const PRETTIER_PARSERS = {
  javascript: 'babel',
  typescript: 'typescript',
  css: 'css',
  html: 'html',
  json: 'json',
  markdown: 'markdown',
} as const

const FORMATTABLE = new Set<string>([...Object.keys(PRETTIER_PARSERS), 'sql'])

export function canFormat(language: string | null): boolean {
  return language !== null && FORMATTABLE.has(language)
}

export async function formatCode(code: string, language: string): Promise<string> {
  if (language === 'sql') {
    const { format } = await import('sql-formatter')
    return format(code, { language: 'sql', keywordCase: 'upper' })
  }

  if (!(language in PRETTIER_PARSERS)) {
    throw new Error(`no formatter for ${language}`)
  }
  const parser = PRETTIER_PARSERS[language as keyof typeof PRETTIER_PARSERS]
  const prettier = await import('prettier/standalone')
  const plugins = await loadPrettierPlugins(parser)
  return prettier.format(code, { parser, plugins: plugins as never, printWidth: 80 })
}

async function loadPrettierPlugins(parser: string): Promise<unknown[]> {
  // prettier 3 needs the right plugin set per parser. estree is the shared
  // ast normaliser for babel + typescript + json.
  switch (parser) {
    case 'babel':
    case 'json': {
      const [babel, estree] = await Promise.all([
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
      ])
      return [babel.default, estree.default]
    }
    case 'typescript': {
      const [ts, estree] = await Promise.all([
        import('prettier/plugins/typescript'),
        import('prettier/plugins/estree'),
      ])
      return [ts.default, estree.default]
    }
    case 'css': {
      const css = await import('prettier/plugins/postcss')
      return [css.default]
    }
    case 'html': {
      const html = await import('prettier/plugins/html')
      return [html.default]
    }
    case 'markdown': {
      const md = await import('prettier/plugins/markdown')
      return [md.default]
    }
    default:
      throw new Error(`unhandled prettier parser: ${parser}`)
  }
}
