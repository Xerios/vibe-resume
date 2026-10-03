import { describe, expect, it } from 'vitest'
import { formatWhen, isoWhen, parseDates, spokenDates } from './dates'

describe('parseDates', () => {
  it('reads a range in every format the lint knows', () => {
    const cases: [string, { year: number; month: number }][] = [
      ['03/2020 – Present', { year: 2020, month: 3 }],
      ['03.2020 - present', { year: 2020, month: 3 }],
      ['2020-03 to now', { year: 2020, month: 3 }],
      ['Mar 2020 — Present', { year: 2020, month: 3 }],
      ['Sept. 2020 – Present', { year: 2020, month: 9 }],
      ['March 2020 until present', { year: 2020, month: 3 }],
    ]
    for (const [text, start] of cases) {
      expect(parseDates(text)).toMatchObject({ start, end: 'present' })
    }
    expect(parseDates('06/2016 – 02/2020')).toMatchObject({ start: { year: 2016, month: 6 }, end: { year: 2020, month: 2 } })
    expect(parseDates('2010 – 2014')).toMatchObject({ start: { year: 2010 }, end: { year: 2014 } })
    expect(parseDates('2017.09–2017.12')).toMatchObject({ start: { year: 2017, month: 9 }, end: { year: 2017, month: 12 } })
  })

  it('reads a single date', () => {
    expect(parseDates('2012')).toMatchObject({ start: { year: 2012 }, end: null })
    expect(parseDates('11/2019')).toMatchObject({ start: { year: 2019, month: 11 }, end: null })
  })

  it('keeps the value as typed, cut at its separator', () => {
    expect(parseDates('03/2020 – Present')?.written).toEqual({ start: '03/2020', sep: ' – ', end: 'Present' })
  })

  it('claims nothing it can’t read', () => {
    for (const text of ['', 'Summer 2019', '13/2020', 'Present – 2020', '2019 – 2020 – 2021', 'Juni 2020']) expect(parseDates(text)).toBeNull()
  })
})

describe('formatting', () => {
  const m = { year: 2020, month: 3 }
  it('prints a month each way, and a year as itself', () => {
    expect(['short', 'long', 'numeric', 'iso'].map((s: string) => formatWhen(m, s))).toEqual(['Mar 2020', 'March 2020', '03/2020', '2020-03'])
    expect(formatWhen({ year: 2014 }, 'long')).toBe('2014')
    expect(formatWhen('present', 'short')).toBe('Present')
  })

  it('gives ISO dates, and none for an open end', () => {
    expect(isoWhen(m)).toBe('2020-03')
    expect(isoWhen({ year: 2014 })).toBe('2014')
    expect(isoWhen('present')).toBe('')
  })

  it('spells a range out the way it reads aloud', () => {
    expect(spokenDates(parseDates('03/2020 – Present') as any)).toBe('March 2020 to Present')
    expect(spokenDates(parseDates('2010 - 2014') as any)).toBe('2010 to 2014')
    expect(spokenDates(parseDates('2023') as any)).toBe('2023')
  })
})
