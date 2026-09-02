/**
 * The page box, as CSS. Nothing here renders, so what is worth pinning down is
 * what a browser is actually handed: a `size` it recognises, margins that make
 * room for whatever stands in them, and margin boxes only where something was
 * asked for.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_PAPER, pageBox, paperCss, resolvePaper } from './paper.js'

describe('resolvePaper', () => {
  it('answers every key for a file that has never chosen any paper', () => {
    expect(resolvePaper(undefined)).toEqual(DEFAULT_PAPER)
    expect(resolvePaper({})).toEqual(DEFAULT_PAPER)
  })

  it('drops an id that is no longer one of the choices, and keeps the rest', () => {
    expect(resolvePaper({ size: 'a3', orientation: 'landscape' })).toEqual({
      ...DEFAULT_PAPER,
      size: 'a4',
      orientation: 'landscape',
    })
  })
})

describe('pageBox', () => {
  it('turns the paper on its side rather than naming a second size', () => {
    expect(pageBox({ size: 'a4', orientation: 'landscape' })).toMatchObject({ w: 297, h: 210 })
    expect(pageBox({ size: 'letter' })).toMatchObject({ w: 215.9, h: 279.4 })
  })

  it('gives an edge more margin only once something stands in it', () => {
    const plain = pageBox(DEFAULT_PAPER)
    const both = pageBox({ ...DEFAULT_PAPER, header: 'name', footer: 'page' })
    expect(both.mt).toBeGreaterThan(plain.mt)
    expect(both.mb).toBeGreaterThan(plain.mb)
    expect(both.mx).toBe(plain.mx)
    // The header is what the top margin answers to, and only the header.
    expect(pageBox({ ...DEFAULT_PAPER, footer: 'page' }).mt).toBe(plain.mt)
  })
})

describe('paperCss', () => {
  it('names a size the print dialog knows, and the orientation beside it', () => {
    expect(paperCss({ size: 'letter', orientation: 'landscape' })).toContain('size: letter landscape;')
  })

  it('sizes the sheet on screen from the same page it prints on', () => {
    const css = paperCss({ size: 'a4', orientation: 'landscape' })
    expect(css).toContain('--page-w: 297mm;')
    expect(css).toContain('--page-h: 210mm;')
  })

  it('writes no margin boxes at all while both edges are empty', () => {
    expect(paperCss(DEFAULT_PAPER, 'Jo Doe')).not.toContain('@top')
    expect(paperCss(DEFAULT_PAPER, 'Jo Doe')).not.toContain('@bottom')
  })

  it('counts pages in the margin, since nothing in the document can', () => {
    expect(paperCss({ ...DEFAULT_PAPER, footer: 'page' })).toContain('@bottom-center { content: counter(page) " / " counter(pages);')
  })

  it('splits an edge in two when it carries both', () => {
    const css = paperCss({ ...DEFAULT_PAPER, footer: 'both' }, 'Jo Doe')
    expect(css).toContain('@bottom-left { content: "Jo Doe";')
    expect(css).toContain('@bottom-right { content: counter(page)')
  })

  it('leaves the name out rather than printing an empty box', () => {
    expect(paperCss({ ...DEFAULT_PAPER, header: 'name' }, '   ')).not.toContain('@top')
    // The page number is still worth having on its own.
    expect(paperCss({ ...DEFAULT_PAPER, header: 'both' }, '')).toContain('@top-right')
  })

  it('escapes what a name can say inside a CSS string', () => {
    expect(paperCss({ ...DEFAULT_PAPER, header: 'name' }, 'Jo "The\\Machine" Doe')).toContain('content: "Jo \\"The\\\\Machine\\" Doe"')
  })

  it('keeps a running header off the page that already has the name on it', () => {
    const css = paperCss({ ...DEFAULT_PAPER, header: 'name', footer: 'page' }, 'Jo Doe')
    expect(css).toContain('@page :first {')
    expect(css).toContain('@top-center { content: none }')
    // A page number belongs on page one like any other.
    expect(css).not.toContain('@bottom-center { content: none }')
  })

  it('has no first-page rule to write when nothing is in the header', () => {
    expect(paperCss({ ...DEFAULT_PAPER, footer: 'both' }, 'Jo Doe')).not.toContain('@page :first')
  })
})
