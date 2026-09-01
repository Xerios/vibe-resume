/**
 * The app's state, as three objects both routes share.
 *
 * They used to be built inside the editor page, which was fine while there was
 * one page. There are two now — the CV and the template behind it — and each
 * would otherwise build its own copy and load it back out of localStorage on
 * every navigation: two writers for the same keys, and a CRDT re-read from disk
 * rather than carried across. Module scope is what keeps them single, and
 * client-side navigation is what keeps module scope alive.
 *
 * `start` is idempotent because both pages call it: whichever is entered first
 * does the work, and the other finds it done.
 */

import { CvDoc } from './doc.svelte.js'
import { FileManager } from './files.svelte.js'
import { TemplateManager } from './templates.svelte.js'

export const doc = new CvDoc()
export const files = new FileManager()
export const templates = new TemplateManager()

let started = false

/** Load everything out of storage, once per page load. */
export function start() {
  if (started) return
  started = true
  templates.init()
  files.init()
  // Async only because of the WASM it waits on; `doc.ready` is what the pages
  // watch, so there is nothing here to await.
  void doc.init(/** @type {string} */ (files.activeId))
}

/** Write out everything that is sitting on a debounce — the tab is going away. */
export function flush() {
  doc.flush()
  templates.flush()
}
