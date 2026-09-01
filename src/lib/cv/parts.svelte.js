import { compose } from './compose.js'
import { PRESETS, composition } from './compositions.js'
import { SLOTS, partId, resolveSlots } from './slots.js'
import { KEYS, read, remove, write } from './storage.js'

/**
 * @typedef {object} StoredPart
 * @property {string} id     `slot:variant`
 * @property {string} slot
 * @property {string} name
 * @property {string} source
 * @property {'css' | 'svelte' | 'layout'} kind  what compose.js should do with the source
 */

/**
 * @typedef {import('./slots.js').Variant & {
 *   partId: string,
 *   slot: string,
 *   builtin: boolean,
 *   edited: boolean,
 *   kind: 'css' | 'svelte' | 'layout',
 * }} Part
 */

/** Source edits are typed, so the write waits for a pause the way the CRDT snapshot does. */
const SAVE_DEBOUNCE_MS = 400

/**
 * Every part a sheet can be composed out of: the layouts and block variants
 * that ship (slots.js), plus whatever has been written or changed here.
 *
 * One list, two kinds of record, exactly as the template registry it replaces.
 * A stored record under a shipped part's id is an *override* — the shipped
 * source is still behind it, which is what makes "Revert" a delete rather than
 * a copy. A record under any other id is a variant of the user's own, and it
 * joins its slot's list in the picker.
 *
 * Parts are shared by every file rather than owned by one, like the palettes:
 * a file names slot choices, so deleting a variant a file was using can't break
 * it — the id stops resolving and the slot falls back to its default.
 */
export class PartManager {
  /** Overrides and user variants, keyed by part id. @type {Record<string, StoredPart>} */
  stored = $state({})

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #saveTimer

  /**
   * The slot registry with everything stored here folded in: shipped variants
   * first, in their shipped order, then anything written here — so a new
   * variant lands at the end of its slot rather than shuffling the ones
   * everybody knows.
   * @type {(Omit<import('./slots.js').Slot, 'variants'> & { variants: Part[] })[]}
   */
  slots = $derived(
    SLOTS.map((s) => ({
      ...s,
      variants: [
        ...s.variants.map((v) =>
          Object.assign({}, v, {
            partId: partId(s.id, v.id),
            slot: s.id,
            builtin: true,
            edited: !!this.stored[partId(s.id, v.id)],
            kind: /** @type {'css' | 'svelte' | 'layout'} */ (v.layout ? 'layout' : v.svelte !== undefined ? 'svelte' : 'css'),
          }),
        ),
        ...Object.values(this.stored)
          .filter((p) => p.slot === s.id && !shipped(p.id))
          .map((p) => ({
            id: p.id.slice(p.slot.length + 1),
            name: p.name,
            hint: 'Your own',
            partId: p.id,
            slot: s.id,
            builtin: false,
            edited: false,
            kind: p.kind,
            // Under whichever key compose.js reads that kind out of, so a
            // variant of the user's own is indistinguishable from a shipped one
            // by the time it gets there.
            [p.kind]: p.source,
          })),
      ],
    })),
  )

  /**
   * Old template id → the `page` variant it became, for the one startup where
   * there is anything to migrate. FileManager reads it and rewrites the files
   * that named one.
   * @type {Record<string, string>}
   */
  migrated = {}

  init() {
    this.stored = this.#load()
    this.migrated = this.#migrateTemplates()
  }

  /** What a file renders through: its preset's choices, with its own on top. @param {any} file */
  composition(file) {
    return composition(file, this.slots)
  }

  /**
   * The composed component for a set of slot choices. The one call the pages
   * make — everything about which part is edited and which is shipped is
   * settled in here.
   * @param {Record<string, string>} choices
   */
  compose(choices) {
    return compose(resolveSlots(choices, this.slots), {
      slots: this.slots,
      source: (id, original) => this.stored[id]?.source ?? original,
    })
  }

  /** @param {string} id  a part id, `stack:chips` */
  get(id) {
    for (const s of this.slots) {
      const found = s.variants.find((v) => v.partId === id)
      if (found) return found
    }
    return null
  }

  /** @param {string} id */
  sourceOf(id) {
    const stored = this.stored[id]
    if (stored) return stored.source
    const part = this.get(id)
    return part?.layout ?? part?.svelte ?? part?.css ?? ''
  }

  /**
   * Take an edit. Shipped or not, the text lands in the same place; what
   * differs is only that a shipped part has something to go back to.
   * @param {string} id
   * @param {string} source
   */
  setSource(id, source) {
    const part = this.get(id)
    if (!part) return
    // Typing the shipped source back in by hand leaves no override behind.
    if (part.builtin && source === (part.layout ?? part.svelte ?? part.css ?? '')) return this.revert(id)
    this.stored[id] = { id, slot: part.slot, name: part.name, source, kind: part.kind }
    this.#saveSoon()
  }

  /**
   * Copy a part into a new variant of the same slot. This is how a variant of
   * your own starts — a blank one would only mean retyping the snippet it is a
   * variation of.
   * @param {string} id
   * @returns {string | null} the new part id
   */
  duplicate(id) {
    const from = this.get(id)
    if (!from) return null
    const newId = `${from.slot}:${uniqueSuffix()}`
    this.stored[newId] = {
      id: newId,
      slot: from.slot,
      name: this.#uniqueName(from.slot, `${from.name} copy`),
      source: this.sourceOf(id),
      kind: from.kind,
    }
    this.#save()
    return newId
  }

  /**
   * @param {string} id
   * @param {string} name
   */
  rename(id, name) {
    const trimmed = name.trim()
    const record = this.stored[id]
    // A shipped part keeps the name it ships with: the picker refers to it by
    // that name throughout, and an override is the same variant.
    if (!trimmed || !record || shipped(id)) return
    this.stored[id] = { ...record, name: this.#uniqueName(record.slot, trimmed, id) }
    this.#save()
  }

  /** Drop a shipped part's override, putting the shipped source back. @param {string} id */
  revert(id) {
    if (!shipped(id)) return
    delete this.stored[id]
    this.#save()
  }

  /**
   * Delete a variant of the user's own. Files still choosing it fall back to
   * the slot's default the next time they resolve, so nothing has to be
   * rewritten.
   * @param {string} id
   */
  remove(id) {
    if (shipped(id)) return
    delete this.stored[id]
    this.#save()
  }

  /** Write out a pending edit now — the tab is going away. */
  flush() {
    if (this.#saveTimer === undefined) return
    clearTimeout(this.#saveTimer)
    this.#saveTimer = undefined
    this.#save()
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #load() {
    const raw = read(KEYS.parts)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return {}
      /** @type {Record<string, StoredPart>} */
      const out = {}
      for (const [id, p] of Object.entries(parsed)) {
        if (!p || typeof p.source !== 'string' || typeof p.slot !== 'string') continue
        out[id] = { id, slot: p.slot, name: String(p.name ?? id), source: p.source, kind: p.kind === 'layout' || p.kind === 'svelte' ? p.kind : 'css' }
      }
      return out
    } catch {
      return {}
    }
  }

  /**
   * First run after the layout/variant split: whole templates written before it
   * become layouts of the user's own.
   *
   * They fit without being rewritten, because a whole template *is* a layout —
   * a complete component that renders the sheet. What it won't have is the
   * `body`/`skillsBody`/`listBody` snippets the shipped layouts factored out,
   * so some slots have nothing to replace in one; that costs an unused style
   * block at worst, and nobody's work is thrown away.
   *
   * The old key is dropped once this has run, the way the pre-multi-file
   * snapshot key is: leaving it would resurrect a migrated layout the user had
   * since deleted.
   */
  #migrateTemplates() {
    const raw = read(KEYS.templates)
    if (!raw) return {}

    /** @type {Record<string, string>} */
    const map = {}
    try {
      const parsed = JSON.parse(raw)
      for (const [oldId, t] of Object.entries(parsed ?? {})) {
        if (!t || typeof t.source !== 'string' || !t.source.trim()) continue
        const id = `page:${uniqueSuffix()}`
        const name = String(t.name ?? oldId)
        this.stored[id] = {
          id,
          slot: 'page',
          // An override of a built-in and a template of the user's own arrive
          // here the same way; only the name says which it was.
          name: PRESETS.some((p) => p.id === oldId) ? `${name} (edited)` : name,
          source: t.source,
          kind: 'layout',
        }
        map[oldId] = id.slice('page:'.length)
      }
    } catch {
      return {}
    }

    if (Object.keys(map).length > 0) this.#save()
    remove(KEYS.templates)
    return map
  }

  #save() {
    write(KEYS.parts, JSON.stringify(this.stored))
  }

  #saveSoon() {
    clearTimeout(this.#saveTimer)
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = undefined
      this.#save()
    }, SAVE_DEBOUNCE_MS)
  }

  /**
   * @param {string} slotId
   * @param {string} base
   * @param {string} [selfId]  the part being renamed, which doesn't clash with itself
   */
  #uniqueName(slotId, base, selfId) {
    const slot = this.slots.find((s) => s.id === slotId)
    const taken = new Set((slot?.variants ?? []).filter((v) => v.partId !== selfId).map((v) => v.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
}

/** Whether a part id names something that ships, rather than a variant written here. @param {string} id */
function shipped(id) {
  const cut = id.indexOf(':')
  return SLOTS.some((s) => s.id === id.slice(0, cut) && s.variants.some((v) => v.id === id.slice(cut + 1)))
}

const uniqueSuffix = () => `u-${Math.random().toString(36).slice(2, 10)}`
