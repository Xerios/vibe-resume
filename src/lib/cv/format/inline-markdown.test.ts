/**
 * What the editor is allowed to call markdown. The interesting half of these is
 * the *negative* half — an underscore in a name, a lone asterisk, a link that
 * hasn't been closed yet — because a resume is full of text that only looks
 * like markup, and colouring it as markup would be a lie about what the page
 * will render.
 */

import { describe, expect, it } from 'vitest'
import { contactRuns, dateRuns, inlineRuns } from './inline-markdown'

/**
 * Each run as `token:text`, with plain runs left bare.
 */
function runs(text: string, from = 0) {
  return inlineRuns(text, from).map((r: any) => {
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

describe('autolinks', () => {
  it('marks a bare address as a link, with the scheme the page drops as markup', () => {
    expect(runs('https://github.com/x')).toEqual(['cvMdMark cvMdLink:https://', 'cvMdLink:github.com/x'])
    expect(runs('see www.x.dev/a.')).toEqual(['see ', 'cvMdLink:www.x.dev/a', '.'])
    expect(runs('ftp://x.dev')).toEqual(['cvMdLink:ftp://x.dev'])
    expect(runs('mail jo.doe@x.dev, today')).toEqual(['mail ', 'cvMdLink:jo.doe@x.dev', ', today'])
    expect(runs('<https://x.dev>')).toEqual(['cvMdMark:<', 'cvMdMark cvMdLink:https://', 'cvMdLink:x.dev', 'cvMdMark:>'])
  })

  it('leaves what marked would not link alone', () => {
    expect(runs('github.com/x')).toEqual(['github.com/x'])
    expect(runs('the web')).toEqual(['the web'])
    expect(runs('@handle')).toEqual(['@handle'])
    expect(runs('[site](https://x.dev)')).toEqual(['cvMdMark:[', 'cvMdLink:site', 'cvMdMark:](', 'cvMdUrl:https://x.dev)'])
    expect(runs('[https://x.dev](u)')).toEqual(['cvMdMark:[', 'cvMdLink:https://x.dev', 'cvMdMark:](', 'cvMdUrl:u)'])
  })

  it('reads the markdown around one', () => {
    expect(runs('**https://x.dev**')).toEqual(['cvMdMark:**', 'cvMdMark cvMdLink:https://', 'cvMdStrong cvMdLink:x.dev', 'cvMdMark:**'])
    expect(runs('https://x.dev/a_b_c')).toEqual(['cvMdMark cvMdLink:https://', 'cvMdLink:x.dev/a_b_c'])
  })
})

/**
 * A contact line's runs, the same way.
 */
function contact(text: string) {
  return contactRuns(text).map((r: any) => {
    const s = text.slice(r.from, r.to)
    return r.token ? `${r.token}:${s}` : s
  })
}

describe('contact lines', () => {
  it('marks a phone number as the link it becomes', () => {
    expect(contact('+1 555 010 1234')).toEqual(['cvMdLink:+1 555 010 1234'])
    expect(contact('Mobile phone: (555) 010-1234 ')).toEqual(['Mobile phone: ', 'cvMdLink:(555) 010-1234', ' '])
    expect(contact("'+1 555 010 1234'")).toEqual(["'", 'cvMdLink:+1 555 010 1234', "'"])
  })

  it('reads anything else as any other value', () => {
    expect(contact('10115 Berlin')).toEqual(['10115 Berlin'])
    expect(contact('2016-2020')).toEqual(['2016-2020'])
    expect(contact('jo@x.dev')).toEqual(['cvMdLink:jo@x.dev'])
  })
})

/**
 * A `dates` value's runs, the same way.
 */
function dates(text: string) {
  return dateRuns(text).map((r: any) => {
    const s = text.slice(r.from, r.to)
    return r.token ? `${r.token}:${s}` : s
  })
}

describe('dates', () => {
  it('marks each end of a range that reads as a date', () => {
    expect(dates('03/2020 – Present')).toEqual(['cvDate:03/2020', ' – ', 'cvDate:Present'])
    expect(dates('Mar 2020 to Jan 2021 ')).toEqual(['cvDate:Mar 2020', ' to ', 'cvDate:Jan 2021', ' '])
    expect(dates('2014–2016')).toEqual(['cvDate:2014', '–', 'cvDate:2016'])
    expect(dates('2021')).toEqual(['cvDate:2021'])
    expect(dates("'2020-03 - now'")).toEqual(["'", 'cvDate:2020-03', ' - ', 'cvDate:now', "'"])
  })

  it('reads an end that is not a date as any other value', () => {
    expect(dates('Summer 2019 – **2020**')).toEqual(['Summer 2019', ' – ', 'cvMdMark:**', 'cvMdStrong:2020', 'cvMdMark:**'])
    expect(dates('2019-2020')).toEqual(['2019-2020'])
  })
})

describe('html tags', () => {
  it('takes a whole tag as one run', () => {
    expect(runs('one<br>two')).toEqual(['one', 'cvMdHtml:<br>', 'two'])
    expect(runs('a <b>bold</b> word')).toEqual(['a ', 'cvMdHtml:<b>', 'bold', 'cvMdHtml:</b>', ' word'])
    expect(runs('<span class="x">x</span>')).toEqual(['cvMdHtml:<span class="x">', 'x', 'cvMdHtml:</span>'])
    expect(runs('line<br />')).toEqual(['line', 'cvMdHtml:<br />'])
  })

  it('leaves a stray angle bracket alone', () => {
    expect(runs('a < b and c > d')).toEqual(['a < b and c > d'])
    expect(runs('<3')).toEqual(['<3'])
    expect(runs('scaled <2x')).toEqual(['scaled <2x'])
    expect(runs('unclosed <b')).toEqual(['unclosed <b'])
    expect(runs('<!-- note -->')).toEqual(['<!-- note -->'])
  })

  it('still reads the markdown around it', () => {
    expect(runs('**a**<br>_b_')).toEqual(['cvMdMark:**', 'cvMdStrong:a', 'cvMdMark:**', 'cvMdHtml:<br>', 'cvMdMark:_', 'cvMdEm:b', 'cvMdMark:_'])
  })
})

describe('the runs themselves', () => {
  const lines = [
    'Full-stack engineer with **10+ years** of experience.',
    '- [github.com/example](https://github.com/example)',
    '**Umbrella Startups** — Freelance developer. _WordPress, PHP._',
    'plain text with no markup at all',
    'Senior dev<br>Remote, since **2020**',
    'at https://x.dev/a. or jo@x.dev',
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
