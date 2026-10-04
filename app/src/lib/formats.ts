/**
 * The source formats a file can be written in, and which one a file is.
 *
 * A file's format is its name's extension — `cv.md` is Markdown — and a name
 * with no extension, or one no format claims, is read as Markdown. Nothing
 * converts a file's text when its name changes.
 *
 * This module is what the workers load, so it holds only the formats' pure
 * halves. The editor's half of each is loaded on demand, below.
 */

import type { Extension } from '@codemirror/state'
import type { FormatId, SourceFormat } from '@vibe-resume/core/format'
import { markdown } from '@vibe-resume/format-markdown'

export const formats: Record<FormatId, SourceFormat> = { markdown }

/** The format a file name says it is in. */
export function formatOf(name: string | null | undefined): SourceFormat {
  const lower = (name ?? '').toLowerCase()
  return Object.values(formats).find((f) => f.extensions.some((ext) => lower.endsWith(ext))) ?? markdown
}

/** What the editor needs from a format, beyond reading it. */
export interface FormatEditor {
  /** colours, folding and indentation — what a read-only view needs */
  language(): Extension
  /** everything the editor adds for the format, language included */
  extensions(): Extension[]
  /** where a line's content starts, for putting the caret on it */
  contentColumn(line: string): number
}

/** Each format's editor support, loaded the first time a file in it is opened. */
const loaders: Record<FormatId, () => Promise<FormatEditor>> = {
  markdown: () => import('@vibe-resume/format-markdown/editor'),
}

export const loadEditor = (id: FormatId): Promise<FormatEditor> => loaders[id]()
