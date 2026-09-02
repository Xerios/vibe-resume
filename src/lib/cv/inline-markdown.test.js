/**
 * What the editor is allowed to call markdown. The interesting half of these is
 * the *negative* half — an underscore in a name, a lone asterisk, a link that
 * hasn't been closed yet — because a resume is full of text that only looks
 * like markup, and colouring it as markup would be a lie about what the page
 * will render.
 */

import { describe, expect, it } from 'vitest'
import { inlineRuns } from './inline-markdown.js'

/**
 * Each run as `token:text`, with plain runs left bare.
 * @param {string} text
 * @param {number} [from]
 */
function runs(text, from = 0) {
  return inlineRuns(text, from).map((r) => {
    const s = text.slice(r.from, r.to)
    return r.token ? `${r.token}:${s}` : s
  })
}

describe('emphasis', () => {
  it('splits the markers off the words they wrap', () => {
    expect(runs('a **bold** word')).toEqual(['a ', 'cvMdMark:**', 'cvMdStrong:bold', 'cvMdMark:**', ' word'])
    expect(runs('_slanted_')).toEqual(['cvMdMark:_', 'cvMdEm:slanted', 'cvMdMark:_'])
    expect(runs('~~gone~~')).toEqual(['cvMdMark:~~', 'cvMdStrike:gone', 'cvMdMark:~~'])
    expect(runs('`code`')).toEqual(['cvMdMark:`', 'cvMdCode:code', 'cvMdMark:`'])
  })

  it('leaves text that only looks like markup alone', () => {
    expect(runs('a snake_case_name here')).toEqual(['a snake_case_name here'])
    expect(runs('5 * 3 * 2')).toEqual(['5 * 3 * 2'])
    expect(runs('a ** b')).toEqual(['a ** b'])
    expect(runs('**unclosed')).toEqual(['**unclosed'])
    expect(runs('C++ / C#')).toEqual(['C++ / C#'])
  })

  it('nests, joining the names', () => {
    expect(runs('**_both_**')).toEqual(['cvMdMark:**', 'cvMdMark:_', 'cvMdStrong cvMdEm:both', 'cvMdMark:_', 'cvMdMark:**'])
  })

  it('reads a code span as literal text', () => {
    expect(runs('`**not bold**`')).toEqual(['cvMdMark:`', 'cvMdCode:**not bold**', 'cvMdMark:`'])
  })
})

describe('links', () => {
  it('separates the label from the destination', () => {
    expect(runs('[example.dev](https://example.dev)')).toEqual(['cvMdMark:[', 'cvMdLink:example.dev', 'cvMdMark:](', 'cvMdUrl:https://example.dev)'])
  })

  it('carries its styling into the label', () => {
    expect(runs('[**a**](u)')).toEqual(['cvMdMark:[', 'cvMdMark:**', 'cvMdLink cvMdStrong:a', 'cvMdMark:**', 'cvMdMark:](', 'cvMdUrl:u)'])
  })

  it('waits for the whole thing before colouring any of it', () => {
    expect(runs('[example.dev](')).toEqual(['[example.dev]('])
    expect(runs('[example.dev]')).toEqual(['[example.dev]'])
    expect(runs('an array[0] of things')).toEqual(['an array[0] of things'])
  })
})

describe('the runs themselves', () => {
  const lines = [
    'Full-stack engineer with **10+ years** of experience.',
    '- [github.com/example](https://github.com/example)',
    '**Umbrella Startups** — Freelance developer. _WordPress, PHP._',
    'plain text with no markup at all',
    '',
  ]

  it('are contiguous and cover the range asked for', () => {
    for (const line of lines) {
      for (const from of [0, 2]) {
        if (from > line.length) continue
        const out = inlineRuns(line, from)
        expect(out.map((r) => line.slice(r.from, r.to)).join('')).toBe(line.slice(from))
        let at = from
        for (const r of out) {
          expect(r.from).toBe(at)
          expect(r.to).toBeGreaterThan(r.from)
          at = r.to
        }
        expect(at).toBe(line.length)
      }
    }
  })

  it('starts where it is told to', () => {
    const line = 'name: **Bold**'
    expect(runs(line, 6)).toEqual(['cvMdMark:**', 'cvMdStrong:Bold', 'cvMdMark:**'])
  })
})
