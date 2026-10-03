/**
 * The work that reads a whole document, each in a worker of its own: parsing
 * — the preview's tree and the editor's diagnostics — and comparing. Two
 * workers rather than one so that a long comparison never holds up the
 * preview behind it.
 *
 * Each call answers for the text it was given, which may be stale by the time
 * it lands; a caller that keeps only the newest answer has to check for that
 * itself.
 */

import { diffDocuments as diffInline } from '../cv/format/diff'
import { lintCv as lintInline } from '../cv/format/lint'
import { parseCv as parseInline } from '../cv/render/parse'
import { connect } from './rpc'

// The same tables each worker serves, for running inline where it can't.
const parser = connect(() => new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' }), { parseCv: parseInline, lintCv: lintInline } as any)
const differ = connect(() => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }), { diffDocuments: diffInline } as any)

export const parseCv = (yaml: string) => parser('parseCv', yaml)

export const lintCv = (text: string) => parser('lintCv', text)

export const diffDocuments = (textA: string, textB: string) => differ('diffDocuments', textA, textB)
