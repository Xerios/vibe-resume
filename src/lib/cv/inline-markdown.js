/**
 * The Markdown inside a scalar, taken apart into runs of text.
 *
 * Every value in a document is rendered through `marked.parseInline`, so a
 * `[label](url)` or a `**claim**` in the editor is markup, not prose. This
 * splits a stretch of a line into the pieces the renderer will read it as, and
 * the tokenizer paints each one; the delimiter rules are the ones marked
 * follows, so nothing here can promise a link the page won't produce.
 *
 * Runs are contiguous and cover the whole range asked for. A run's `token` is a
 * space-separated list of token names — nesting concatenates, so the `a` in
 * `[**a**](u)` comes out as `cvMdLink cvMdStrong` — and is `''` for plain text.
 */

/**
 * @typedef {object} Run
 * @property {number} from  column the run starts at
 * @property {number} to    column past its end
 * @property {string} token space-separated token names, or '' for plain text
 */

/** Characters that could open something. Everything else is prose. */
const OPENERS = '[!`*_~'

/** A link or an image: one line, a bare destination, an optional title. */
const LINK_RE = /^(!?\[)([^\]]*)(\]\()([^\s)]*(?:\s+"[^"\n]*")?\))/

/** A run of backticks, and the same run again — a code span, marked's first pass. */
const CODE_RE = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/

/**
 * Whether the character on either side of a delimiter lets it open or close.
 * `_` inside a word is not emphasis — `snake_case_name` is a name — while `*`
 * is allowed to be, which is CommonMark's rule and marked's behaviour.
 * @param {string} ch
 */
const wordish = (ch) => !!ch && !/[\s!-/:-@[-`{-~]/.test(ch)

/**
 * The delimited construct opening at `at` — emphasis, or a `~~` deletion — or
 * null.
 *
 * The opener has to be followed by a non-space and the closer preceded by one,
 * so `5 * 3` and `a ** b` stay the arithmetic and the prose they look like, and
 * an unclosed `**claim` stays plain until it is finished.
 * @param {string} text
 * @param {number} at
 * @param {number} to
 */
function emphasisAt(text, at, to) {
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

/**
 * @param {Run[]} out
 * @param {number} from
 * @param {number} to
 * @param {string} token
 */
function push(out, from, to, token) {
  if (to > from) out.push({ from, to, token })
}

/** @param {string} base @param {string} name */
const join = (base, name) => (base ? base + ' ' + name : name)

/**
 * Split `[from, to)` of `text` into runs.
 * @param {string} text
 * @param {number} [from]
 * @param {number} [to]
 * @param {string} [base] token names every run inside this range inherits
 * @returns {Run[]}
 */
export function inlineRuns(text, from = 0, to = text.length, base = '') {
  /** @type {Run[]} */
  const out = []
  let plain = from

  for (let i = from; i < to; i++) {
    if (!OPENERS.includes(text[i])) continue

    /** @type {Run[] | null} */
    let runs = null

    const slice = text.slice(i, to)
    const code = text[i] === '`' && CODE_RE.exec(slice)
    const link = (text[i] === '[' || (text[i] === '!' && text[i + 1] === '[')) && LINK_RE.exec(slice)

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
    } else if (text[i] !== '!' && text[i] !== '[') {
      const em = emphasisAt(text, i, to)
      if (em) {
        const name = text[i] === '~' ? 'cvMdStrike' : em.token
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
