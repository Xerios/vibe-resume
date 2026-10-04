import { describe, expect, it } from 'vitest'
import { lintWriting } from './writing'

/**
 * Lint a CV written one value to a line, as `path: value`, with the line map a
 * format would give it. What comes back is the text each finding underlines.
 */
function lint(cv: Record<string, unknown>) {
  const rows: string[] = []
  const lines = new Map<string, number>()
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      lines.set(path, rows.length + 1)
      rows.push(`${path}: ${v}`)
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
  }
  walk(cv, '')
  const text = rows.join('\n')
  return lintWriting(text, { value: cv, lines }).map((d) => ({ text: text.slice(d.from, d.to), severity: d.severity, message: d.message }))
}

const job = (entry: Record<string, unknown>) => ({ sections: [{ type: 'entries', title: 'Experience', items: [{ title: 'Engineer', ...entry }] }] })
const bullets = (dates: string, ...list: string[]) => lint(job({ dates, bullets: list }))
const sub = (text: string) => lint(job({ sub: text }))
const underlined = (found: Array<{ text: string }>) => found.map((f) => f.text)

describe('punctuation', () => {
  it('wants a space after a comma, a colon and a full stop, and none before', () => {
    expect(underlined(sub('APIs,tools and SDKs'))).toEqual([','])
    expect(underlined(sub('Note:see below'))).toEqual([':'])
    expect(underlined(sub('Shipped it.Then more'))).toEqual(['.'])
    expect(underlined(sub('Fast , cheap'))).toEqual([' ,'])
  })

  it('leaves decimals, times, names and addresses alone', () => {
    expect(sub('1,000 users at 10:30, on Node.js and ASP.NET, e.g. this, https://a.dev/x,y and jo@a.dev')).toEqual([])
  })

  it('wants a space outside brackets', () => {
    expect(underlined(sub('Springfield(remote)team'))).toEqual(['(', ')'])
    expect(sub('one or more role(s) via useState() — see [docs](https://x.dev/a(b))')).toEqual([])
  })

  it('never starts a line with punctuation', () => {
    expect(underlined(sub(', and more'))).toEqual([','])
    expect(sub('.NET services')).toEqual([])
  })

  it('puts a space between a number and its unit', () => {
    expect(lint(job({ sub: 'p99 under 100ms on 2GB' }))[0].message).toContain('100 ms')
    expect(underlined(sub('p99 under 100ms on 2GB'))).toEqual(['100ms', '2GB'])
    expect(sub('10k users, 5M rows, 99% uptime, 4K video')).toEqual([])
  })

  it('closes up a slash or a hyphen joining two things', () => {
    expect(underlined(sub('Frontend / Backend'))).toEqual([' / '])
    expect(underlined(sub('front -end'))).toEqual([' -'])
    expect(sub('pre- and post-processing, CI/CD')).toEqual([])
  })

  it('knows a hyphen from an en dash from an em dash', () => {
    expect(lint(job({ sub: 'Payments - the hard part' }))[0].message).toContain('em dash')
    expect(lint(job({ sub: 'Pages 3 - 7' }))[0].message).toContain('en dash')
    expect(underlined(sub('From 2016-2020, word---word'))).toEqual(['2016-2020', '---'])
    expect(sub('555-010-1234, ID AWS-1234-5678, run with --verbose')).toEqual([])
  })

  it('wants curly quotation marks, and leaves apostrophes alone', () => {
    expect(underlined(sub('the "Atlas" project and the \'Hermes\' one'))).toEqual(['"Atlas"', "'Hermes'"])
    expect(sub("the team's tools, don't")).toEqual([])
  })

  it('wants one space between words', () => {
    expect(underlined(sub('two  spaces'))).toEqual(['  '])
  })

  it('leaves the full stop off a list item, but not off an abbreviation', () => {
    expect(underlined(bullets('', 'Shipped it.', 'Hired designers, engineers, etc.', 'Shipped **this**.'))).toEqual(['.', '.'])
  })

  it('wants a full stop at the end of a long list item', () => {
    const long = 'Led the migration of the billing platform to a new event-driven architecture across four teams'
    expect(bullets('', `${long}.`, 'Shipped it. Then it scaled.')).toEqual([])
    const found = bullets('', long, 'Shipped it. Then it scaled;')
    expect(underlined(found)).toEqual(['s', ';'])
    expect(found.map((f) => f.message)).toEqual(['End a long list item with a full stop.', 'End a long list item with a full stop.'])
  })

  it('wants a full stop on every item of a list that has a long one', () => {
    const long = 'Led the migration of the billing platform to a new event-driven architecture across four teams.'
    expect(bullets('', 'Shipped it.', long)).toEqual([])
    const found = bullets('', 'Shipped it', long, 'Hired two engineers;', 'Hired designers, engineers, etc.')
    expect(underlined(found)).toEqual(['t', ';'])
    expect(found[0].message).toBe('This list is written in sentences: end each item with a full stop.')
    expect(underlined(bullets('', 'Shipped it.', 'Hired two engineers'))).toEqual(['.'])
  })
})

describe('grammar', () => {
  it('starts a bullet with the verb, not the subject', () => {
    expect(underlined(bullets('', 'I led a team', 'We shipped it'))).toEqual(['I', 'We'])
    expect(bullets('', 'I/O-bound services tuned')).toEqual([])
  })

  it('puts a finished role in the past tense', () => {
    const found = bullets('2016–2020', 'Develop the API', 'Managing a team', 'Leads hiring', 'Shipping weekly', 'Led a team')
    expect(found.map((f) => f.message.match(/‘(\w+)’/)?.[1])).toEqual(['Developed', 'Managed', 'Led', 'Shipped'])
  })

  it('puts a role still going in the present tense', () => {
    expect(underlined(bullets('03/2020–Present', 'Led a team', 'Lead a team'))).toEqual(['Led'])
  })

  it('says nothing about tense when it can’t tell when a role was', () => {
    expect(bullets('Summer 2019', 'Develop the API', 'Led a team')).toEqual([])
  })

  it('wants a name where a CV calls itself one', () => {
    expect(lint({ header: { name: 'My Resume' } })[0].severity).toBe('warning')
    expect(lint({ header: { name: 'CV' } })).toHaveLength(1)
    expect(lint({ header: { name: 'Jo Doe' } })).toEqual([])
  })

  it('leaves personal details off', () => {
    expect(underlined(lint({ header: { contact: ['Date of birth: 1990-01-01', 'Springfield', '742 Evergreen Road', 'Married'] } }))).toEqual([
      'Date of birth',
      '742 Evergreen Road',
      'Married',
    ])
  })

  it('wants the year in full, and an en dash in a range', () => {
    expect(underlined(lint(job({ dates: "05/06 – Jun '08" })))).toEqual(['05/06', "'08"])
    expect(underlined(lint(job({ dates: '2016 - 2020' })))).toEqual([' - '])
    expect(underlined(lint(job({ dates: '2016—2020' })))).toEqual(['—'])
    expect(underlined(lint(job({ dates: '2010 – 2014' })))).toEqual([' – '])
    expect(lint(job({ dates: 'Mar 2020 – Present' }))).toEqual([])
    expect(lint(job({ dates: '2015.05–2016.06' }))).toEqual([])
  })
})

describe('spelling', () => {
  it('corrects the names in the guide’s table', () => {
    const found = sub('javascript, mysql, Xcode, IOS and jquery')
    expect(found.map((f) => f.message.match(/‘([^’]+)’/)?.[1])).toEqual(['JavaScript', 'MySQL', 'iOS', 'jQuery'])
    expect(found.find((f) => f.text === 'IOS')?.severity).toBe('info')
  })

  it('corrects a name that is also a word only where it stands alone in a list', () => {
    expect(underlined(sub('React, Node, Go'))).toEqual(['Node'])
    expect(sub('Built a node pool for the cluster')).toEqual([])
  })

  it('leaves file names, packages, code and addresses alone', () => {
    expect(sub('index.html, node-fetch, `git rebase`, https://github.com/x/python and Node.js')).toEqual([])
  })

  it('takes the longer name first', () => {
    expect(underlined(sub('android studio'))).toEqual(['android studio'])
  })
})

describe('date formats', () => {
  const jobs = (list: string[]) =>
    lint({ sections: [{ type: 'entries', items: list.map((dates) => ({ title: 'Dev', dates })) }] }).filter((f) => f.message.startsWith('Most dates'))

  it('points at the one written differently from the rest', () => {
    const [found, ...rest] = jobs(['03/2020 – Present', '06/2016 – 02/2020', 'Mar 2014 – May 2016'])
    expect(rest).toEqual([])
    expect(found.severity).toBe('info')
    expect(found.text).toBe('Mar 2014 – May 2016')
    expect(found.message).toContain('`03/2020`')
  })

  it('catches a range that switches halfway', () => {
    expect(jobs(['03/2020 – Present', '06/2016 – Feb 2020'])).toHaveLength(1)
  })

  it('lets a bare year sit beside months', () => {
    expect(jobs(['03/2020 – Present', '2010 – 2014', '2016-2020'])).toEqual([])
  })

  it('leaves what it cannot read alone', () => {
    expect(jobs(['Summer 2019', 'mars 2020 – présent', '03/2020 – 05/2021'])).toEqual([])
  })
})

describe('where a finding lands', () => {
  it('underlines the same occurrence in the source as in the value', () => {
    const text = 'sub: a,b,c'
    const [, second] = lintWriting(text, { value: { sub: 'a,b,c' }, lines: new Map([['sub', 1]]) })
    expect(second.from).toBe(text.lastIndexOf(','))
  })

  it('falls back to the line when the source was rewritten', () => {
    const text = '- "Shipped\n  it"'
    const [found] = lintWriting(text, { value: { bullets: ['"Shipped it"'] }, lines: new Map([['bullets.0', 1]]) })
    expect(text.slice(found.from, found.to)).toBe('- "Shipped')
  })
})

describe('fixes', () => {
  /** Apply every finding's fix to a one-value document, back to front, and return the value. */
  const fixed = (key: string, value: string, cv: Record<string, unknown> = { [key]: value }) => {
    const text = `${key}: ${value}`
    const found = lintWriting(text, { value: cv, lines: new Map([[key, 1]]) })
    let out = text
    for (const d of found.toReversed()) if (d.fixes) out = out.slice(0, d.from) + d.fixes[0].insert + out.slice(d.to)
    return out.slice(key.length + 2)
  }

  it('mends punctuation, dashes, quotes and spelling in place', () => {
    expect(fixed('sub', 'APIs,tools (remote)team , and "Atlas"  in javascript')).toBe('APIs, tools (remote) team, and “Atlas” in JavaScript')
    expect(fixed('sub', 'Payments - the hard part, 2016-2020, p99 at 100ms')).toBe('Payments — the hard part, 2016–2020, p99 at 100 ms')
  })

  it('closes up a range between single-word ends, and spaces one between longer ends', () => {
    expect(fixed('dates', '2016 - 2020')).toBe('2016–2020')
    expect(fixed('dates', 'Mar 2016 — Present')).toBe('Mar 2016 – Present')
    expect(fixed('dates', '2010 – 2014')).toBe('2010–2014')
  })

  it('puts a finished role’s verb in the past tense', () => {
    const cv = { dates: '2016–2020', bullets: ['Develop the API.'] }
    const text = 'dates: 2016–2020\n- Develop the API.'
    const found = lintWriting(text, {
      value: cv,
      lines: new Map([
        ['dates', 1],
        ['bullets.0', 2],
      ]),
    })
    expect(found.map((d) => d.fixes?.[0])).toEqual([
      { label: 'Write ‘Developed’', insert: 'Developed' },
      { label: 'Remove the ‘.’', insert: '' },
    ])
  })

  it('offers nothing where the finding fell back to the whole line', () => {
    const text = '- "Shipped\n  it"'
    const [found] = lintWriting(text, { value: { bullets: ['"Shipped it"'] }, lines: new Map([['bullets.0', 1]]) })
    expect(found.fixes).toBeUndefined()
  })

  it('leaves a rewrite it can’t make mechanically to the writer', () => {
    expect(lint(job({ bullets: ['I led a team'] }))).toHaveLength(1)
    const text = 'b: I led a team'
    const [found] = lintWriting(text, { value: { bullets: ['I led a team'] }, lines: new Map([['bullets.0', 1]]) })
    expect(found.fixes).toBeUndefined()
  })
})
