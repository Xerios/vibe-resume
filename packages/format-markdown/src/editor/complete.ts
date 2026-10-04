/**
 * What the editor offers to type for you: the keys and values of a directive
 * comment, the `<!-- type: list -->` that says what the text can't.
 *
 * A comment only means something in three places, and each takes its own keys —
 * read.ts holds the list as `DIRECTIVE_KEYS`, which is imported rather than
 * copied, so what is offered here is what the reader will take. Which place a
 * comment is in is decided the way read.ts decides it: by the last heading
 * above it, or by sitting at the end of a list item.
 *
 * Past a `key:`, the handful of keys with a closed set of answers offer them.
 * `lang` and `sideNote` are free text and get nothing.
 */

import { autocompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { SECTIONS } from '@vibe-resume/core/schema'
import { DIRECTIVE_KEYS } from '../read'

type Where = keyof typeof DIRECTIVE_KEYS

/** One line for every key a comment can set. */
const KEY_INFO: Record<string, string> = {
  lang: 'The language the CV is written in, as a tag — en, de, fr-CA. Screen readers read it in that voice.',
  type: 'Which of the seven kinds of section this is.',
  inline: 'Set the items as pills on one line.',
  subtype: 'Only `earlier`, which folds a run of old roles into one list.',
  sideNote: 'A short note set against the entry.',
  rating: 'The level out of five, for when the words can’t be read as one.',
}

/**
 * The keys whose values are a closed set. Everything absent from here is prose.
 */
const VALUES: Record<string, Array<{ label: string; info: string }>> = {
  type: Object.keys(SECTIONS).map((type) => ({ label: type, info: `Holds \`${SECTIONS[type].holds}\`.` })),
  subtype: [
    { label: 'job', info: 'A role of its own, with dates and bullets.' },
    { label: 'earlier', info: 'A run of older roles, as one titled list with no dates.' },
  ],
  inline: [
    { label: 'true', info: 'Yes.' },
    { label: 'false', info: 'No — and worth saying when the default is yes.' },
  ],
  rating: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), info: `${n} out of five.` })),
}

const HEADING = /^(#{1,6})\s/
const LIST = /^\s*(?:[-*+]|\d+[.)])\s/

/** Where the cursor is in a directive: which place it sets keys for, and whether it is on a key or a value. */
export interface Spot {
  where: Where
  what: 'key' | 'value'
  /** the key a value is for */
  key?: string
  /** where the word being typed starts */
  from: number
}

/**
 * The directive the cursor is in, or null — outside a comment, in one that
 * spans lines, or in one that sits where no comment means anything.
 */
export function spotAt(text: string, pos: number): Spot | null {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const lineEnd = text.indexOf('\n', pos)
  const line = text.slice(start, lineEnd < 0 ? text.length : lineEnd)
  const col = pos - start
  if (HEADING.test(line)) return null

  const open = line.lastIndexOf('<!--', col - 4)
  if (open < 0 || open + 4 > col) return null
  const close = line.indexOf('-->', open + 4)
  if (close >= 0 && close < col) return null

  // The pair being typed: what follows the last separator before the cursor.
  const pair =
    line
      .slice(open + 4, col)
      .split(/[,;]/)
      .pop() ?? ''
  const value = /^\s*([A-Za-z_][\w-]*)\s*:\s*([\w-]*)$/.exec(pair)
  const key = value ? null : /^\s*([\w-]*)$/.exec(pair)
  if (!value && !key) return null

  const where = LIST.test(line) && line.slice(0, open).trim() !== '' ? 'item' : placeOf(text.slice(0, start))
  if (!where) return null
  return value ? { where, what: 'value', key: value[1], from: pos - value[2].length } : { where, what: 'key', from: pos - (key?.[1].length ?? 0) }
}

/** What a comment at the end of `above` belongs to, by the headings in it — read.ts's rule. */
function placeOf(above: string): Where | null {
  let where: Where | null = null
  let header = false
  let sections = 0
  for (const line of above.split('\n')) {
    const m = HEADING.exec(line)
    if (!m) continue
    const level = m[1].length
    if (level === 1 && !header && !sections) {
      header = true
      where = 'header'
    } else if (level <= 2) {
      sections++
      where = 'section'
    } else if (sections) where = 'item'
  }
  return where
}

/**
 * The completion source: the keys or the values on offer at the cursor.
 */
export function directiveComplete(cx: CompletionContext): CompletionResult | null {
  const spot = spotAt(cx.state.doc.toString(), cx.pos)
  if (!spot) return null
  const keys: readonly string[] = DIRECTIVE_KEYS[spot.where]

  const options: Completion[] = []
  if (spot.what === 'value') {
    if (!keys.includes(String(spot.key))) return null
    for (const v of VALUES[String(spot.key)] ?? []) options.push({ label: v.label, type: 'enum', info: v.info })
  } else {
    // Nothing typed and nobody asked: a comment may be just a comment.
    if (!cx.explicit && cx.pos === spot.from) return null
    for (const key of keys) options.push({ label: key, type: 'property', info: KEY_INFO[key], apply: `${key}: ` })
  }
  return options.length ? { from: spot.from, options, validFor: /^[\w-]*$/ } : null
}

/**
 * Whether picking this one should open a second list straight away — a key
 * with a closed set of values behind it. Choosing `type` is really the first
 * half of choosing which type.
 */
export const opensValues = (completion: Completion): boolean => completion.type === 'property' && VALUES[completion.label] !== undefined

/** Completion inside directive comments. */
export function directiveCompletion() {
  return autocompletion({ override: [directiveComplete], activateOnCompletion: opensValues })
}
