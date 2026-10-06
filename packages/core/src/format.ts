/**
 * What a source format is, to the rest of the app.
 *
 * A file is text in a format — Markdown, for now — and a format reads it
 * into a CV object (see schema.ts), with a map from each value's dotted path to the line it came
 * from. That map is what the preview stamps onto what it renders as
 * `data-src`, so hovering or clicking the sheet can point back at the line
 * behind it, whatever the format.
 *
 * Keys are paths into the CV as `migrateTree` leaves it —
 * `sections.2.items.0.bullets.1` — and a line is 1-based. A format puts a
 * container on the line you would click to edit it: a mapping entry on its
 * key, a list item on its first line.
 */

import { migrateTree } from './migrate-tree'

/**
 * A way to fix a diagnostic: what to write over its range. Plain data, so it
 * crosses from the parse worker as it is; the editor turns it into an edit.
 */
export interface Fix {
  /** what the button says — `Write ‘MySQL’` */
  label: string
  insert: string
}

/** A problem with the text, as character offsets — the shape CodeMirror's linter takes. */
export interface Diagnostic {
  from: number
  to: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
  /** edits that would settle it, each replacing `from`–`to` */
  fixes?: Fix[]
}

/** A heading in the text, and the offset it starts at. */
export interface Heading {
  from: number
  title: string
}

/** What a format reads out of a text: the tree, where each part of it is, and what is wrong. */
export interface SourceRead {
  value: unknown
  lines: Map<string, number>
  diagnostics: Diagnostic[]
}

/**
 * A CV as every format reads it: a header and a list of sections. Loose on
 * purpose — the text is the user's, half-typed most of the time, and the
 * renderer is written to take whatever shape it is given.
 */
export type Cv = { header?: Record<string, any>; sections?: Array<Record<string, any>>; [key: string]: any }

export type FormatId = 'markdown'

export interface SourceFormat {
  id: FormatId
  /** what the format is called in the chrome */
  label: string
  /** the first is the one a new file gets */
  extensions: string[]
  mime: string
  /** what a new file starts as */
  template: string
  /** read a text; never throws */
  read(text: string): SourceRead
  /** everything the editor should underline */
  lint(text: string): Diagnostic[]
  /**
   * The headings the text is divided by, in reading order. Optional: a format
   * with no headings has none, and what reads them is only ever naming a part
   * of the document a change landed in.
   */
  outline?(text: string): Heading[]
}

export type ParseResult = { cv: Cv; lines: Map<string, number>; error: null } | { cv: null; lines: null; error: string }

/**
 * Read a text into a CV, plus the map that ties every value back to its line.
 * The only thing that fails here is a document with nothing usable in it, or
 * one the format reports an error in.
 *
 * A document in the old section types — an earlier version being looked at in
 * the history — is read as the current ones, so it still renders.
 */
export function parseWith(format: SourceFormat, text: string): ParseResult {
  const { value, lines, diagnostics } = format.read(text)
  if (!value || typeof value !== 'object') return { cv: null, lines: null, error: 'Document is empty' }
  const broken = diagnostics.find((d) => d.severity === 'error')
  return broken ? { cv: null, lines: null, error: broken.message } : { cv: migrateTree(value), lines, error: null }
}
