/**
 * The dialect, pinned. Most of what these check is the *absence* of YAML's
 * punctuation rules — a link, a phone number and a colon mid-sentence all
 * reading as the text they obviously are — so they double as the spec for what
 * a resume is allowed to say without reaching for quotes.
 */

import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { KEY_RE, needsQuotes, parse, readScalar, splitLine } from './relaxed-yaml.js'

/** @param {string} text */
const tree = (text) => parse(text).value
/** @param {string} text */
const errors = (text) => parse(text).diagnostics.filter((d) => d.severity === 'error')

describe('markdown without quotes', () => {
  const doc = `- title: Some text: more text
  subtitle: **bold text**
  items:
    - +1 555 010 1234
    - [github.com/example](https://github.com/example)
`

  it('reads the whole example the obvious way', () => {
    expect(tree(doc)).toEqual([
      {
        title: 'Some text: more text',
        subtitle: '**bold text**',
        items: ['+1 555 010 1234', '[github.com/example](https://github.com/example)'],
      },
    ])
  })

  it('finds nothing to complain about in it', () => {
    expect(parse(doc).diagnostics).toEqual([])
  })

  it('takes only the first `key:` on a line, however many colons follow', () => {
    expect(tree('a: b: c: d')).toEqual({ a: 'b: c: d' })
  })

  it('refuses a key with a space in it, so a sentence stays a sentence', () => {
    expect(tree('- Some text: more text')).toEqual(['Some text: more text'])
    expect(tree('- Analytics: Mixpanel')).toEqual([{ Analytics: 'Mixpanel' }])
  })

  it('needs a space after the colon', () => {
    expect(tree('- url: https://example.dev')).toEqual([{ url: 'https://example.dev' }])
    expect(tree('- https://example.dev')).toEqual(['https://example.dev'])
  })

  it('leaves the characters YAML reserves alone', () => {
    expect(tree('a: [x](y)\nb: +1 555\nc: {x}\nd: &anchor\ne: *star\nf: ? maybe\ng: !bang')).toEqual({
      a: '[x](y)',
      b: '+1 555',
      c: '{x}',
      d: '&anchor',
      e: '*star',
      f: '? maybe',
      g: '!bang',
    })
  })
})

describe('scalars', () => {
  it('keeps true and false boolean, and everything else a string', () => {
    expect(tree('inline: true\nhasHeader: false\ndates: 2023\nstars: 120\nrating: 4')).toEqual({
      inline: true,
      hasHeader: false,
      dates: '2023',
      stars: '120',
      rating: '4',
    })
  })

  it('unwraps quotes that wrap the whole value', () => {
    expect(tree("a: 'ORM: Prisma'\nb: \"quoted\"\nc: ''")).toEqual({ a: 'ORM: Prisma', b: 'quoted', c: '' })
  })

  it('leaves quotes that do not wrap the whole value', () => {
    expect(tree("a: 'Bob' the builder\nb: he said 'hi'")).toEqual({ a: "'Bob' the builder", b: "he said 'hi'" })
  })

  it('honours the escapes older documents were written with', () => {
    expect(readScalar("'It''s fine'")).toEqual({ value: "It's fine", quoted: true })
    expect(readScalar('"say \\"hi\\""')).toEqual({ value: 'say "hi"', quoted: true })
  })

  it('folds an indented paragraph into the value above it', () => {
    expect(tree('summary:\n  one line\n  and another')).toEqual({ summary: 'one line and another' })
  })

  it('reads block scalars', () => {
    expect(tree('a: |\n  one\n  two\nb: >\n  one\n  two')).toEqual({ a: 'one\ntwo', b: 'one two' })
  })

  it('has nothing for a key with nothing under it', () => {
    expect(tree('a:\nb: x')).toEqual({ a: null, b: 'x' })
  })
})

describe('comments', () => {
  it('only starts one at the head of a line', () => {
    expect(tree('# a comment\ndesc: color #fff, ranked # 1\n  # indented, still a comment\nb: y')).toEqual({
      desc: 'color #fff, ranked # 1',
      b: 'y',
    })
  })

  it('leaves a hash after a dash as text', () => {
    expect(tree('- #hashtag')).toEqual(['#hashtag'])
  })
})

describe('structure', () => {
  it('keeps a compact item on one line with the keys under it', () => {
    expect(tree('items:\n  - name: A\n    level: B\n  - name: C')).toEqual({
      items: [{ name: 'A', level: 'B' }, { name: 'C' }],
    })
  })

  it('nests a list opened on the same line as its dash', () => {
    expect(tree('- - a\n  - b\n- c')).toEqual([['a', 'b'], 'c'])
  })

  it('takes the block under a bare dash as the item', () => {
    expect(tree('items:\n  -\n    name: A')).toEqual({ items: [{ name: 'A' }] })
  })

  it('maps every node to the line it starts on, keyed on the entry, not the value', () => {
    const { lines } = parse('header:\n  name: Jo\nsections:\n  - type: summary\n    paragraphs:\n      - one\n      - two\n')
    expect(lines.get('header.name')).toBe(2)
    expect(lines.get('sections.0')).toBe(4)
    expect(lines.get('sections.0.paragraphs')).toBe(5)
    expect(lines.get('sections.0.paragraphs.1')).toBe(7)
  })
})

describe('diagnostics', () => {
  it('rejects a tab in the indentation', () => {
    expect(errors('a:\n\tb: 1')[0].message).toMatch(/tab/i)
  })

  it('flags a line that lines up with nothing', () => {
    expect(errors('a: 1\n    b: 2')[0].message).toMatch(/indented further/)
  })

  it('flags a mapping line that forgot its colon', () => {
    expect(errors('a: 1\nb 2\nc: 3')[0].message).toMatch(/Expected `key: value`/)
  })

  it('carries on past a broken line rather than giving up on the document', () => {
    expect(tree('a: 1\nb 2\nc: 3')).toEqual({ a: '1', c: '3' })
  })

  it('warns about a duplicate key without dropping the document', () => {
    const { value, diagnostics } = parse('a: 1\na: 2')
    expect(value).toEqual({ a: '2' })
    expect(diagnostics.find((d) => d.severity === 'warning')?.message).toMatch(/Duplicate key/)
  })

  it('points out quotes that have stopped doing anything', () => {
    const hints = parse("a: '[x](y)'\nb: '+1 555'\nc: 'ORM: Prisma'").diagnostics
    expect(hints).toHaveLength(3)
    expect(hints.every((d) => d.severity === 'hint')).toBe(true)
  })

  it('leaves quotes alone where they still do work', () => {
    expect(parse("- 'Analytics: Mixpanel'\n- 'true'\n- ' padded '").diagnostics).toEqual([])
  })

  it('never throws on a half-typed document', () => {
    const doc = DEFAULT_YAML
    for (let i = 0; i < doc.length; i += 37) expect(() => parse(doc.slice(0, i))).not.toThrow()
  })
})

describe('needsQuotes', () => {
  it.each([
    ['[x](y)', false, false],
    ['+1 555', false, false],
    ['ORM: Prisma', false, false],
    ['ORM: Prisma', true, true],
    ['**bold**', true, false],
    ['true', false, true],
    [' padded ', false, true],
    ['', false, true],
    ['|', false, true],
    ["'quoted'", false, true],
    ['- dash', true, true],
  ])('%s at item start %s → %s', (text, atItemStart, expected) => {
    expect(needsQuotes(text, atItemStart)).toBe(expected)
  })
})

describe('the shipped document', () => {
  it('parses with nothing to report', () => {
    expect(parse(DEFAULT_YAML).diagnostics).toEqual([])
  })

  it('still says what the templates read', () => {
    const cv = tree(DEFAULT_YAML)
    expect(cv.header.contact).toContain('+1 555 010 1234')
    expect(cv.sections.map((/** @type {any} */ s) => s.type)).toEqual([
      'summary',
      'skills',
      'experience',
      'projects',
      'education',
      'certifications',
      'languages',
      'list',
      'oss',
    ])
    expect(cv.sections.find((/** @type {any} */ s) => s.type === 'list').inline).toBe(true)
    expect(cv.sections.find((/** @type {any} */ s) => s.type === 'oss').hasHeader).toBe(false)
  })
})

describe('splitLine', () => {
  it('takes a line apart the way the tokenizer needs', () => {
    expect(splitLine('  - title: Some text: more')).toMatchObject({ indent: 2, dashes: [2], content: 4, key: 'title', colon: 9, value: 11 })
    expect(splitLine('    - plain text')).toMatchObject({ dashes: [4], key: null, content: 6, value: 6 })
    expect(splitLine('  # note')).toMatchObject({ comment: 2, key: null })
    expect(splitLine('  bullets:')).toMatchObject({ key: 'bullets', value: -1 })
    expect(splitLine('')).toMatchObject({ indent: 0, key: null, value: -1 })
  })

  it('matches a key only where one can be', () => {
    expect(KEY_RE.test('title: x')).toBe(true)
    expect(KEY_RE.test('title:x')).toBe(false)
    expect(KEY_RE.test('two words: x')).toBe(false)
    expect(KEY_RE.test('1st: x')).toBe(false)
    expect(KEY_RE.test('has-Header: x')).toBe(true)
  })
})
