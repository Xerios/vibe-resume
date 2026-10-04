/**
 * Markdown, as much of it as a CV uses, for the editor: headings, list
 * markers, quotes and comments, the markdown inside a line, and folding a
 * heading over everything up to the next heading of its level or above.
 *
 * A `StreamLanguage` reads a line at a time, which is how read.ts reads the
 * document too, so what a line looks like and what it means stay in step. The
 * text of a line is coloured a run at a time out of inline-markdown.ts, whose
 * rules are marked's, so nothing is coloured as a link the page won't make.
 * Two kinds of line are read for more than their markdown: a contact line,
 * which can be a phone number, and the dates line under an entry's heading.
 * The label of a `Stack:` or `Methodologies:` line is marked out as well.
 */

import { LanguageSupport, StreamLanguage, foldService } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { LABEL } from '../read'
import { contactRuns, inlineRuns, metaRuns } from './inline-markdown'

interface State {
  /** inside an HTML comment, which can span lines */
  comment: boolean
  /** past a `type:` or `subtype:` in a comment, so the next word is its value */
  typeNext: boolean
  /** where the document is: before the `#`, in the header under it, or past the first `##` */
  region: 'pre' | 'header' | 'body'
  /** the last line with anything on it was a `###`, so this one may be its dates */
  afterEntry: boolean
  /** column this line's text starts at, or -1 before it is reached */
  md: number
  /** column it ends at: the line's end, or the next comment */
  end: number
  /** the token under the text's markdown — a heading's, or none */
  base: string
  /** a line read for more than its markdown */
  kind: '' | 'contact' | 'meta'
  /** column a `Stack:` or `Methodologies:` label ends at, or -1 */
  label: number
}

const HEADING = /^(#{1,6})\s/
const LIST = /^\s*(?:[-*+]|\d+[.)])\s/
const COMMENT_START = /^\s*<!--/

/** Start the line's text at `from`, up to the next comment. */
function begin(stream: StringStream, state: State, from: number): void {
  const next = stream.string.indexOf('<!--', from)
  state.md = from
  state.end = next < 0 ? stream.string.length : next
}

/** In the body, a `Stack:` or `Methodologies:` label opening the line's text, as read.ts reads one. */
function label(stream: StringStream, state: State): void {
  const rest = stream.string.slice(state.md).trimStart()
  const m = state.region === 'body' ? LABEL.exec(rest) : null
  state.label = m ? stream.string.length - rest.length + m[0].length : -1
}

/** Emit the next run of the text that starts at `state.md`, markdown and all. */
function text(stream: StringStream, state: State): string | null {
  const runs = state.kind === 'contact' ? contactRuns : state.kind === 'meta' ? metaRuns : inlineRuns
  const run = runs(stream.string, state.md, state.end).find((r) => r.to > stream.pos)
  if (!run) {
    stream.pos = state.end
    return state.base || null
  }
  stream.pos = run.to
  return [state.base, run.token].filter(Boolean).join(' ') || null
}

/** A comment, a token at a time: the value of a `type:` or `subtype:` is picked out. */
function comment(stream: StringStream, state: State): string {
  if (state.typeNext) {
    state.typeNext = false
    if (stream.match(/^[\w-]+/)) return 'cvType'
  }
  if (stream.match('-->')) {
    state.comment = false
    if (!stream.eol()) begin(stream, state, stream.pos)
    return 'comment'
  }
  const prev = stream.string[stream.pos - 1]
  if ((!prev || !/[\w-]/.test(prev)) && stream.match(/^(?:sub)?type\s*:\s*/)) {
    state.typeNext = true
    return 'comment'
  }
  stream.next()
  stream.eatWhile(/[^-st]/)
  return 'comment'
}

function token(stream: StringStream, state: State): string | null {
  if (state.comment) return comment(stream, state)

  if (stream.sol()) {
    const line = stream.string
    state.md = -1
    state.kind = ''
    state.base = ''
    state.label = -1
    if (!line.trim()) {
      stream.skipToEnd()
      return null
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = heading[1].length
      // As read.ts has it: the first `#` is the header, and any `#` or `##` after it a section.
      if (level === 1 && state.region === 'pre') state.region = 'header'
      else if (level <= 2) state.region = 'body'
      state.afterEntry = level >= 3 && state.region === 'body'
      state.base = level === 1 ? 'heading1' : level === 2 ? 'heading2' : level === 3 ? 'heading3' : 'heading'
      stream.match(/^#+\s+/)
      begin(stream, state, stream.pos)
      return state.base
    }

    // A comment line leaves the entry's dates line still to come; anything else is it, or ends the wait.
    const dates = state.afterEntry && !LIST.test(line)
    if (!COMMENT_START.test(line)) state.afterEntry = false

    if (stream.match(LIST)) {
      if (state.region === 'header') state.kind = 'contact'
      begin(stream, state, stream.pos)
      label(stream, state)
      return 'list'
    }
    if (stream.match(/^>\s?/)) {
      begin(stream, state, stream.pos)
      return 'quote'
    }
    if (dates && !COMMENT_START.test(line)) state.kind = 'meta'
    begin(stream, state, 0)
    label(stream, state)
  }

  // The label first; what follows it is ordinary text.
  if (state.label > stream.pos) {
    stream.pos = state.label
    state.kind = ''
    begin(stream, state, stream.pos)
    return 'cvLabel'
  }

  if (state.md >= 0 && stream.pos < state.end) return text(stream, state)
  if (stream.match('<!--')) {
    state.comment = true
    return 'comment'
  }
  stream.next()
  return null
}

const parser = {
  name: 'markdown',
  startState: (): State => ({ comment: false, typeNext: false, region: 'pre', afterEntry: false, md: -1, end: 0, base: '', kind: '', label: -1 }),
  token,
  tokenTable: {
    heading1: t.heading1,
    heading2: t.heading2,
    heading3: t.heading3,
    heading: t.heading,
    list: t.list,
    quote: t.quote,
    comment: t.comment,

    // The markdown inside a line, out of inline-markdown.ts. A name that only
    // adds weight, slant or a line comes alongside the heading it sits in.
    cvMdMark: t.punctuation,
    cvMdLink: t.link,
    cvMdUrl: t.url,
    cvMdStrong: t.strong,
    cvMdEm: t.emphasis,
    cvMdCode: t.monospace,
    cvMdStrike: t.strikethrough,
    cvMdHtml: t.special(t.content),

    // Each end of an entry's dates that reads as one.
    cvDate: t.number,
    // What a section or an entry is — the value of `type` or `subtype` in a comment.
    cvType: [t.typeName, t.strong],
    // The label of a `Stack:` or `Methodologies:` line.
    cvLabel: [t.labelName, t.strong],
  },
  languageData: { commentTokens: { block: { open: '<!--', close: '-->' } } },
}

export const markdownLanguage = StreamLanguage.define(parser)

/** A heading folds over everything up to the next heading of its level or above. */
const foldHeadings = foldService.of((state, from) => {
  const line = state.doc.lineAt(from)
  const own = /^(#{1,6})\s/.exec(line.text)
  if (!own) return null
  const level = own[1].length
  let end = line.to
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n)
    const m = /^(#{1,6})\s/.exec(next.text)
    if (m && m[1].length <= level) break
    if (next.text.trim()) end = next.to
  }
  return end > line.to ? { from: line.to, to: end } : null
})

export function markdownMode(): LanguageSupport {
  return new LanguageSupport(markdownLanguage, [foldHeadings])
}
