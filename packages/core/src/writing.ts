/**
 * What the editor suggests about the writing itself, after YAMLResume's guides
 * to punctuation, grammar and spelling (https://yamlresume.dev/docs/guide).
 * Each format's own lint says whether a CV is shaped right; this says whether
 * it reads right. It works on the tree every format reads into, so a rule is
 * written once for all of them.
 *
 * A rule finds something in a value. The line map says which line the value
 * came from, and the characters are found again in the source from there. A
 * format that rewrote the value on the way in — a Markdown paragraph joined
 * from several lines — can leave them unfindable, and then the line itself is
 * underlined.
 *
 * What the guides say a CV must do is a warning; what they recommend is info.
 * Neither stops the preview or blocks an export. Where the change is
 * mechanical — a space, a dash, a name's spelling — a finding carries the fix,
 * offered only where its characters were found, since a fix written over the
 * fallback's whole line would replace the line.
 */

import { DATE_FORMATS, RANGE_SPLIT, parseDates } from './dates'
import type { Diagnostic, Fix, SourceRead } from './format'

type Severity = Diagnostic['severity']

/** Something a rule found in a value: which characters, and what to say about them. */
interface Finding {
  at: number
  len: number
  severity: Severity
  message: string
  fix?: Fix
}

/** Whether the role a bullet belongs to is over, still going, or undated. */
type Tense = 'past' | 'present' | null

/** Keys whose values are settings, levels or figures rather than prose. */
const NOT_PROSE = new Set(['type', 'subtype', 'lang', 'inline', 'rating', 'tier', 'level', 'value'])

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const byPosition = (a: Diagnostic, b: Diagnostic): number => a.from - b.from || a.to - b.to

/**
 * Everything the guides would change about the writing in a document.
 */
export function lintWriting(text: string, { value, lines }: Pick<SourceRead, 'value' | 'lines'>): Diagnostic[] {
  const place = locator(text, lines)
  const out: Diagnostic[] = []

  const check = (s: string, path: string, field: string, listItem: boolean, tense: Tense, sentences: boolean): Finding[] => {
    if (NOT_PROSE.has(field)) return []
    if (/^header\.(contact|left)/.test(path)) return personal(s)
    if (field === 'dates') return dates(s)
    const found = [...prose(s), ...spelling(s)]
    if (path === 'header.role') found.push(...personal(s))
    if (path === 'header.name' || /^sections\.\d+\.title$/.test(path)) found.push(...title(s, path === 'header.name'))
    if (listItem && (field === 'bullets' || field === 'items')) found.push(...ending(s, sentences))
    if (listItem && field === 'bullets') found.push(...opening(s, tense))
    return found
  }

  const dated: Array<{ path: string; written: string; formats: string[] }> = []

  /**
   * `sentences`: whether the list a value sits in has an item long enough to be
   * a sentence, so every item in it takes a full stop and the list reads alike.
   */
  const visit = (node: unknown, path: string, field: string, listItem: boolean, tense: Tense, sentences = false): void => {
    if (typeof node === 'string') {
      if (field === 'dates') dated.push({ path, written: node, formats: dateFormats(node) })
      for (const f of check(node, path, field, listItem, tense, sentences)) {
        const at = place(path, node, f.at, f.len)
        if (!at) continue
        const { exact, ...range } = at
        out.push({ ...range, severity: f.severity, source: 'writing', message: f.message, ...(exact && f.fix && { fixes: [f.fix] }) })
      }
    } else if (Array.isArray(node)) {
      const long = node.some((v) => typeof v === 'string' && isLong(v.trim()))
      node.forEach((v, i) => visit(v, `${path}.${i}`, field, true, tense, long))
    } else if (isMap(node)) {
      const own = Array.isArray(node.bullets) ? tenseOf(node.dates) : tense
      for (const [k, v] of Object.entries(node)) visit(v, path ? `${path}.${k}` : k, k, false, own)
    }
  }

  visit(value, '', '', false, null)
  for (const { path, written, odd, main } of oddDates(dated)) {
    const at = place(path, written, 0, written.length)
    if (!at) continue
    out.push({
      from: at.from,
      to: at.to,
      severity: 'info',
      source: 'writing',
      message: `Most dates here read like \`${main}\`; this one reads like \`${odd}\`. One format throughout is easier for résumé parsers to read.`,
    })
  }
  return out.toSorted(byPosition)
}

/* ── One way of writing a month ───────────────────────────────────────────── */

/** The month formats a `dates` value is written in, as their examples. */
const dateFormats = (value: string): string[] =>
  value
    .replace(/[*_`]/g, '')
    .split(RANGE_SPLIT)
    .map((part) => DATE_FORMATS.find(([re]) => re.test(part.trim()))?.[1])
    .filter((f) => f !== undefined)

/**
 * One way of writing a month throughout. A résumé parser reads dates off the
 * printed text, and a document that switches between `03/2020` and
 * `March 2021` is the one most likely to get a range wrong. The format most of
 * the document uses is the one to keep; a tie goes to whichever came first.
 */
function oddDates<T extends { formats: string[] }>(dated: T[]): Array<T & { odd: string; main: string }> {
  const counts: Map<string, number> = new Map()
  for (const { formats } of dated) for (const f of formats) counts.set(f, (counts.get(f) ?? 0) + 1)
  if (counts.size < 2) return []
  let main = ''
  for (const [f, n] of counts) if (n > (counts.get(main) ?? 0)) main = f

  return dated.flatMap((d) => {
    const odd = d.formats.find((f) => f !== main)
    return odd ? [{ ...d, odd, main }] : []
  })
}

/* ── Finding a value's characters in the source ───────────────────────────── */

/**
 * Where characters of a value sit in the source. A value lies between its own
 * line and the next line the map names; inside that, its first few characters
 * say where it starts, and the same occurrence of what was found is taken from
 * there — the third comma of the value is the third comma after its start.
 */
function locator(text: string, lines: Map<string, number>) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  const mapped = [...new Set(lines.values())].toSorted((a, b) => a - b)

  return (path: string, value: string, at: number, len: number): { from: number; to: number; exact: boolean } | null => {
    const n = lines.get(path)
    if (!n || n > starts.length) return null
    const from = starts[n - 1]
    const next = mapped.find((m) => m > n)
    const region = text.slice(from, next && next <= starts.length ? starts[next - 1] : text.length)

    const head = value.split('\n')[0].trim().slice(0, 24)
    const firstLine = region.split('\n')[0]
    let i = head ? firstLine.lastIndexOf(head) : -1
    if (i < 0 && head) i = region.indexOf(head)
    if (i < 0) i = 0

    const snippet = value.slice(at, at + len)
    let k = 0
    for (let j = value.indexOf(snippet); j >= 0 && j < at; j = value.indexOf(snippet, j + 1)) k++
    i = region.indexOf(snippet, i)
    while (i >= 0 && k-- > 0) i = region.indexOf(snippet, i + 1)
    if (i >= 0 && snippet) return { from: from + i, to: from + i + len, exact: true }

    const indent = firstLine.length - firstLine.trimStart().length
    return { from: from + indent, to: from + Math.max(firstLine.trimEnd().length, indent), exact: false }
  }
}

/* ── Punctuation ──────────────────────────────────────────────────────────── */

/**
 * What isn't prose, blanked out character for character so offsets still line
 * up: inline code, addresses, and a Markdown link's target.
 */
const NOT_TEXT = [
  /`[^`]*`/g,
  /(?<=\])\([^)\s]*\)/g,
  /\b(?:https?:\/\/|mailto:|tel:|www\.)[^\s<>()]*[^\s<>().,;:!?'"]/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[\w-]+(?:\.[\w-]+)+\/[^\s<>()]*[^\s<>().,;:!?'"]/g,
]

const blank = (s: string): string => NOT_TEXT.reduce((t, re) => t.replace(re, (m) => '\0'.repeat(m.length)), s)

/** Units a number takes a space before. Magnitudes (`10k`, `5M`) and `%` don't. */
const UNIT =
  /(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)?)(ms|µs|ns|secs?|mins?|hrs?|[KkMGTP]B|[KMGT]b|[kMG]?Hz|kg|km|cm|mm|px|dpi|fps|rps|qps|RPS|QPS|TPS)(?![\p{L}\p{N}])/gu

/** A range of years joined by a hyphen, which is an en dash's job. */
const YEAR_RANGE = /(?<![\p{N}-])(?:19|20)\d{2}-(?:19|20)\d{2}(?![\p{N}-])/gu

const fix = (label: string, insert: string): Fix => ({ label, insert })
const ADD_SPACE = (m: string): Fix => fix('Add the space', `${m} `)

/**
 * Rules as a pattern, what to say about each match, and how to fix it when
 * that's mechanical. The match is what gets underlined and what a fix
 * replaces, so the patterns lean on lookarounds to keep it to the culprit.
 * A fix is handed the match as written, with nothing blanked out of it.
 */
const PROSE: Array<[RegExp, Severity, (m: RegExpExecArray) => string, ((m: string, found: RegExpExecArray) => Fix)?]> = [
  // Must: one space after , ; : . ! ?
  [/(?:[,;]|(?<!:):(?!:))(?=\p{L})/gu, 'warning', (m) => `Put a space after ‘${m[0]}’.`, ADD_SPACE],
  [/(?<=\p{Ll}{2})[.!?](?=\p{Lu}\p{Ll})/gu, 'warning', (m) => `Put a space after ‘${m[0]}’.`, ADD_SPACE],
  [/(?<=[\p{L}\p{N})\]]) +[,;:.!?](?=\s|$)/gu, 'warning', (m) => `No space before ‘${m[0].trim()}’.`, (m) => fix('Remove the space', m.trim())],
  // Must: a space before an opening bracket and after a closing one — `role(s)` and `()` aside.
  [/(?<=[\p{L}\p{N}])\((?!s\)|\))/gu, 'warning', () => 'Put a space before ‘(’.', () => fix('Add the space', ' (')],
  [/(?<!\(s)\)(?=[\p{L}\p{N}])/gu, 'warning', () => 'Put a space after ‘)’.', ADD_SPACE],
  // Must: no punctuation hanging at the start of a line. `.NET` is a word, not a full stop.
  [/(?<=(?:^|\n)[ \t*_]*)(?:[,;:!?)\]]|\.(?![\p{L}\p{N}]))/gu, 'warning', (m) => `A line can't start with ‘${m[0]}’ — keep it with the word before it.`],
  // Recommended: a space between a number and its unit.
  [UNIT, 'info', (m) => `Put a space between a number and its unit: ‘${m[1]} ${m[2]}’.`, (_, m) => fix(`Write ‘${m[1]} ${m[2]}’`, `${m[1]} ${m[2]}`)],
  // Recommended: no spaces around a slash or a hyphen joining two things.
  [
    /(?<=[\p{L}\p{N}])(?: +\/ *| *\/ +)(?=[\p{L}\p{N}])/gu,
    'info',
    () => 'No spaces around a slash between alternatives: ‘A/B’.',
    () => fix('Close up the slash', '/'),
  ],
  [
    /(?<=\p{L}) +-(?=\p{L})|(?<=\p{L})- +(?!(?:and|or|to)\b)(?=\p{L})/gu,
    'info',
    () => 'No spaces around a hyphen joining words.',
    () => fix('Close up the hyphen', '-'),
  ],
  // Dashes: a hyphen joins, an en dash spans, an em dash sets apart.
  [/(?<=\d) - (?=\d)/g, 'info', () => 'A range takes an en dash with no spaces: ‘2019–2021’.', () => fix('Use an en dash', '–')],
  [
    /(?<=[^\s\d]) - (?=\S)|(?<=\S) - (?=\D)/g,
    'info',
    () => 'A hyphen only joins words. To set a phrase apart, use an em dash: ‘—’.',
    () => fix('Use an em dash', ' — '),
  ],
  [
    /(?<![-\s])-{2,3}(?!-)|(?<=\s)-{2,3}(?=\s)/g,
    'info',
    (m) => (m[0].length === 2 ? 'Write an en dash ‘–’ rather than two hyphens.' : 'Write an em dash ‘—’ rather than three hyphens.'),
    (m) => (m.length === 2 ? fix('Use an en dash', '–') : fix('Use an em dash', '—')),
  ],
  [YEAR_RANGE, 'info', (m) => `A range takes an en dash: ‘${m[0].replace('-', '–')}’.`, (m) => fix('Use an en dash', m.replace('-', '–'))],
  // Recommended: curly quotation marks. An apostrophe inside a word is left alone.
  [/"[^"\n]*"/g, 'info', () => 'Use curly quotation marks: “…”.', (m) => fix('Curl the quotes', `“${m.slice(1, -1)}”`)],
  [/(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, 'info', () => 'Use curly quotation marks: ‘…’.', (m) => fix('Curl the quotes', `‘${m.slice(1, -1)}’`)],
  [/(?<=\S) {2,}(?=\S)/g, 'info', () => 'One space between words is enough.', () => fix('Use one space', ' ')],
]

function prose(raw: string): Finding[] {
  const s = blank(raw)
  return PROSE.flatMap(([re, severity, say, mend]) =>
    [...s.matchAll(re)].map((m) => {
      const len = m[0].length
      const found: Finding = { at: m.index, len, severity, message: say(m) }
      if (mend) found.fix = mend(raw.slice(m.index, m.index + len), m)
      return found
    }),
  )
}

/** What may end a list item that isn't punctuation of its own: an ellipsis, or an abbreviation's full stop. */
const KEPT_ENDING = /(?:\.\.\.|…|\b(?:etc|Inc|Ltd|Co|Corp|Jr|Sr|e\.g|i\.e|vs)\.)$/i

/** How many words make a list item a long sentence rather than a fragment. */
const LONG_ITEM_WORDS = 15

/** A list item that runs to a long sentence, or to more than one sentence. */
const isLong = (t: string): boolean => t.split(/\s+/).length >= LONG_ITEM_WORDS || /\p{L}[.!?] +\p{Lu}/u.test(t)

/**
 * Should avoid: punctuation at the end of a short list item. A long one — a
 * full sentence or a paragraph — should end with a full stop instead, and so
 * should every other item in its list (`sentences`), short or not.
 */
function ending(raw: string, sentences: boolean): Finding[] {
  const t = raw.replace(/[\s*_`~]+$/, '')
  const last = t.at(-1) ?? ''
  if (KEPT_ENDING.test(t)) return []
  if (sentences || isLong(t)) {
    if (/[.!?]/.test(last)) return []
    const message = isLong(t) ? 'End a long list item with a full stop.' : 'This list is written in sentences: end each item with a full stop.'
    if (/[;,:]/.test(last)) return [{ at: t.length - 1, len: 1, severity: 'info', message, fix: fix(`Replace the ‘${last}’ with ‘.’`, '.') }]
    if (!last) return []
    return [{ at: t.length - 1, len: 1, severity: 'info', message, fix: fix('Add a full stop', `${last}.`) }]
  }
  if (!/[.;,:!]/.test(last)) return []
  return [{ at: t.length - 1, len: 1, severity: 'info', message: `Leave the ‘${last}’ off the end of a list item.`, fix: fix(`Remove the ‘${last}’`, '') }]
}

/* ── Grammar ──────────────────────────────────────────────────────────────── */

/** The guide's hundred action verbs, in the past tense a finished role takes. */
const ACTION_VERBS = `Accelerated Accomplished Accounted Accumulated Achieved Administrated Arbitrated Articulated Boosted Briefed
  Broadened Budgeted Campaigned Chaired Championed Clarified Coached Collaborated Coordinated Corroborated Cultivated Customized
  Decided Decreased Delegated Demonstrated Designated Developed Devised Diagnosed Documented Doubled Economized Edited Educated
  Empowered Enabled Encouraged Endorsed Enhanced Facilitated Focused Forecasted Generated Harmonized Harnessed Identified
  Illustrated Impressed Improved Increased Justified Launched Led Magnified Managed Marketed Mastered Navigated Negotiated Observed
  Obtained Organized Orchestrated Participated Pinpointed Performed Publicized Published Realigned Recognized Recommended Selected
  Separated Spearheaded Stimulated Succeeded Surpassed Synchronized Synergized Tabulated Targeted Tested Traded Translated
  Triggered Triumphed Troubleshot Uncovered Underwrote Unearthed Unified Upgraded Urged Utilized Validated Verbalized Verified
  Vitalized Yielded`

/** And the ones a technical CV leans on most, which the guide's list leaves out. */
const MORE_VERBS = `Analysed Analyzed Architected Automated Built Contributed Created Delivered Deployed Designed Drove Established
  Expanded Grew Handled Hired Implemented Integrated Introduced Maintained Mentored Migrated Modernized Optimised Optimized Owned
  Oversaw Partnered Planned Prototyped Ran Rebuilt Redesigned Reduced Refactored Researched Resolved Scaled Shipped Streamlined
  Supported Taught Trained Won Worked Wrote`

const IRREGULAR: Record<string, string> = {
  built: 'build',
  drove: 'drive',
  grew: 'grow',
  led: 'lead',
  oversaw: 'oversee',
  ran: 'run',
  rebuilt: 'rebuild',
  taught: 'teach',
  troubleshot: 'troubleshoot',
  underwrote: 'underwrite',
  won: 'win',
  wrote: 'write',
}

const VERBS = `${ACTION_VERBS} ${MORE_VERBS}`.split(/\s+/)
const PAST = new Set(VERBS.map((v) => v.toLowerCase()))

const undouble = (s: string): string => (/([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : s)

/**
 * Each verb's present stem, to the past tense it should have been. A regular
 * verb's stem is one of a few spellings — `boost`, `accelerate`, `ship` — and
 * all of them are kept: the wrong ones are never typed, so they cost nothing.
 */
const STEM: Map<string, string> = new Map()
for (const past of VERBS) {
  const p = past.toLowerCase()
  const stems = IRREGULAR[p] ? [IRREGULAR[p]] : p.endsWith('ied') ? [`${p.slice(0, -3)}y`] : [p.slice(0, -2), p.slice(0, -1), undouble(p.slice(0, -2))]
  for (const s of stems) if (s.length > 2 && !PAST.has(s)) STEM.set(s, past)
}

/** The past tense of a verb written in the present — `Develop`, `Develops`, `Developing` — or null. */
function pastOf(word: string): string | null {
  const w = word.toLowerCase()
  const forms = [w]
  if (w.endsWith('ies')) forms.push(`${w.slice(0, -3)}y`)
  if (w.endsWith('es')) forms.push(w.slice(0, -2))
  if (w.endsWith('s')) forms.push(w.slice(0, -1))
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3)
    forms.push(stem, `${stem}e`, undouble(stem))
  }
  for (const f of forms) {
    const past = STEM.get(f)
    if (past) return past
  }
  return null
}

/** Whether a role is over: its `dates` end in a date rather than `Present`, or are a single date. */
function tenseOf(when: unknown): Tense {
  const span = typeof when === 'string' ? parseDates(when.replace(/[*_`]/g, '')) : null
  return !span ? null : span.end === 'present' ? 'present' : 'past'
}

/**
 * A bullet starts with a verb and leaves the subject out — in the past tense,
 * or the present for work that is still going on.
 */
function opening(raw: string, tense: Tense): Finding[] {
  const m = /^[\s*_~[]*(\p{L}+)/u.exec(raw)
  if (!m) return []
  const word = m[1]
  const at = m.index + m[0].length - word.length
  const at1 = (severity: Severity, message: string, mend?: Fix): Finding[] => [{ at, len: word.length, severity, message, ...(mend && { fix: mend }) }]
  if (/^(?:I|We|My|Our)$/.test(word) && /\s/.test(raw[at + word.length] ?? '')) {
    return at1('info', 'Start with the verb and leave out the subject: ‘Led …’, not ‘I led …’.')
  }
  if (tense === 'past') {
    const past = pastOf(word)
    if (past && past.toLowerCase() !== word.toLowerCase()) {
      const written = /^\p{Lu}/u.test(word) ? past : past.toLowerCase()
      return at1('info', `This role has ended, so the past tense: ‘${past}’.`, fix(`Write ‘${written}’`, written))
    }
  }
  if (tense === 'present' && PAST.has(word.toLowerCase())) {
    return at1('info', `This role is still going, so say what you do in the present tense rather than ‘${word}’.`)
  }
  return []
}

/** A CV that calls itself one in place of the name. */
function title(s: string, isName: boolean): Finding[] {
  const plain = s.replace(/[*_`]/g, '').trim()
  const bad = isName ? /^(?:my\s+)?(?:r[eé]sum[eé]|cv|curriculum\s+vitae)$/i.test(plain) : /\bmy\s+r[eé]sum[eé]\b/i.test(plain)
  return bad ? [{ at: 0, len: s.length, severity: 'warning', message: 'A CV doesn’t need to say it’s a CV — put your name here, not ‘My Resume’.' }] : []
}

/** What the guide leaves off a CV: it says nothing about the work, and invites bias. */
const PERSONAL: Array<[RegExp, string]> = [
  [/\b(?:date of birth|birth ?date|birthday|born|d\.o\.b\.?|dob)\b/i, 'your date of birth'],
  [/\bage\s*[:\d]/i, 'your age'],
  [/\b(?:nationality|citizenship)\b/i, 'your nationality'],
  [/\b(?:marital status|married|divorced|widowed|children)\b/i, 'marital and family status'],
  [/\b(?:religion|political)\b/i, 'religious and political identity'],
  [
    /\b\d+\w?\s+(?:\p{L}+\s+)+(?:street|st\.?|avenue|ave\.?|road|rd\.?|lane|ln\.?|boulevard|blvd\.?|drive|dr\.?)(?=\s|,|$)/iu,
    'a home address — a city is enough',
  ],
]

function personal(s: string): Finding[] {
  for (const [re, what] of PERSONAL) {
    const m = re.exec(s)
    if (m) return [{ at: m.index, len: m[0].length, severity: 'info', message: `Leave ${what} off a CV: it says nothing about the work.` }]
  }
  return []
}

/**
 * Dates a reader anywhere can't misread: the year in full, and an en dash
 * between the ends of a range — closed up when each end is a single word.
 */
function dates(s: string): Finding[] {
  const out: Finding[] = []
  const add = (re: RegExp, severity: Severity, message: string, mend?: (m: RegExpExecArray) => Fix): void => {
    for (const m of s.matchAll(re)) out.push({ at: m.index, len: m[0].length, severity, message, ...(mend && { fix: mend(m) }) })
  }
  /** The en dash a range's separator should be: closed up between single-word ends. */
  const enDash = (m: RegExpExecArray): Fix => {
    const ends = [s.slice(0, m.index), s.slice(m.index + m[0].length)].map((e) => e.replace(/[*_`]/g, '').trim())
    return fix('Use an en dash', ends.some((e) => /\s/.test(e)) ? ' – ' : '–')
  }
  add(
    /(?<![\p{N}/.-])\d{1,2}[/.-]\d{2}(?![\p{N}/.-])|['’]\d{2}(?!\d)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{2}(?!\d)/giu,
    'warning',
    'Write the year in full — ‘2016.05’ or ‘May, 2016’ — so the date can’t be misread.',
  )
  add(/(?<=\S) - (?=\S)/g, 'info', 'A range takes an en dash ‘–’, not a hyphen.', enDash)
  add(/\s*—\s*/g, 'info', 'A range takes an en dash ‘–’, not an em dash.', enDash)
  add(YEAR_RANGE, 'info', 'A range takes an en dash ‘–’, not a hyphen.', (m) => fix('Use an en dash', m[0].replace('-', '–')))
  if (/^[*_]*\S+\s+–\s+\S+[*_]*$/.test(s.trim())) {
    add(/\s+–\s+/g, 'info', 'Close up the en dash between single-word ends: ‘2010–2014’.', () => fix('Close up the dash', '–'))
  }
  return out
}

/* ── Spelling ─────────────────────────────────────────────────────────────── */

/**
 * The guide's table of names a CV in software gets wrong, each with the
 * spellings it corrects. A name that is also a common word — `node`, `JS`,
 * `OC` — is only corrected where it stands alone as an item of a list.
 */
const TERMS: Array<[right: string, wrong: string[], listOnly?: true]> = [
  ['Ajax', ['ajax']],
  ['Android Studio', ['android studio', 'Android studio']],
  ['Android', ['android']],
  ['App Store', ['AppStore', 'Appstore', 'app store']],
  ['App', ['APP']],
  ['CSS', ['Css', 'css']],
  ['Eclipse', ['eclipse']],
  ['Git', ['git', 'GIT']],
  ['HTML', ['Html', 'html']],
  ['HTTP', ['Http', 'http']],
  ['JSON', ['Json', 'json']],
  ['Java', ['JAVA', 'java']],
  ['JavaScript', ['Javascript', 'javascript', 'JAVASCRIPT']],
  ['JavaScript', ['JS', 'js'], true],
  ['Linux', ['linux', 'LINUX']],
  ['MySQL', ['mysql', 'Mysql', 'MySql', 'MYSQL']],
  ['Node.js', ['NodeJS', 'NodeJs', 'Nodejs', 'nodejs', 'node.js']],
  ['Node.js', ['node', 'Node'], true],
  ['Objective-C', ['objective-c', 'Objective-c', 'ObjectiveC']],
  ['Objective-C', ['OC', 'oc'], true],
  ['Python', ['python']],
  ['Ruby', ['ruby']],
  ['SQLite', ['sqlite', 'Sqlite', 'SQLITE']],
  ['XML', ['xml', 'Xml']],
  ['Xcode', ['xcode', 'XCode', 'XCODE']],
  ['iOS', ['ios', 'IOS', 'Ios']],
  ['iPhone', ['iphone', 'Iphone', 'IPhone', 'IPHONE']],
  ['jQuery', ['jquery', 'Jquery', 'JQuery', 'JQUERY']],
]

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A whole name: not part of a longer word, a file name (`index.html`), a package (`node-fetch`) or a handle. */
const SPELLINGS = TERMS.map(
  ([right, wrong, listOnly]) =>
    [right, new RegExp(`(?<![\\p{L}\\p{N}_.@-])(?:${wrong.map(escape).join('|')})(?![\\p{L}\\p{N}_@-]|\\.[\\p{L}\\p{N}])`, 'gu'), listOnly] as const,
)

/** Whether a match stands alone between a list's separators. */
const alone = (s: string, at: number, len: number): boolean => /(?:^|[,;/·|(:])\s*$/.test(s.slice(0, at)) && /^\s*(?:$|[,;/·|)])/.test(s.slice(at + len))

function spelling(raw: string): Finding[] {
  const s = blank(raw)
  const out: Finding[] = []
  for (const [right, re, listOnly] of SPELLINGS) {
    for (const m of s.matchAll(re)) {
      const at = m.index
      const len = m[0].length
      if (listOnly && !alone(s, at, len)) continue
      if (out.some((f) => at < f.at + f.len && f.at < at + len)) continue
      const cisco = m[0] === 'IOS' ? ' — unless this is Cisco’s IOS' : ''
      out.push({ at, len, severity: cisco ? 'info' : 'warning', message: `The name is spelled ‘${right}’${cisco}.`, fix: fix(`Write ‘${right}’`, right) })
    }
  }
  return out
}
