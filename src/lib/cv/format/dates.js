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
 * Anything not recognised — another language, `Summer 2019` — is left alone.
 * @type {[RegExp, string][]}
 */
export const DATE_FORMATS = [
  [/^\d{1,2}\/\d{4}$/, '03/2020'],
  [/^\d{1,2}\.\d{4}$/, '03.2020'],
  [/^\d{4}-\d{1,2}$/, '2020-03'],
  [/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}$/i, 'Mar 2020'],
  [/^(?:january|february|march|april|june|july|august|september|october|november|december)\s+\d{4}$/i, 'March 2020'],
]

/** The two ends of a range: a dash with room around it, an en or em dash, or a word. */
export const RANGE_SPLIT = /\s*[–—]\s*|\s+-\s+|\s+(?:to|until)\s+/i

/** A year on its own, and the words that stand for a range's open end. */
const OTHER_DATES = /^(?:\d{4}|present|current|now|today|ongoing)$/i

/**
 * Whether one end of a range is a date: a month in any of the formats, a year,
 * or `Present`.
 * @param {string} part trimmed
 */
export const isDate = (part) => OTHER_DATES.test(part) || DATE_FORMATS.some(([re]) => re.test(part))
