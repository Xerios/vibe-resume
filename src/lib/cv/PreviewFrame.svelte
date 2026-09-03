<script>
  /**
   * The CV sheet, in a document of its own.
   *
   * The preview used to be a `#cv-root` div in the app's own DOM, which meant
   * one stylesheet for two unrelated things: a chrome rule could reach the
   * sheet, and a sheet rule could reach the chrome. An iframe makes that
   * impossible in both directions — nothing crosses, custom properties
   * included — which is what lets a file carry arbitrary CSS of its own
   * without any of it being able to break the editor around it.
   *
   * The frame's stylesheets are imported as text and written into its head:
   * frame.css declares what the sheet spends, then cv.css, the theme ramps and
   * the font stacks, then two empty style elements — one for whatever the
   * active template's own style block compiled to, one for the file's own CSS,
   * in that order. Editing either is a `textContent` assignment — no rebuild,
   * and no way for a half-typed rule to escape.
   *
   * The sheet itself is `mount()`ed rather than rendered here, since it has to
   * land in the frame's document. Its props are a $state object, so mutating
   * them re-renders it in place — the frame is built once and never reloaded.
   */
  import { mount, onDestroy, unmount } from 'svelte'
  import CvFrameBody from './CvFrameBody.svelte'
  import { DEFAULT_PRESET } from './template/compositions.js'
  import { DEFAULT_FONT } from './theme/fonts.js'
  import { DEFAULT_PAPER, pageWidthPx, paperCss } from './theme/paper.js'
  import { DEFAULT_THEME } from './theme/presets.js'
  import cvCss from './cv.css?raw'
  import frameCss from './frame.css?raw'
  import fontsCss from './theme/fonts.css?raw'
  import palettesCss from './theme/palettes.css?raw'
  import presetsCss from './theme/presets.css?raw'

  /**
   * `cv` is null until the first successful parse and `component` until the
   * first successful compile; `templateCss` is what that template's style
   * block came to, and `css` the active file's own, applied last in the
   * cascade inside the frame. `layout`, `theme` and `font` are only ids: each
   * lands on `#cv-root` as a data attribute, where the frame's own stylesheets
   * — and a file's custom CSS — are what give it meaning.
   *
   * `onReady` is handed the frame's document, window and `#cv-root` once they
   * exist — the page binds its preview listeners in there, since nothing
   * inside an iframe bubbles out to us, keydown included.
   *
   * `paper` is the one piece of presentation that can't be an id on an
   * attribute: a page box is `@page`, and no selector reaches that. So it
   * arrives as a value and becomes a stylesheet of its own — see paper.js —
   * with `name` in it, since a running header can only hold a string literal.
   *
   * `fit` scales the sheet down until a whole page fits the pane, which is a
   * way of looking at the preview rather than anything about the file. The
   * page decides whether to ask for it; all that happens here is the arithmetic
   * and a `zoom`, which the print stylesheet drops.
   *
   * @type {{
   *   cv?: any,
   *   component?: any,
   *   templateCss?: string,
   *   layout?: string,
   *   theme?: string,
   *   font?: string,
   *   css?: string,
   *   paper?: Partial<import('./theme/paper.js').Paper>,
   *   name?: string,
   *   fit?: boolean,
   *   onReady?: (parts: { doc: Document, win: Window, root: HTMLElement }) => void
   * }}
   */
  let {
    cv = null,
    component = null,
    templateCss = '',
    layout = DEFAULT_PRESET,
    theme = DEFAULT_THEME,
    font = DEFAULT_FONT,
    css = '',
    paper = DEFAULT_PAPER,
    name = '',
    fit = false,
    onReady = undefined,
  } = $props()

  /** An empty same-origin document to build into; `srcdoc` keeps it off the network. */
  const SHELL = "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"

  /** @type {HTMLIFrameElement} */
  let frameEl
  /**
   * The frame's parts, null until it has loaded. Reactive because the effects
   * below have to run again once these arrive — the frame loads a tick or two
   * after this component mounts, so the first pass at each of them finds
   * nothing to write to.
   */
  let doc = $state(/** @type {Document | null} */ (null))
  let root = $state(/** @type {HTMLElement | null} */ (null))
  let pageStyle = $state(/** @type {HTMLStyleElement | null} */ (null))
  let templateStyle = $state(/** @type {HTMLStyleElement | null} */ (null))
  let userStyle = $state(/** @type {HTMLStyleElement | null} */ (null))
  let sheet = /** @type {Record<string, any> | null} */ (null)

  /** The page box and its margin boxes, as CSS. Rebuilt whenever either moves. */
  const pageCss = $derived(paperCss(paper, name))

  /** The frame's own width, watched so that a fitted sheet re-scales with the pane. */
  let paneW = $state(0)

  /** How much of the pane a fitted page leaves as a gutter either side. */
  const FIT_GUTTER = 32
  /** Below this the type is unreadable, so the sheet stops shrinking and scrolls. */
  const FIT_FLOOR = 0.35

  /**
   * The mounted sheet's props. Assigned into rather than replaced — the object
   * identity is what the mounted component holds on to.
   */
  const sheetProps = $state({
    cv: /** @type {any} */ (null),
    component: /** @type {any} */ (null),
  })

  // Ahead of the paint rather than after it, so a `tick()` in the page still
  // finds the frame's DOM current: the props cross two component boundaries.
  $effect.pre(() => {
    sheetProps.cv = cv
    sheetProps.component = component
  })

  /* Presentation rides on the same attributes it always did — only the element
	   they land on has moved.

	   Each of these reads its prop into a local *before* testing the target. An
	   effect only subscribes to what it actually reads, and on the first pass the
	   target is still null: guarding first would short-circuit past the prop,
	   leave the effect with no dependencies at all, and never run it again. */
  $effect(() => {
    const id = layout
    if (root) root.dataset.cvLayout = id
  })

  $effect(() => {
    const id = theme
    if (root) root.dataset.cvTheme = id
  })

  $effect(() => {
    const id = font
    if (root) root.dataset.cvFont = id
  })

  $effect(() => {
    const text = pageCss
    if (pageStyle) pageStyle.textContent = text
  })

  /* Fit-to-width, as one number. `zoom` rather than a transform because it is
	   laid out rather than painted: the frame's own scrollbars stay right, the
	   rects the page measures for the scroll ladder come back in the frame's
	   viewport coordinates as they always did, and nothing has to be divided by
	   anything. It never scales *up* — a page bigger than
	   its paper is not a preview of anything. */
  $effect(() => {
    const on = fit
    const width = paneW
    const pageW = pageWidthPx(paper)
    if (!root) return
    const scale = on && width ? Math.max(FIT_FLOOR, Math.min(1, (width - FIT_GUTTER) / pageW)) : 1
    // Cleared rather than set to 1, so an unfitted sheet carries no zoom at all.
    root.style.zoom = scale === 1 ? '' : scale.toFixed(3)
  })

  /* The pane is resized by the divider, by the side panel opening and by the
	   window; one observer on the frame itself answers all three. */
  $effect(() => {
    if (!frameEl) return
    const observer = new ResizeObserver(([entry]) => {
      paneW = entry.contentRect.width
    })
    observer.observe(frameEl)
    return () => observer.disconnect()
  })

  $effect(() => {
    const text = templateCss
    if (templateStyle) templateStyle.textContent = text
  })

  $effect(() => {
    const text = css
    if (userStyle) userStyle.textContent = text
  })

  onDestroy(() => {
    if (sheet) unmount(sheet)
  })

  /**
   * Build the frame's document. Driven by the iframe's own `load`, which is
   * the point at which `contentDocument` is the shell above rather than the
   * transient `about:blank` that precedes it.
   */
  function build() {
    const d = frameEl.contentDocument
    const win = frameEl.contentWindow
    if (!d || !win || doc) return // built already; the frame is never reloaded

    addStyle(d, [frameCss, cvCss, palettesCss, fontsCss, presetsCss].join('\n'))
    // Three more, in cascade order. The paper goes first, because it is the
    // page the two below it are drawn on: the template's own styles are scoped
    // by the compiler and outrank cv.css on specificity alone, but the file's
    // CSS is written by hand and has only its position to win on.
    pageStyle = addStyle(d, pageCss)
    templateStyle = addStyle(d, templateCss)
    userStyle = addStyle(d, css)

    const el = d.createElement('div')
    el.id = 'cv-root'
    el.dataset.cvLayout = layout
    el.dataset.cvTheme = theme
    el.dataset.cvFont = font
    d.body.appendChild(el)

    doc = d
    root = el
    sheet = mount(CvFrameBody, { target: el, props: sheetProps })
    onReady?.({ doc: d, win, root: el })
  }

  /**
   * @param {Document} d
   * @param {string} text
   */
  function addStyle(d, text) {
    const style = d.createElement('style')
    style.textContent = text
    d.head.appendChild(style)
    return style
  }

  /**
   * Print the sheet. It is a document of its own now, so the print has to go to
   * the frame: printing the app would get this iframe clipped to its box on the
   * page rather than the CV flowed across as many pages as it needs.
   */
  export function print() {
    const win = frameEl?.contentWindow
    if (!win) return false
    win.focus() // some browsers print the top document without this
    win.print()
    return true
  }
</script>

<!-- No `sandbox`: the frame is same-origin on purpose, since the page scripts it
     for scroll sync and the hover-to-source mapping. -->
<iframe bind:this={frameEl} title="CV preview" srcdoc={SHELL} onload={build}></iframe>

<style>
  iframe {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: block;
    border: 0;
    background: var(--gray-3);
  }
</style>
