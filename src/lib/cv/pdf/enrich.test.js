import { describe, expect, it } from 'vitest'
import { CREATOR, PdfError, enrichPdf, mismatch, readPdf } from './enrich.js'

import SAMPLE_URL from '../../../../fixtures/sample.pdf?inline'

/** One character per byte, both ways. */
const latin1 = (/** @type {Uint8Array} */ b) => Array.from(b, (c) => String.fromCharCode(c)).join('')
const bytesOf = (/** @type {string} */ s) => Uint8Array.from(s, (c) => c.charCodeAt(0))

/** A real export: Chrome 154's print to PDF of the shipped CV. */
const sample = bytesOf(atob(SAMPLE_URL.slice(SAMPLE_URL.indexOf(',') + 1)))

const meta = {
  title: 'John Doe — CV',
  author: 'John Doe',
  description: 'Senior Full-Stack Engineer. Builds things.',
  keywords: ['TypeScript', 'Node.js', 'C++ & <XML>'],
}
const now = new Date('2026-10-02T08:00:00Z')
const attachments = [
  { name: 'cv.yaml', mime: 'application/yaml', description: 'The CV, as YAML', data: new TextEncoder().encode('header:\n  name: John Doe\n') },
  { name: 'cv.json', mime: 'application/json', description: 'The CV, as JSON', data: new TextEncoder().encode('{"header":{"name":"John Doe"}}') },
]

describe('readPdf', () => {
  it('reads what the browser wrote', () => {
    const info = readPdf(sample)
    expect(info.title).toBe('John Doe — CV')
    expect(info.producer).toMatch(/^Skia/)
    expect(info.author).toBe('')
    expect(info.created?.toISOString()).toBe('2026-10-01T23:38:38.000Z')
  })

  it('refuses what is not a PDF, or not one it can update', () => {
    expect(() => readPdf(new TextEncoder().encode('hello'))).toThrow(PdfError)
    const restreamed = latin1(sample).replace(/startxref\s+\d+/, 'startxref\n0')
    expect(() => readPdf(bytesOf(restreamed))).toThrow(/re-saved/)
  })
})

describe('mismatch', () => {
  const info = readPdf(sample)
  const exported = Date.parse('2026-10-01T23:38:00Z')

  it('takes the file the export just made', () => {
    expect(mismatch(info, { title: 'John Doe — CV', since: exported })).toBeNull()
  })

  it('names a different CV', () => {
    expect(mismatch(info, { title: 'Jane Roe — CV', since: exported })).toContain('Jane Roe')
  })

  it('names a file made before the version it should show', () => {
    expect(mismatch(info, { title: 'John Doe — CV', since: exported + 3_600_000 })).toMatch(/before the version/)
  })
})

describe('enrichPdf', () => {
  it('leaves every byte the browser wrote where it was', async () => {
    const out = await enrichPdf(sample, { meta, attachments, now })
    expect(out.subarray(0, sample.length)).toEqual(sample)
    expect(latin1(out).endsWith('%%EOF\n')).toBe(true)
  })

  it('fills in the Info dictionary', async () => {
    const info = readPdf(await enrichPdf(sample, { meta, attachments, now }))
    expect(info).toMatchObject({
      title: meta.title,
      author: 'John Doe',
      subject: meta.description,
      keywords: 'TypeScript, Node.js, C++ & <XML>',
      creator: CREATOR,
    })
    expect(info.producer).toMatch(/^Skia/)
    expect(info.created?.toISOString()).toBe('2026-10-01T23:38:38.000Z')
  })

  it('adds XMP and the attachments to the catalog, keeping what it had', async () => {
    const tail = latin1(await enrichPdf(sample, { meta, attachments, now })).slice(sample.length)
    expect(tail).toContain('<dc:creator><rdf:Seq><rdf:li>John Doe</rdf:li></rdf:Seq></dc:creator>')
    expect(tail).toContain('<rdf:li>C++ &amp; &lt;XML&gt;</rdf:li>')
    expect(tail).toMatch(/\/Type \/Catalog[\s\S]*\/StructTreeRoot 29 0 R[\s\S]*\/Metadata \d+ 0 R[\s\S]*\/EmbeddedFiles/)
    expect(tail).toContain('/Subtype /application#2fyaml')
  })

  it('can be run again on its own output', async () => {
    const once = await enrichPdf(sample, { meta, attachments, now })
    const twice = await enrichPdf(once, { meta: { ...meta, author: 'J. Doe' }, attachments, now })
    expect(readPdf(twice).author).toBe('J. Doe')
  })
})
