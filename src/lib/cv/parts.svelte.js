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
}

/** Whether a part id names something that ships, rather than a variant written here. @param {string} id */
function shipped(id) {
  const cut = id.indexOf(':')
  return SLOTS.some((s) => s.id === id.slice(0, cut) && s.variants.some((v) => v.id === id.slice(cut + 1)))
}

const uniqueSuffix = () => `u-${Math.random().toString(36).slice(2, 10)}`
