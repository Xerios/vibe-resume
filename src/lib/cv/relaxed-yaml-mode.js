/**
 * The dialect as CodeMirror sees it: colours, folding and indentation.
 *
 * A `StreamLanguage` rather than a Lezer grammar, because the dialect is
 * line-oriented — a line is an indent, some dashes, maybe a key, and then text
 * to the end of it, and none of that needs a parse tree. The tokenizer reads
 * each line through the same `splitLine` in relaxed-yaml.js that the parser
 * does, so the editor can never colour a line as something the document doesn't
 * mean by it. Folding goes back to plain indentation for the same reason.
 *
 * The tag names are the ones cm-highlight.js already styles; a token type it
 * doesn't know about would come out unstyled.
 */

import { LanguageSupport, StreamLanguage, foldService } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { splitLine } from './relaxed-yaml.js'

/**
 * @typedef {object} State
 * @property {number} block  indent of the line that opened a `|` or `>` body, or -1
 * @property {number} indent indent of the last line that had anything on it
 * @property {boolean} opens that line ended on a `key:` or a bare `-`, so the next one steps in
 */

const tokenTable = {
  cvKey: t.definition(t.propertyName),
  cvMark: t.punctuation,
  cvText: t.content,
  cvString: t.string,
  cvBlock: t.special(t.string),
  cvBool: t.bool,
  cvComment: t.lineComment,
}

/**
 * Whether a scalar is wrapped in its own quotes — the one thing the tokenizer
 * colours differently from bare text. Deliberately looser than the parser's
 * `readScalar`: a half-typed quote should still look like a string.
 * @param {string} s
 */
function quoted(s) {
  const v = s.trimEnd()
  if (v.length < 2) return false
  const q = v[0]
  return (q === "'" || q === '"') && v[v.length - 1] === q
}

/** @type {import('@codemirror/language').StreamParser<State>} */
const parser = {
  name: 'relaxed-yaml',

  startState: () => ({ block: -1, indent: 0, opens: false }),

  token(stream, state) {
    const line = stream.string
    const p = splitLine(line)
    const blank = p.indent >= line.length

    if (stream.sol()) {
      // Inside a `|` or `>` body everything is content until the indent comes back.
      if (state.block >= 0) {
        if (blank || p.indent > state.block) {
          stream.skipToEnd()
          return blank ? null : 'cvBlock'
        }
        state.block = -1
      }
      if (!blank && p.comment < 0) {
        state.indent = p.indent
        state.opens = (p.key !== null && p.value < 0) || (p.dashes.length > 0 && p.content >= line.length)
      }
      if (stream.eatSpace()) return null
      if (p.comment >= 0) {
        stream.skipToEnd()
        return 'cvComment'
      }
    }

    const at = stream.pos

    // Each `- ` on its own, so a list opened on the line above its item reads as nested.
    if (at < p.content && line[at] === '-') {
      stream.next()
      stream.eatSpace()
      return 'cvMark'
    }

    if (p.key !== null && at === p.content) {
      stream.pos = p.colon
      return 'cvKey'
    }
    if (p.key !== null && at === p.colon) {
      stream.next()
      stream.eatSpace()
      return 'cvMark'
    }

    // From here to the end of the line is one value, whatever is inside it.
    const rest = line.slice(at)
    stream.skipToEnd()
    if (/^[|>][-+]?\s*$/.test(rest)) {
      state.block = p.content
      return 'cvBlock'
    }
    const v = rest.trim()
    if (v === 'true' || v === 'false') return 'cvBool'
    return quoted(rest) ? 'cvString' : 'cvText'
  },

  /**
   * A line following a `key:` or a bare `-` steps in one unit; anything else
   * keeps the indent of the line above it. There is nothing further to guess
   * from — a value carries no punctuation the way a brace or a bracket would.
   */
  indent(state, _textAfter, cx) {
    if (state.block >= 0) return state.block + cx.unit
    return state.indent + (state.opens ? cx.unit : 0)
  },

  languageData: {
    commentTokens: { line: '#' },
  },

  tokenTable,
}

export const relaxedYamlLanguage = StreamLanguage.define(parser)

/**
 * Fold a line against the run of more-indented lines beneath it — what
 * `@codemirror/lang-yaml` used to provide, and all a block-indented format
 * needs. A blank line inside the run doesn't end it; trailing ones stay out, so
 * folding a section doesn't swallow the gap before the next one.
 */
const foldByIndent = foldService.of((state, _from, to) => {
  const line = state.doc.lineAt(to)
  const p = splitLine(line.text)
  if (p.indent >= line.text.length || p.comment >= 0) return null

  let end = -1
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n)
    const q = splitLine(next.text)
    if (q.indent >= next.text.length) continue // a blank line decides nothing
    if (q.indent <= p.indent) break
    end = next.to
  }
  return end < 0 ? null : { from: to, to: end }
})

/** The editor's language: the tokenizer, and folding by indentation. */
export function relaxedYaml() {
  return new LanguageSupport(relaxedYamlLanguage, [foldByIndent])
}
