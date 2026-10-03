import type { Paper } from '../theme/paper'
import { resolvePaper } from '../theme/paper'
import { KEYS, read, remove, snapshotKey, write } from './storage'

export interface FileMeta {
  id: string
  name: string
  /** ms epoch when moved to trash; null while open */
  deletedAt: number | null
  /** a LAYOUTS id from render/tokens.js; absent means the default */
  layout?: string
  /** palette id from theme/palettes.js; absent means the default */
  theme?: string
  /** a DENSITIES id from render/tokens.js; absent means the default */
  density?: string
  /** a FONTS id from theme/typefaces.js; absent means the default */
  font?: string
  /** slot id → block variant id, from render/variants.js; a slot left out is its default */
  variants?: Record<string, string>
  /** the page box it prints on; absent means A4 portrait */
  paper?: Paper
}

/**
 * The set of documents open in the editor, as tabs. Each file's own CRDT
 * snapshot lives under its own storage key (see `snapshotKey`); this class
 * only owns the registry — id, name, trash state — not document content.
 *
 * Deleting a file is a soft delete: it drops off the tab bar but its snapshot
 * key is left untouched, so restoring it from the trash brings back the full
 * history exactly as it was.
 *
 * Layout, theme, font, density, block variants and paper ride along here too, because this is
 * the only place that knows them for a file that isn't open. For the file that
 * *is* open they are also in its document, which is what puts a restyle in the
 * version history and on the undo stack — see `bindStyle` in doc.svelte.ts.
 * Everything that changes a style here goes through `restyle` in
 * state.svelte.ts, which keeps the two in step.
 */
export class FileManager {
  files = $state<FileMeta[]>([])
  activeId = $state<string | null>(null)

  /** Left-to-right tab order, oldest first. */
  open = $derived(this.files.filter((f) => !f.deletedAt))
  /** Most recently deleted first. */
  trashed = $derived(this.files.filter((f) => f.deletedAt).toSorted((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)))
  active = $derived(this.files.find((f) => f.id === this.activeId) ?? null)

  init(): void {
    this.files = this.#loadList()
    if (this.files.length === 0) this.#migrateOrSeed()

    const openIds = this.open.map((f) => f.id)
    const stored = read(KEYS.activeFile)
    this.activeId = stored && openIds.includes(stored) ? stored : (openIds[0] ?? this.create())
  }

  switchTo(id: string): void {
    if (id === this.activeId) return
    this.activeId = id
    this.#saveActive()
  }

  /**
   * Open a new tab by copying a file's stored snapshot verbatim — the copy
   * carries the source's full history, not just its current text.
   */
  duplicate(sourceId: string): string {
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
        theme: source.theme,
        density: source.density,
        font: source.font,
        variants: source.variants,
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
   */
  create(name?: string): string {
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
   */
  trash(id: string): string {
    this.files = this.files.map((f) => (f.id === id ? { ...f, deletedAt: Date.now() } : f))
    this.#saveList()
    if (this.activeId !== id) return this.activeId as string

    const nextId = this.open[0]?.id ?? this.create()
    this.activeId = nextId
    this.#saveActive()
    return nextId
  }

  /** Bring a trashed file back as an open tab. */
  restore(id: string): void {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    const name = this.#uniqueName(file.name)
    this.files = this.files.map((f) => (f.id === id ? { ...f, name, deletedAt: null } : f))
    this.#saveList()
    this.activeId = id
    this.#saveActive()
  }

  /** Permanently delete a trashed file — its snapshot is gone for good. */
  purge(id: string): void {
    this.files = this.files.filter((f) => f.id !== id)
    this.#saveList()
    remove(snapshotKey(id))
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    this.files = this.files.map((f) => (f.id === id ? { ...f, name: trimmed } : f))
    this.#saveList()
  }

  /**
   * Move a tab along the row: `id` lands where `beforeId` sits now, pushing it
   * and everything after it to the right. A null `beforeId` puts it last.
   *
   * The trashed files are carried along in `files` untouched — the row is the
   * `open` slice of it, so re-inserting relative to another open file is
   * enough to say where the tab goes. A move that changes nothing is dropped
   * before the write, because this runs on every dragover event.
   */
  reorder(id: string, beforeId: string | null): void {
    if (id === beforeId) return
    const from = this.files.findIndex((f) => f.id === id)
    if (from < 0) return

    const next = this.files.slice()
    const [moved] = next.splice(from, 1)
    const at = beforeId === null ? -1 : next.findIndex((f) => f.id === beforeId)
    if (beforeId !== null && at < 0) return
    next.splice(at < 0 ? next.length : at, 0, moved)

    if (next.every((f, i) => f.id === this.files[i].id)) return
    this.files = next
    this.#saveList()
  }

  /**
   * Restyle a file. Ids are stored as given and validated on the way out
   * (`resolveLayout` / `resolveTheme` / `resolveDensity` / `resolveFont` /
   * `resolveVariants`), so an id that later
   * disappears degrades to the default instead of rendering nothing.
   *
   * Not the way to restyle the file being edited: that is `restyle` in
   * state.svelte.ts, which writes here *and* records the change in the
   * document. This is the plain write, which is also what the document calls
   * back into when an undo or a restore moves the style from that end.
   */
  setStyle(id: string, style: Partial<Omit<FileMeta, 'id' | 'name' | 'deletedAt'>>): void {
    this.files = this.files.map((f) => (f.id === id ? { ...f, ...style } : f))
    this.#saveList()
  }

  /**
   * Choose one block variant, leaving every other slot where it was. Picking a
   * slot's default drops the entry rather than storing it, so a file put back
   * to the defaults reads as unmodified again.
   */
  setVariant(id: string, slotId: string, variantId: string, isDefault: boolean): void {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    const variants = { ...file.variants }
    if (isDefault) delete variants[slotId]
    else variants[slotId] = variantId
    this.setStyle(id, { variants })
  }

  /**
   * Change one thing about the paper, leaving the rest of it where it was.
   * Stored whole rather than as a patch, so a file that has chosen any paper
   * at all carries a complete answer and nothing has to merge two halves at
   * read time; `resolvePaper` is still what fills in a file that has chosen
   * none.
   */
  setPaper(id: string, patch: Partial<Paper>): void {
    const file = this.files.find((f) => f.id === id)
    if (!file) return
    this.setStyle(id, { paper: { ...resolvePaper(file.paper), ...patch } })
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #loadList(): FileMeta[] {
    const raw = read(KEYS.files)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  #saveList(): void {
    write(KEYS.files, JSON.stringify(this.files))
  }

  #saveActive(): void {
    if (this.activeId) write(KEYS.activeFile, this.activeId)
  }

  /** First run after this feature shipped: fold the old single-document snapshot in as the first file. */
  #migrateOrSeed(): void {
    const legacy = read(KEYS.legacySnapshot)
    const id = newId()
    if (legacy) {
      write(snapshotKey(id), legacy)
      remove(KEYS.legacySnapshot)
    }
    this.files = [{ id, name: 'Untitled', deletedAt: null }]
    this.#saveList()
  }

  #uniqueName(base: string): string {
    const taken = new Set(this.files.filter((f) => !f.deletedAt).map((f) => f.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
}

const newId = (): string => Math.random().toString(36).slice(2, 10)

/**
 * A file's presentation, as the document's style map holds it — everything in
 * a file's record except the two things that are the registry's own business,
 * its name and whether it is in the trash.
 *
 * The undefined values are left undefined rather than defaulted: a file that
 * has never been restyled has nothing to say about any of these, and the
 * resolvers (`resolveLayout`, `resolveTheme`, `resolveDensity`, …) are what turn
 * that into the default at the point it is rendered.
 */
export function styleOf(file: FileMeta | null | undefined): Record<string, any> {
  return { layout: file?.layout, theme: file?.theme, density: file?.density, font: file?.font, variants: file?.variants, paper: file?.paper }
}
