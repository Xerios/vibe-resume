/**
 * The CV as a tagged PDF (PDF 1.7, PDF/UA-1), generated directly with pdfkit
 * from what the preview laid out.
 *
 * The layout is the preview's: measure.js reads the paginated sheet into a
 * display list, with each line of text where the browser set it, and each
 * border, fill and logo. This draws that list. It writes the structure tree and
 * every page's content stream in the display list's order, which is the
 * sheet's document order and so the order the CV is read in. Each line goes at
 * the absolute position it was measured at, whichever page and column that
 * is. Screen readers, ATS parsers and plain text extraction all read that
 * order, whatever the columns look like on the page.
 *
 * What makes it PDF/UA:
 * - **Structure:** every piece of text sits in a structure element.
 *   - `Document` holds a `Sect` for the header and one per section.
 *   - Sections hold `H1`–`H3`, `P`, `L` > `LI` > `LBody`, and `Div`. A
 *     section carries its title (`/T`), and a list what marks its items
 *     (`ListNumbering`).
 *   - Each link is a `Link` element holding its text and its annotation.
 *   - A level meter is a `Figure` with alternative text.
 *   - A date range is a `Span` whose `ActualText` is the range spelled out —
 *     `March 2020 to Present` — however the sheet styled it.
 * - **Navigation:** a bookmark per section, open when the file is.
 * - **Artifacts:** everything drawn that isn't content is an `Artifact` and is
 *   never read: the page fill, rules, frames, bullet marks, chip outlines and
 *   logos, separators, and the running head and foot.
 * - **Fonts:** only the bundled faces, embedded and subset with a ToUnicode
 *   map, and never a standard-14 font.
 * - **Document-level entries:** a title shown in the window (`DisplayDocTitle`),
 *   a language, and XMP that declares `pdfuaid:part` 1.
 */

import PDFDocument from 'pdfkit'
// @ts-ignore - pdfkit/output doesn't have type definitions
import { toBytes } from 'pdfkit/output'
import { pageBox, resolvePaper } from '../theme/paper'
import { faceFor, fontOf } from '../theme/typefaces'
import { Fonts } from './fonts'

/** Millimetres to points. */
const PT = 72 / 25.4

/** What the Creator says: the program that made the document, as opposed to the one that wrote the PDF. */
export const CREATOR = 'Resume Editor'

export interface Attachment {
  /** the file name it is listed under */
  name: string
  mime: string
  description: string
  data: Uint8Array
  /** how it relates to the PDF (AFRelationship); Source unless said */
  relationship?: 'Source' | 'Data' | 'Alternative' | 'Supplement'
}

type DisplayList = import('./measure').DisplayList
type TextItem = import('./measure').TextItem
type Paint = import('./measure').Paint
type StructNode = import('./measure').StructNode

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export class PdfRenderer {
  fonts: Record<string, Uint8Array | ArrayBuffer>
  compress: boolean

  constructor({
    fonts,
    compress = true,
  }: {
    /** FACES id → the TTF's bytes, for every face the list uses */
    fonts: Record<string, Uint8Array | ArrayBuffer>
    /** false leaves streams readable, for tests */
    compress?: boolean
  }) {
    if (!Object.keys(fonts).length) throw new Error('No fonts to embed')
    this.fonts = fonts
    this.compress = compress
  }

  async render(
    list: DisplayList,
    {
      meta,
      lang = list.lang ?? 'en',
      font,
      paper,
      attachments = [],
      now = new Date(),
    }: {
      meta: import('../render/doc-meta').DocMeta
      /** the font choice, for the running head and foot */
      lang?: string
      font?: string
      /** for what stands in the margins */
      paper?: Partial<import('../theme/paper').Paper>
      attachments?: Attachment[]
      now?: Date
    },
  ): Promise<Uint8Array> {
    // Typed loosely: pdfkit's bundled types leave out the tagging and
    // attachment API this file is built on.
    const doc = new PDFDocument({
      pdfVersion: '1.7',
      // Not `subset: 'PDF/UA'`: besides the XMP flag, which #metadata writes,
      // that sets the flag pdfkit also uses for PDF/A-1, and so writes a
      // CIDSet into every font. That CIDSet lists only the glyphs the text
      // uses, not the components composite glyphs bring into the subset with
      // them, which PDF/UA-1 (7.21.4.2) forbids. CIDSet is optional; there is
      // none.
      tagged: true,
      displayTitle: true,
      lang,
      bufferPages: true,
      autoFirstPage: false,
      compress: this.compress,
      size: [list.width, list.height],
      margin: 0,
      // pdfkit sets a default font as it starts; this keeps it from reaching
      // for Helvetica. It is never drawn with, so it is never embedded.
      font: bytes(Object.values(this.fonts)[0]),
      info: {
        Title: meta.title,
        ...(meta.author ? { Author: meta.author } : {}),
        ...(meta.description ? { Subject: meta.description } : {}),
        ...(meta.keywords.length ? { Keywords: meta.keywords.join(', ') } : {}),
        Creator: CREATOR,
        CreationDate: now,
        ModDate: now,
      },
    } as any)
    const out = toBytes(doc)
    for (const [id, data] of Object.entries(this.fonts)) doc.registerFont(id, bytes(data))
    const fonts = new Fonts(doc)
    for (let i = 0; i < list.pages; i++) doc.addPage()

    // Decoration first, a page at a time; then the content, in reading order.
    for (let page = 0; page < list.pages; page++) {
      doc.switchToPage(page)
      if (list.paper.toLowerCase() !== '#ffffff') {
        doc.markContent('Artifact', { type: 'Background' })
        doc.rect(0, 0, list.width, list.height).fill(list.paper)
        doc.endMarkedContent()
      }
      if (!list.artifacts[page]?.length) continue
      doc.markContent('Artifact', { type: 'Layout' })
      for (const a of list.artifacts[page]) draw(doc, fonts, a)
      doc.endMarkedContent()
    }

    const root = doc.struct('Document')
    doc.addStructure(root)
    this.#content(doc, fonts, list.root, root)
    this.#bookmarks(doc, list)
    this.#running(doc, fonts, list, resolvePaper(paper), meta.author, font)
    root.end()

    for (const file of attachments) {
      doc.file(file.data, {
        name: file.name,
        type: file.mime,
        description: file.description,
        relationship: file.relationship ?? 'Source',
        creationDate: now,
        modifiedDate: now,
      })
    }

    this.#metadata(doc, meta, lang)
    doc.end()
    return out
  }

  /**
   * A structure node's children, in order. Text and figure paint go in as
   * marked content belonging to `parent`, one sequence per page; a child node
   * becomes a structure element of its own.
   */
  #content(doc: any, fonts: Fonts, node: StructNode, parent: any): void {
    const kids = node.children
    let i = 0
    while (i < kids.length) {
      const kid = kids[i]
      if (kid.kind === 'node') {
        const el = doc.struct(kid.tag, {
          ...(kid.alt ? { alt: kid.alt } : {}),
          ...(kid.actual ? { actual: kid.actual } : {}),
          ...(kid.title ? { title: kid.title } : {}),
        })
        // What marks the items, as the attribute PDF/UA readers look for on a list.
        if (kid.numbering) el.dictionary.data.A = { O: 'List', ListNumbering: kid.numbering }
        parent.add(el)
        if (kid.tag === 'Link') this.#link(doc, fonts, kid, el)
        else this.#content(doc, fonts, kid, el)
        el.end()
        i++
        continue
      }
      // A stretch of content on one page.
      let j = i + 1
      while (j < kids.length && kids[j].kind !== 'node' && (kids[j] as TextItem | Paint).page === (kid as TextItem | Paint).page) j++
      doc.switchToPage((kid as TextItem | Paint).page)
      // A span's actual text goes on its marked content too, where extractors
      // that read the content stream rather than the structure tree find it.
      const content = doc.markStructureContent(node.tag, node.actual ? { actual: node.actual } : {})
      for (const k of kids.slice(i, j)) draw(doc, fonts, k as TextItem | Paint)
      doc.endMarkedContent()
      parent.add(content)
      i = j
    }
  }

  /**
   * A link: its text as the `Link` element's content, and an annotation over
   * each line of it, described by the text and where it goes.
   */
  #link(doc: any, fonts: Fonts, node: StructNode, el: any): void {
    const items = node.children.filter((c) => c.kind === 'text') as TextItem[]
    const label = items
      .map((t) => t.text)
      .join('')
      .trim()
    for (const page of new Set(items.map((t) => t.page))) {
      const here = items.filter((t) => t.page === page)
      doc.switchToPage(page)
      const content = doc.markStructureContent('Link')
      for (const t of here) draw(doc, fonts, t)
      doc.endMarkedContent()
      el.add(content)
      for (const t of here) {
        doc.link(t.x, t.y - t.size, t.w, t.h, node.href, { structParent: el, Contents: new String(`${label} (${node.href})`) })
      }
    }
  }

  /**
   * A bookmark per section, in reading order, at its title. Opening the file
   * shows them (pdfkit sets `/PageMode /UseOutlines` once there is one).
   */
  #bookmarks(doc: any, list: DisplayList): void {
    const visit = (node: StructNode): void => {
      for (const c of node.children) {
        if (c.kind !== 'node') continue
        const at = c.tag === 'Sect' && c.title ? firstText(c) : null
        if (at) doc.outline.addItem(c.title, { pageNumber: at.page, fit: false, top: Math.max(0, at.y - at.size * 2), left: list.width, zoom: 0 })
        else visit(c)
      }
    }
    visit(list.root)
  }

  /**
   * The running head and foot: the name, the page number, or both, in the
   * margin, as pagination artifacts. Page one never gets a head, since it
   * already carries the name in the header. Set where the preview's page view
   * sets them, in the label face.
   */
  #running(doc: any, fonts: Fonts, list: DisplayList, paper: import('../theme/paper').Paper, name: string, font: string | undefined): void {
    const box = pageBox(paper)
    const face = faceFor(fontOf(font).label, 400).id
    const size = 8
    const color = list.muted
    const left = box.mx * PT
    const right = list.width - box.mx * PT
    for (let page = 0; page < list.pages; page++) {
      const edges = (['header', 'footer'] as const).map((edge) => [edge, edge === 'header' ? (box.mt * PT) / 2 : list.height - (box.mb * PT) / 2] as const)
      for (const [edge, mid] of edges) {
        const mode = paper[edge as keyof import('../theme/paper').Paper]
        if (mode === 'none' || (edge === 'header' && page === 0)) continue
        const num = `${page + 1} / ${list.pages}`
        const items: [string, 'left' | 'center' | 'right'][] =
          mode === 'name' && name
            ? [[name, 'center']]
            : mode === 'page'
              ? [[num, 'center']]
              : mode === 'both'
                ? name
                  ? [
                      [name, 'left'],
                      [num, 'right'],
                    ]
                  : [[num, 'right']]
                : []
        if (!items.length) continue
        doc.switchToPage(page)
        doc.markContent('Artifact', { type: 'Pagination' })
        for (const [label, align] of items) {
          const w = fonts.width(label, face, size)
          const x = align === 'left' ? left : align === 'right' ? right - w : (left + right - w) / 2
          doc
            .font(face)
            .fontSize(size)
            .fillColor(color)
            .text(label, x, mid + size * 0.35, { lineBreak: false, baseline: 'alphabetic' })
        }
        doc.endMarkedContent()
      }
    }
  }

  /**
   * The XMP beside the Info dictionary: the PDF/UA identification, the language, and what
   * pdfkit writes itself. pdfkit writes the title, author,
   * description and keywords into it from `info` as given, without escaping
   * them for XML. The Info dictionary is written before the metadata, so
   * escaping the values at that point fixes the XMP and leaves the Info
   * dictionary as written. The keywords also go in as `dc:subject`, which is
   * where most readers of XMP look for them.
   */
  #metadata(doc: any, meta: import('../render/doc-meta').DocMeta, lang: string): void {
    doc.appendXML(`
        <rdf:Description rdf:about="" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
          <pdfuaid:part>1</pdfuaid:part>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:language><rdf:Bag><rdf:li>${xml(lang)}</rdf:li></rdf:Bag></dc:language>
          <dc:type><rdf:Bag><rdf:li>Text</rdf:li></rdf:Bag></dc:type>
        </rdf:Description>`)
    if (meta.keywords.length) {
      doc.appendXML(`
        <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:subject><rdf:Bag>${meta.keywords.map((k) => `<rdf:li>${xml(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>
        </rdf:Description>`)
    }
    const end = doc.endMetadata
    doc.endMetadata = function () {
      for (const key of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer']) {
        if (typeof this.info[key] === 'string') this.info[key] = xml(this.info[key])
      }
      return end.call(this)
    }
  }
}

/**
 * One item of the display list, on the current page.
 */
function draw(doc: any, fonts: Fonts, item: TextItem | Paint): void {
  switch (item.kind) {
    case 'text':
      text(doc, fonts, item)
      return
    case 'rect':
      doc.save()
      if (item.r > 0) doc.roundedRect(item.x, item.y, item.w, item.h, item.r)
      else doc.rect(item.x, item.y, item.w, item.h)
      if (item.fill) doc.fill(item.fill)
      else if (item.stroke) {
        if (item.dash) doc.dash(item.dash[0], { space: item.dash[1] })
        doc.lineWidth(item.lw ?? 1).stroke(item.stroke)
      }
      doc.restore()
      return
    case 'line':
      doc.save().lineWidth(item.lw).strokeColor(item.color)
      if (item.dash) doc.dash(item.dash[0], { space: item.dash[1] })
      doc.moveTo(item.x1, item.y1).lineTo(item.x2, item.y2).stroke().restore()
      return
    case 'path':
      doc.save().translate(item.x, item.y).scale(item.scale).path(item.d).fill(item.fill).restore()
  }
}

/**
 * A measured run, a word at a time. Each word starts where the browser put it
 * and is scaled horizontally by however little it takes to end where the
 * browser ended it, so the gaps between words are the browser's own, whatever
 * the two shapers disagree on: pixel-rounded advances on one side, fractional
 * on the other. Scaling rather than letter spacing, because a glyph's box —
 * what an extractor measures gaps from — scales with it.
 *
 * Each space is drawn on its own, its advance fitted to the gap the browser
 * left, so that text extraction finds a space there that doesn't overlap the
 * next word. A gap narrower than the font's own space — kerning round an `&`
 * can make one — is widened to it, taking the difference out of the word after
 * it rather than pushing the rest of the line along: extractors read a gap that
 * narrow as no space at all.
 */
function text(doc: any, fonts: Fonts, t: TextItem): void {
  const words = t.words?.length ? t.words : [{ at: 0, x: t.x, w: t.w }]
  const track = t.tracking ?? 0
  /** A string's own advance, its letter spacing included. */
  const natural = (str: string): number =>
    fonts.pieces(str, t.families, t.weight, t.italic).reduce((sum, p) => sum + fonts.width(p.text, p.face, t.size) + track * [...p.text].length, 0)
  /** a share of the natural width */
  const put = (str: string, x: number, scale: number): void => {
    let at = x
    for (const p of fonts.pieces(str, t.families, t.weight, t.italic)) {
      doc
        .font(p.face)
        .fontSize(t.size)
        .fillColor(t.color)
        .text(p.text, at, t.y, { lineBreak: false, baseline: 'alphabetic', horizontalScaling: scale * 100, characterSpacing: track })
      at += (fonts.width(p.text, p.face, t.size) + track * [...p.text].length) * scale
    }
  }

  // Where the last thing drawn ended. Each word aims for the box the browser
  // gave it, starting no earlier than this plus a whole space.
  let end = t.x
  const lead = t.text.slice(0, words[0].at)
  words.forEach((word, i) => {
    const before = i === 0 ? lead : ''
    if (before) {
      const own = natural(before)
      const room = word.x - end
      put(before, end, own > 0 ? Math.max(room, own) / own : 1)
      end += Math.max(room, own)
    }
    const chunk = t.text.slice(word.at, words[i + 1]?.at ?? t.text.length)
    const body = chunk.trimEnd()
    const gap = chunk.slice(body.length)
    const x = Math.max(word.x, end)
    const own = natural(body)
    const scale = own > 0 ? clamp((word.x + word.w - x) / own) : 1
    put(body, x, scale)
    end = x + own * scale
    if (!gap) return
    const next = words[i + 1]
    const space = natural(gap)
    const room = next ? next.x - end : space
    put(gap, end, space > 0 ? Math.max(room, space) / space : 1)
    end += Math.max(room, space)
  })
}

/**
 * The first run of text inside a structure node, in reading order.
 */
function firstText(node: StructNode): TextItem | null {
  for (const c of node.children) {
    const hit = c.kind === 'node' ? firstText(c) : c.kind === 'text' ? c : null
    if (hit) return hit
  }
  return null
}

/** As much of a scale as a word can take before it looks squeezed or stretched. */
const clamp = (k: number): number => Math.min(1.15, Math.max(0.85, k))

const bytes = (b: Uint8Array | ArrayBuffer): Uint8Array => (b instanceof Uint8Array ? b : new Uint8Array(b))
