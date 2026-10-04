/**
 * What a `dates` value is made of: one date, or two ends of a range.
 *
 * The lint reads it to check a document writes its months one way throughout,
 * and the editor to colour each end, so both agree on what counts as a date.
 */

/**
 * The ways a CV writes a month, each with the example a message shows. A bare
 * year isn't among them: it is a coarser date, not another spelling of one, and
 * a degree in `2010 – 2014` beside a job in `03/2020 – Present` is normal.
 * A comma after the month (`June, 2016`) is the same format. Anything not
 * recognised — another language, `Summer 2019` — is left alone.
 */
export const DATE_FORMATS: Array<[RegExp, string]> = [
  [/^\d{1,2}\/\d{4}$/, '03/2020'],
  [/^\d{1,2}\.\d{4}$/, '03.2020'],
  [/^\d{4}-\d{1,2}$/, '2020-03'],
  [/^\d{4}\.\d{1,2}$/, '2020.03'],
  [/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?,?\s+\d{4}$/i, 'Mar 2020'],
  [/^(?:january|february|march|april|june|july|august|september|october|november|december),?\s+\d{4}$/i, 'March 2020'],
]

/** The two ends of a range: a dash with room around it, an en or em dash, or a word. */
export const RANGE_SPLIT = /\s*[–—]\s*|\s+-\s+|\s+(?:to|until)\s+/i

/** A year on its own, and the words that stand for a range's open end. */
const OTHER_DATES = /^(?:\d{4}|present|current|now|today|ongoing)$/i

/**
 * Whether one end of a range is a date: a month in any of the formats, a year,
 * or `Present`.
 */
export const isDate = (part: string): boolean => OTHER_DATES.test(part) || DATE_FORMATS.some(([re]) => re.test(part))

/* ── Reading a date for what it means ────────────────────────────────────── */

/**
 * One end of a range: a year, and a month when the CV gave one.
 */
export interface When {
  year: number
  month?: number
}

/**
 * What a `dates` value means: where it starts, and where it ends — another
 * date, still going, or nothing for a single date.
 */
interface DateSpan {
  start: When
  end: When | 'present' | null
  /** the value as typed, cut at the separator */
  written: { start: string; sep: string; end: string }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const LONG = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1))
const SHORT = LONG.map((m) => m.slice(0, 3))

/** The words that stand for a range's open end. */
const OPEN_END = /^(?:present|current|now|today|ongoing)$/i

/**
 * One end of a range, read: every format DATE_FORMATS knows, or a year.
 */
function readWhen(part: string): When | null {
  let m = /^(\d{1,2})[/.](\d{4})$/.exec(part)
  if (m) return month(Number(m[2]), Number(m[1]))
  m = /^(\d{4})[-.](\d{1,2})$/.exec(part)
  if (m) return month(Number(m[1]), Number(m[2]))
  m = /^([a-z]+)\.?,?\s+(\d{4})$/i.exec(part)
  if (m) {
    const name = m[1].toLowerCase()
    const i = MONTHS.findIndex((full) => full === name || (name.length >= 3 && full.startsWith(name)))
    return i < 0 ? null : { year: Number(m[2]), month: i + 1 }
  }
  m = /^(\d{4})$/.exec(part)
  return m ? { year: Number(m[1]) } : null
}

const month = (year: number, m: number): When | null => (m >= 1 && m <= 12 ? { year, month: m } : null)

/**
 * What a `dates` value means, or null when it isn't one this can read — a
 * season, another language, a typo. A value like that is printed as typed and
 * claims nothing.
 */
export function parseDates(text: string): DateSpan | null {
  const value = text.trim()
  if (!value) return null
  const cut = RANGE_SPLIT.exec(value)
  if (!cut) {
    const start = readWhen(value)
    return start ? { start, end: null, written: { start: value, sep: '', end: '' } } : null
  }
  const left = value.slice(0, cut.index).trim()
  const right = value.slice(cut.index + cut[0].length).trim()
  const start = readWhen(left)
  if (!start || RANGE_SPLIT.test(right)) return null
  const end = OPEN_END.test(right) ? 'present' : readWhen(right)
  if (!end) return null
  return { start, end, written: { start: left, sep: cut[0], end: right } }
}

/** The ways the sheet can print a date, by `dates` variant id. */
export const DATE_STYLES = ['as-written', 'short', 'long', 'numeric', 'iso']

/**
 * One end, printed.
 */
export function formatWhen(w: When | 'present', style: string): string {
  if (w === 'present') return 'Present'
  if (!w.month) return String(w.year)
  const mm = String(w.month).padStart(2, '0')
  if (style === 'short') return `${SHORT[w.month - 1]} ${w.year}`
  if (style === 'long') return `${LONG[w.month - 1]} ${w.year}`
  if (style === 'numeric') return `${mm}/${w.year}`
  return `${w.year}-${mm}`
}

/**
 * One end as an ISO 8601 date — `2020-03`, `2020` — for `<time datetime>`. An
 * open end has none.
 */
export const isoWhen = (w: When | 'present' | null): string =>
  !w || w === 'present' ? '' : w.month ? `${w.year}-${String(w.month).padStart(2, '0')}` : String(w.year)

/**
 * A span as it reads aloud and as a parser reads it best: months spelled out
 * and `to` between the ends — `March 2020 to Present`. This is what the PDF
 * gives as the dates' actual text, whatever the sheet printed.
 */
export function spokenDates(span: DateSpan): string {
  const start = formatWhen(span.start, 'long')
  return span.end ? `${start} to ${formatWhen(span.end, 'long')}` : start
}
