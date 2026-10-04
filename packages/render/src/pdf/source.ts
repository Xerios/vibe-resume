/**
 * The way back from an export: the source a PDF carries as its `Source`
 * attachment, read out again so the CV can be reopened from the PDF alone.
 *
 * A reader for what PdfRenderer writes, not for PDFs at large: pdfkit writes
 * every object on its own, uncompressed dictionaries and all, with direct
 * lengths, and Flate is the only filter it uses. A PDF that has been through
 * another program since may pack its objects into streams; that one has no
 * source to give back here.
 */

export interface Source {
  /** the attachment's media type, as `text/markdown` */
  mime: string
  text: string
}

/** The CV source attached to a PDF, or null if it has none this can read. */
export async function readSource(data: Uint8Array): Promise<Source | null> {
  const found = attachment(data)
  if (!found) return null
  const { mime, bytes, flate } = found
  return { mime, text: new TextDecoder().decode(flate ? await inflate(bytes) : bytes) }
}

/** The `Source` attachment's media type and stream, still encoded. */
function attachment(data: Uint8Array): { mime: string; bytes: Uint8Array; flate: boolean } | null {
  // Latin-1 keeps one character per byte, so offsets in the text are offsets in the data.
  let s = ''
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000))
  if (!s.startsWith('%PDF-')) return null

  const object = (n: number): { at: number; body: string } | null => {
    const m = new RegExp(`(?:^|\\s)${n} 0 obj\\b`).exec(s)
    if (!m) return null
    const at = m.index + m[0].length
    const end = s.indexOf('endobj', at)
    return { at, body: s.slice(at, end < 0 ? undefined : end) }
  }

  for (const spec of s.matchAll(/\/AFRelationship\s*\/Source\b/g)) {
    // The rest of the file spec this relationship belongs to.
    const rest = s.slice(spec.index, s.indexOf('endobj', spec.index))
    const ref = /\/EF\s*<<\s*\/F\s+(\d+)\s+0\s+R/.exec(rest)?.[1]
    const file = ref ? object(Number(ref)) : null
    if (!file || !/\/Type\s*\/EmbeddedFile\b/.test(file.body)) continue

    const head = file.body.slice(0, file.body.indexOf('stream'))
    const length = Number(/\/Length\s+(\d+)/.exec(head)?.[1])
    const start = /stream\r?\n/.exec(file.body)
    if (!start || !Number.isFinite(length)) continue
    const from = file.at + start.index + start[0].length
    const flate = /\/Filter\s*\/FlateDecode\b/.test(head)
    if (!flate && /\/Filter\b/.test(head)) continue

    const subtype = /\/Subtype\s*\/([^\s/<>[\]()]+)/.exec(head)?.[1] ?? ''
    const mime = subtype.replace(/#([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    return { mime, bytes: data.subarray(from, from + length), flate }
  }
  return null
}

/** zlib-wrapped deflate, which is what FlateDecode is. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
