/**
 * The parser, off the main thread: the preview's tree and the editor's
 * diagnostics. Both read the whole document on every pause in typing.
 */

import type { FormatId } from '@vibe-resume/core/format'
import { parseWith } from '@vibe-resume/core/format'
import { formats } from '../formats'
import { serve } from './rpc'

const parseCv = (format: FormatId, text: string) => parseWith(formats[format], text)
const lintCv = (format: FormatId, text: string) => formats[format].lint(text)

serve({ parseCv, lintCv } as any)
