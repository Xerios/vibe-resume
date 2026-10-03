/**
 * Markdown, as much of it as a CV uses, for the editor: headings, list
 * markers, emphasis, links, code and comments, and folding a heading over
 * everything up to the next heading of its level or above.
 *
 * A `StreamLanguage` reads a line at a time, which is how read.ts reads the
 * document too, so what a line looks like and what it means stay in step.
 */

import { LanguageSupport, StreamLanguage, foldService } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

interface State {
  /** inside an HTML comment that spans lines */
  comment: boolean
}

const HEADING = /^#{1,6}\s/

function token(stream: StringStream, state: State): string | null {
  if (state.comment) {
    if (stream.skipTo('-->')) {
      stream.match('-->')
      state.comment = false
    } else stream.skipToEnd()
    return 'comment'
  }
  if (stream.sol()) {
    if (stream.match(HEADING, false)) {
      const level = /^#+/.exec(stream.string)?.[0].length ?? 1
      stream.skipToEnd()
      return level === 1 ? 'heading1' : level === 2 ? 'heading2' : level === 3 ? 'heading3' : 'heading'
    }
    if (stream.match(/^\s*(?:[-*+]|\d+[.)])\s/)) return 'list'
    if (stream.match(/^>\s?/)) return 'quote'
  }
  if (stream.match('<!--')) {
    state.comment = true
    return token(stream, state)
  }
  if (stream.match(/^\*\*[^*]+\*\*/) || stream.match(/^__[^_]+__/)) return 'strong'
  if (stream.match(/^\*[^*\s][^*]*\*/) || stream.match(/^_[^_\s][^_]*_/)) return 'emphasis'
  if (stream.match(/^`[^`]*`/)) return 'monospace'
  if (stream.match(/^\[[^\]]*\]\([^)]*\)/)) return 'link'
  if (stream.match(/^https?:\/\/\S+/)) return 'url'
  stream.next()
  stream.eatWhile(/[^*_`[<h]/)
  return null
}

const parser = {
  name: 'markdown',
  startState: (): State => ({ comment: false }),
  token,
  tokenTable: {
    heading1: t.heading1,
    heading2: t.heading2,
    heading3: t.heading3,
    heading: t.heading,
    list: t.list,
    quote: t.quote,
    strong: t.strong,
    emphasis: t.emphasis,
    monospace: t.monospace,
    link: t.link,
    url: t.url,
    comment: t.comment,
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
