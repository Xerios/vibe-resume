import { describe, expect, it } from 'vitest'
import { contactRuns, runs, textOf } from './inline'

describe('runs', () => {
  it('splits emphasis, code and strikethrough into marked runs', () => {
    expect(runs('**10+ years** of _work_ in `C#` ~~and~~')).toEqual([
      { text: '10+ years', strong: true },
      { text: ' of ' },
      { text: 'work', em: true },
      { text: ' in ' },
      { text: 'C#', code: true },
      { text: ' ' },
      { text: 'and', del: true },
    ])
  })

  it('nests marks', () => {
    expect(runs('***both***')).toEqual([{ text: 'both', em: true, strong: true }])
  })

  it('keeps a link label as written and prints a bare address without its scheme', () => {
    expect(runs('[Acme](https://acme.test)')).toEqual([{ text: 'Acme', href: 'https://acme.test' }])
    expect(runs('https://github.com/x')).toEqual([{ text: 'github.com/x', href: 'https://github.com/x' }])
    expect(runs('see <https://x.dev>.')).toEqual([{ text: 'see ' }, { text: 'x.dev', href: 'https://x.dev' }, { text: '.' }])
    expect(runs('[https://x.dev](https://x.dev)')[0].text).toBe('https://x.dev')
  })

  it('links a mail address', () => {
    expect(runs('jane@example.com')).toEqual([{ text: 'jane@example.com', href: 'mailto:jane@example.com' }])
  })

  it('reduces raw HTML to its text and decodes entities', () => {
    expect(textOf(runs('a <b>bold</b> &amp; b'))).toBe('a bold & b')
  })

  it('survives whatever a half-typed document holds', () => {
    expect(runs(undefined)).toEqual([])
    expect(runs('')).toEqual([])
    expect(runs({ a: 1 })).toEqual([])
    expect(runs(2023)).toEqual([{ text: '2023' }])
  })
})

describe('contactRuns', () => {
  it('links a phone number, dialable', () => {
    expect(contactRuns('+1 555 010 1234')).toEqual([{ text: '+1 555 010 1234', href: 'tel:+15550101234' }])
    expect(contactRuns('Phone: (555) 010-1234')).toEqual([{ text: 'Phone: ' }, { text: '(555) 010-1234', href: 'tel:5550101234' }])
  })

  it('leaves anything that only contains digits alone', () => {
    expect(contactRuns('10115 Berlin')).toEqual([{ text: '10115 Berlin' }])
    expect(contactRuns('2016-2020')).toEqual([{ text: '2016-2020' }])
  })
})
