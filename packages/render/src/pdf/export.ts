/**
 * The Export button, end to end: fetch the faces the measured sheet uses,
 * render, and save. Loaded on the first export rather than with the app, since
 * it brings pdfkit and fontkit with it.
 */

import { docMeta } from '../doc-meta'
import { FACES, faceFor, fontOf } from '../theme/typefaces'
import { familiesOf } from './fonts'
import { PdfRenderer } from './PdfRenderer'

const fetched: Map<string, Promise<ArrayBuffer>> = new Map()

/**
 * A face's bytes, fetched once per page load. The faces are build assets the
 * service worker caches, so this works offline for any font already used.
 */
function load(face: import('../theme/typefaces').Face): Promise<ArrayBuffer> {
  let p = fetched.get(face.id)
  if (!p) {
    p = fetch(face.url).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load the ${face.id} font`)
      return res.arrayBuffer()
    })
    p.catch(() => fetched.delete(face.id))
    fetched.set(face.id, p)
  }
  return p
}

/**
 * Every face a display list can draw with: each family its text names, and the
 * label face the running head is set in.
 */
function facesOf(list: import('./measure').DisplayList, font: string): import('../theme/typefaces').Face[] {
  const families = new Set([fontOf(font).label])
  const visit = (n: import('./measure').StructNode | import('./measure').TextItem | import('./measure').Paint): void => {
    if (n.kind === 'node') n.children.forEach(visit)
    else if (n.kind === 'text') for (const f of familiesOf(n.families)) families.add(f)
  }
  visit(list.root)
  for (const page of list.artifacts) page.forEach(visit)
  return FACES.filter((f) => families.has(f.family) || f.id === faceFor(fontOf(font).label, 400).id)
}

export interface ExportPdfInput {
  list: import('./measure').DisplayList
  cv: any
  /** the text the CV was written in, attached as it is */
  source: { name: string; mime: string; text: string }
  look: { font?: string; paper?: Partial<import('../theme/paper').Paper> }
  fileName: string
}

export async function exportPdf({ list, cv, source, look, fileName }: ExportPdfInput): Promise<boolean> {
  const font = look.font ?? 'sans'
  const faces = facesOf(list, font)
  const fonts = Object.fromEntries(await Promise.all(faces.map(async (f) => [f.id, await load(f)] as const)))
  const enc = new TextEncoder()
  const bytes = await new PdfRenderer({ fonts }).render(list, {
    meta: docMeta(cv),
    font,
    paper: look.paper,
    attachments: [
      { name: source.name, mime: source.mime, description: "This CV's source, as written", data: enc.encode(source.text) },
    ],
  })
  return save(bytes, `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'cv'}.pdf`)
}

/**
 * Through the save dialog where there is one, so the file can go wherever the
 * user wants it; a download where there isn't.
 */
async function save(bytes: Uint8Array, name: string): Promise<boolean> {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const picker = (window as any).showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      throw e
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
