/**
 * What the page links without being asked: a bare web address, a mail address,
 * and — on a contact line — a phone number.
 *
 * The first two are marked's (GFM autolinks), so the rules here are copied out
 * of its tokenizer rather than invented: the editor colours with them, and a
 * run it calls a link has to be one the page will have produced. The phone
 * number is ours, made a link by `contact` in template-api.js.
 */

/** marked's GFM `url` rule: a scheme or `www.`, a host, then anything up to a space or `<`. */
const URL_RE = /^(?:(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[a-zA-Z0-9-]+\.?)+[^\s<]*/

/** marked's GFM bare mail address. */
const EMAIL_RE = /^[A-Za-z0-9._+-]+@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]*[a-zA-Z0-9])+(?![\w-])/

/**
 * marked's `_backpedal`: what a URL gives back at its end. A sentence's full
 * stop or a closing bracket isn't part of the address it follows, unless the
 * bracket was opened inside it.
 */
const BACKPEDAL_RE = /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/

/**
 * marked's `<…>` autolink: any scheme, or a mail address, in angle brackets.
 * marked also refuses control characters in the address; a line of a YAML
 * document has none, so that half is left out.
 */
export const ANGLE_RE =
  /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*|[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_]))>/

/** The part of a web address the page doesn't print. */
export const SCHEME_RE = /^https?:\/\//i

/** The characters a mail address can start with — and so, before it, can't. */
export const EMAIL_CHAR = /[A-Za-z0-9._+-]/

/**
 * The length of the bare web address at the start of `text`, or 0.
 * @param {string} text
 */
export function urlAt(text) {
  const m = URL_RE.exec(text)
  if (!m) return 0
  let url = m[0]
  let prev
  do {
    prev = url
    url = BACKPEDAL_RE.exec(url)?.[0] ?? ''
  } while (prev !== url)
  return url.length
}

/**
 * The length of the bare mail address at the start of `text`, or 0. marked only
 * looks for one where a word starts, so the caller checks the character before.
 * @param {string} text
 */
export const emailAt = (text) => EMAIL_RE.exec(text)?.[0].length ?? 0

/**
 * A web address as the page prints it: without the `https://`, which every
 * reader assumes and nobody types.
 * @param {string} url
 */
export const displayUrl = (url) => url.replace(SCHEME_RE, '')

/**
 * A phone number with nothing else on the line but an optional `Label:` in
 * front — which is how a contact line holds one.
 */
const PHONE_RE = /^(\s*(?:[^\d+(:[\]]*:\s*)?)(\+?[\d\s().-]+?)\s*$/

/**
 * The phone number a contact line is, or null.
 *
 * Only a line that is the number is read as one, so a postcode in an address
 * stays text; and it takes 9 digits, or 7 behind a `+`, so a year range like
 * `2016-2020` does too. 15 is the most E.164 allows.
 *
 * @param {string} text
 * @returns {{ lead: string, number: string, href: string } | null}
 */
export function phoneNumber(text) {
  const m = PHONE_RE.exec(text)
  if (!m) return null
  const digits = m[2].replace(/\D/g, '')
  const number = m[2].trim()
  const plus = number.startsWith('+')
  if (digits.length < (plus ? 7 : 9) || digits.length > 15) return null
  return { lead: m[1], number, href: `tel:${plus ? '+' : ''}${digits}` }
}
