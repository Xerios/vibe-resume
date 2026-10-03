/**
 * The Markdown inside a scalar, taken apart into runs of text.
 *
 * Every value in a document is rendered through `marked.parseInline`, so a
 * `[label](url)` or a `**claim**` in the editor is markup, not prose. This
 * splits a stretch of a line into the pieces the renderer will read it as, and
 * the tokenizer paints each one; the delimiter rules are the ones marked
 * follows, so nothing here can promise a link the page won't produce.
 *
 * marked also links what it recognises on its own — a bare web address or mail
 * address, or one in `<…>` — and those are runs here too, out of the same rules
 * (autolink.js). The `https://` the page leaves off is marked as markup.
 *
 * Runs are contiguous and cover the whole range asked for. A run's `token` is a
 * space-separated list of token names — nesting concatenates, so the `a` in
 * `[**a**](u)` comes out as `cvMdLink cvMdStrong` — and is `''` for plain text.
 */

/**
 * A run of marked-up text in a value.
 */
interface Run {
  /** column the run starts at */
  from: number
  /** column past its end */
  to: number
  /** space-separated token names, or '' for plain text */
  token: string
}

import { ANGLE_RE, EMAIL_CHAR, SCHEME_RE, emailAt, phoneNumber, urlAt } from './autolink'
import { RANGE_SPLIT, isDate } from './dates'

/** Characters that could open something. Everything else is prose, or an autolink. */
const OPENERS = '[!`*_~<'

/** Characters a bare web address can start with — `http`, `ftp`, `www.`. */
const URL_OPENERS = 'hHfFw'

/** A link or an image: one line, a bare destination, an optional title. */
const LINK_RE = /^(!?\[)([^\]]*)(\]\()([^\s)]*(?:\s+"[^"\n]*")?\))/

/** A run of backticks, and the same run again — a code span, marked's first pass. */
const CODE_RE = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/

/**
 * An inline tag — `<br>`, `</b>`, `<span class="x">`. marked passes raw HTML
 * through untouched, so these reach the page as markup and are worth marking as
 * such; the name has to follow the `<` immediately, which keeps a bare `a < b`
 * prose. Comments and processing instructions aren't tags and stay text.
 */
const HTML_RE = /^<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/

/**
 * Whether the character on either side of a delimiter lets it open or close.
 * `_` inside a word is not emphasis — `snake_case_name` is a name — while `*`
 * is allowed to be, which is CommonMark's rule and marked's behaviour.
 */
const wordish = (ch: string): boolean => !!ch && !/[\s!-/:-@[-`{-~]/.test(ch)

/**
 * The delimited construct opening at `at` — emphasis, or a `~~` deletion — or
 * null.
 *
 * The opener has to be followed by a non-space and the closer preceded by one,
 * so `5 * 3` and `a ** b` stay the arithmetic and the prose they look like, and
 * an unclosed `**claim` stays plain until it is finished.
 */
function emphasisAt(text: string, at: number, to: number): { mark: string; body: number; end: number; to: number; token: string } | null {
  const ch = text[at]
  const double = text[at + 1] === ch
  const mark = double ? ch + ch : ch
  const body = at + mark.length
  if (body >= to || /\s/.test(text[body])) return null
  if (ch === '_' && wordish(text[at - 1])) return null

  for (let i = body + 1; i + mark.length <= to; i++) {
    if (text[i] !== ch || (double && text[i + 1] !== ch)) continue
    if (/\s/.test(text[i - 1])) continue
    // A longer run of the same character isn't the closer for a shorter one.
    if (text[i + mark.length] === ch) continue
    if (ch === '_' && wordish(text[i + mark.length])) continue
    return { mark, body, end: i, to: i + mark.length, token: double ? 'cvMdStrong' : 'cvMdEm' }
  }
  return null
}

function push(out: Run[], from: number, to: number, token: string): void {
  if (to > from) out.push({ from, to, token })
}

const join = (base: string, name: string): string => (base ? base + ' ' + name : name)

/**
 * An address the page links on its own, as runs: the `https://` it won't print
 * is markup, but still part of the link, so the underline runs unbroken.
 */
function autolink(text: string, from: number, to: number, base: string): Run[] {
  const scheme = from + (SCHEME_RE.exec(text.slice(from, to))?.[0].length ?? 0)
  const out: Run[] = []
  push(out, from, scheme, 'cvMdMark cvMdLink')
  push(out, scheme, to, join(base, 'cvMdLink'))
  return out
}

/**
 * Split `[from, to)` of `text` into runs.
 */
export function inlineRuns(text: string, from = 0, to = text.length, base = ''): Run[] {
  const out: Run[] = []
  let plain = from

  // marked doesn't autolink inside a link's own label.
  const auto = !base.split(' ').includes('cvMdLink')
  const mail = auto && text.slice(from, to).includes('@')

  for (let i = from; i < to; i++) {
    const ch = text[i]
    const bare = auto && (URL_OPENERS.includes(ch) || (mail && EMAIL_CHAR.test(ch) && (i === from || !EMAIL_CHAR.test(text[i - 1]))))
    if (!bare && !OPENERS.includes(ch)) continue

    let runs: Run[] | null = null

    const slice = text.slice(i, to)
    const code = ch === '`' && CODE_RE.exec(slice)
    const link = (ch === '[' || (ch === '!' && text[i + 1] === '[')) && LINK_RE.exec(slice)
    const html = ch === '<' && HTML_RE.exec(slice)
    const angle = auto && !html && ch === '<' && ANGLE_RE.exec(slice)
    const url = bare ? urlAt(slice) || emailAt(slice) : 0

    if (code) {
      const [all, ticks, body] = code
      runs = [
        { from: i, to: i + ticks.length, token: 'cvMdMark' },
        { from: i + ticks.length, to: i + ticks.length + body.length, token: 'cvMdCode' },
        { from: i + all.length - ticks.length, to: i + all.length, token: 'cvMdMark' },
      ]
    } else if (link) {
      const [all, open, label, close] = link
      const body = i + open.length
      runs = [
        { from: i, to: body, token: 'cvMdMark' },
        ...inlineRuns(text, body, body + label.length, join(base, 'cvMdLink')),
        { from: body + label.length, to: body + label.length + close.length, token: 'cvMdMark' },
        { from: body + label.length + close.length, to: i + all.length, token: 'cvMdUrl' },
      ]
    } else if (html) {
      runs = [{ from: i, to: i + html[0].length, token: 'cvMdHtml' }]
    } else if (angle) {
      const end = i + angle[0].length
      runs = [{ from: i, to: i + 1, token: 'cvMdMark' }, ...autolink(text, i + 1, end - 1, base), { from: end - 1, to: end, token: 'cvMdMark' }]
    } else if (url) {
      runs = autolink(text, i, i + url, base)
    } else if (ch === '*' || ch === '_' || ch === '~') {
      const em = emphasisAt(text, i, to)
      if (em) {
        const name = ch === '~' ? 'cvMdStrike' : em.token
        runs = [
          { from: i, to: em.body, token: 'cvMdMark' },
          ...inlineRuns(text, em.body, em.end, join(base, name)),
          { from: em.end, to: em.to, token: 'cvMdMark' },
        ]
      }
    }

    if (!runs) continue
    push(out, plain, i, base)
    out.push(...runs)
    i = runs[runs.length - 1].to - 1
    plain = i + 1
  }

  push(out, plain, to, base)
  return out
}

/**
 * The stretch of `[from, to)` inside a pair of wrapping quotes, or the whole of
 * it. A legacy document quotes its numbers and its dates; the page reads what
 * is inside.
 */
function unquoted(text: string, from: number, to: number): [number, number] {
  const q = /^(['"])(.*)\1\s*$/.exec(text.slice(from, to))
  return q ? [from + 1, from + 1 + q[2].length] : [from, to]
}

/**
 * A contact line's runs. The same as any value's, except that a line which is a
 * phone number has the number marked as the link `contact` makes of it — and
 * only here, because only the contact block gets one.
 */
export function contactRuns(text: string, from = 0, to = text.length): Run[] {
  const [start, stop] = unquoted(text, from, to)
  const tel = phoneNumber(text.slice(start, stop))
  if (!tel) return inlineRuns(text, from, to)

  const at = start + tel.lead.length
  const end = at + tel.number.length
  const out = inlineRuns(text, from, at)
  out.push({ from: at, to: end, token: 'cvMdLink' })
  push(out, end, to, '')
  return out
}

/** RANGE_SPLIT, to walk every separator in a value rather than split on them. */
const RANGE_SPLIT_ALL = new RegExp(RANGE_SPLIT.source, 'gi')

/**
 * A `dates` value's runs: each end of the range that reads as a date — the same
 * test the lint makes — is a `cvDate`; an end that doesn't is read as any other
 * value, markdown and all.
 */
export function dateRuns(text: string, from = 0, to = text.length): Run[] {
  const [start, stop] = unquoted(text, from, to)
  const out: Run[] = []
  push(out, from, start, '')

  const part = (a: number, b: number): void => {
    const s = text.slice(a, b)
    const lead = a + s.length - s.trimStart().length
    const tail = b - (s.length - s.trimEnd().length)
    if (lead < tail && isDate(text.slice(lead, tail))) {
      push(out, a, lead, '')
      push(out, lead, tail, 'cvDate')
      push(out, tail, b, '')
    } else out.push(...inlineRuns(text, a, b))
  }

  let at = start
  for (const m of text.slice(start, stop).matchAll(RANGE_SPLIT_ALL)) {
    const sep = start + (m.index ?? 0)
    part(at, sep)
    push(out, sep, sep + m[0].length, '')
    at = sep + m[0].length
  }
  part(at, stop)
  push(out, stop, to, '')
  return out
}
