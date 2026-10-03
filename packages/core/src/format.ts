/**
 * What a source format is, to the rest of the app.
 *
 * A file is text in one of several formats — the relaxed YAML dialect,
 * Markdown — and every one of them reads into the same CV object (see
 * schema.ts), with a map from each value's dotted path to the line it came
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

/** A problem with the text, as character offsets — the shape CodeMirror's linter takes. */
export interface Diagnostic {
  from: number
  to: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
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

export type FormatId = 'yaml' | 'markdown'

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
