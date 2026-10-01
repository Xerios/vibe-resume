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

import { diffDocuments as diffInline } from '../cv/format/diff.js'
import { lintCv as lintInline } from '../cv/format/lint.js'
import { parseCv as parseInline } from '../cv/template/render.js'
import { connect } from './rpc.js'

// The same tables each worker serves, for running inline where it can't.
const parser = connect(() => new Worker(new URL('./parse.worker.js', import.meta.url), { type: 'module' }), { parseCv: parseInline, lintCv: lintInline })
const differ = connect(() => new Worker(new URL('./diff.worker.js', import.meta.url), { type: 'module' }), { diffDocuments: diffInline })

/** @param {string} yaml */
export const parseCv = (yaml) => parser('parseCv', yaml)

/** @param {string} text */
export const lintCv = (text) => parser('lintCv', text)

/** @param {string} textA @param {string} textB */
export const diffDocuments = (textA, textB) => differ('diffDocuments', textA, textB)
