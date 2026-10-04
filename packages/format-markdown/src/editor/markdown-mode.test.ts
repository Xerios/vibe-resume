/**
 * The colours, end to end: the document as the tokenizer hands it to
 * CodeMirror, with `@lezer/highlight`'s class highlighter standing in for
 * cm-highlight.ts — so a run reads as the tags it carries. It has no class for
 * a list marker or a strikethrough, so those two are added.
 */

import { classHighlighter, highlightTree, tagHighlighter, tags as t } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { markdownLanguage } from './markdown-mode'

const extra = tagHighlighter([
  { tag: t.list, class: 'tok-list' },
  { tag: t.strikethrough, class: 'tok-strikethrough' },
])

/**
 * Every styled run of a document as `text=tags`.
 */
function paint(doc: string) {
  const out: string[] = []
  highlightTree(markdownLanguage.parser.parse(doc), [classHighlighter, extra], (from: number, to: number, cls: string) => {
    out.push(doc.slice(from, to) + '=' + cls.replace(/tok-/g, ''))
  })
  return out
}

describe('the markdown inside a line', () => {
  it('marks up links, bare addresses and strikethrough', () => {
    expect(paint('See [site](https://x.dev), www.x.dev and ~~old~~\n')).toEqual([
      '[=punctuation',
      'site=link',
      '](=punctuation',
      'https://x.dev)=url',
      'www.x.dev=link',
      '~~=punctuation',
      'old=strikethrough',
      '~~=punctuation',
    ])
  })

  it('keeps a heading a heading underneath', () => {
    expect(paint('## **Big** news\n')).toEqual(['## =heading', '**=heading punctuation', 'Big=heading strong', '**=heading punctuation', ' news=heading'])
  })

  it('stops at a comment and picks out a type', () => {
    expect(paint('- Kit <!-- rating: 4 -->\n## Talks\n<!-- type: list -->\n')).toEqual([
      '- =list',
      '<!-- rating: 4 -->=comment',
      '## Talks=heading',
      '<!-- type: =comment',
      'list=typeName strong',
      ' -->=comment',
    ])
  })
})

describe('lines read for more than their markdown', () => {
  it('marks a phone number in the contact list, and only there', () => {
    const doc = '# Jo\n\n- +1 555 010 1234\n\n## Notes\n\n- +1 555 010 1234\n'
    expect(paint(doc)).toEqual(['# Jo=heading', '- =list', '+1 555 010 1234=link', '## Notes=heading', '- =list'])
  })

  it('marks the dates under an entry heading', () => {
    const doc = '# Jo\n## Work\n### Acme\n**03/2020–Present** · Remote\n\n2020–2021 under it is just text\n'
    expect(paint(doc)).toEqual([
      '# Jo=heading',
      '## Work=heading',
      '### Acme=heading',
      '**=punctuation',
      '03/2020=number strong',
      '–=strong',
      'Present=number strong',
      '**=punctuation',
    ])
  })
})
