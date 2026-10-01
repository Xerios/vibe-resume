/**
 * Everything the chrome can ask the app to do, by name.
 *
 * A button, a menu item and a shortcut that do the same thing call the same
 * entry here rather than each being handed a callback down through the tree.
 * The commands work over the singletons in state.svelte.js; the one thing
 * only the page can supply — the preview frame to print — is bound with
 * `bindHost`.
 *
 * Nothing in here uses `this`, so an entry can be passed around bare:
 * `onclick={commands.newFile}`. The ones that take an argument want an arrow
 * around them, or the click event lands in it.
 */

import { pushState } from '$app/navigation'
import { page } from '$app/state'
import { preset as presetOf } from '../template/compositions.js'
import { FONTS } from '../theme/fonts.js'
import { ORIENTATIONS, PAPER_SIZES, RUNNING } from '../theme/paper.js'
import { THEMES } from '../theme/presets.js'
import { doc, files, parts, restyle, restylePaper, restyleVariant, ui } from './state.svelte.js'
import { KEYS, write } from './storage.js'

/**
 * What the page lends the commands — see `bindHost`.
 * @typedef {object} Host
 * @property {() => boolean} print  print the preview frame; false if it isn't up yet
 */

/** @type {Host} */
let host = { print: () => false }

/** Lend the page's frame to `exportPDF`. @param {Host} h */
export function bindHost(h) {
  host = h
}

/** Every paper axis, by the key it is stored under — for the history's label. */
const PAPER_AXES = /** @type {Record<string, { id: string, name: string }[]>} */ ({
  size: PAPER_SIZES,
  orientation: ORIENTATIONS,
  header: RUNNING,
  footer: RUNNING,
})

export const commands = {
  /* ── Files ─────────────────────────────────────────────────────────────── */

  /** Open a fresh tab holding the shipped template — no snapshot yet, so `CvDoc` seeds one. */
  newFile() {
    const id = files.create()
    doc.switchTo(id)
    ui.toast('New CV from template')
  },

  /**
   * Open YAML that came from outside the editor — an OS file association today — as
   * its own tab. Seeded through `switchTo` so the tab's history starts with the
   * imported text rather than the template plus an overwrite.
   * @param {string} filename
   * @param {string} text
   */
  openImported(filename, text) {
    const id = files.create(filename.replace(/\.(ya?ml)$/i, ''))
    doc.switchTo(id, text)
    ui.toast(`Opened ${files.active?.name ?? filename}`)
  },

  /** @param {string} id */
  selectTab(id) {
    if (id === files.activeId) return
    files.switchTo(id)
    doc.switchTo(id)
  },

  duplicateTab() {
    doc.flush() // capture the latest edits before copying the stored snapshot
    const id = files.duplicate(/** @type {string} */ (files.activeId))
    doc.switchTo(id)
    ui.toast('Tab duplicated')
  },

  /** @param {string} id */
  closeTab(id) {
    const closingActive = id === files.activeId
    const name = files.files.find((f) => f.id === id)?.name ?? 'File'
    // An untouched "New CV" has nothing to restore, so it doesn't earn a
    // place in the trash: drop it outright rather than clutter the bin.
    if (closingActive && doc.pristine) {
      doc.switchTo(files.trash(id)) // switching away flushes the old snapshot, so purge after
      files.purge(id)
      ui.toast(`Closed “${name}”`)
      return
    }
    const nextId = files.trash(id)
    if (closingActive) doc.switchTo(nextId)
    ui.toast(`Moved “${name}” to trash`)
  },

  /**
   * @param {string} id
   * @param {string} name
   */
  renameTab(id, name) {
    files.rename(id, name)
  },

  /** @param {string} id */
  restoreTab(id) {
    files.restore(id)
    doc.switchTo(id)
    ui.toast('Restored from trash')
  },

  /** @param {string} id */
  purgeTab(id) {
    if (!confirm('Delete this file forever? This cannot be undone.')) return
    files.purge(id)
    ui.toast('File deleted forever')
  },

  emptyTrash() {
    if (!files.trashed.length) return
    if (!confirm(`Permanently delete ${files.trashed.length} file(s) from trash? This cannot be undone.`)) return
    for (const f of files.trashed) files.purge(f.id)
    ui.toast('Trash emptied')
  },

  copyYaml() {
    navigator.clipboard
      .writeText(doc.yaml)
      .then(() => ui.toast('YAML copied to clipboard'))
      .catch(() => ui.toast('Copy failed — try Ctrl+A, Ctrl+C'))
  },

  /** Downloads the active file's YAML source as a `.yaml` file. */
  saveYaml() {
    const blob = new Blob([doc.yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${files.active?.name ?? 'cv'}.yaml`
    a.click()
    URL.revokeObjectURL(url)
    ui.toast('YAML saved')
  },

  exportPDF() {
    if (ui.parseError) {
      ui.toast('Fix YAML errors before exporting')
      return
    }
    // Tagged before printing, so the mark in the history sits on exactly the
    // version that goes to the printer.
    doc.markExport()
    // The frame prints itself. Printing the app instead would put the iframe on
    // the page as a box and crop the CV to it, however many pages it wanted.
    if (!host.print()) ui.toast("Preview isn't ready yet")
  },

  /* ── History ───────────────────────────────────────────────────────────── */

  /**
   * Save a named version — or an unnamed one, which is what Ctrl+S does.
   * @param {string} [label]
   */
  checkpoint(label = '') {
    if (doc.isViewingHistory) {
      ui.toast('Editing is paused while viewing history')
      return
    }
    const name = label.trim()
    doc.checkpoint(name)
    ui.toast(name ? `Saved “${name}”` : 'Version saved')
  },

  /**
   * Open the compare dialog. With nothing named, the newest text is put beside
   * the most likely thing to hold it against: the tab next to this one, or —
   * with only one tab — the version before this one.
   *
   * Opening pushes a history entry carrying the two sides, so Back is a way
   * out, and closing from inside the dialog is the same Back — see `closeCompare`.
   * @param {import('../../../app').CompareSource} [left]
   * @param {import('../../../app').CompareSource} [right]
   */
  openCompare(left, right) {
    const id = files.activeId
    if (!id) return
    /** @type {import('../../../app').CompareSource} */
    const current = { fileId: id, versionKey: null }
    if (!right) {
      const neighbour = files.open.find((f) => f.id !== id)
      const previous = doc.entries[1]
      right = neighbour ? { fileId: neighbour.id, versionKey: null } : { fileId: id, versionKey: previous?.key ?? null }
    }
    pushState('', { compare: { left: left ?? current, right } })
  },

  /**
   * Close the dialog by going back over the entry that opened it, so the
   * history reads the same whether it was the X or the browser that closed it.
   */
  closeCompare() {
    if (page.state.compare) history.back()
  },

  /**
   * A version against what is on screen: the version being previewed, if
   * there is one and it isn't this same entry, otherwise what the file says now.
   * @param {import('./doc.svelte.js').HistoryEntry} entry
   */
  compareVersion(entry) {
    const id = /** @type {string} */ (files.activeId)
    const viewed = doc.viewingKey !== null && doc.viewingKey !== entry.key ? doc.viewingKey : null
    commands.openCompare({ fileId: id, versionKey: entry.key }, { fileId: id, versionKey: viewed })
  },

  /* ── Style ─────────────────────────────────────────────────────────────── */

  /** @param {string} id */
  setPreset(id) {
    // A preset is a whole set of choices, so taking one drops the overrides
    // that were sitting on the last one — otherwise half of the look you just
    // asked for wouldn't arrive.
    restyle({ layout: id, variants: {} }, `Preset — ${presetOf(id)?.name ?? id}`)
  },

  /**
   * @param {string} slotId
   * @param {string} variantId
   */
  setVariant(slotId, variantId) {
    const slot = parts.slots.find((s) => s.id === slotId)
    const name = slot?.variants.find((v) => v.id === variantId)?.name ?? variantId
    restyleVariant(slotId, variantId, `${slot?.name ?? slotId} — ${name}`)
  },

  /** Back to the preset's own choices, whichever axes have been moved off it. */
  resetVariants() {
    restyle({ variants: {} }, 'Blocks — reset')
  },

  /** @param {string} id */
  setTheme(id) {
    restyle({ theme: id }, `Theme — ${THEMES.find((t) => t.id === id)?.name ?? id}`)
  },

  /** @param {string} id */
  setFont(id) {
    restyle({ font: id }, `Font — ${FONTS.find((f) => f.id === id)?.name ?? id}`)
  },

  /**
   * Change one thing about the page. Which thing is what the label says, since
   * `Paper — A4` and `Paper — Footer: Page` are the same axis to a reader and
   * different ones to the history.
   * @param {Partial<import('../theme/paper.js').Paper>} patch
   */
  setPaper(patch) {
    const [key, id] = Object.entries(patch)[0] ?? []
    if (!key || !id) return
    const name = PAPER_AXES[key]?.find((o) => o.id === id)?.name ?? id
    const edge = key === 'header' || key === 'footer' ? `${key[0].toUpperCase()}${key.slice(1)}: ` : ''
    restylePaper(patch, `Paper — ${edge}${name}`)
  },

  /**
   * The active file's own CSS. Unvalidated by design — it is applied inside the
   * preview frame, where nothing it says can reach the editor around it.
   *
   * The only style that is typed rather than chosen, so its record in the
   * history waits for a pause the way an edit does — see `recordStyle`.
   * @param {string} text
   */
  setCss(text) {
    restyle({ css: text }, 'Custom CSS', true)
  },

  /* ── View ──────────────────────────────────────────────────────────────── */

  /** @param {'style' | 'history'} which */
  toggleSidePanel(which) {
    ui.sidePanel = ui.sidePanel === which ? null : which
    write(KEYS.sidePanel, ui.sidePanel ?? 'none')
  },

  toggleTrash() {
    ui.trashOpen = !ui.trashOpen
  },

  closeTrash() {
    ui.trashOpen = false
  },

  /** @param {boolean} hidden */
  setSourceHidden(hidden) {
    ui.sourceHidden = hidden
    write(KEYS.sourceHidden, String(hidden))
  },

  toggleSource() {
    commands.setSourceHidden(!ui.sourceHidden)
  },

  /** Scale the preview to the pane, or stop. Not a restyle — see `ui.fitPreview`. */
  toggleFit() {
    ui.fitPreview = !ui.fitPreview
    write(KEYS.previewFit, String(ui.fitPreview))
  },

  /** Couple the editor to the pointer over the preview, or stop. See `ui.hoverSync`. */
  toggleHoverSync() {
    ui.hoverSync = !ui.hoverSync
    write(KEYS.hoverSync, String(ui.hoverSync))
  },

  /** Couple the two panes' scrolling, or let each keep its own place. See `ui.scrollSync`. */
  toggleScrollSync() {
    ui.scrollSync = !ui.scrollSync
    write(KEYS.scrollSync, String(ui.scrollSync))
  },

  toggleTheme() {
    // The sheet sits this out — paper is white — but the frame around it follows.
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    ui.dark = next === 'dark'
    syncThemeColor()
    write(KEYS.theme, next)
  },

  dismissWelcome() {
    ui.welcomeOpen = false
    write(KEYS.welcomeSeen, 'true')
  },

  async installApp() {
    const prompt = ui.installPrompt
    if (!prompt) return
    ui.installPrompt = null // single use, accepted or dismissed
    await prompt.prompt()
  },
}

/**
 * Keep an installed window's titlebar on the colour of the toolbar beneath it.
 * Read from the token rather than repeated as a literal — app.html has to spell
 * the two values out only because it runs before the stylesheet lands.
 */
function syncThemeColor() {
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim()
  if (!bar) return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar)
}
