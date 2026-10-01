/**
 * The app's state, as module-level singletons: the document, the file
 * registry, the part registry, and the window's own preferences. `look` is
 * the active file's presentation read off the first three, defaulted, so the
 * page and the style panel take it from one place rather than each resolving
 * it. What the chrome can *do* to all of this is in commands.js.
 *
 * `start` is idempotent: it's safe to call from a page's `onMount` without
 * worrying whether something else already did the work.
 */

import { isModified, resolvePreset } from '../template/compositions.js'
import { resolveFont } from '../theme/fonts.js'
import { resolvePaper } from '../theme/paper.js'
import { resolveTheme } from '../theme/presets.js'
import { CvDoc } from './doc.svelte.js'
import { FileManager, styleOf } from './files.svelte.js'
import { PartManager } from './parts.svelte.js'
import { UiState } from './ui.svelte.js'

export const doc = new CvDoc()
export const files = new FileManager()
export const parts = new PartManager()
export const ui = new UiState()

/** Presentation of the active file, defaulted here so the rest can assume a valid id. */
class Look {
  preset = $derived(resolvePreset(files.active?.layout))
  theme = $derived(resolveTheme(files.active?.theme))
  font = $derived(resolveFont(files.active?.font))
  css = $derived(files.active?.css ?? '')
  paper = $derived(resolvePaper(files.active?.paper))
  /** Which variant fills each slot: the preset's choices with the file's own on top. */
  choices = $derived(parts.composition(files.active))
  /** Whether any axis has been moved off the preset. */
  modified = $derived(isModified(files.active, parts.slots))
}

export const look = new Look()

let started = false

/** Load everything out of storage, once per page load. */
export function start() {
  if (started) return
  started = true
  parts.init()
  files.init()
  // The document holds the active file's presentation as well as its text, so
  // that restyling lands in the history like any other change. This is the
  // seam between the two stores: the registry's copy is what the document's
  // own map layers over, and a change that comes back out of the document —
  // an undo, a restore, a version being viewed — is written back here.
  doc.bindStyle({
    base: () => styleOf(files.active),
    apply: (style) => {
      if (files.activeId) files.setStyle(files.activeId, style)
    },
  })
  // Whole templates written before the layout/variant split became layouts a
  // moment ago; the files that named one have to be pointed at it.
  files.adoptLegacyTemplates(parts.migrated)
  // Async only because of the WASM it waits on; `doc.ready` is what the pages
  // watch, so there is nothing here to await.
  void doc.init(/** @type {string} */ (files.activeId))
}

/** Write out everything that is sitting on a debounce — the tab is going away. */
export function flush() {
  doc.flush()
}

/**
 * Restyle the active file: apply it, and record it in the file's own history.
 *
 * Both halves, always, and in that order. The registry is what the app renders
 * from, so it moves first and the sheet follows immediately; the document is
 * what remembers, so the change gets a line in the history panel and a place
 * on the undo stack. Anything that changes how a CV looks goes through here.
 *
 * What the patch touches is the axis the change is on, which is what the history
 * entry for a run of restyles is named by — see `recordStyle`. Two goes at the
 * theme read as the last theme; a theme and then a font read as both.
 *
 * @param {{ layout?: string, variants?: Record<string, string>, theme?: string, font?: string, css?: string, paper?: import('../theme/paper.js').Paper }} patch
 * @param {string} label   what the history entry reads as, e.g. `Theme — Plum`
 * @param {boolean} [defer]  for a style that is typed rather than chosen
 */
export function restyle(patch, label, defer) {
  const id = files.activeId
  if (!id) return
  files.setStyle(id, patch)
  doc.recordStyle(styleOf(files.active), label, Object.keys(patch).sort().join('+'), defer)
}

/**
 * Choose one block variant. The same as `restyle`, but the patch is the file's
 * own doing: putting a slot back to what its preset says drops the override
 * rather than storing it, and only FileManager knows which that is.
 * One slot is one axis, so cycling a block through its variants names only the
 * one it ended on in the history.
 * @param {string} slotId
 * @param {string} variantId
 * @param {string} label
 */
export function restyleVariant(slotId, variantId, label) {
  const id = files.activeId
  if (!id) return
  files.setVariant(id, slotId, variantId)
  doc.recordStyle(styleOf(files.active), label, `variants:${slotId}`)
}

/**
 * Change one thing about the paper. The same as `restyle`, but the patch is
 * one key of an object the file owns whole, and only FileManager knows what
 * the other keys currently say.
 *
 * Each key is its own axis, so turning the sheet on its side and then asking
 * for page numbers are both named in the history — the same rule the slots
 * follow, for the same reason: they are two decisions.
 * @param {Partial<import('../theme/paper.js').Paper>} patch
 * @param {string} label
 */
export function restylePaper(patch, label) {
  const id = files.activeId
  if (!id) return
  files.setPaper(id, patch)
  doc.recordStyle(styleOf(files.active), label, `paper:${Object.keys(patch).sort().join('+')}`)
}
