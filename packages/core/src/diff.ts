/**
 * A line diff of two documents, for the Compare view.
 *
 * Nothing here knows what format the texts are in, or what a CV is: both are
 * read as lines, and a run of removed lines followed by a run of added ones is
 * read as edits to the lines that line up.
 */

type LineKind = 'same' | 'added' | 'removed' | 'changed'

/**
 * What became of one line.
 */
export interface LineInfo {
  kind: LineKind
  /** the line on the other side it pairs with, for `same` and `changed` */
  twin?: number
  /** column ranges that differ, for `changed` */
  ranges?: Array<[number, number]>
}

/**
 * One thing to step to. A side is null where it has nothing to show — a pure
 * insertion has no lines on A.
 */
export interface Hunk {
  a: [number, number] | null
  b: [number, number] | null
  kind: 'added' | 'removed' | 'changed'
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
  /** in B order, with removals placed where they would have been */
  hunks: Hunk[]
  /** paired lines, strictly increasing on both sides — for scrolling one side to the other */
  anchors: Anchor[]
  counts: { added: number; removed: number; changed: number }
}

/**
 * Diff two documents.
 */
export function diffText(textA: string, textB: string): DocDiff {
  // Split the way the editor counts lines: a trailing newline is one more,
  // empty, line.
  const linesA = textA.split('\n')
  const linesB = textB.split('\n')
  const ta = linesA.map((l) => l.trimEnd())
  const tb = linesB.map((l) => l.trimEnd())
  const infoA: LineInfo[] = ta.map(() => ({ kind: 'same' as const }))
  const infoB: LineInfo[] = tb.map(() => ({ kind: 'same' as const }))

  for (const op of lineOps(ta, tb)) {
    if (op.kind === 'same') {
      infoA[op.a] = { kind: 'same', twin: op.b + 1 }
      infoB[op.b] = { kind: 'same', twin: op.a + 1 }
    } else if (op.kind === 'changed') {
      const [ra, rb] = lineRanges(linesA[op.a], linesB[op.b])
      infoA[op.a] = { kind: 'changed', twin: op.b + 1, ranges: ra }
      infoB[op.b] = { kind: 'changed', twin: op.a + 1, ranges: rb }
    } else if (op.kind === 'removed') {
      // A blank line is spacing, not content: one more or less between two
      // blocks is not a change worth pointing at.
      infoA[op.a] = { kind: ta[op.a] ? 'removed' : 'same' }
    } else {
      infoB[op.b] = { kind: tb[op.b] ? 'added' : 'same' }
    }
  }

  const anchors: Anchor[] = []
  infoA.forEach((l, i) => {
    if (l.twin !== undefined) anchors.push({ a: i + 1, b: l.twin })
  })
  return {
    a: infoA,
    b: infoB,
    hunks: buildHunks(infoA, infoB, anchors),
    anchors,
    counts: {
      added: infoB.filter((l) => l.kind === 'added').length,
      removed: infoA.filter((l) => l.kind === 'removed').length,
      changed: infoB.filter((l) => l.kind === 'changed').length,
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

/** Whether a line is anything but plain. */
const marked = (l: LineInfo): boolean => l.kind !== 'same'

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
    i = runEnd(infoB, i, marked)
    const run = infoB.slice(from, i)
    const twins = run.map((l) => l.twin).filter((t) => t !== undefined)
    const kind = run.some((l) => l.kind === 'changed') ? 'changed' : 'added'
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
