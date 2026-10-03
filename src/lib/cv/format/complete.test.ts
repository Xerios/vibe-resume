/**
 * What the editor offers, pinned.
 *
 * Two halves. The first is `spotAt` — the question "which mapping is the cursor
 * in", which is the whole of the hard part, since everything after it is a
 * table lookup. The second is the table lookup against the shipped document:
 * every key it uses has to be one the editor would have offered, which is what
 * stops complete.js and lint.js drifting apart the way two copies of a schema
 * always do.
 */

import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { cvComplete, keysAt, opensValues, sectionSkeleton, spotAt } from './complete.js'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { SECTIONS, lintCv } from './lint.js'
import { parse, splitLine } from './relaxed-yaml.js'

/** A document with the cursor written as `|`. */
const spot = (/** @type {string} */ src) => spotAt(src.replace('|', ''), src.indexOf('|'))

/** The keys on offer where the cursor is. */
const keys = (/** @type {string} */ src) => {
  const at = spot(src)
  return at && at.what === 'key' ? keysAt(at.path, parse(src.replace('|', '')).value) : null
}

/** Every label the editor would offer where the cursor is. */
const labels = (/** @type {string} */ src, explicit = true) => {
  const text = src.replace('|', '')
  const state = EditorState.create({ doc: text })
  const result = cvComplete(new CompletionContext(state, src.indexOf('|'), explicit))
  return result?.options.map((o) => o.label) ?? null
}

describe('where the cursor is', () => {
  it('puts a key at the top level in the document itself', () => {
    expect(spot('h|')).toMatchObject({ what: 'key', path: '', from: 0, colon: false })
  })

  it('reads a key under a mapping as that mapping’s', () => {
    expect(keys('header:\n  na|')).toEqual(['name', 'role', 'contact', 'lang'])
  })

  it('reads a key on a `- ` line as the item’s own', () => {
    expect(keys('sections:\n  - ty|')).toContain('type')
  })

  it('takes a section’s type from the document, not from the indentation', () => {
    expect(keys('sections:\n  - type: levels\n    it|')).toEqual(['type', 'title', 'rail', 'items'])
    expect(keys('sections:\n  - type: table\n    co|')).toEqual(['type', 'title', 'rail', 'items', 'columns'])
  })

  it('reaches an entry inside a section', () => {
    expect(keys('sections:\n  - type: levels\n    items:\n      - name: English\n        le|')).toEqual(['name', 'level', 'note', 'rating'])
  })

  it('reaches a row inside a groups block', () => {
    expect(keys('sections:\n  - type: groups\n    blocks:\n      - title: Core\n        rows:\n          - ti|')).toEqual(['tier', 'text'])
  })

  it('counts the items above it, so the second entry is not the first', () => {
    const at = spot('sections:\n  - type: levels\n    items:\n      - name: English\n      - na|')
    expect(at?.path).toBe('sections.0.items.1')
  })

  it('sees a key it is in the middle of, and knows the colon is already there', () => {
    expect(spot('header:\n  nam|e: Jo')).toMatchObject({ what: 'key', path: 'header', colon: true })
  })

  it('is past the key once the cursor is past the colon', () => {
    expect(spot('sections:\n  - type: exp|')).toMatchObject({ what: 'value', key: 'type', path: 'sections.0' })
  })

  it('offers nothing where the content is prose', () => {
    expect(keys('sections:\n  - type: list\n    items:\n      - Che|')).toBeNull()
    expect(keys('sections:\n  - type: text\n    paragraphs:\n      - Full-|')).toBeNull()
    expect(keys('header:\n  contact:\n    - Springfield|')).toBeNull()
  })

  it('offers nothing inside a comment, a block body, or a line’s indentation', () => {
    expect(spot('header:\n  # na|')).toBeNull()
    expect(spot('header:\n  role: >\n    Some pro|se here')).toBeNull()
    expect(spot('header:\n |   name: Jo')).toBeNull()
  })
})

describe('what it offers', () => {
  it('brings its own `: ` on a fresh key, and none on one being retyped', () => {
    const state = EditorState.create({ doc: 'header:\n  na' })
    const fresh = cvComplete(new CompletionContext(state, 12, true))
    expect(fresh?.options.find((o) => o.label === 'name')?.apply).toBe('name: ')

    const typo = EditorState.create({ doc: 'header:\n  nam: Jo' })
    const again = cvComplete(new CompletionContext(typo, 13, true))
    expect(again?.options.find((o) => o.label === 'name')?.apply).toBe('name')
  })

  it('offers the seven types as values of `type:`, and nothing for prose', () => {
    expect(labels('sections:\n  - type: |')).toEqual(['text', 'groups', 'entries', 'list', 'levels', 'records', 'table'])
    expect(labels('sections:\n  - type: list\n    title: |')).toBeNull()
  })

  it('offers a whole section where one can start, and not inside one', () => {
    expect(labels('sections:\n  |')).toContain('entries section')
    expect(labels('sections:\n  - |')).toContain('entries section')
    // The section already knows what it is; a skeleton here would nest one.
    expect(labels('sections:\n  - type: entries\n    |')).not.toContain('entries section')
  })

  it('sinks a key the entry already carries below the ones it is missing', () => {
    const state = EditorState.create({ doc: 'header:\n  name: Jo\n  n' })
    const found = cvComplete(new CompletionContext(state, 21, true))
    expect(found?.options.find((o) => o.label === 'name')?.boost).toBe(-1)
    expect(found?.options.find((o) => o.label === 'role')?.boost).toBe(0)
  })

  it('opens with nothing typed where a key is still missing', () => {
    expect(labels('header:\n  |', false)).toEqual(['name', 'role', 'contact', 'lang'])
    expect(labels('sections:\n  - |', false)).toContain('entries section')
  })

  it('stays quiet with nothing typed once the mapping says everything it can', () => {
    expect(labels('header:\n  name: Jo\n  role: Dev\n  contact:\n    - Here\n  |', false)).toBeNull()
    // Asking outright still answers, since one of them may be about to be retyped.
    expect(labels('header:\n  name: Jo\n  role: Dev\n  contact:\n    - Here\n  |', true)).toContain('name')
  })

  it('opens a closed set of values as soon as the `: ` is there', () => {
    expect(labels('sections:\n  - type: |', false)).toContain('entries')
    expect(labels('sections:\n  - type: entries\n    items:\n      - subtype: |', false)).toEqual(['job', 'earlier'])
    expect(labels('sections:\n  - type: list\n    inline: |', false)).toEqual(['true', 'false'])
    // Prose keeps its silence — there is no set of answers to offer.
    expect(labels('sections:\n  - type: list\n    title: |', false)).toBeNull()
  })

  it('sends a key with a closed set on to its values', () => {
    const state = EditorState.create({ doc: 'sections:\n  - ty' })
    const found = cvComplete(new CompletionContext(state, 17, true))
    const type = found?.options.find((o) => o.label === 'type')
    const title = found?.options.find((o) => o.label === 'title')
    expect(type && opensValues(type)).toBe(true)
    expect(title && opensValues(title)).toBe(false)
  })
})

describe('the shipped document', () => {
  it('uses no key the editor would not have offered', () => {
    const doc = parse(DEFAULT_YAML).value
    let from = 0
    for (const line of DEFAULT_YAML.split('\n')) {
      const p = splitLine(line)
      if (p.key !== null) {
        const at = spotAt(DEFAULT_YAML, from + p.content)
        expect(at?.what, line).toBe('key')
        expect(keysAt(String(at?.path), doc), line).toContain(p.key)
      }
      from += line.length + 1
    }
  })
})

/**
 * CodeMirror's own snippet placement, which is the whole reason the templates
 * are written with tabs: every line after the first is laid out as the start
 * line's indentation, plus one `indentUnit` per leading tab.
 * @param {string} template
 * @param {string} indent
 */
const place = (template, indent) =>
  template
    .split('\n')
    .map((line, i) => {
      if (i === 0) return line
      const tabs = /^\t*/.exec(line)?.[0].length ?? 0
      return indent + '  '.repeat(tabs) + line.slice(tabs)
    })
    .join('\n')

/** A snippet as it reads once every field has been tabbed past. */
const filled = (/** @type {string} */ text) => text.replace(/#\{([^{}]*)\}/g, '$1')

describe('the section skeletons', () => {
  it('lands as a section the linter has nothing to say about', () => {
    for (const type of Object.keys(SECTIONS)) {
      const doc = `sections:\n  ${filled(place(sectionSkeleton(type, true), '  '))}\n`
      expect(lintCv(doc), doc).toEqual([])
      const section = parse(doc).value.sections[0]
      expect(section.type).toBe(type)
      expect(Array.isArray(section[SECTIONS[type].holds]), type).toBe(true)
    }
  })

  it('reads the same whether the `- ` came with it or was already there', () => {
    for (const type of Object.keys(SECTIONS)) {
      const brought = `  ${place(sectionSkeleton(type, true), '  ')}`
      const already = `  - ${place(sectionSkeleton(type, false), '  ')}`
      expect(already, type).toBe(brought)
    }
  })
})
