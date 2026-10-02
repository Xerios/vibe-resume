/**
 * The Export button, end to end: fetch the faces the measured sheet uses,
 * render, and save. Loaded on the first export rather than with the app, since
 * it brings pdfkit and fontkit with it.
 */

import { toStrictYaml } from '../format/strict-yaml.js'
import { docMeta } from '../render/doc-meta.js'
import { toJsonResume } from '../render/json-resume.js'
import { FACES, faceFor, fontOf } from '../theme/typefaces.js'
import { familiesOf } from './fonts.js'
import { PdfRenderer } from './PdfRenderer.js'

/** @type {Map<string, Promise<ArrayBuffer>>} */
const fetched = new Map()

/**
 * A face's bytes, fetched once per page load. The faces are build assets the
 * service worker caches, so this works offline for any font already used.
 * @param {import('../theme/typefaces.js').Face} face
 */
function load(face) {
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
 * @param {import('./measure.js').DisplayList} list
 * @param {string} font
 */
function facesOf(list, font) {
  const families = new Set([fontOf(font).label])
  /** @param {import('./measure.js').StructNode | import('./measure.js').TextItem | import('./measure.js').Paint} n */
  const visit = (n) => {
    if (n.kind === 'node') n.children.forEach(visit)
    else if (n.kind === 'text') for (const f of familiesOf(n.families)) families.add(f)
  }
  visit(list.root)
  for (const page of list.artifacts) page.forEach(visit)
  return FACES.filter((f) => families.has(f.family) || f.id === faceFor(fontOf(font).label, 400).id)
}

/**
 * @param {object} what
 * @param {import('./measure.js').DisplayList} what.list  the preview, measured
 * @param {any} what.cv       the parsed CV the preview is showing
 * @param {string} what.yaml  its source, as the editor holds it
 * @param {{ font?: string, paper?: Partial<import('../theme/paper.js').Paper> }} what.look
 * @param {string} what.fileName  the tab's name, which the saved file is named after
 * @returns {Promise<boolean>} false if the user backed out of the save dialog
 */
export async function exportPdf({ list, cv, yaml, look, fileName }) {
  const font = look.font ?? 'sans'
  const faces = facesOf(list, font)
  const fonts = Object.fromEntries(await Promise.all(faces.map(async (f) => /** @type {const} */ ([f.id, await load(f)]))))
  const enc = new TextEncoder()
  const bytes = await new PdfRenderer({ fonts }).render(list, {
    meta: docMeta(cv),
    font,
    paper: look.paper,
    attachments: [
      { name: 'cv.yaml', mime: 'application/yaml', description: 'This CV’s source, as YAML', data: enc.encode(toStrictYaml(yaml)) },
      {
        name: 'resume.json',
        mime: 'application/json',
        description: 'This CV in the JSON Resume schema (jsonresume.org), for resume parsers',
        relationship: 'Alternative',
        data: enc.encode(JSON.stringify(toJsonResume(cv), null, 2)),
      },
    ],
  })
  return save(bytes, `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'cv'}.pdf`)
}

/**
 * Through the save dialog where there is one, so the file can go wherever the
 * user wants it; a download where there isn't.
 * @param {Uint8Array} bytes
 * @param {string} name
 * @returns {Promise<boolean>} false if the user backed out of the dialog
 */
async function save(bytes, name) {
  const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/pdf' })
  const picker = /** @type {any} */ (window).showSaveFilePicker
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
