/**
 * Markdown as a source format. See read.ts for how a Markdown resume maps
 * onto the sections a CV is made of.
 */

import type { SourceFormat } from '@vibe-resume/core/format'
import { byPosition, lintWriting } from '@vibe-resume/core/writing'
import { outline, read } from './read'
import template from './template.md?raw'

export const markdown: SourceFormat = {
  id: 'markdown',
  label: 'Markdown',
  extensions: ['.md', '.markdown'],
  mime: 'text/markdown',
  template,
  read,
  outline,
  // Markdown has no syntax errors, so what the reader noticed is all there is
  // of its own; the writing is checked as it is in every format.
  lint: (text) => {
    const it = read(text)
    return [...it.diagnostics, ...lintWriting(text, it)].toSorted(byPosition)
  },
}
