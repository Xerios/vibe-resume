/**
 * What the editor needs for the YAML dialect: its colours and folding, its
 * completion, and where a line's content starts. Kept apart from the format
 * itself (../index.ts) so the workers that parse never load CodeMirror.
 */

import type { Extension } from '@codemirror/state'
import { splitLine } from '../relaxed-yaml'
import { cvCompletion } from './complete'
import { relaxedYaml } from './relaxed-yaml-mode'

/** Colours, folding and indentation — all a read-only view needs. */
export const language = (): Extension => relaxedYaml()

/** Everything the editor adds for this format. */
export const extensions = (): Extension[] => [relaxedYaml(), cvCompletion()]

/**
 * Where the content starts on a line: past the indent, any `- ` markers, a
 * `key: ` and an opening quote — the character a click in the preview means
 * to land on. A line carrying no inline value (`bullets:`, a block that
 * continues below) falls back to where its own content starts, which still
 * beats the indentation.
 *
 * The line is taken apart by the parser's own `splitLine`, so what counts as
 * a key here is exactly what counts as one in the document.
 */
export function contentColumn(text: string): number {
  const p = splitLine(text)
  let col = p.value >= 0 ? p.value : p.content
  if (text[col] === "'" || text[col] === '"') col++ // sit on the text, not the quote
  return Math.min(col, text.length)
}
