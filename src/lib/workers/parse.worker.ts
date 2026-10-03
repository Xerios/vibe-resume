/**
 * The parser, off the main thread: the preview's tree and the editor's
 * diagnostics. Both read the whole document on every pause in typing.
 */

import { lintCv } from '../cv/format/lint'
import { parseCv } from '../cv/render/parse'
import { serve } from './rpc'

serve({ parseCv, lintCv } as any)
