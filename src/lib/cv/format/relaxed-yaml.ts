/**
 * The document format: YAML's shape, without the punctuation rules that fight
 * with Markdown.
 *
 * A CV is prose, and prose is full of the characters YAML reserves. Real YAML
 * makes you quote a link because it starts with `[`, a phone number because it
 * starts with `+`, and `ORM: Prisma` because of the colon — none of which is
 * anything a person writing a resume should have to know. So the parser here
 * reads a smaller, line-oriented dialect where a value runs verbatim to the end
 * of its line and nothing inside it means anything:
 *
 *     line    := indent ( comment | dash* ( entry | scalar )? )
 *     comment := '#' …EOL          only when '#' is the line's first character
 *     dash    := '-' (space | EOL) each one opens a sequence level
 *     entry   := key ':' (space+ value | EOL)
 *     key     := [A-Za-z_][A-Za-z0-9_-]*    one word, no spaces
 *     value   := …EOL, verbatim
 *
 * The load-bearing rule is `KEY_RE`: a key is one unspaced identifier followed
 * by a colon and a space. Only the *first* one on a line counts, which is what
 * lets `title: Some text: more text` read the obvious way — the second colon is
 * inside the value and never looked at. A word with a space in it can't be a
 * key at all, so `- Some text: more` stays a string.
 *
 * Quotes are no longer required anywhere, but they are still honoured, because
 * every resume saved before this existed is full of them. A value wrapped
 * *entirely* in matching quotes is unwrapped; `'Bob' the builder` isn't wrapped,
 * so it stays as written. Where a pair of quotes has stopped doing any work, the
 * parser says so as a hint rather than removing them behind the writer's back.
 *
 * Everything is a string except bare `true` and `false`. Those have to stay
 * boolean — `inline` and `rail` are tested for truthiness, and the
 * string `'false'` is true. Numbers don't need the same care: `runs` and
 * `techs` both coerce, so `dates: 2023` reads the same either way.
 *
 * Gone, deliberately: flow collections, anchors, aliases, tags and multiple
 * documents. `[` is just a bracket now.
 *
 * The parser never throws. The preview re-parses on every keystroke, so a
 * half-typed line is the normal case, not an error case — it yields whatever
 * tree it can and reports the rest as diagnostics.
 */

/** One unspaced identifier, followed by a colon and a space or the line's end. */
export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*(?=:(?:[ \t]|$))/

/**
 * @typedef {object} LineParts
 * @property {number} indent   column of the first non-space character
 * @property {number} tab      column of a tab in the indentation, or -1
 * @property {number} comment  column of the `#`, or -1 when the line isn't one
 * @property {number[]} dashes column of each `- ` marker, outermost first
 * @property {string | null} key
 * @property {number} content  column where the entry or scalar starts, past every dash
 * @property {number} colon    column of the key's `:`, or -1
 * @property {number} value    column where the value text starts, or -1 when there is none
 */

/**
 * A line, taken apart. The tokenizer, the parser and the editor's
 * "where does the content start" all read a line through here, so none of them
 * can disagree about what a key is.
 * @param {string} text a single line, without its newline
 * @returns {LineParts}
 */
export function splitLine(text) {
  let i = 0
  let tab = -1
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) {
    if (text[i] === '\t' && tab < 0) tab = i
    i++
  }
  const indent = i
  const bare = { indent, tab, comment: -1, dashes: /** @type {number[]} */ ([]), key: null, content: i, colon: -1, value: -1 }
  if (i >= text.length) return bare
  // A comment is only a comment at the head of a line, so `# 1` and `#fff` are
  // ordinary text everywhere a value can appear.
  if (text[i] === '#') return { ...bare, comment: i }

  /** @type {number[]} */
  const dashes = []
  while (text[i] === '-' && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) {
    dashes.push(i)
    i++
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++
  }
  const content = i

  const m = KEY_RE.exec(text.slice(i))
  if (!m) return { indent, tab, comment: -1, dashes, key: null, content, colon: -1, value: i < text.length ? i : -1 }
  const colon = i + m[0].length
  let v = colon + 1
  while (v < text.length && (text[v] === ' ' || text[v] === '\t')) v++
  return { indent, tab, comment: -1, dashes, key: m[0], content, colon, value: v < text.length ? v : -1 }
}

/**
 * A scalar's source text, read as a value.
 *
 * @param {string} raw the value text, from where it starts to the end of the line
 * @returns {{ value: string | boolean, quoted: boolean }}
 */
export function readScalar(raw) {
  const s = raw.trimEnd()
  if (s === 'true') return { value: true, quoted: false }
  if (s === 'false') return { value: false, quoted: false }
  const un = unquote(s)
  return un === null ? { value: s, quoted: false } : { value: un, quoted: true }
}

/**
 * The text inside a pair of wrapping quotes, or null when the scalar isn't one.
 *
 * "Wrapping" means the whole scalar: a quote that closes early — `'Bob' the
 * builder` — leaves the rest outside, so the quotes are just characters and the
 * scalar is taken as written. Both YAML escapes are honoured for the sake of
 * documents written before the dialect relaxed: `''` inside single quotes, and
 * backslashes inside double.
 * @param {string} s
 * @returns {string | null}
 */
function unquote(s) {
  if (s.length < 2) return null
  const q = s[0]
  if ((q !== "'" && q !== '"') || s[s.length - 1] !== q) return null
  const inner = s.slice(1, -1)
  if (q === "'") return /(^|[^'])'(?!')/.test(inner) ? null : inner.replace(/''/g, "'")
  return /(^|[^\\])"/.test(inner) ? null : inner.replace(/\\(.)/g, '$1')
}

/**
 * Whether a scalar still has to be quoted to read as itself.
 *
 * Almost nothing does any more, which is the point — this is what tells a
 * writer which of the quotes they inherited are now just noise.
 * @param {string} text the text inside the quotes
 * @param {boolean} atItemStart the scalar sits directly after a `- `
 */
export function needsQuotes(text, atItemStart) {
  if (text === '' || text !== text.trim()) return true // empty, or space that would be trimmed away
  if (text === 'true' || text === 'false') return true // otherwise it comes back a boolean
  if (/^[|>][-+]?$/.test(text)) return true // otherwise it opens a block scalar
  if (unquote(text) !== null) return true // its own quotes would be stripped next time
  // A bullet is the one place a bare `word:` still reads as a key.
  return atItemStart && (KEY_RE.test(text) || /^-(\s|$)/.test(text))
}

/**
 * @typedef {object} ParseResult
 * @property {any} value the document
 * @property {Map<string, number>} lines dotted path → the 1-based line it starts on
 * @property {import('@codemirror/lint').Diagnostic[]} diagnostics in character offsets
 */

/**
 * A source line as the parser carries it: taken apart, placed, and holding a
 * count of how many of its own `- ` markers have been read.
 * @typedef {LineParts & { n: number, from: number, text: string, di: number }} Line
 */

/** A line with nothing on it to parse. Blanks and comments are invisible to the parser. */
const skip = (/** @type {Line} */ l) => l.comment >= 0 || l.indent >= l.text.length

/** The column a line is currently being read at — its next unread `- `, or its content. */
const colOf = (/** @type {Line} */ l) => (l.di < l.dashes.length ? l.dashes[l.di] : l.content)

/** @param {string} base @param {string | number} segment */
const join = (base, segment) => (base ? `${base}.${segment}` : String(segment))

/**
 * Read a document.
 *
 * One pass produces all three things the app wants from the source — the tree
 * the templates render, the line map the preview points back through, and the
 * diagnostics the editor underlines. They used to be three separate parses of
 * the same text on every keystroke, and could disagree.
 *
 * The line map keys every node by its dotted path — `sections.2.items.0` — and
 * anchors a mapping entry on its *key*, because `title: Summary` and a
 * `bullets:` block both want the line you'd click to edit them, not wherever
 * the value happens to begin.
 *
 * @param {string} text
 * @returns {ParseResult}
 */
export function parse(text) {
  /** @type {import('@codemirror/lint').Diagnostic[]} */
  const diagnostics = []
  /** @type {Map<string, number>} */
  const paths = new Map()

  /** @type {Line[]} */
  const lines = []
  for (let from = 0, n = 1; from <= text.length; n++) {
    let end = text.indexOf('\n', from)
    if (end < 0) end = text.length
    const src = text.slice(from, end)
    lines.push({ ...splitLine(src), n, from, text: src, di: 0 })
    from = end + 1
    if (end >= text.length) break
  }

  /**
   * @param {Line} l
   * @param {number} col
   * @param {number} to
   * @param {import('@codemirror/lint').Diagnostic['severity']} severity
   * @param {string} message
   */
  const report = (l, col, to, severity, message) => {
    diagnostics.push({ from: l.from + col, to: l.from + Math.max(to, col), severity, source: 'yaml', message })
  }

  for (const l of lines) {
    if (l.tab >= 0) report(l, l.tab, l.indent, 'error', 'Tabs are not allowed in indentation — use spaces.')
  }

  let at = 0
  const peek = () => {
    while (at < lines.length && skip(lines[at])) at++
    return at < lines.length ? lines[at] : null
  }

  /**
   * Whatever starts at `col`: a sequence, a mapping, or a run of bare lines.
   * @param {number} col
   * @param {string} path
   */
  function parseBlock(col, path) {
    const l = peek()
    if (!l || colOf(l) !== col) return null
    if (l.di < l.dashes.length) return parseSeq(col, path)
    if (l.key !== null) return parseMap(col, path)
    return parseFolded(col)
  }

  /**
   * The block indented under the line just consumed, or null when there isn't one.
   * @param {number} col the parent's column
   * @param {string} path
   */
  function parseChild(col, path) {
    const l = peek()
    if (!l || colOf(l) <= col) return null
    return parseBlock(colOf(l), path)
  }

  /** @param {number} col @param {string} path */
  function parseMap(col, path) {
    /** @type {Record<string, any>} */
    const obj = {}
    for (;;) {
      const l = peek()
      if (!l) break
      const c = colOf(l)
      if (c < col) break
      // A line deeper than the block it sits in. Reported and skipped rather
      // than ending the block, so one ragged line doesn't invalidate the rest.
      if (c > col) {
        report(l, c, l.text.length, 'error', 'This line is indented further than the block it belongs to.')
        at++
        continue
      }
      if (l.di < l.dashes.length) break // a list at our column — not part of this mapping
      if (l.key === null) {
        report(l, c, l.text.length, 'error', 'Expected `key: value` here.')
        at++
        continue
      }

      const key = l.key
      const keyPath = join(path, key)
      if (!paths.has(keyPath)) paths.set(keyPath, l.n)
      if (Object.hasOwn(obj, key)) report(l, c, l.colon, 'warning', `Duplicate key \`${key}\` — the last one wins.`)
      at++
      obj[key] = l.value >= 0 ? scalar(l, col) : parseChild(col, keyPath)
    }
    return obj
  }

  /** @param {number} col @param {string} path */
  function parseSeq(col, path) {
    /** @type {any[]} */
    const arr = []
    for (;;) {
      const l = peek()
      if (!l) break
      const c = colOf(l)
      if (c < col) break
      if (c > col) {
        report(l, c, l.text.length, 'error', 'This line is indented further than the list it belongs to.')
        at++
        continue
      }
      if (l.di >= l.dashes.length) {
        report(l, c, l.text.length, 'error', 'Expected `- ` at the start of this list item.')
        at++
        continue
      }

      const itemPath = join(path, arr.length)
      if (!paths.has(itemPath)) paths.set(itemPath, l.n)
      l.di++ // step over this item's dash; the rest of the line reads as its own line
      const inner = colOf(l)

      if (l.di < l.dashes.length) {
        arr.push(parseSeq(inner, itemPath)) // `- - a`, a list opening on the same line
      } else if (l.content < l.text.length) {
        if (l.key !== null) {
          arr.push(parseMap(inner, itemPath))
        } else {
          at++
          arr.push(scalar(l, inner))
        }
      } else {
        at++ // a bare `-`; the item is whatever is indented beneath it
        arr.push(parseChild(col, itemPath))
      }
    }
    return arr
  }

  /**
   * A run of bare lines standing where a value was expected, folded into one
   * string — what `key:` followed by an indented paragraph means.
   * @param {number} col
   */
  function parseFolded(col) {
    /** @type {string[]} */
    const parts = []
    let first = null
    for (;;) {
      const l = peek()
      if (!l || colOf(l) !== col || l.di < l.dashes.length || l.key !== null) break
      first ??= l
      parts.push(l.text.slice(l.content).trim())
      at++
    }
    if (parts.length === 1 && first) return scalar(first, col, first.content)
    return parts.join(' ')
  }

  /**
   * The value on a line, from `col` — or the block scalar it opens.
   * @param {Line} l the line, already consumed
   * @param {number} col the column the line is being read at
   * @param {number} [from] where the value text starts; defaults to the entry's value
   */
  function scalar(l, col, from = l.value) {
    const raw = l.text.slice(from)
    const block = /^([|>])[-+]?$/.exec(raw.trim())
    if (block) return blockScalar(col, block[1] === '|')

    const { value, quoted } = readScalar(raw)
    if (quoted && !needsQuotes(String(value), l.key === null && l.dashes.length > 0)) {
      report(l, from, l.text.trimEnd().length, 'hint', 'These quotes are no longer needed — the text reads the same without them.')
    }
    return value
  }

  /**
   * The indented body of a `|` or `>` value, dedented by its first line.
   * @param {number} col the column of the line that opened it
   * @param {boolean} literal `|` keeps the line breaks; `>` folds them to spaces
   */
  function blockScalar(col, literal) {
    /** @type {string[]} */
    const body = []
    let indent = -1
    while (at < lines.length) {
      const l = lines[at]
      const blank = l.indent >= l.text.length
      if (!blank && l.indent <= col) break
      if (!blank && indent < 0) indent = l.indent
      body.push(blank ? '' : l.text.slice(Math.min(indent, l.indent)))
      at++
    }
    while (body.length > 0 && body[body.length - 1] === '') body.pop()
    return literal ? body.join('\n') : body.join(' ').trim()
  }

  const head = peek()
  if (head) paths.set('', head.n)
  const value = head ? parseBlock(colOf(head), '') : null

  // Anything the document couldn't absorb — a first line that was a bare scalar,
  // say, with a mapping after it.
  for (;;) {
    const l = peek()
    if (!l) break
    report(l, colOf(l), l.text.length, 'error', "This line doesn't belong to the document above it.")
    at++
  }

  return { value, lines: paths, diagnostics }
}
