import { KEYS, read, write } from './storage.js'
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE, builtin } from './templates.js'

/**
 * @typedef {object} StoredTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} source
 */

/**
 * @typedef {object} Template
 * @property {string} id
 * @property {string} name
 * @property {string} source
 * @property {boolean} builtin
 * @property {boolean} edited  a built-in whose source has been changed here
 * @property {string} [hint]
 */

/** Source edits are typed, so the write waits for a pause the way the CRDT snapshot does. */
const SAVE_DEBOUNCE_MS = 400

/**
 * Every template the app knows: the five that ship with it, plus whatever has
 * been written or changed in the template editor.
 *
 * One list, two kinds of record. A stored record under a built-in's id is an
 * *override* — the shipped source is still there behind it, which is what makes
 * "Revert" a delete rather than a copy. A stored record under any other id is a
 * template of the user's own.
 *
 * Templates are shared by every file rather than owned by one, like the themes
 * beside them: a file's `layout` is only the id of the template it renders
 * through. Deleting a template a file was using therefore can't break it — the
 * id stops resolving and `resolve` hands back the default (see files.svelte.js
 * for the same argument about a preset that outlives its id).
 */
export class TemplateManager {
  /** Overrides and user templates, keyed by id. @type {Record<string, StoredTemplate>} */
  stored = $state({})

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #saveTimer

  /**
   * Built-ins first, in their shipped order, then anything written here — the
   * order the picker draws, so a new template lands at the end rather than
   * shuffling the five everyone knows.
   * @type {Template[]}
   */
  all = $derived([
    ...BUILTIN_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      hint: t.hint,
      source: this.stored[t.id]?.source ?? t.source,
      builtin: true,
      edited: !!this.stored[t.id],
    })),
    ...Object.values(this.stored)
      .filter((t) => !builtin(t.id))
      .map((t) => ({ id: t.id, name: t.name, source: t.source, builtin: false, edited: false })),
  ])

  init() {
    this.stored = this.#load()
  }

  /**
   * Falls back rather than trusting the id it is given: a file may name a
   * template that has since been deleted, and one saved before templates
   * existed names nothing at all.
   * @param {string | undefined | null} id
   */
  resolve(id) {
    return this.all.some((t) => t.id === id) ? /** @type {string} */ (id) : DEFAULT_TEMPLATE
  }

  /** @param {string} id */
  get(id) {
    return this.all.find((t) => t.id === id) ?? null
  }

  /** @param {string} id */
  sourceOf(id) {
    return this.get(id)?.source ?? ''
  }

  /**
   * Take an edit. Built-in or not, the text lands in the same place; what
   * differs is only that a built-in has something to go back to.
   * @param {string} id
   * @param {string} source
   */
  setSource(id, source) {
    const base = this.get(id)
    if (!base) return
    // Typing the shipped source back in by hand leaves no override behind.
    if (base.builtin && source === builtin(id)?.source) return this.revert(id)
    this.stored[id] = { id, name: base.name, source }
    this.#saveSoon()
  }

  /**
   * Copy a template under a new id. This is how a new one is made — starting
   * from a blank component would only mean retyping the sheet's markup.
   * @param {string} sourceId
   * @returns {string} the new id
   */
  duplicate(sourceId) {
    const from = this.get(sourceId)
    const id = newId()
    this.stored[id] = {
      id,
      name: this.#uniqueName(from ? `${from.name} copy` : 'Template'),
      source: from?.source ?? '',
    }
    this.#save()
    return id
  }

  /**
   * @param {string} id
   * @param {string} name
   */
  rename(id, name) {
    const trimmed = name.trim()
    const record = this.stored[id]
    // A built-in keeps the name it ships with: the picker's five ids are
    // referred to by name throughout, and an override is the same template.
    if (!trimmed || !record || builtin(id)) return
    this.stored[id] = { ...record, name: this.#uniqueName(trimmed, id) }
    this.#save()
  }

  /** Drop a built-in's override, putting the shipped source back. @param {string} id */
  revert(id) {
    if (!builtin(id)) return
    delete this.stored[id]
    this.#save()
  }

  /**
   * Delete a template of the user's own. Files still pointing at it fall back
   * to the default the next time they resolve, so nothing has to be rewritten.
   * @param {string} id
   */
  remove(id) {
    if (builtin(id)) return
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
    const raw = read(KEYS.templates)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return {}
      /** @type {Record<string, StoredTemplate>} */
      const out = {}
      for (const [id, t] of Object.entries(parsed)) {
        if (t && typeof t.source === 'string') out[id] = { id, name: String(t.name ?? id), source: t.source }
      }
      return out
    } catch {
      return {}
    }
  }

  #save() {
    write(KEYS.templates, JSON.stringify(this.stored))
  }

  #saveSoon() {
    clearTimeout(this.#saveTimer)
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = undefined
      this.#save()
    }, SAVE_DEBOUNCE_MS)
  }

  /**
   * @param {string} base
   * @param {string} [selfId]  the template being renamed, which doesn't clash with itself
   */
  #uniqueName(base, selfId) {
    const taken = new Set(this.all.filter((t) => t.id !== selfId).map((t) => t.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }
}

const newId = () => `t-${Math.random().toString(36).slice(2, 10)}`
