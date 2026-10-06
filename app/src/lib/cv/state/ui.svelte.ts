import type { Fix } from '@vibe-resume/core/format'
import { KEYS, read } from './storage'

/**
 * A diagnostic as the editor holds it now: its range has moved with the text
 * since the lint found it, and `text` is what that range holds, so a fix can
 * tell when the words under it have changed since.
 */
export interface Problem {
  from: number
  to: number
  /** 1-based */
  line: number
  /** 1-based */
  column: number
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
  fixes: Fix[]
  text: string
}

/** How long a toast stays up. A failure gets longer — it has to be read. */
const TOAST_MS = 2200
const TOAST_ERROR_MS = 6000

/** Whether a toast reports something that worked or something that didn't. */
export type ToastTone = 'success' | 'error'

/**
 * How the window is arranged and what this browser prefers: which panels are
 * up, whether the panes are coupled, the colour scheme. None of it is about
 * any CV — scaling a page to fit the pane changes no file — so it lives here
 * rather than in the document or the file registry, and stays out of the
 * history. The preferences worth keeping are read back out of localStorage
 * here and written by the command that moves them — see commands.ts.
 *
 * The chrome reads this directly rather than being handed each flag as a
 * prop; `ui` in state.svelte.ts is the one instance.
 */
export class UiState {
  /** First visit only — dismissing it writes the flag, so it never returns. */
  welcomeOpen = $state(read(KEYS.welcomeSeen) !== 'true')
  /**
   * Style and History share the column to the right of the preview, so opening
   * one closes the other. Style is what an unopinionated first visit gets: it
   * is the panel with something to do in it before there is any history.
   */
  sidePanel = $state(readSidePanel())
  sourceHidden = $state(read(KEYS.sourceHidden) === 'true')
  /**
   * How the preview is looked at rather than anything about the file: scaling a
   * page to fit the pane changes no CV, so it is a preference of this browser's
   * and stays out of the document and the history. On unless turned off.
   */
  fitPreview = $state(read(KEYS.previewFit) !== 'false')
  /** The preview as the PDF's pages, drawn apart; off, one strip with the same breaks. A view, not a restyle. */
  pagedPreview = $state(read(KEYS.pagedPreview) !== 'false')
  /**
   * Whether the pointer resting on the sheet pulls the editor to its line. Same
   * family as `fitPreview`: how the window behaves rather than what the CV says.
   * On unless turned off.
   */
  hoverSync = $state(read(KEYS.hoverSync) !== 'false')
  /**
   * Whether a scroll in either pane drags the other along with it. Same family
   * again. On unless turned off.
   */
  scrollSync = $state(read(KEYS.scrollSync) !== 'false')
  /** Whether the list of problems sits under the editor. Off unless turned on. */
  problemsOpen = $state(read(KEYS.problemsOpen) === 'true')
  /**
   * Everything the main editor's lint has to say, in document order. The
   * editor keeps it current; the problems panel and the status bar read it.
   */
  problems = $state.raw<Problem[]>([])
  /**
   * Whether any of it is an error or a warning. Suggestions and hints alone
   * aren't problems, and the UI shouldn't call them that.
   */
  hasProblems = $derived(this.problems.some((p) => p.severity === 'error' || p.severity === 'warning'))
  /**
   * The app's colour scheme, mirrored into the preview frame: the gutter around
   * the sheet follows it, the sheet itself never does. Read from the same key
   * app.html's pre-paint script set the <html> attribute from.
   */
  dark = $state(read(KEYS.theme) === 'dark')
  /** Whether the split has room for two columns side by side — the page keeps it current. */
  desktop = $state(true)
  editorWidth = $state(read(KEYS.editorWidth))
  trashOpen = $state(false)
  /** The browser's deferred install prompt, held until the user asks for it. */
  installPrompt = $state<BeforeInstallPromptEvent | null>(null)
  /**
   * What is wrong with the source, or nothing. The page sets it as it parses;
   * the banner, the status bar and the export read it.
   */
  parseError = $state<string | null>(null)
  toastMsg = $state('')
  toastOn = $state(false)
  /** Whether the toast reports a failure rather than something that worked. */
  toastTone = $state<ToastTone>('success')
  #toastTimer: ReturnType<typeof setTimeout> | undefined

  toast(msg: string, tone: ToastTone = 'success'): void {
    this.toastMsg = msg
    this.toastTone = tone
    this.toastOn = true
    clearTimeout(this.#toastTimer)
    this.#toastTimer = setTimeout(() => (this.toastOn = false), tone === 'error' ? TOAST_ERROR_MS : TOAST_MS)
  }

  destroy(): void {
    clearTimeout(this.#toastTimer)
  }
}

function readSidePanel(): 'style' | 'history' | null {
  const saved = read(KEYS.sidePanel, 'style')
  return saved === 'history' ? 'history' : saved === 'none' ? null : 'style'
}
