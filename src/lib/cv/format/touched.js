/**
 * Which parts of a CV an edit touched, by name — for the history panel, so a
 * burst of typing reads as `Experience, Core Skills` rather than as `Edit`.
 *
 * A part is the header or one section, and a section is named the way the
 * sheet names it: by its title, falling back to its type. Each side of the
 * edit is read in its own text — what was removed in the text before, what was
 * inserted in the text after — so a section deleted whole is still named, by
 * the title it had.
 */

import { parse } from './relaxed-yaml.js'

/**
 * Where each part starts, in document order. `label` is null for a line that
 * belongs to no part — `sections:` itself, or whatever else sits at the root.
 * @typedef {{ line: number, label: string | null }} Part
 */

/**
 * @param {string} text
 * @returns {Part[]}
 */
function outline(text) {
  const { value, lines } = parse(text)
  const sections = Array.isArray(value?.sections) ? value.sections : []
  /** @type {Part[]} */
  const parts = []
  for (const [path, line] of lines) {
    if (path === 'header') parts.push({ line, label: 'Header' })
    else if (path === 'sections') parts.push({ line, label: null })
    else if (/^sections\.\d+$/.test(path)) parts.push({ line, label: nameOf(sections[Number(path.slice(9))]) })
  }
  return parts.toSorted((a, b) => a.line - b.line)
}

/** @param {any} section */
function nameOf(section) {
  const title = section?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  const type = section?.type
  if (typeof type === 'string' && type) return type[0].toUpperCase() + type.slice(1)
  return 'Section'
}

/** 1-based line of a character offset. @param {string} text @param {number} at */
function lineOf(text, at) {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++
  return line
}

/**
 * The labels of every part a range of lines overlaps.
 * @param {Part[]} parts
 * @param {number} first
 * @param {number} last
 * @param {Set<string>} into
 */
function collect(parts, first, last, into) {
  for (let i = 0; i < parts.length; i++) {
    const end = i + 1 < parts.length ? parts[i + 1].line - 1 : Infinity
    if (parts[i].line > last) break
    const { label } = parts[i]
    if (end >= first && label) into.add(label)
  }
}

/**
 * Name the parts a text delta touched. A change is placed by its last
 * character rather than the one after it, so a line typed and ended with
 * Enter just above the next section is not counted against that section.
 * @param {string} before  the text the delta applies to
 * @param {string} after   the text it produces
 * @param {import('loro-crdt/web').TextDiff['diff']} ops
 * @returns {string[]}  in the order the delta reaches them
 */
export function touchedParts(before, after, ops) {
  /** @type {Set<string>} */
  const names = new Set()
  /** @type {Part[] | null} */
  let partsBefore = null
  /** @type {Part[] | null} */
  let partsAfter = null
  let fromPos = 0
  let toPos = 0
  for (const op of ops) {
    if (op.retain != null) {
      fromPos += op.retain
      toPos += op.retain
    } else if (op.insert) {
      partsAfter ??= outline(after)
      collect(partsAfter, lineOf(after, toPos), lineOf(after, toPos + op.insert.length - 1), names)
      toPos += op.insert.length
    } else if (op.delete != null) {
      partsBefore ??= outline(before)
      collect(partsBefore, lineOf(before, fromPos), lineOf(before, fromPos + op.delete - 1), names)
      fromPos += op.delete
    }
  }
  return [...names]
}
