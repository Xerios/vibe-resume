/**
 * The line diff. A bullet that was reworded is *changed*, not a removal and an
 * insertion, and the changed words are marked inside it.
 */

import { describe, expect, it } from 'vitest'
import { diffText, mapLine } from './diff'

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
const doc = (...sections: string[]) =>
  `header:\n  name: Jo\n  role: Engineer\nsections:\n${sections.map((s: string) => `  ${s.split('\n').join('\n  ')}`).join('\n\n')}\n`

/** Get line numbers matching a specific kind. */
const linesOf = (side: any[], kind: string) => side.map((l: any, i: number) => (l.kind === kind ? i + 1 : 0)).filter(Boolean)

/** Find the first line matching a regex. */
const lineMatching = (text: string, re: RegExp) => text.split('\n').findIndex((l: string) => re.test(l)) + 1

describe('nothing changed', () => {
  it('finds nothing in a document compared with itself', () => {
    const d = diffText(doc(SUMMARY, SKILLS, WORK), doc(SUMMARY, SKILLS, WORK))
    expect(d.hunks).toEqual([])
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(d.a.every((l) => l.kind === 'same')).toBe(true)
  })

  it('pairs every line of an unchanged document with itself', () => {
    const d = diffText(doc(SUMMARY, SKILLS, WORK), doc(SUMMARY, SKILLS, WORK))
    for (const [i, l] of d.a.entries()) if (l.twin !== undefined) expect(l.twin).toBe(i + 1)
  })
})

describe('edits', () => {
  it('reads a reworded bullet as one changed line, with the changed words marked', () => {
    const before = doc(WORK)
    const after = before.replace('Mentored four junior engineers.', 'Mentored five junior engineers.')
    const d = diffText(before, after)
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    const line = lineMatching(after, /Mentored/)
    expect(d.b[line - 1].kind).toBe('changed')
    expect(d.b[line - 1].twin).toBe(line)
    const [[from, to]] = d.b[line - 1].ranges ?? [[0, 0]]
    expect(after.split('\n')[line - 1].slice(from, to)).toBe('ive') // the `f` is shared
    expect(d.hunks).toEqual([{ kind: 'changed', a: [line, line], b: [line, line] }])
  })

  it('reads a new section as added and a dropped one as removed', () => {
    const d = diffText(doc(SUMMARY, WORK), doc(SUMMARY, SKILLS, WORK))
    expect(d.counts.added).toBe(SKILLS.split('\n').length)
    expect(d.counts.removed).toBe(0)
    expect(d.hunks).toHaveLength(1)
    expect(d.hunks[0].kind).toBe('added')
    expect(d.hunks[0].a).toBeNull()

    const back = diffText(doc(SUMMARY, SKILLS, WORK), doc(SUMMARY, WORK))
    expect(back.counts.removed).toBe(SKILLS.split('\n').length)
    expect(back.hunks).toEqual([{ kind: 'removed', a: back.hunks[0].a, b: null }])
  })

  it('reads a renamed job as the same entry, changed', () => {
    const before = doc(WORK)
    const after = before.replace('title: Senior Engineer', 'title: Staff Engineer')
    const d = diffText(before, after)
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 1 })
  })
})

describe('plain text', () => {
  it('diffs text that has no structure', () => {
    const d = diffText('one\ntwo\nthree\n', 'one\n2\nthree\nfour\n')
    expect(d.counts).toEqual({ added: 1, removed: 0, changed: 1 })
    expect(linesOf(d.b, 'changed')).toEqual([2])
    expect(linesOf(d.b, 'added')).toEqual([4])
  })

  it('reads an empty side as everything added', () => {
    const d = diffText('', doc(SUMMARY))
    expect(d.counts.added).toBe(doc(SUMMARY).split('\n').length - 1)
  })
})

describe('anchors', () => {
  it('climb on both sides', () => {
    const d = diffText(doc(SUMMARY, SKILLS, WORK), doc(SKILLS, SUMMARY, WORK))
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
