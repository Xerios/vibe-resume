/**
 * The structural diff, off the main thread. It parses both sides and pairs
 * their trees, which on two long CVs is the slowest thing the app does.
 */

import { diffDocuments } from '../cv/format/diff.js'
import { serve } from './rpc.js'

serve({ diffDocuments })
