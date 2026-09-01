import { compileTemplate } from './compile-template.js'

/** Compiling a template costs more than parsing YAML, so it waits a little longer. */
const COMPILE_DEBOUNCE_MS = 350

/**
 * A template, kept compiled.
 *
 * Both pages need the same thing from the same source text — the editor page to
 * render its preview, the template page to render the one beside the source
 * being typed — so the debounce, the out-of-order guard and the keep-the-last-
 * good-one rule live here rather than twice.
 *
 * Call it during component initialisation: it sets up an `$effect`, so it
 * belongs to whichever component asked for it and stops when that unmounts.
 *
 * @param {() => { id: string, source: string }} read  the template to track
 */
export function liveTemplate(read) {
  let component = $state(/** @type {any} */ (null))
  let css = $state('')
  let error = $state(/** @type {{ message: string, line?: number } | null} */ (null))

  /** Compiles land out of order if one is slower; only the newest may win. */
  let seq = 0
  /** Which template the last compile was of, to tell a switch from a keystroke. */
  let lastId = ''

  $effect(() => {
    const { id, source } = read()
    if (id !== lastId) {
      // A different template altogether — that's a choice, not typing, so it
      // shouldn't sit out the debounce meant for keystrokes.
      lastId = id
      void compile(source)
      return
    }
    const timer = setTimeout(() => compile(source), COMPILE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  /** @param {string} source */
  async function compile(source) {
    const mine = ++seq
    try {
      const result = await compileTemplate(source)
      if (mine !== seq) return // a newer compile has already landed
      component = result.component
      css = result.css
      error = null
    } catch (e) {
      if (mine !== seq) return
      const err = /** @type {Error & { line?: number }} */ (e)
      // The last template that worked stays on screen: a preview is there to
      // be looked at while the source is half-written, exactly as it is while
      // the YAML is.
      error = { message: err.message, line: err.line }
    }
  }

  return {
    get component() {
      return component
    },
    get css() {
      return css
    },
    get error() {
      return error
    },
  }
}
