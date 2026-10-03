/**
 * The line diff, off the main thread, so a long comparison never holds up
 * typing.
 */

import { diffText } from '@vibe-resume/core/diff'
import { serve } from './rpc'

serve({ diffText } as any)
