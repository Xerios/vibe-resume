/**
 * What the editor needs for Markdown: its colours and folding, and where a
 * line's content starts. Kept apart from the format itself so the
 * workers that parse never load CodeMirror.
 */

import type { Extension } from '@codemirror/state'
import { markdownMode } from './markdown-mode'

/** Colours and folding by heading — all a read-only view needs. */
export const language = (): Extension => markdownMode()

/** Everything the editor adds for this format. */
export const extensions = (): Extension[] => [markdownMode()]

/**
 * Where the content starts on a line: past a heading's hashes, a list marker
 * and a quote — the character a click in the preview means to land on.
 */
export function contentColumn(text: string): number {
  const m = /^\s*(?:#{1,6}\s+|>\s*)?(?:(?:[-*+]|\d+[.)])\s+)?/.exec(text)
  return Math.min(m ? m[0].length : 0, text.length)
}
