import { describe, it, expect } from 'vitest'
import { detectClipKind } from './detect'

describe('detectClipKind / url', () => {
  it('classifies a bare https url', () => {
    const k = detectClipKind('https://example.com')
    expect(k.type).toBe('url')
    if (k.type === 'url') expect(k.href).toBe('https://example.com/')
  })

  it('keeps the full url with path and query', () => {
    const k = detectClipKind('https://docs.python.org/3/library/urllib.parse.html?x=1#anchor')
    expect(k.type).toBe('url')
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(detectClipKind('  https://example.com  ').type).toBe('url')
  })

  it('rejects prose that mentions a url', () => {
    expect(detectClipKind('look at https://example.com later').type).toBe('text')
    expect(detectClipKind('https://example.com is great').type).toBe('text')
  })

  it('rejects bare domains without a scheme', () => {
    expect(detectClipKind('example.com').type).toBe('text')
  })

  it('rejects non-web schemes', () => {
    expect(detectClipKind('mailto:hi@example.com').type).toBe('text')
    expect(detectClipKind('tel:+12025550100').type).toBe('text')
    expect(detectClipKind('javascript:void(0)').type).toBe('text')
  })
})

describe('detectClipKind / json', () => {
  it('classifies object literals and prettyprints', () => {
    const k = detectClipKind('{"a":1,"b":[2,3]}')
    expect(k.type).toBe('json')
    if (k.type === 'json') {
      expect(k.pretty).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
    }
  })

  it('classifies array literals', () => {
    expect(detectClipKind('[1, 2, 3]').type).toBe('json')
  })

  it('rejects bare json primitives — they look like prose to a reader', () => {
    expect(detectClipKind('42').type).toBe('text')
    expect(detectClipKind('"hi"').type).toBe('text')
    expect(detectClipKind('true').type).toBe('text')
    expect(detectClipKind('null').type).toBe('text')
  })

  it('rejects malformed json', () => {
    expect(detectClipKind('{a: 1}').type).not.toBe('json')
    expect(detectClipKind('{ "a": 1, ').type).not.toBe('json')
  })
})

describe('detectClipKind / code', () => {
  it('classifies typescript with type signals', () => {
    const k = detectClipKind(`import { foo } from './bar'

export function greet(name: string): string {
  return \`hello \${name}\`
}`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe('typescript')
  })

  it('classifies javascript', () => {
    const k = detectClipKind(`const x = 1
function f() {
  return x + 1
}
console.log(f())`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe('javascript')
  })

  it('classifies python', () => {
    const k = detectClipKind(`def greet(name):
    print(f"hello {name}")

greet("world")`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe('python')
  })

  it('classifies sql', () => {
    const k = detectClipKind(`SELECT * FROM users
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY id;`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe('sql')
  })

  it('classifies shell with shebang', () => {
    const k = detectClipKind(`#!/bin/bash
echo "hi"
grep foo file.txt | awk '{print $1}'`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe('shell')
  })

  it('returns null language for code that does not match a known guess', () => {
    // c-style struct: passes the multi-line + structure + keyword check
    // via `type` and `{};`, but no language-specific signals.
    const k = detectClipKind(`type point = struct {
  int x;
  int y;
};`)
    expect(k.type).toBe('code')
    if (k.type === 'code') expect(k.language).toBe(null)
  })

  it('does not promote single-line `console.log("hi")` to code — short enough to read as text', () => {
    expect(detectClipKind('console.log("hi")').type).toBe('text')
  })

  it('does not promote multi-line prose that mentions code keywords', () => {
    const t = `I prefer const over let.
Also function-based programming is great.`
    expect(detectClipKind(t).type).toBe('text')
  })
})

describe('detectClipKind / text', () => {
  it('classifies plain prose', () => {
    expect(detectClipKind('hello world').type).toBe('text')
  })

  it('classifies multi-line prose without code markers', () => {
    expect(
      detectClipKind(`Hello, world!

This is some prose.
Just regular text.`).type,
    ).toBe('text')
  })

  it('empty string is text', () => {
    expect(detectClipKind('').type).toBe('text')
  })
})
