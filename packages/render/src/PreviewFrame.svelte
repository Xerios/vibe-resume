<script>
  /**
   * The CV sheet, in a document of its own.
   *
   * An iframe keeps the sheet's stylesheet and the app's apart in both
   * directions: nothing crosses, custom properties included.
   *
   * The frame's stylesheets are written into its head as text: frame.css and
   * the bundled faces, then sheet.css for the arrangement, then two that move.
   * The tokens hold the palette, the type and the spacing for this file's theme
   * and density; the paper holds the page box. Changing either is a
   * `textContent` assignment, never a reload.
   *
   * The sheet itself is `mount()`ed rather than rendered here, since it has to
   * land in the frame's document. Its props are a $state object, so mutating
   * them re-renders it in place.
   *
   * After every render the sheet is paginated (html/paginate.js): blocks are
   * pushed onto the page they will be on in the PDF, and in page view the pages
   * are drawn apart. `measure()` reads that back for the export, so the PDF is
   * exactly what is on screen.
   */
  import { mount, onDestroy, tick, unmount } from 'svelte'
  import CvSheet from './html/CvSheet.svelte'
  import { paginate } from './html/paginate'
  import { facesCss, sheetCss } from './html/sheet-css'
  import sheetLayoutCss from './html/sheet.css?raw'
  import { measure as measureSheet } from './pdf/measure'
  import { docMeta } from './doc-meta'
  import { buildModel } from './model'
  import { DEFAULT_DENSITY, DEFAULT_LAYOUT } from './tokens'
  import { DEFAULT_PAPER, pageBox, pageWidthPx, paperCss } from './theme/paper'
  import { DEFAULT_THEME } from './theme/palettes'
  import { DEFAULT_FONT } from './theme/typefaces'
  import frameCss from './frame.css?raw'

  /**
   * `cv` is null until the first successful parse. `layout`, `theme`, `font`
   * and `density` are ids, resolved against the shared tokens; `variants` is
   * the block variant chosen per slot.
   *
   * `paged` draws the pages apart, as cards with the running head and foot in
   * their margins. Off, the sheet is one strip; the page breaks are the same.
   *
   * `onReady` is handed the frame's document, window and `#cv-root` once they
   * exist. The page binds its preview listeners in there, since nothing inside
   * an iframe bubbles out to us, keydown included.
   *
   * `paper` becomes a stylesheet of its own (see paper.js), with `name` in it,
   * since a running header in the print margin can only hold a string literal.
   *
   * `fit` scales the sheet down until a whole page fits the pane. That is a
   * way of looking at the preview rather than anything about the file, so all
   * that happens here is the arithmetic and a `zoom`, which the print
   * stylesheet drops.
   *
   * `dark` is the app's colour scheme, which the frame can't see for itself.
   * Only the gutter around the sheet follows it.
   *
   * @type {{
   *   cv?: any,
   *   layout?: string,
   *   variants?: Record<string, string>,
   *   theme?: string,
   *   font?: string,
   *   density?: string,
   *   paged?: boolean,
   *   paper?: Partial<import('./theme/paper').Paper>,
   *   name?: string,
   *   fit?: boolean,
   *   dark?: boolean,
   *   onReady?: (parts: { doc: Document, win: Window, root: HTMLElement }) => void
   *   onPaginated?: () => void
   * }}
   */
  let {
    cv = null,
    layout = DEFAULT_LAYOUT,
    variants = {},
    theme = DEFAULT_THEME,
    font = DEFAULT_FONT,
    density = DEFAULT_DENSITY,
    paged = false,
    paper = DEFAULT_PAPER,
    name = '',
    fit = false,
    dark = false,
    onReady = undefined,
    onPaginated = undefined,
  } = $props()

  /** The gap between pages in page view, px. */
  const PAGE_GAP = 16
  /** CSS px per millimetre. */
  const PX_PER_MM = 96 / 25.4

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
  let tokenStyle = $state(/** @type {HTMLStyleElement | null} */ (null))
  let head = $state(/** @type {{ title: HTMLTitleElement, author: HTMLMetaElement, description: HTMLMetaElement, keywords: HTMLMetaElement } | null} */ (null))
  let sheet = /** @type {Record<string, any> | null} */ (null)

  /** What the sheet says about itself — the printed PDF's title among it. See doc-meta.js. */
  const meta = $derived(docMeta(cv))

  /** The page box and its margin boxes, as CSS. Rebuilt whenever either moves. */
  const pageCss = $derived(paperCss(paper, name))

  /** Palette, type and spacing, as custom properties and role classes. */
  const tokensCss = $derived(sheetCss({ theme, density, font }))

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
    model: /** @type {import('./model').Model | null} */ (null),
    paged: false,
    pages: 1,
    dividers: /** @type {import('./html/paginate').Pagination['dividers']} */ ([]),
    running: { header: 'none', footer: 'none', name: '' },
  })

  // Ahead of the paint rather than after it, so a `tick()` in the page still
  // finds the frame's DOM current.
  $effect.pre(() => {
    sheetProps.model = cv ? buildModel(cv, { layout, variants }) : null
    sheetProps.paged = paged
    sheetProps.running = { header: paper.header ?? 'none', footer: paper.footer ?? 'none', name }
  })

  /** The page, in px, as paginate.js and measure.js take it. */
  function geometry() {
    const box = pageBox(paper)
    return { width: box.w * PX_PER_MM, height: box.h * PX_PER_MM, mt: box.mt * PX_PER_MM, mb: box.mb * PX_PER_MM, gap: paged ? PAGE_GAP : 0 }
  }

  /** The pagination in flight, which `measure()` waits for. */
  let pending = Promise.resolve()
  let runs = 0

  /** Paginate once the DOM and its fonts have settled; a newer run supersedes an older one. */
  function repaginate() {
    const run = ++runs
    pending = (async () => {
      await tick()
      if (doc) await doc.fonts.ready
      const el = /** @type {HTMLElement | null | undefined} */ (root?.querySelector('.sheet'))
      if (run !== runs || !el || !root) return
      const geo = geometry()
      root.style.setProperty('--page-gap', `${geo.gap}px`)
      const result = paginate(el, geo)
      sheetProps.pages = result.pages
      sheetProps.dividers = result.dividers
      onPaginated?.()
    })()
  }

  // Anything that moves the layout moves the page breaks.
  $effect(() => {
    void sheetProps.model
    void tokensCss
    void pageCss
    void paged
    if (root) repaginate()
  })

  // A face that arrives late reflows the text it sets.
  $effect(() => {
    if (!doc) return
    const fonts = doc.fonts
    const onDone = () => repaginate()
    fonts.addEventListener('loadingdone', onDone)
    return () => fonts.removeEventListener('loadingdone', onDone)
  })

  /**
   * The sheet as it is laid out and paginated now, for the PDF — see
   * pdf/measure.js. Null before there is a sheet to measure.
   * @returns {Promise<import('./pdf/measure').DisplayList | null>}
   */
  export async function measure() {
    await pending
    const el = /** @type {HTMLElement | null | undefined} */ (root?.querySelector('.sheet'))
    if (!el) return null
    const geo = geometry()
    return measureSheet(el, { width: geo.width, height: geo.height, gap: geo.gap, pages: sheetProps.pages })
  }

  /* Each of these reads its prop into a local *before* testing the target. An
	   effect only subscribes to what it actually reads, and on the first pass the
	   target is still null: guarding first would short-circuit past the prop,
	   leave the effect with no dependencies at all, and never run it again. */
  $effect(() => {
    const text = pageCss
    if (pageStyle) pageStyle.textContent = text
  })

  $effect(() => {
    const text = tokensCss
    if (tokenStyle) tokenStyle.textContent = text
  })
  $effect(() => {
    const { title, author, description, keywords } = meta
    if (!head) return
    head.title.textContent = title
    head.author.content = author
    head.description.content = description
    head.keywords.content = keywords.join(', ')
  })

  $effect(() => {
    const on = dark
    if (doc) doc.documentElement.dataset.scheme = on ? 'dark' : 'light'
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

    d.documentElement.dataset.scheme = dark ? 'dark' : 'light'
    addStyle(d, [frameCss, facesCss, sheetLayoutCss].join('\n'))
    tokenStyle = addStyle(d, tokensCss)
    pageStyle = addStyle(d, pageCss)
    head = {
      title: d.head.appendChild(d.createElement('title')),
      author: addMeta(d, 'author'),
      description: addMeta(d, 'description'),
      keywords: addMeta(d, 'keywords'),
    }

    const el = d.createElement('div')
    el.id = 'cv-root'
    d.body.appendChild(el)

    doc = d
    root = el
    sheet = mount(CvSheet, { target: el, props: sheetProps })
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
   * @param {Document} d
   * @param {string} key
   */
  function addMeta(d, key) {
    const el = d.createElement('meta')
    el.name = key
    d.head.appendChild(el)
    return el
  }

  /**
   * Print the sheet — the fallback beside the PDF export. It is a document of
   * its own, so the print has to go to the frame: printing the app would get
   * this iframe clipped to its box on the page rather than the CV flowed across
   * as many pages as it needs.
   */
  export function print() {
    const win = frameEl?.contentWindow
    if (!win) return false
    win.focus() // some browsers print the top document without this
    // The frame's title is the PDF's Title, but the name the save dialog
    // offers comes from the tab's. `print()` blocks until the dialog closes.
    const appTitle = document.title
    document.title = meta.title
    try {
      win.print()
    } finally {
      document.title = appTitle
    }
    return true
  }
</script>

<!-- No `sandbox`: the frame is same-origin on purpose, since the page scripts it
     for scroll sync and the hover-to-source mapping. -->
<iframe bind:this={frameEl} title="CV preview" srcdoc={SHELL} onload={build}></iframe>

<style lang="scss">
  iframe {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: block;
    border: 0;
    /* The sunken surface, as the pane behind it: this element is the app's. */
    background: var(--ds-surface-sunken);
    color-scheme: auto;
  }
</style>
