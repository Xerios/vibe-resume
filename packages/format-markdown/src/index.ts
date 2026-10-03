/**
 * Markdown as a source format. See read.ts for how a Markdown resume maps
 * onto the sections a CV is made of.
 */

import type { SourceFormat } from '@vibe-resume/core/format'
import { read } from './read'
import template from './template.md?raw'

export const markdown: SourceFormat = {
  id: 'markdown',
  label: 'Markdown',
  extensions: ['.md', '.markdown'],
  mime: 'text/markdown',
  template,
  read,
  // Markdown has no syntax errors, so what the reader noticed is all there is.
  lint: (text) => read(text).diagnostics,
}
