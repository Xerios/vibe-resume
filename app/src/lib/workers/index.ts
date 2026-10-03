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

import { diffText as diffInline } from '@vibe-resume/core/diff'
import type { FormatId } from '@vibe-resume/core/format'
import { parseWith } from '@vibe-resume/core/format'
import { formats } from '../formats'
import { connect } from './rpc'

const parseInline = (format: FormatId, text: string) => parseWith(formats[format], text)
const lintInline = (format: FormatId, text: string) => formats[format].lint(text)

// The same tables each worker serves, for running inline where it can't.
const parser = connect(() => new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' }), { parseCv: parseInline, lintCv: lintInline } as any)
const differ = connect(() => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }), { diffText: diffInline } as any)

export const parseCv = (format: FormatId, text: string) => parser('parseCv', format, text)

export const lintCv = (format: FormatId, text: string) => parser('lintCv', format, text)

export const diffText = (textA: string, textB: string) => differ('diffText', textA, textB)
