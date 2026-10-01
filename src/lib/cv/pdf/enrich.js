/**
 * Putting back what the browser's print leaves out of a PDF.
 *
 * Print to PDF writes the document's title and nothing else from its head (see
 * doc-meta.js), and the app never sees the file it writes — so this works on
 * the file afterwards, handed back by the user. It adds the Author, Subject and
 * Keywords the Info dictionary has room for, the same again as XMP for
 * anything that reads that instead, and the CV itself as attached files.
 *
 * It does so as an *incremental update*: the new objects, a cross-reference
 * section for them and a new trailer are appended, and not one byte of the file
 * as printed changes. The pages, the fonts, the links and the tagged structure
 * a screen reader walks are exactly what the browser wrote. Only the catalog
 * and the Info dictionary are written again, as new revisions of themselves.
 *
 * That takes reading very little of the file: the trailer, the cross-reference
 * table, and those two objects. What it can't read is a file whose
 * cross-references are a compressed stream, or one that is encrypted — neither
 * is what a browser prints, so either means the file has been through another
 * program since, and it is refused rather than half-understood.
 */

/** What the Creator says from now on: the program that made the document, as opposed to the one that wrote the PDF. */
export const CREATOR = 'Resume Editor'

/**
 * A file this can't work on, with a sentence for the person who dropped it.
 */
export class PdfError extends Error {}

/**
 * @typedef {object} PdfInfo
 * @property {string} title
 * @property {string} author
 * @property {string} subject
 * @property {string} keywords
 * @property {string} creator
 * @property {string} producer
 * @property {Date | null} created  the CreationDate, when there is one that reads
 */

/**
 * @typedef {object} Attachment
 * @property {string} name  the file name it is listed under
 * @property {string} mime
 * @property {string} description
 * @property {Uint8Array} data
 */

/**
 * @typedef {object} Enrichment
 * @property {import('../template/doc-meta.js').DocMeta} meta
 * @property {Attachment[]} attachments
 * @property {Date} [now]  when it happened, for ModDate; the clock unless a test says otherwise
 */

/* ── Reading ─────────────────────────────────────────────────────────────── */

/**
 * The file as a string of one character per byte, so that an index into it is
 * an offset into the file. `TextDecoder('latin1')` would not do: it is really
 * windows-1252 and moves 0x80–0x9F.
 * @param {Uint8Array} bytes
 */
function binary(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return out
}

const WHITESPACE = '\0\t\n\f\r '
const DELIMITERS = '()<>[]{}/%'

/**
 * Past whitespace and comments.
 * @param {string} s
 * @param {number} i
 */
function skip(s, i) {
  while (i < s.length) {
    if (WHITESPACE.includes(s[i])) i++
    else if (s[i] === '%') while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
    else break
  }
  return i
}

/**
 * One value — a dictionary, an array, a string, a name or a bare token — as the
 * text it was written as, and where it ends. An indirect reference is three
 * values to this; `entries` puts them back together.
 * @param {string} s
 * @param {number} i
 * @returns {{ raw: string, end: number }}
 */
function value(s, i) {
  const start = skip(s, i)
  let j = start
  if (s.startsWith('<<', j)) {
    j += 2
    for (j = skip(s, j); !s.startsWith('>>', j); j = skip(s, j)) {
      if (j >= s.length) throw new PdfError('The file ends partway through.')
      j = value(s, j).end
    }
    j += 2
  } else if (s[j] === '[') {
    for (j = skip(s, j + 1); s[j] !== ']'; j = skip(s, j)) {
      if (j >= s.length) throw new PdfError('The file ends partway through.')
      j = value(s, j).end
    }
    j += 1
  } else if (s[j] === '(') {
    let depth = 0
    for (; j < s.length; j++) {
      if (s[j] === '\\') j++
      else if (s[j] === '(') depth++
      else if (s[j] === ')' && --depth === 0) break
    }
    j += 1
  } else if (s[j] === '<') {
    j = s.indexOf('>', j) + 1
    if (j === 0) throw new PdfError('The file ends partway through.')
  } else {
    if (s[j] === '/') j++
    while (j < s.length && !WHITESPACE.includes(s[j]) && !DELIMITERS.includes(s[j])) j++
  }
  if (j === start) throw new PdfError('Part of this file doesn’t read as PDF.')
  return { raw: s.slice(start, j), end: j }
}

/**
 * A dictionary's entries, key (without its slash) → value as written, in the
 * order they came.
 * @param {string} raw  `<< … >>`
 */
function entries(raw) {
  /** @type {string[]} */
  const parts = []
  for (let j = skip(raw, 2); !raw.startsWith('>>', j); j = skip(raw, j)) {
    const v = value(raw, j)
    parts.push(v.raw)
    j = v.end
  }
  /** @type {Map<string, string>} */
  const out = new Map()
  for (let k = 0; k < parts.length; k += 2) {
    const key = parts[k]
    let val = parts[k + 1] ?? 'null'
    if (/^\d+$/.test(val) && /^\d+$/.test(parts[k + 2] ?? '') && parts[k + 3] === 'R') {
      val = `${val} ${parts[k + 2]} R`
      k += 2
    }
    out.set(key.slice(1), val)
  }
  return out
}

/** @param {Map<string, string>} dict */
const dictionary = (dict) => `<<${[...dict].map(([k, v]) => `/${k} ${v}`).join('\n')}>>`

/** @param {string} ref  `12 0 R` */
function refOf(ref) {
  const m = /^(\d+) (\d+) R$/.exec(ref)
  return m ? { num: Number(m[1]), gen: Number(m[2]) } : null
}

/**
 * The file's structure, as far as this needs it.
 * @param {Uint8Array} bytes
 */
function open(bytes) {
  const s = binary(bytes)
  if (!s.startsWith('%PDF-')) throw new PdfError('That isn’t a PDF.')

  const at = s.lastIndexOf('startxref')
  const startxref = at < 0 ? NaN : Number(/^startxref\s+(\d+)/.exec(s.slice(at, at + 40))?.[1])
  if (!Number.isFinite(startxref)) throw new PdfError('This PDF is damaged — it has no table of contents to read.')

  /** Object number → where it starts and its generation; the newest section wins. */
  /** @type {Map<number, { offset: number, gen: number }>} */
  const objects = new Map()
  /** @type {Map<string, string> | null} */
  let trailer = null
  /** @type {Set<number>} */
  const seen = new Set()
  for (let offset = startxref; Number.isFinite(offset) && !seen.has(offset);) {
    seen.add(offset)
    const section = xref(s, offset)
    for (const [num, entry] of section.objects) if (!objects.has(num)) objects.set(num, entry)
    trailer ??= section.trailer
    offset = section.trailer.has('Prev') ? Number(section.trailer.get('Prev')) : NaN
  }
  if (!trailer) throw new PdfError('This PDF is damaged — it has no table of contents to read.')
  if (trailer.has('Encrypt')) throw new PdfError('This PDF is encrypted, so nothing can be added to it.')

  /**
   * An indirect object's value, as written.
   * @param {string | undefined} ref
   */
  const object = (ref) => {
    const r = ref ? refOf(ref) : null
    const entry = r ? objects.get(r.num) : undefined
    if (!r || !entry) return null
    const head = new RegExp(`^${r.num}\\s+${entry.gen}\\s+obj`).exec(s.slice(entry.offset, entry.offset + 32))
    if (!head) throw new PdfError('This PDF is damaged — its table of contents points at the wrong places.')
    return value(s, entry.offset + head[0].length).raw
  }

  return { startxref, trailer, object }
}

/**
 * One classic cross-reference section and the trailer after it. A
 * cross-reference *stream* — PDF 1.5's compressed form — is what a file
 * re-saved by a PDF tool usually has, and is refused here.
 * @param {string} s
 * @param {number} offset
 */
function xref(s, offset) {
  if (!s.startsWith('xref', offset)) {
    throw new PdfError('This PDF has been re-saved by another program since it was exported. Drop the file your browser saved.')
  }
  /** @type {Map<number, { offset: number, gen: number }>} */
  const objects = new Map()
  let j = skip(s, offset + 4)
  const head = /(\d+)\s+(\d+)/y
  const row = /(\d{10})\s(\d{5})\s([nf])\s*/y
  while (!s.startsWith('trailer', j)) {
    head.lastIndex = j
    const h = head.exec(s)
    if (!h) throw new PdfError('This PDF is damaged — its table of contents doesn’t read.')
    j = skip(s, head.lastIndex)
    for (let k = 0; k < Number(h[2]); k++) {
      row.lastIndex = j
      const r = row.exec(s)
      if (!r) throw new PdfError('This PDF is damaged — its table of contents doesn’t read.')
      if (r[3] === 'n') objects.set(Number(h[1]) + k, { offset: Number(r[1]), gen: Number(r[2]) })
      j = row.lastIndex
    }
    j = skip(s, j)
  }
  const raw = value(s, j + 'trailer'.length).raw
  if (!raw.startsWith('<<')) throw new PdfError('This PDF is damaged — its table of contents doesn’t read.')
  return { objects, trailer: entries(raw) }
}

/**
 * A PDF string's text: a literal `( … )` or a hex `< … >`, in PDFDocEncoding
 * or, behind a byte-order mark, UTF-16BE. PDFDocEncoding is read as Latin-1,
 * which it is everywhere a title is likely to go.
 * @param {string | undefined} raw
 */
function text(raw) {
  if (!raw) return ''
  let bytes = ''
  if (raw.startsWith('(')) {
    const body = raw.slice(1, -1)
    /** @type {Record<string, string>} */
    const ESC = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
    bytes = body.replace(/\\(\r\n|[\r\n]|[0-7]{1,3}|.)/gs, (_, c) => {
      if (c[0] === '\r' || c[0] === '\n') return ''
      if (/^[0-7]/.test(c)) return String.fromCharCode(parseInt(c, 8) & 0xff)
      return ESC[c] ?? c
    })
  } else if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/\s/g, '')
    for (let i = 0; i < hex.length; i += 2) bytes += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16))
  } else return ''
  if (bytes.startsWith('\xfe\xff')) {
    let out = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1))
    return out
  }
  return bytes
}

/**
 * `D:YYYYMMDDHHmmSS+HH'mm'`, with everything after the year optional.
 * @param {string} s
 */
function pdfDate(s) {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(s)
  if (!m) return null
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz, oh = '00', om = '00'] = m
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)
  const shift = tz === '+' || tz === '-' ? (tz === '-' ? -1 : 1) * (+oh * 60 + +om) * 60_000 : 0
  return new Date(utc - shift)
}

/**
 * What a PDF says about itself — enough to tell whether it is the one that was
 * just exported. Throws a PdfError for a file `enrichPdf` couldn't take.
 * @param {Uint8Array} bytes
 * @returns {PdfInfo}
 */
export function readPdf(bytes) {
  const { trailer, object } = open(bytes)
  if (!object(trailer.get('Root'))?.startsWith('<<')) throw new PdfError('This PDF is damaged — it has no catalog.')
  const raw = object(trailer.get('Info')) ?? trailer.get('Info')
  const info = raw?.startsWith('<<') ? entries(raw) : new Map()
  return {
    title: text(info.get('Title')),
    author: text(info.get('Author')),
    subject: text(info.get('Subject')),
    keywords: text(info.get('Keywords')),
    creator: text(info.get('Creator')),
    producer: text(info.get('Producer')),
    created: pdfDate(text(info.get('CreationDate'))),
  }
}

/**
 * @typedef {object} Expected
 * @property {string} title  the title the export printed under
 * @property {number} since  when the text that was exported was first exported, in ms
 */

/** @param {Date | number} d */
const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A file printed this long before the export it is supposed to be is still taken to be it: clocks and rounding. */
const SLACK_MS = 60_000

/**
 * Why a PDF isn't the one that was exported, or null when it is.
 *
 * The title is what names it: it is the CV's name, and it is the one thing
 * the browser carries through. The creation date is what dates it — a PDF made
 * before the version it is supposed to show was exported is an older one,
 * however right its name.
 *
 * @param {PdfInfo} info
 * @param {Expected} expected
 * @returns {string | null}
 */
export function mismatch(info, expected) {
  if (!info.title) return 'This PDF has no title, so it didn’t come from this CV’s export.'
  if (info.title !== expected.title) return `This PDF is “${info.title}”, but the CV you exported is “${expected.title}”.`
  if (info.created && info.created.getTime() < expected.since - SLACK_MS) {
    return `This PDF was made ${when(info.created)}, before the version you just exported (${when(expected.since)}). Drop the file you just saved.`
  }
  return null
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

/**
 * A text string as UTF-16BE behind a byte-order mark, in hex — the form any
 * text survives in, and the one browsers write titles in themselves.
 * @param {string} str
 */
function pdfText(str) {
  let hex = 'FEFF'
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `<${hex}>`
}

/** A name, with anything outside the printable range escaped. @param {string} name */
const pdfName = (name) => `/${name.replace(/[^!-~]|[#()<>[\]{}/%]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}`

/** @param {Date} d */
const pdfDateOf = (d) => `(D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)`

/** @param {string} s */
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The XMP packet: Dublin Core for title, author, description and subjects,
 * and the PDF and XMP basics alongside. Left uncompressed, as the XMP spec
 * asks, so that a tool scanning the file for a packet finds it.
 * @param {import('../template/doc-meta.js').DocMeta} meta
 * @param {{ producer: string, created: Date | null, now: Date }} at
 */
function xmp(meta, { producer, created, now }) {
  const alt = (/** @type {string} */ v) => `<rdf:Alt><rdf:li xml:lang="x-default">${xml(v)}</rdf:li></rdf:Alt>`
  const lines = [
    `<dc:format>application/pdf</dc:format>`,
    meta.title && `<dc:title>${alt(meta.title)}</dc:title>`,
    meta.author && `<dc:creator><rdf:Seq><rdf:li>${xml(meta.author)}</rdf:li></rdf:Seq></dc:creator>`,
    meta.description && `<dc:description>${alt(meta.description)}</dc:description>`,
    meta.keywords.length && `<dc:subject><rdf:Bag>${meta.keywords.map((k) => `<rdf:li>${xml(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`,
    meta.keywords.length && `<pdf:Keywords>${xml(meta.keywords.join(', '))}</pdf:Keywords>`,
    producer && `<pdf:Producer>${xml(producer)}</pdf:Producer>`,
    `<xmp:CreatorTool>${CREATOR}</xmp:CreatorTool>`,
    created && `<xmp:CreateDate>${created.toISOString()}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${now.toISOString()}</xmp:ModifyDate>`,
    `<xmp:MetadataDate>${now.toISOString()}</xmp:MetadataDate>`,
  ].filter(Boolean)
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
${lines.join('\n')}
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * zlib, which is what FlateDecode means — the browser's own, so no library.
 * @param {Uint8Array} data
 */
async function deflate(data) {
  const stream = new Blob([/** @type {BlobPart} */ (data)]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * The PDF with its metadata and attachments added, as an incremental update.
 * Throws a PdfError for a file it can't read.
 * @param {Uint8Array} bytes
 * @param {Enrichment} what
 * @returns {Promise<Uint8Array>}
 */
export async function enrichPdf(bytes, { meta, attachments, now = new Date() }) {
  const { startxref, trailer, object } = open(bytes)
  const enc = new TextEncoder()

  const rootRef = trailer.get('Root') ?? ''
  const root = refOf(rootRef)
  const catalogRaw = object(rootRef)
  if (!root || !catalogRaw?.startsWith('<<')) throw new PdfError('This PDF is damaged — it has no catalog.')
  const catalog = entries(catalogRaw)

  let next = Number(trailer.get('Size'))
  if (!Number.isInteger(next) || next < 1) throw new PdfError('This PDF is damaged — its table of contents doesn’t read.')

  /** Everything appended, in order, with the object number each one is. */
  /** @type {{ num: number, gen: number, head: string, stream?: Uint8Array }[]} */
  const out = []
  /** @param {string} head @param {Uint8Array} [stream] */
  const add = (head, stream) => {
    const num = next++
    out.push({ num, gen: 0, head, stream })
    return `${num} 0 R`
  }

  // Info: what was there, and the rest beside it. The browser's own Producer
  // and dates stay; Creator becomes the program the document was made in.
  const infoRef = trailer.get('Info')
  const infoOld = object(infoRef) ?? ''
  const info = infoOld.startsWith('<<') ? entries(infoOld) : new Map()
  const producer = text(info.get('Producer'))
  const created = pdfDate(text(info.get('CreationDate')))
  info.set('Title', pdfText(meta.title))
  if (meta.author) info.set('Author', pdfText(meta.author))
  if (meta.description) info.set('Subject', pdfText(meta.description))
  if (meta.keywords.length) info.set('Keywords', pdfText(meta.keywords.join(', ')))
  info.set('Creator', pdfText(CREATOR))
  info.set('ModDate', pdfDateOf(now))
  const infoAt = infoRef && refOf(infoRef)
  if (infoAt) out.push({ ...infoAt, head: dictionary(info) })
  else trailer.set('Info', add(dictionary(info)))

  const packet = enc.encode(xmp(meta, { producer, created, now }))
  catalog.set('Metadata', add(`<</Type /Metadata\n/Subtype /XML\n/Length ${packet.length}>>`, packet))

  /** @type {string[]} */
  const specs = []
  /** @type {string[]} */
  const names = []
  const packed = await Promise.all(attachments.map((file) => deflate(file.data)))
  attachments.forEach((file, i) => {
    const data = packed[i]
    const ef = add(
      `<</Type /EmbeddedFile\n/Subtype ${pdfName(file.mime)}\n/Filter /FlateDecode\n/Length ${data.length}\n/Params <</Size ${file.data.length}\n/ModDate ${pdfDateOf(now)}>>>>`,
      data,
    )
    const name = pdfText(file.name)
    // /F is a byte string from before Unicode, so it gets an ASCII spelling; /UF is the real name.
    const ascii = `(${file.name.replace(/[^\x20-\x7e]/g, '_').replace(/[()\\]/g, '\\$&')})`
    const spec = add(`<</Type /Filespec\n/F ${ascii}\n/UF ${name}\n/Desc ${pdfText(file.description)}\n/AFRelationship /Source\n/EF <</F ${ef}\n/UF ${ef}>>>>`)
    specs.push(spec)
    names.push(`${name} ${spec}`)
  })
  if (specs.length) {
    // The name tree has to be sorted, and the catalog's /Names may be a
    // reference to a dictionary of its own — which is read and inlined here.
    const old = catalog.get('Names')
    const oldRaw = old?.startsWith('<<') ? old : object(old)
    const tree = oldRaw?.startsWith('<<') ? entries(oldRaw) : new Map()
    tree.set('EmbeddedFiles', `<</Names [${names.toSorted().join(' ')}]>>`)
    catalog.set('Names', dictionary(tree))
    catalog.set('AF', `[${specs.join(' ')}]`)
  }
  out.push({ ...root, head: dictionary(catalog) })

  // The update itself: the objects, a cross-reference section listing only
  // them, and a trailer that points back at the table it supersedes.
  /** @type {Uint8Array[]} */
  const chunks = []
  let length = bytes.length
  /** @param {string | Uint8Array} part */
  const push = (part) => {
    const b = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(b)
    length += b.length
  }
  if (bytes[bytes.length - 1] !== 0x0a) push('\n')
  /** @type {Map<number, { offset: number, gen: number }>} */
  const offsets = new Map()
  for (const o of out) {
    offsets.set(o.num, { offset: length, gen: o.gen })
    push(`${o.num} ${o.gen} obj\n${o.head}`)
    if (o.stream) {
      push('\nstream\n')
      push(o.stream)
      push('\nendstream')
    }
    push('\nendobj\n')
  }

  const xrefAt = length
  let table = 'xref\n'
  const nums = [...offsets.keys()].toSorted((a, b) => a - b)
  for (let i = 0; i < nums.length;) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    table += `${nums[i]} ${j - i + 1}\n`
    for (let k = i; k <= j; k++) {
      const { offset, gen } = /** @type {{ offset: number, gen: number }} */ (offsets.get(nums[k]))
      table += `${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} n\r\n`
    }
    i = j + 1
  }
  trailer.set('Size', String(next))
  trailer.set('Prev', String(startxref))
  trailer.delete('XRefStm')
  push(`${table}trailer\n${dictionary(trailer)}\nstartxref\n${xrefAt}\n%%EOF\n`)

  const result = new Uint8Array(length)
  result.set(bytes)
  let at = bytes.length
  for (const c of chunks) {
    result.set(c, at)
    at += c.length
  }
  return result
}
