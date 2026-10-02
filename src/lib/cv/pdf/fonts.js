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

import { faceFor, FAMILIES, LAST_RESORT } from '../theme/typefaces.js'

/** CSS family name → FAMILIES key. */
const BY_CSS = new Map(Object.entries(FAMILIES).map(([key, f]) => [f.css, key]))

/**
 * The bundled families a CSS stack names, in order, ending in the last resort.
 * @param {string[]} stack
 */
export function familiesOf(stack) {
  const keys = stack.map((name) => BY_CSS.get(name)).filter((k) => k !== undefined)
  return [...new Set([...keys, LAST_RESORT])]
}

/**
 * A run cut into pieces of one face each.
 * @typedef {{ text: string, face: string }} Piece
 */

export class Fonts {
  /** @type {Map<string, boolean>} */
  #glyphs = new Map()
  /** @type {Map<string, number>} */
  #widths = new Map()

  /** @param {any} doc  the PDFDocument, with every face registered under its FACES id */
  constructor(doc) {
    this.doc = doc
  }

  /**
   * Whether a face has a glyph for a character, asked of the fontkit font
   * pdfkit embeds from.
   * @param {string} face
   * @param {string} ch
   */
  covers(face, ch) {
    const key = `${face}|${ch}`
    const known = this.#glyphs.get(key)
    if (known !== undefined) return known
    /** @type {boolean} */
    const has = /\s/.test(ch) || current(this.doc.font(face)).font.hasGlyphForCodePoint(ch.codePointAt(0))
    this.#glyphs.set(key, has)
    return has
  }

  /**
   * A run's text, in the faces it is set in.
   * @param {string} text
   * @param {string[]} stack  CSS family names
   * @param {number} weight
   * @param {boolean} italic
   * @returns {Piece[]}
   */
  pieces(text, stack, weight, italic) {
    const faces = familiesOf(stack).map((family) => faceFor(family, weight, italic).id)
    /** @type {Piece[]} */
    const out = []
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
   * @param {string} text
   * @param {string} face
   * @param {number} size
   */
  width(text, face, size) {
    const key = `${face}|${size}|${text}`
    const known = this.#widths.get(key)
    if (known !== undefined) return known
    /** @type {number} */
    const w = this.doc.font(face).fontSize(size).widthOfString(text)
    this.#widths.set(key, w)
    return w
  }
}

/**
 * The font pdfkit has current, and the fontkit font behind it (`font`).
 * pdfkit has no public accessor for it, and coverage is needed to fall back the
 * way the browser does.
 * @param {any} doc
 */
// oxlint-disable-next-line no-underscore-dangle -- pdfkit's only handle on the current font; there is no public API for it
const current = (doc) => doc._font
