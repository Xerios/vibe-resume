/**
 * Setting a measured run of text in the PDF: which bundled face it is, and
 * which face each of its characters needs.
 *
 * measure.js reports a run's CSS font stack, weight and slant, which is what
 * the browser chose from. The same choice is made here out of the same faces
 * (theme/typefaces.js): the first family in the stack, and for a character it
 * has no glyph for, the next family that has one — the order the browser falls
 * back in.
 */

import { faceFor, FAMILIES, LAST_RESORT } from '../theme/typefaces'

/** CSS family name → FAMILIES key. */
const BY_CSS = new Map(Object.entries(FAMILIES).map(([key, f]) => [f.css, key]))

/**
 * The bundled families a CSS stack names, in order, ending in the last resort.
 */
export function familiesOf(stack: string[]): string[] {
  const keys = stack.map((name) => BY_CSS.get(name)).filter((k) => k !== undefined)
  return [...new Set([...keys, LAST_RESORT])]
}

export interface Piece {
  text: string
  face: string
}

export class Fonts {
  doc: any

  #glyphs: Map<string, boolean> = new Map()
  #widths: Map<string, number> = new Map()

  /** the PDFDocument, with every face registered under its FACES id */
  constructor(doc: any) {
    this.doc = doc
  }

  /**
   * Whether a face has a glyph for a character, asked of the fontkit font
   * pdfkit embeds from.
   */
  covers(face: string, ch: string): boolean {
    const key = `${face}|${ch}`
    const known = this.#glyphs.get(key)
    if (known !== undefined) return known
    const has: boolean = /\s/.test(ch) || current(this.doc.font(face)).font.hasGlyphForCodePoint(ch.codePointAt(0))
    this.#glyphs.set(key, has)
    return has
  }

  /**
   * A run's text, in the faces it is set in.
   */
  pieces(text: string, stack: string[], weight: number, italic: boolean): Piece[] {
    const faces = familiesOf(stack).map((family) => faceFor(family, weight, italic).id)
    const out: Piece[] = []
    for (const ch of text) {
      const face = faces.find((f) => this.covers(f, ch)) ?? faces[0]
      const last = out[out.length - 1]
      if (last && last.face === face) last.text += ch
      else out.push({ text: ch, face })
    }
    return out
  }

  /**
   * A string's advance in a face at a size, in pt.
   */
  width(text: string, face: string, size: number): number {
    const key = `${face}|${size}|${text}`
    const known = this.#widths.get(key)
    if (known !== undefined) return known
    const w: number = this.doc.font(face).fontSize(size).widthOfString(text)
    this.#widths.set(key, w)
    return w
  }
}

/**
 * The font pdfkit has current, and the fontkit font behind it (`font`).
 * pdfkit has no public accessor for it, and coverage is needed to fall back the
 * way the browser does.
 */
// oxlint-disable-next-line no-underscore-dangle -- pdfkit's only handle on the current font; there is no public API for it
const current = (doc: any): any => doc._font
