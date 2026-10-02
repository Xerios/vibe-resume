/**
 * The parser, off the main thread: the preview's tree and the editor's
 * diagnostics. Both read the whole document on every pause in typing.
 */

import { lintCv } from '../cv/format/lint.js'
import { parseCv } from '../cv/render/parse.js'
import { serve } from './rpc.js'

serve({ parseCv, lintCv })
