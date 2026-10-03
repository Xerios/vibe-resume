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

import { parse } from './relaxed-yaml'

/**
 * Where each part starts, in document order. `label` is null for a line that
 * belongs to no part — `sections:` itself, or whatever else sits at the root.
 */
interface Part {
  line: number
  label: string | null
}

function outline(text: string): Part[] {
  const { value, lines } = parse(text)
  const sections = Array.isArray(value?.sections) ? value.sections : []
  const parts: Part[] = []
  for (const [path, line] of lines) {
    if (path === 'header') parts.push({ line, label: 'Header' })
    else if (path === 'sections') parts.push({ line, label: null })
    else if (/^sections\.\d+$/.test(path)) parts.push({ line, label: nameOf(sections[Number(path.slice(9))]) })
  }
  return parts.toSorted((a, b) => a.line - b.line)
}

function nameOf(section: any): string {
  const title = section?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  const type = section?.type
  if (typeof type === 'string' && type) return type[0].toUpperCase() + type.slice(1)
  return 'Section'
}

/** 1-based line of a character offset. */
function lineOf(text: string, at: number): number {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++
  return line
}

/** The labels of every part a range of lines overlaps. */
function collect(parts: Part[], first: number, last: number, into: Set<string>): void {
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
 */
export function touchedParts(before: string, after: string, ops: import('loro-crdt/web').TextDiff['diff']): string[] {
  const names: Set<string> = new Set()
  let partsBefore: Part[] | null = null
  let partsAfter: Part[] | null = null
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
