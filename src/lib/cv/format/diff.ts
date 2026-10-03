/**
 * A structural diff of two documents, for the Compare view.
 *
 * A plain line diff of a CV is honest and unreadable: move a section and every
 * line of it is a deletion here and an insertion there, with the one word that
 * actually changed lost in the middle. So this one reads both texts through the
 * parser first and diffs the *tree* — sections, entries, bullets — and only
 * diffs lines inside things it has already decided are the same thing.
 *
 * The parser's line map is the whole structural input. Every node it names
 * becomes a block of lines; blocks under one parent are paired by what
 * identifies them (a mapping key by its name, an entry by its title, a bullet
 * by its text), then by similarity for whatever is left — a reworded bullet,
 * a renamed job. Pairs that changed order are *moved*; so are pairs made
 * across parents, which is an entry that went to another section. Inside a
 * pair the same thing happens one level down, until a pair has no children,
 * where an ordinary line diff finishes the job.
 *
 * Nothing here knows what a CV is beyond `identity`, the handful of keys an
 * entry is likely to be named by.
 */

import { parse } from './relaxed-yaml'

type LineKind = 'same' | 'added' | 'removed' | 'changed'

/**
 * What became of one line.
 */
export interface LineInfo {
  kind: LineKind
  /** id of the moved block the line sits in — see `Move` */
  move?: number
  /** the line on the other side it pairs with, for `same` and `changed` */
  twin?: number
  /** column ranges that differ, for `changed` */
  ranges?: Array<[number, number]>
}

/**
 * A block that is on both sides, in a different place. Line ranges are 1-based
 * and inclusive; `label` is what the block is called, for saying which moved.
 */
interface Move {
  id: number
  a: [number, number]
  b: [number, number]
  label: string
}

/**
 * One thing to step to. A side is null where it has nothing to show — a pure
 * insertion has no lines on A.
 */
export interface Hunk {
  a: [number, number] | null
  b: [number, number] | null
  kind: 'added' | 'removed' | 'changed' | 'moved'
}

/** A line on A and the line on B it corresponds to. */
export type Anchor = { a: number; b: number }

/**
 * The result of diffing two documents.
 */
export interface DocDiff {
  /** one per line of A; index is line − 1 */
  a: LineInfo[]
  b: LineInfo[]
  moves: Move[]
  /** in B order, with removals placed where they would have been */
  hunks: Hunk[]
  /** paired lines, strictly increasing on both sides — for scrolling one side to the other */
  anchors: Anchor[]
  counts: { added: number; removed: number; changed: number; moved: number }
}

/**
 * A node of the parsed document, as a range of lines.
 */
interface Node {
  path: string
  /** what it is paired on; null means "by resemblance only" */
  key: string | null
  /** a list item, which is allowed to move to another parent */
  item: boolean
  /** first line, 1-based */
  start: number
  /** exclusive; trailing blank lines are left out */
  end: number
  /** in document order */
  children: Node[]
  /** lines of its own that no child covers */
  own: number[]
  /** the source lines of the whole range */
  lines: string[]
}

/** Two children of one parent that were judged the same thing. */
interface Pair {
  a: Node
  b: Node
}

/** How alike two blocks under one parent have to be to count as one edited block. */
const SIBLING_MIN = 0.5
/** Higher for a match across parents — that claim carries more weight. */
const MOVE_MIN = 0.6

/**
 * Diff two documents.
 */
export function diffDocuments(textA: string, textB: string): DocDiff {
  const A = buildTree(textA)
  const B = buildTree(textB)
  const infoA: LineInfo[] = A.lines.map(() => ({ kind: 'same' as const }))
  const infoB: LineInfo[] = B.lines.map(() => ({ kind: 'same' as const }))
  const assignedA = new Uint8Array(A.lines.length + 1)
  const assignedB = new Uint8Array(B.lines.length + 1)
  const moves: Move[] = []
  const poolA: Node[] = []
  const poolB: Node[] = []
  /** Nodes that found a counterpart; anything else is wholly gone or wholly new. */
  const matched: Set<Node> = new Set()

  const set = (side: 'a' | 'b', line: number, info: LineInfo, move: number | undefined): void => {
    if (move !== undefined) info.move = move
    if (side === 'a') {
      infoA[line - 1] = info
      assignedA[line] = 1
    } else {
      infoB[line - 1] = info
      assignedB[line] = 1
    }
  }

  const newMove = (a: Node, b: Node): number => {
    const id = moves.length + 1
    moves.push({ id, a: [a.start, a.end - 1], b: [b.start, b.end - 1], label: labelOf(b) })
    return id
  }

  /**
   * Diff a pair of lines, in place. `la` and `lb` are line numbers and need not
   * be contiguous — a node's own lines are whatever its children left it.
   */
  function lcsLines(la: number[], lb: number[], move: number | undefined): void {
    const ta = la.map((n) => A.lines[n - 1].trimEnd())
    const tb = lb.map((n) => B.lines[n - 1].trimEnd())
    for (const op of lineOps(ta, tb)) {
      if (op.kind === 'same') {
        set('a', la[op.a], { kind: 'same', twin: lb[op.b] }, move)
        set('b', lb[op.b], { kind: 'same', twin: la[op.a] }, move)
      } else if (op.kind === 'changed') {
        const [ra, rb] = lineRanges(A.lines[la[op.a] - 1], B.lines[lb[op.b] - 1])
        set('a', la[op.a], { kind: 'changed', twin: lb[op.b], ranges: ra }, move)
        set('b', lb[op.b], { kind: 'changed', twin: la[op.a], ranges: rb }, move)
      } else if (op.kind === 'removed') {
        // A blank line is spacing, not content: one more or less between two
        // blocks is not a change worth pointing at.
        set('a', la[op.a], { kind: ta[op.a] ? 'removed' : 'same' }, move)
      } else {
        set('b', lb[op.b], { kind: tb[op.b] ? 'added' : 'same' }, move)
      }
    }
  }

  /**
   * Two nodes judged to be the same thing: pair up their children, recurse
   * into each pair, and line-diff what is left over.
   */
  function pairTree(a: Node, b: Node, move: number | undefined): void {
    matched.add(a)
    matched.add(b)
    if (!a.children.length || !b.children.length) {
      // One of them is a scalar — or a `stack` that was a line and is now a
      // list. Structure has nothing to say; the lines do.
      lcsLines(span(a), span(b), move)
      return
    }
    const pairs = matchChildren(a.children, b.children)
    // A pair that is out of order relative to the others has moved. The longest
    // run that *is* in order is what stayed put.
    const order = pairs.map((p) => b.children.indexOf(p.b))
    const kept = new Set(longestRun(order))
    pairs.forEach((p, i) => pairTree(p.a, p.b, kept.has(i) ? move : newMove(p.a, p.b)))
    lcsLines(a.own, b.own, move)

    const usedA = new Set(pairs.map((p) => p.a))
    const usedB = new Set(pairs.map((p) => p.b))
    for (const c of a.children) if (!usedA.has(c)) collectItems(c, poolA)
    for (const c of b.children) if (!usedB.has(c)) collectItems(c, poolB)
  }

  pairTree(A.root, B.root, undefined)

  // Whatever no parent could place: an entry that went to another section, a
  // bullet that went to another job. Best resemblance first, and a match takes
  // its descendants out of the running — they are the pair's to diff.
  for (;;) {
    let best: { a: Node; b: Node; score: number } | null = null
    for (const x of poolA) {
      if (matched.has(x) || assignedA[x.start]) continue
      for (const y of poolB) {
        if (matched.has(y) || assignedB[y.start]) continue
        const score = x.key !== null && x.key === y.key ? 1 : similarity(x, y)
        if (score >= MOVE_MIN && (!best || score > best.score)) best = { a: x, b: y, score }
      }
    }
    if (!best) break
    pairTree(best.a, best.b, newMove(best.a, best.b))
  }

  // Everything still unclaimed under an unmatched node was removed or added,
  // blank lines included, so the block reads as one. Lines a matched node
  // never diffed — the blanks between its children — are nothing either way.
  const sweep = (node: Node, side: 'a' | 'b'): void => {
    if (matched.has(node)) {
      for (const c of node.children) sweep(c, side)
      return
    }
    const assigned = side === 'a' ? assignedA : assignedB
    for (let n = node.start; n < node.end; n++) {
      if (!assigned[n]) set(side, n, { kind: side === 'a' ? 'removed' : 'added' }, undefined)
    }
  }
  sweep(A.root, 'a')
  sweep(B.root, 'b')

  const anchors = buildAnchors(infoA)
  return {
    a: infoA,
    b: infoB,
    moves,
    hunks: buildHunks(infoA, infoB, anchors),
    anchors,
    counts: {
      added: infoB.filter((l) => l.kind === 'added').length,
      removed: infoA.filter((l) => l.kind === 'removed').length,
      changed: infoB.filter((l) => l.kind === 'changed').length,
      moved: moves.length,
    },
  }
}

/**
 * The line on the other side that `line` corresponds to, read off the anchors
 * by interpolating between the two it falls between. Past either end the
 * offset from the nearest anchor is kept. Fractional lines go in and come out,
 * so a scroll position mid-line maps to one.
 */
export function mapLine(anchors: Anchor[], from: 'a' | 'b', line: number): number {
  const to = from === 'a' ? 'b' : 'a'
  if (!anchors.length) return line
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (line <= first[from]) return first[to] + (line - first[from])
  if (line >= last[from]) return last[to] + (line - last[from])
  let lo = 0
  let hi = anchors.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (anchors[mid][from] <= line) lo = mid
    else hi = mid - 1
  }
  const p = anchors[lo]
  const q = anchors[lo + 1]
  return p[to] + ((line - p[from]) / (q[from] - p[from])) * (q[to] - p[to])
}

// ── The tree ────────────────────────────────────────────────────────────────

/**
 * Read a document into nodes with line ranges.
 */
function buildTree(text: string): { root: Node; lines: string[] } {
  // Split the way the editor counts lines: a trailing newline is one more,
  // empty, line.
  const lines = text.split('\n')
  const { value, lines: paths } = parse(text)
  const root: Node = { path: '', key: null, item: false, start: paths.get('') ?? 1, end: lines.length + 1, children: [], own: [], lines: [] }
  grow(root, value, paths)
  place(root, lines)
  return { root, lines }
}

/**
 * Add a value's children under its node, by the line each starts on.
 */
function grow(node: Node, value: unknown, paths: Map<string, number>): void {
  if (value === null || typeof value !== 'object') return
  const list = Array.isArray(value)
  const entries: Array<[string, unknown]> = list ? value.map((v, i) => [String(i), v]) : Object.entries(value)
  for (const [segment, child] of entries) {
    const path = node.path ? `${node.path}.${segment}` : segment
    const start = paths.get(path)
    if (start === undefined) continue
    const n: Node = { path, key: list ? identity(child) : segment, item: list, start, end: 0, children: [], own: [], lines: [] }
    node.children.push(n)
    grow(n, child, paths)
  }
  node.children.sort((x, y) => x.start - y.start)
}

/**
 * Give every node its end — the next sibling's start, or the parent's end —
 * less any blank lines at its tail, and work out which lines are its own.
 */
function place(node: Node, lines: string[]): void {
  node.children.forEach((c, i) => {
    c.end = i + 1 < node.children.length ? node.children[i + 1].start : node.end
    place(c, lines)
  })
  while (node.end - 1 > node.start && lines[node.end - 2].trim() === '') node.end--
  const covered = new Set()
  for (const c of node.children) for (let n = c.start; n < c.end; n++) covered.add(n)
  node.own = []
  for (let n = node.start; n < node.end; n++) if (!covered.has(n)) node.own.push(n)
  node.lines = lines.slice(node.start - 1, node.end - 1)
}

/**
 * What a list item is called, for pairing it with its counterpart. A mapping
 * goes by the first of the keys an entry is usually named by; a scalar goes
 * by its text. A mapping with none of them pairs by resemblance only.
 */
function identity(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return null
  if (typeof value !== 'object') return String(value).trim()
  const v = value as Record<string, unknown>
  for (const k of ['title', 'name', 'text', 'org', 'company', 'school']) {
    if (typeof v[k] === 'string' && v[k].trim()) return `${typeof v.type === 'string' ? `${v.type}|` : ''}${k}=${v[k].trim()}`
  }
  return null
}

/** The name `identity` keys an entry by, as the entry spells it. */
const NAMED_RE = /^(?:[^|=]*\|)?(?:title|name|text|org|company|school)=/

/**
 * What a node is called, as a reader would say it: an entry by its title or
 * name, a bullet by its text, a mapping entry by its key. Anything else by its
 * first line.
 */
function labelOf(node: Node): string {
  if (node.key !== null) {
    const named = NAMED_RE.exec(node.key)
    return named ? node.key.slice(named[0].length) : node.key
  }
  return (node.lines.find((l) => l.trim()) ?? '').trim().replace(/^(?:- )+/, '')
}

/** Every line of a node, first to last. */
const span = (node: Node): number[] => Array.from({ length: node.end - node.start }, (_, i) => node.start + i)

/** The node and every list item beneath it. */
function collectItems(node: Node, out: Node[]): void {
  if (node.item) out.push(node)
  for (const c of node.children) collectItems(c, out)
}

// ── Pairing ─────────────────────────────────────────────────────────────────

/**
 * Pair the children of two matched nodes: first by name, in order, then by
 * how much the leftovers resemble each other. Returned in A's order.
 */
function matchChildren(ca: Node[], cb: Node[]): Pair[] {
  const pairs: Pair[] = []
  const usedB: Set<Node> = new Set()
  const byKey: Map<string, Node[]> = new Map()
  for (const y of cb) {
    if (y.key === null) continue
    const list = byKey.get(y.key)
    if (list) list.push(y)
    else byKey.set(y.key, [y])
  }

  const leftA = []
  for (const x of ca) {
    const y = x.key === null ? undefined : byKey.get(x.key)?.find((c) => !usedB.has(c))
    if (y) {
      pairs.push({ a: x, b: y })
      usedB.add(y)
    } else leftA.push(x)
  }

  const candidates: Array<{ a: Node; b: Node; score: number }> = []
  for (const x of leftA) {
    for (const y of cb) {
      if (usedB.has(y)) continue
      const score = similarity(x, y)
      if (score >= SIBLING_MIN) candidates.push({ a: x, b: y, score })
    }
  }
  candidates.sort((p, q) => q.score - p.score)
  const usedA = new Set()
  for (const c of candidates) {
    if (usedA.has(c.a) || usedB.has(c.b)) continue
    usedA.add(c.a)
    usedB.add(c.b)
    pairs.push({ a: c.a, b: c.b })
  }
  return pairs.toSorted((p, q) => p.a.start - q.a.start)
}

/**
 * How alike two blocks are, 0 to 1: Dice over their lines, or over character
 * pairs when both are a single line — a bullet reworded is still mostly the
 * same characters, and not at all the same line.
 */
function similarity(x: Node, y: Node): number {
  if (x.lines.length <= 1 && y.lines.length <= 1) return dice(bigrams(x.lines[0] ?? ''), bigrams(y.lines[0] ?? ''))
  return dice(lineBag(x.lines), lineBag(y.lines))
}

function bigrams(text: string): Map<string, number> {
  const s = text.trim()
  const bag: Map<string, number> = new Map()
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2)
    bag.set(g, (bag.get(g) ?? 0) + 1)
  }
  return bag
}

function lineBag(lines: string[]): Map<string, number> {
  const bag: Map<string, number> = new Map()
  for (const l of lines) {
    const t = l.trim()
    if (t) bag.set(t, (bag.get(t) ?? 0) + 1)
  }
  return bag
}

/** Dice coefficient of two multisets. */
function dice(p: Map<string, number>, q: Map<string, number>): number {
  let sizeP = 0
  let sizeQ = 0
  let both = 0
  for (const n of p.values()) sizeP += n
  for (const n of q.values()) sizeQ += n
  if (!sizeP || !sizeQ) return 0
  for (const [g, n] of p) both += Math.min(n, q.get(g) ?? 0)
  return (2 * both) / (sizeP + sizeQ)
}

/**
 * Indices of the longest strictly increasing run in `values`, by patience
 * sorting — so an out-of-order stretch costs its own length and no more.
 */
function longestRun(values: number[]): number[] {
  /** Index of the smallest tail seen for a run of each length. */
  const tails: number[] = []
  const prev = Array.from({ length: values.length }, () => -1)
  for (let i = 0; i < values.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[tails[mid]] < values[i]) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const out: number[] = []
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i)
  return out.toReversed()
}

// ── Lines ───────────────────────────────────────────────────────────────────

type LineOp = { kind: 'same' | 'changed'; a: number; b: number } | { kind: 'removed'; a: number } | { kind: 'added'; b: number }

/**
 * An ordinary line diff, as operations over indices into the two lists. A run
 * of removals followed by a run of insertions is read as edits to the lines
 * that line up, and the rest as the removal or insertion it is.
 */
function lineOps(ta: string[], tb: string[]): LineOp[] {
  const ops: LineOp[] = []
  let pre = 0
  while (pre < ta.length && pre < tb.length && ta[pre] === tb[pre]) pre++
  let suf = 0
  while (suf < ta.length - pre && suf < tb.length - pre && ta[ta.length - 1 - suf] === tb[tb.length - 1 - suf]) suf++

  for (let i = 0; i < pre; i++) ops.push({ kind: 'same', a: i, b: i })

  const ma = ta.slice(pre, ta.length - suf)
  const mb = tb.slice(pre, tb.length - suf)
  const table = lcsTable(ma, mb)
  let dels: number[] = []
  let ins: number[] = []
  const flush = (): void => {
    // Lines are paired up positionally, except that a blank line is never an
    // edit of a line with something on it.
    let k = 0
    for (; k < dels.length && k < ins.length && ta[dels[k]] && tb[ins[k]]; k++) ops.push({ kind: 'changed', a: dels[k], b: ins[k] })
    for (let d = k; d < dels.length; d++) ops.push({ kind: 'removed', a: dels[d] })
    for (let n = k; n < ins.length; n++) ops.push({ kind: 'added', b: ins[n] })
    dels = []
    ins = []
  }
  let i = 0
  let j = 0
  while (i < ma.length || j < mb.length) {
    if (i < ma.length && j < mb.length && ma[i] === mb[j]) {
      flush()
      ops.push({ kind: 'same', a: pre + i, b: pre + j })
      i++
      j++
    } else if (j < mb.length && (i >= ma.length || table[i][j + 1] >= table[i + 1][j])) {
      ins.push(pre + j)
      j++
    } else {
      dels.push(pre + i)
      i++
    }
  }
  flush()

  for (let k = 0; k < suf; k++) ops.push({ kind: 'same', a: ta.length - suf + k, b: tb.length - suf + k })
  return ops
}

/**
 * `table[i][j]` is the length of the longest common subsequence of `a[i..]`
 * and `b[j..]`.
 */
function lcsTable(a: string[], b: string[]): Int32Array[] {
  const table = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

/**
 * Where two lines differ, as a column range on each: what is left after the
 * common head and tail are taken off. An empty range is left out.
 */
function lineRanges(a: string, b: string): [Array<[number, number]>, Array<[number, number]>] {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const ra: Array<[number, number]> = a.length - suf > pre ? [[pre, a.length - suf]] : []
  const rb: Array<[number, number]> = b.length - suf > pre ? [[pre, b.length - suf]] : []
  return [ra, rb]
}

// ── Reading it back ─────────────────────────────────────────────────────────

/**
 * The paired lines outside any moved block, thinned to a run that climbs on
 * both sides. A moved block pairs its lines with lines far away, and
 * interpolating through those would send a scroll position backwards — and
 * which of two swapped blocks counts as the one that moved was decided when
 * they were paired, so the ladder has to leave out the same one the tint does
 * rather than the shorter one.
 */
function buildAnchors(infoA: LineInfo[]): Anchor[] {
  const paired: Anchor[] = []
  infoA.forEach((l, i) => {
    if (l.twin !== undefined && l.move === undefined) paired.push({ a: i + 1, b: l.twin })
  })
  return longestRun(paired.map((p) => p.b)).map((i) => paired[i])
}

/** Whether a line is anything but plain. */
const marked = (l: LineInfo): boolean => l.kind !== 'same' || l.move !== undefined

/**
 * Where the run of marked lines starting at `i` ends, as an index just past
 * it. A blank line between two marked lines of the same run — a paragraph
 * break inside a new section — is carried along rather than cutting the run
 * in two; it has no twin, which is how a blank is told from a line that is
 * genuinely the same on both sides.
 */
function runEnd(infos: LineInfo[], i: number, inRun: (l: LineInfo) => boolean): number {
  let end = i
  while (i < infos.length) {
    if (inRun(infos[i])) end = ++i
    else if (infos[i].kind === 'same' && infos[i].twin === undefined) i++
    else break
  }
  return end
}

/**
 * Runs of lines worth stepping to. Read off B, since that is the side a
 * reader is usually asking about; what A lost and B never had is slotted in
 * where it would have been.
 */
function buildHunks(infoA: LineInfo[], infoB: LineInfo[], anchors: Anchor[]): Hunk[] {
  const found: Array<{ at: number; hunk: Hunk }> = []

  for (let i = 0; i < infoB.length;) {
    if (!marked(infoB[i])) {
      i++
      continue
    }
    const from = i
    const move = infoB[i].move
    // A moved block is its own hunk, so that stepping lands on the whole of
    // it and nothing else. Two adjacent moves are two hunks.
    i = runEnd(infoB, i, (l) => marked(l) && l.move === move)
    const run = infoB.slice(from, i)
    const twins = run.map((l) => l.twin).filter((t) => t !== undefined)
    const kind = move !== undefined ? 'moved' : run.some((l) => l.kind === 'changed') ? 'changed' : 'added'
    found.push({ at: from + 1, hunk: { kind, a: twins.length ? [Math.min(...twins), Math.max(...twins)] : null, b: [from + 1, i] } })
  }

  for (let i = 0; i < infoA.length;) {
    if (infoA[i].kind !== 'removed') {
      i++
      continue
    }
    const from = i
    i = runEnd(infoA, i, (l) => l.kind === 'removed')
    found.push({ at: mapLine(anchors, 'a', from + 1), hunk: { kind: 'removed', a: [from + 1, i], b: null } })
  }

  return found.toSorted((p, q) => p.at - q.at).map((f) => f.hunk)
}
