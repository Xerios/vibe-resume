/**
 * The colours, end to end: the document as the tokenizer hands it to
 * CodeMirror. `@lezer/highlight`'s own class highlighter stands in for
 * cm-highlight.js here, so a run reads as the tags it carries rather than as a
 * CSS class — a tag it has no class for (`content`, `monospace`) comes out
 * bare, which is the highlighter's gap and not the mode's.
 */

import { classHighlighter, highlightTree } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { relaxedYamlLanguage } from './relaxed-yaml-mode.js'

/**
 * Every styled run of a document as `text=tags`.
 * @param {string} doc
 */
function paint(doc) {
  /** @type {string[]} */
  const out = []
  highlightTree(relaxedYamlLanguage.parser.parse(doc), classHighlighter, (from, to, cls) => {
    out.push(doc.slice(from, to) + '=' + cls.replace(/tok-/g, ''))
  })
  return out
}

describe('markdown inside a value', () => {
  it('marks up a bare value', () => {
    expect(paint('- [github.com/example](https://github.com/example)\n')).toEqual([
      '- =punctuation',
      '[=punctuation',
      'github.com/example=link',
      '](=punctuation',
      'https://github.com/example)=url',
    ])
  })

  it('keeps a quoted value a string underneath', () => {
    expect(paint('name: "**Bold** name"\n')).toEqual([
      'name=propertyName definition',
      ': =punctuation',
      '"=string',
      '**=string punctuation',
      'Bold=string strong',
      '**=string punctuation',
      ' name"=string',
    ])
  })

  it('keeps a block body a block underneath, to the end of the body', () => {
    const doc = 'summary: |\n  A **bold** claim.\n  note: not a key\nafter: plain\n'
    expect(paint(doc)).toEqual([
      'summary=propertyName definition',
      ': =punctuation',
      '|=string2',
      'A =string2',
      '**=string2 punctuation',
      'bold=string2 strong',
      '**=string2 punctuation',
      ' claim.=string2',
      'note: not a key=string2',
      'after=propertyName definition',
      ': =punctuation',
    ])
  })

  it('settles what a value is before reading the markdown in it', () => {
    // `true` partway through a sentence is part of the sentence, and a value
    // that starts as text stays text.
    expect(paint('odd: it is **true**\n')).toEqual(['odd=propertyName definition', ': =punctuation', '**=punctuation', 'true=strong', '**=punctuation'])
    expect(paint('flag: true\n')).toEqual(['flag=propertyName definition', ': =punctuation', 'true=bool'])
  })
})
