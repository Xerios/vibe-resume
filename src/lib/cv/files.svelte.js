import { resolvePaper } from './paper.js'
import { KEYS, read, remove, snapshotKey, write } from './storage.js'

/**
 * @typedef {object} FileMeta
 * @property {string} id
 * @property {string} name
 * @property {number | null} deletedAt   ms epoch when moved to trash; null while open
 * @property {string} [layout]           preset id from compositions.js; absent means the default
 * @property {Record<string, string>} [variants]  slot id → variant id, on top of the preset's
 * @property {string} [theme]            palette id from presets.js; absent means the default
 * @property {string} [font]             font id from fonts.js; absent means the default
 * @property {string} [css]              the file's own CSS, applied last inside the preview frame
 * @property {import('./paper.js').Paper} [paper]  the page box it prints on; absent means A4 portrait
 */

/**
 * The set of documents open in the editor, as tabs. Each file's own CRDT
 * snapshot lives under its own storage key (see `snapshotKey`); this class
 * only owns the registry — id, name, trash state — not document content.
 *
 * Deleting a file is a soft delete: it drops off the tab bar but its snapshot
 * key is left untouched, so restoring it from the trash brings back the full
 * history exactly as it was.
 *
 * Preset, block variants, theme and font ride along here too, because this is
 * the only place that knows them for a file that isn't open. For the file that
 * *is* open they are also in its document, which is what puts a restyle in the
 * version history and on the undo stack — see `bindStyle` in doc.svelte.js.
 * Everything that changes a style here goes through `restyle` in
 * state.svelte.js, which keeps the two in step.
 */
export class FileManager {
  /** @type {FileMeta[]} */
  files = $state([])
  activeId = $state(/** @type {string | null} */ (null))

  /** Left-to-right tab order, oldest first. */
  open = $derived(this.files.filter((f) => !f.deletedAt))
  /** Most recently deleted first. */
  trashed = $derived(this.files.filter((f) => f.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)))
  active = $derived(this.files.find((f) => f.id === this.activeId) ?? null)

  init() {
    this.files = this.#loadList()
    if (this.files.length === 0) this.#migrateOrSeed()

    const openIds = this.open.map((f) => f.id)
    const stored = read(KEYS.activeFile)
    this.activeId = stored && openIds.includes(stored) ? stored : (openIds[0] ?? this.create())
  }

  /** @param {string} id */
  switchTo(id) {
    if (id === this.activeId) return
    this.activeId = id
    this.#saveActive()
  }

  /**
   * Open a new tab by copying a file's stored snapshot verbatim — the copy
   * carries the source's full history, not just its current text.
   * @param {string} sourceId
   */
  duplicate(sourceId) {
    const source = this.files.find((f) => f.id === sourceId)
    if (!source) return this.create()

    const raw = read(snapshotKey(sourceId))
    const id = newId()
    if (raw) write(snapshotKey(id), raw)

    this.files = [
      ...this.files,
      {
        id,
        name: this.#uniqueName(`${source.name} copy`),
        deletedAt: null,
        layout: source.layout,
        variants: source.variants,
        theme: source.theme,
        font: source.font,
        css: source.css,
        paper: source.paper,
      },
    ]
    this.#saveList()
    this.activeId = id
    this.#saveActive()
    return id
  }

  /**
   * A given name is de-duplicated like a generated one — importing the same
   * `cv.yaml` twice should give two distinguishable tabs, not two called "cv".
   * @param {string} [name]
   */
  create(name) {
    const id = newId()
    this.files = [...this.files, { id, name: this.#uniqueName(name || 'Untitled'), deletedAt: null }]
    this.#saveList()
    this.activeId = id
    this.#saveActive()
    return id
  }

  /**
   * Move a file to the trash. Its snapshot key is left in place. Returns the
   * id that should now be active — unchanged unless the trashed file was it.
   * @param {string} id
   * @returns {string}
   */
  trash(id) {
    this.files = this.files.map((f) => (f.id === id ? { ...f, deletedAt: Date.now() } : f))
    this.#saveList()
    if (this.activeId !== id) return /** @type {string} */ (this.activeId)

    const nextId = this.open[0]?.id ?? this.create()
    this.activeId = nextId
    this.#saveActive()
    return nextId
  }

  /** Bring a trashed file back as an open tab. @param {string} id */
  restore(id) {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    const name = this.#uniqueName(file.name)
    this.files = this.files.map((f) => (f.id === id ? { ...f, name, deletedAt: null } : f))
    this.#saveList()
    this.activeId = id
    this.#saveActive()
  }

  /** Permanently delete a trashed file — its snapshot is gone for good. @param {string} id */
  purge(id) {
    this.files = this.files.filter((f) => f.id !== id)
    this.#saveList()
    remove(snapshotKey(id))
  }

  /**
   * @param {string} id
   * @param {string} name
   */
  rename(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    this.files = this.files.map((f) => (f.id === id ? { ...f, name: trimmed } : f))
    this.#saveList()
  }

  /**
   * Restyle a file. Ids are stored as given and validated on the way out
   * (`resolvePreset` / `resolveSlots` / `resolveTheme` / `resolveFont`), so a
   * preset or variant that later disappears degrades to the default instead of
   * rendering nothing. Custom CSS gets no validation at all: it is applied
   * inside the preview frame, where the worst a broken rule can do is make the
   * sheet look wrong.
   *
   * Not the way to restyle the file being edited: that is `restyle` in
   * state.svelte.js, which writes here *and* records the change in the
   * document. This is the plain write, which is also what the document calls
   * back into when an undo or a restore moves the style from that end.
   *
   * @param {string} id
   * @param {{ layout?: string, variants?: Record<string, string>, theme?: string, font?: string, css?: string, paper?: import('./paper.js').Paper }} style
   */
  setStyle(id, style) {
    this.files = this.files.map((f) => (f.id === id ? { ...f, ...style } : f))
    this.#saveList()
  }

  /**
   * Choose one block variant, leaving the file's preset — and every other slot
   * — where it was. Picking the slot's default back drops the entry rather than
   * storing it, so a file that has been put back to its preset reads as
   * unmodified again.
   * @param {string} id
   * @param {string} slotId
   * @param {string | null} variantId  null clears the override
   */
  setVariant(id, slotId, variantId) {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    const variants = { ...file.variants }
    if (variantId === null) delete variants[slotId]
    else variants[slotId] = variantId
    this.setStyle(id, { variants })
  }

  /**
   * Change one thing about the paper, leaving the rest of it where it was.
   * Stored whole rather than as a patch, so a file that has chosen any paper
   * at all carries a complete answer and nothing has to merge two halves at
   * read time; `resolvePaper` is still what fills in a file that has chosen
   * none.
   * @param {string} id
   * @param {Partial<import('./paper.js').Paper>} patch
   */
  setPaper(id, patch) {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    this.setStyle(id, { paper: { ...resolvePaper(file.paper), ...patch } })
  }

  /**
   * Take on the whole templates written before the layout/variant split. Each
   * has become a layout of the user's own (see PartManager), so a file that
   * named one now names it in the `page` slot instead.
   * @param {Record<string, string>} map  old template id → new `page` variant id
   */
  adoptLegacyTemplates(map) {
    if (Object.keys(map).length === 0) return
    let changed = false
    this.files = this.files.map((f) => {
      const adopted = f.layout ? map[f.layout] : undefined
      if (!adopted || f.variants?.page) return f
      changed = true
      return { ...f, variants: { ...f.variants, page: adopted } }
    })
    if (changed) this.#saveList()
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #loadList() {
    const raw = read(KEYS.files)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  #saveList() {
    write(KEYS.files, JSON.stringify(this.files))
  }

  #saveActive() {
    if (this.activeId) write(KEYS.activeFile, this.activeId)
  }

  /** First run after this feature shipped: fold the old single-document snapshot in as the first file. */
  #migrateOrSeed() {
    const legacy = read(KEYS.legacySnapshot)
    const id = newId()
    if (legacy) {
      write(snapshotKey(id), legacy)
      remove(KEYS.legacySnapshot)
    }
    this.files = [{ id, name: 'Untitled', deletedAt: null }]
    this.#saveList()
  }

  /** @param {string} base */
  #uniqueName(base) {
    const taken = new Set(this.files.filter((f) => !f.deletedAt).map((f) => f.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
}

const newId = () => Math.random().toString(36).slice(2, 10)

/**
 * A file's presentation, as the document's style map holds it — everything in
 * a file's record except the two things that are the registry's own business,
 * its name and whether it is in the trash.
 *
 * The undefined values are left undefined rather than defaulted: a file that
 * has never been restyled has nothing to say about any of these, and the
 * resolvers (`resolvePreset`, `resolveTheme`, `resolveFont`) are what turn
 * that into the default at the point it is rendered.
 *
 * @param {FileMeta | null | undefined} file
 * @returns {Record<string, any>}
 */
export function styleOf(file) {
  return { layout: file?.layout, variants: file?.variants, theme: file?.theme, font: file?.font, css: file?.css, paper: file?.paper }
}
