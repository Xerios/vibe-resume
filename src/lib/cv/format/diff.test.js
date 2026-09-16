/**
 * The structural diff. What these pin down is the reading, not the algorithm:
 * a block that moved is *moved*, a bullet that was reworded is *changed*, and
 * neither turns into a wall of removals and insertions.
 */

import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { diffDocuments, mapLine } from './diff.js'

const SUMMARY = `- type: summary
  title: Summary
  paragraphs:
    - A short paragraph about me.`

const SKILLS = `- type: skills
  title: Skills
  blocks:
    - title: Core
      rows:
        - text: TypeScript, Node.js
        - text: React, Svelte`

const WORK = `- type: experience
  title: Experience
  items:
    - title: Senior Engineer
      company: Acme
      dates: 2020 – now
      bullets:
        - Led the dashboard rebuild from design to rollout.
        - Mentored four junior engineers.
        - Cut release time from days to hours.
    - title: Developer
      company: Globex
      dates: 2016 – 2020
      bullets:
        - Built the public API.`

/** A document with sections spliced in, indented to sit under `sections:`. */
const doc = (/** @type {string[]} */ ...sections) =>
  `header:\n  name: Jo\n  role: Engineer\nsections:\n${sections.map((s) => `  ${s.split('\n').join('\n  ')}`).join('\n\n')}\n`

/** @param {import('./diff.js').LineInfo[]} side @param {import('./diff.js').LineKind} kind */
const linesOf = (side, kind) => side.map((l, i) => (l.kind === kind ? i + 1 : 0)).filter(Boolean)

/** @param {string} text @param {RegExp} re */
const lineMatching = (text, re) => text.split('\n').findIndex((l) => re.test(l)) + 1

describe('nothing changed', () => {
  it('finds nothing in a document compared with itself', () => {
    const d = diffDocuments(DEFAULT_YAML, DEFAULT_YAML)
    expect(d.hunks).toEqual([])
    expect(d.moves).toEqual([])
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0, moved: 0 })
    expect(d.a.every((l) => l.kind === 'same')).toBe(true)
  })

  it('pairs every line of an unchanged document with itself', () => {
    const d = diffDocuments(DEFAULT_YAML, DEFAULT_YAML)
    for (const [i, l] of d.a.entries()) if (l.twin !== undefined) expect(l.twin).toBe(i + 1)
  })
})

describe('edits', () => {
  it('reads a reworded bullet as one changed line, with the changed words marked', () => {
    const before = doc(WORK)
    const after = before.replace('Mentored four junior engineers.', 'Mentored five junior engineers.')
    const d = diffDocuments(before, after)
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 1, moved: 0 })
    const line = lineMatching(after, /Mentored/)
    expect(d.b[line - 1].kind).toBe('changed')
    expect(d.b[line - 1].twin).toBe(line)
    const [[from, to]] = d.b[line - 1].ranges ?? [[0, 0]]
    expect(after.split('\n')[line - 1].slice(from, to)).toBe('ive') // the `f` is shared
    expect(d.hunks).toEqual([{ kind: 'changed', a: [line, line], b: [line, line] }])
  })

  it('reads a new section as added and a dropped one as removed', () => {
    const d = diffDocuments(doc(SUMMARY, WORK), doc(SUMMARY, SKILLS, WORK))
    expect(d.counts.added).toBe(SKILLS.split('\n').length)
    expect(d.counts.removed).toBe(0)
    expect(d.counts.moved).toBe(0)
    expect(d.hunks).toHaveLength(1)
    expect(d.hunks[0].kind).toBe('added')
    expect(d.hunks[0].a).toBeNull()

    const back = diffDocuments(doc(SUMMARY, SKILLS, WORK), doc(SUMMARY, WORK))
    expect(back.counts.removed).toBe(SKILLS.split('\n').length)
    expect(back.hunks).toEqual([{ kind: 'removed', a: back.hunks[0].a, b: null }])
  })

  it('reads a renamed job as the same entry, changed', () => {
    const before = doc(WORK)
    const after = before.replace('title: Senior Engineer', 'title: Staff Engineer')
    const d = diffDocuments(before, after)
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 1, moved: 0 })
  })
})

describe('moves', () => {
  it('reads a section put elsewhere as moved, not rewritten', () => {
    const d = diffDocuments(doc(SUMMARY, SKILLS, WORK), doc(SKILLS, SUMMARY, WORK))
    expect(d.counts.added).toBe(0)
    expect(d.counts.removed).toBe(0)
    expect(d.counts.changed).toBe(0)
    expect(d.moves).toHaveLength(1)
    // The block that moved is the one out of order; either side reads.
    const [move] = d.moves
    for (let n = move.a[0]; n <= move.a[1]; n++) {
      expect(d.a[n - 1].kind).toBe('same')
      expect(d.a[n - 1].move).toBe(move.id)
    }
    expect(d.hunks).toEqual([{ kind: 'moved', a: move.a, b: move.b }])
  })

  it('still finds the one edit inside a moved block', () => {
    const after = doc(WORK, SUMMARY).replace('Built the public API.', 'Built the public GraphQL API.')
    const d = diffDocuments(doc(SUMMARY, WORK), after)
    expect(d.counts.added).toBe(0)
    expect(d.counts.removed).toBe(0)
    expect(d.counts.changed).toBe(1)
    const line = lineMatching(after, /GraphQL/)
    expect(d.b[line - 1].kind).toBe('changed')
  })

  it('reads reordered bullets as moved', () => {
    const swapped = WORK.replace(
      '        - Led the dashboard rebuild from design to rollout.\n        - Mentored four junior engineers.\n',
      '        - Mentored four junior engineers.\n        - Led the dashboard rebuild from design to rollout.\n',
    )
    expect(swapped).not.toBe(WORK)
    const d = diffDocuments(doc(WORK), doc(swapped))
    expect(d.counts.added).toBe(0)
    expect(d.counts.removed).toBe(0)
    expect(d.counts.moved).toBe(1)
    expect(d.moves[0].a[0]).toBe(d.moves[0].a[1]) // one line
  })

  it('reads an entry that went to another section as moved', () => {
    const PROJECTS = `- type: projects
  title: Projects
  items:
    - title: Side thing
      bullets:
        - A weekend project.`
    const before = doc(WORK, PROJECTS)
    const after = doc(
      WORK.replace('        - Built the public API.', '        - Built the public API.\n    - title: Side thing\n      bullets:\n        - A weekend project.'),
      `- type: projects\n  title: Projects\n  items:\n    - title: Other thing\n      bullets:\n        - Nothing alike here at all.`,
    )
    const d = diffDocuments(before, after)
    expect(d.moves).toHaveLength(1)
    const line = lineMatching(after, /A weekend project/)
    expect(d.b[line - 1].kind).toBe('same')
    expect(d.b[line - 1].move).toBe(d.moves[0].id)
  })
})

describe('outside the format', () => {
  it('falls back to a line diff for text that has no structure', () => {
    const d = diffDocuments('one\ntwo\nthree\n', 'one\n2\nthree\nfour\n')
    expect(d.counts).toEqual({ added: 1, removed: 0, changed: 1, moved: 0 })
    expect(linesOf(d.b, 'changed')).toEqual([2])
    expect(linesOf(d.b, 'added')).toEqual([4])
  })

  it('reads an empty side as everything added', () => {
    const d = diffDocuments('', doc(SUMMARY))
    expect(d.counts.added).toBe(doc(SUMMARY).split('\n').length - 1)
  })
})

describe('anchors', () => {
  it('climb on both sides, even across a move', () => {
    const d = diffDocuments(doc(SUMMARY, SKILLS, WORK), doc(SKILLS, SUMMARY, WORK))
    for (let i = 1; i < d.anchors.length; i++) {
      expect(d.anchors[i].a).toBeGreaterThan(d.anchors[i - 1].a)
      expect(d.anchors[i].b).toBeGreaterThan(d.anchors[i - 1].b)
    }
  })

  it('map a line through to the other side', () => {
    const anchors = [
      { a: 1, b: 1 },
      { a: 5, b: 9 },
    ]
    expect(mapLine(anchors, 'a', 1)).toBe(1)
    expect(mapLine(anchors, 'a', 3)).toBe(5)
    expect(mapLine(anchors, 'b', 5)).toBe(3)
    expect(mapLine(anchors, 'a', 7)).toBe(11)
    expect(mapLine(anchors, 'b', 0)).toBe(0)
    expect(mapLine([], 'a', 4)).toBe(4)
  })
})
