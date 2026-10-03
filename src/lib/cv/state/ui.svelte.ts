import { KEYS, read } from './storage.js'

/** How long a toast stays up. */
const TOAST_MS = 2200

/**
 * How the window is arranged and what this browser prefers: which panels are
 * up, whether the panes are coupled, the colour scheme. None of it is about
 * any CV — scaling a page to fit the pane changes no file — so it lives here
 * rather than in the document or the file registry, and stays out of the
 * history. The preferences worth keeping are read back out of localStorage
 * here and written by the command that moves them — see commands.js.
 *
 * The chrome reads this directly rather than being handed each flag as a
 * prop; `ui` in state.svelte.js is the one instance.
 */
export class UiState {
  /** First visit only — dismissing it writes the flag, so it never returns. */
  welcomeOpen = $state(read(KEYS.welcomeSeen) !== 'true')
  /* Style and History share the column to the right of the preview, so opening
	   one closes the other. Style is what an unopinionated first visit gets: it
	   is the panel with something to do in it before there is any history. */
  sidePanel = $state(readSidePanel())
  sourceHidden = $state(read(KEYS.sourceHidden) === 'true')
  /* How the preview is looked at rather than anything about the file: scaling a
	   page to fit the pane changes no CV, so it is a preference of this browser's
	   and stays out of the document and the history. On unless turned off. */
  fitPreview = $state(read(KEYS.previewFit) !== 'false')
  /** The preview as the PDF's pages, drawn apart; off, one strip with the same breaks. A view, not a restyle. */
  pagedPreview = $state(read(KEYS.pagedPreview) !== 'false')
  /* Whether the pointer resting on the sheet pulls the editor to its line. Same
	   family as `fitPreview`: how the window behaves rather than what the CV says.
	   On unless turned off. */
  hoverSync = $state(read(KEYS.hoverSync) !== 'false')
  /* Whether a scroll in either pane drags the other along with it. Same family
	   again. On unless turned off. */
  scrollSync = $state(read(KEYS.scrollSync) !== 'false')
  /* The app's colour scheme, mirrored into the preview frame: the gutter around
	   the sheet follows it, the sheet itself never does. Read from the same key
	   app.html's pre-paint script set the <html> attribute from. */
  dark = $state(read(KEYS.theme) === 'dark')
  /** Whether the split has room for two columns side by side — the page keeps it current. */
  desktop = $state(true)
  editorWidth = $state(read(KEYS.editorWidth))
  trashOpen = $state(false)
  /** The browser's deferred install prompt, held until the user asks for it. */
  installPrompt = $state(/** @type {BeforeInstallPromptEvent | null} */ (null))
  /**
   * What is wrong with the YAML, or nothing. The page sets it as it parses;
   * the banner, the status bar and the export read it.
   */
  parseError = $state(/** @type {string | null} */ (null))
  toastMsg = $state('')
  toastOn = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #toastTimer

  /** @param {string} msg */
  toast(msg) {
    this.toastMsg = msg
    this.toastOn = true
    clearTimeout(this.#toastTimer)
    this.#toastTimer = setTimeout(() => (this.toastOn = false), TOAST_MS)
  }

  destroy() {
    clearTimeout(this.#toastTimer)
  }
}

/** @returns {'style' | 'history' | null} */
function readSidePanel() {
  const saved = read(KEYS.sidePanel, 'style')
  return saved === 'history' ? 'history' : saved === 'none' ? null : 'style'
}
