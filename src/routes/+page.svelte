<script>
  import { onMount, tick } from 'svelte'
  import { pushState } from '$app/navigation'
  import { page } from '$app/state'
  import CompareModal from '$lib/components/CompareModal.svelte'
  import HistoryPanel from '$lib/components/HistoryPanel.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import StylePicker from '$lib/components/StylePicker.svelte'
  import TabBar from '$lib/components/TabBar.svelte'
  import Toolbar from '$lib/components/Toolbar.svelte'
  import TrashPanel from '$lib/components/TrashPanel.svelte'
  import WelcomeOverlay from '$lib/components/WelcomeOverlay.svelte'
  import YamlEditor from '$lib/components/YamlEditor.svelte'
  import PreviewFrame from '$lib/cv/PreviewFrame.svelte'
  import { isModified, preset as presetOf, resolvePreset } from '$lib/cv/template/compositions.js'
  import { FONTS, resolveFont } from '$lib/cv/theme/fonts.js'
  import { liveTemplate } from '$lib/cv/template/live-template.svelte.js'
  import { ORIENTATIONS, PAPER_SIZES, RUNNING, resolvePaper } from '$lib/cv/theme/paper.js'
  import { THEMES, resolveTheme } from '$lib/cv/theme/presets.js'
  import { parseCv } from '$lib/cv/template/render.js'
  import { doc as cv, files, flush, parts, restyle, restylePaper, restyleVariant, start } from '$lib/cv/state/state.svelte.js'
  import { KEYS, read, write } from '$lib/cv/state/storage.js'
  import { swUpdate } from '$lib/sw-update.svelte.js'

  const PARSE_DEBOUNCE_MS = 250
  /** How long a pane's own scroll events stay ours after we move it ourselves. */
  const SYNC_QUIET_MS = 250
  /** A tab switch or version preview scrolls things about; sync sits out this long. */
  const SYNC_HOLD_MS = 400
  /** Where the top of the preview viewport is read from — a little breathing room. */
  const PREVIEW_TOP_MARGIN = 16
  /** Breathing room above an edited element when the preview is pulled to it. */
  const EDIT_REVEAL_MARGIN = 72
  /** How long after the preview last moved it goes back to answering the pointer. */
  const POINTER_SETTLE_MS = 250
  /* Where the split still has two columns side by side — the same width the
	   stacked layout takes over at, since fitting a page across a pane means
	   nothing once the pane is the whole window. */
  const DESKTOP = '(min-width: 900px)'

  /** Which document `parsed` reflects — used to bypass the debounce when a tab switch swaps it out from under us. */
  let lastParsedDocId = -1

  /** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
  let parsed = $state(/** @type {any} */ (null))
  let parseError = $state(/** @type {string | null} */ (null))
  /**
   * Where each value in `parsed` came from — `data-src` path → source line.
   * Only read from event handlers, so it stays off the reactive graph.
   * @type {Map<string, number> | null}
   */
  let srcLines = null

  /** First visit only — dismissing it writes the flag, so it never returns. */
  let welcomeOpen = $state(read(KEYS.welcomeSeen) !== 'true')
  /* Style and History share the column to the right of the preview, so opening
	   one closes the other. Style is what an unopinionated first visit gets: it
	   is the panel with something to do in it before there is any history. */
  const savedPanel = read(KEYS.sidePanel, 'style')
  let sidePanel = $state(savedPanel === 'history' ? 'history' : savedPanel === 'none' ? null : 'style')
  let sourceHidden = $state(read(KEYS.sourceHidden) === 'true')
  /* How the preview is looked at rather than anything about the file: scaling a
	   page to fit the pane changes no CV, so it is a preference of this browser's
	   and stays out of the document and the history. */
  let fitPreview = $state(read(KEYS.previewFit) === 'true')
  /* Whether the pointer resting on the sheet pulls the editor to its line. Same
	   family as `fitPreview`: how the window behaves rather than what the CV says,
	   so it stays out of the document and the history. On unless turned off. */
  let hoverSync = $state(read(KEYS.hoverSync) !== 'false')
  /* Whether a scroll in either pane drags the other along with it. Same family
	   again — how the window behaves rather than what the CV says. On unless
	   turned off. */
  let scrollSync = $state(read(KEYS.scrollSync) !== 'false')
  /* The app's colour scheme, mirrored into the preview frame: the gutter around
	   the sheet follows it, the sheet itself never does. Read from the same key
	   app.html's pre-paint script set the <html> attribute from. */
  let dark = $state(read(KEYS.theme) === 'dark')
  let desktop = $state(true)
  let editorWidth = $state(read(KEYS.editorWidth))
  let toastMsg = $state('')
  let toastOn = $state(false)

  let editor = $state(/** @type {YamlEditor | undefined} */ (undefined))
  let frame = $state(/** @type {PreviewFrame | undefined} */ (undefined))
  /** @type {HTMLDivElement} */
  let split
  /** @type {HTMLDivElement} */
  let previewPane
  /** @type {HTMLDivElement} */
  let editorPane

  /* The preview is an iframe, so the DOM it works over is not ours. These are
	   set from `onFrameReady` and are null until the frame has loaded. */
  let frameDoc = /** @type {Document | null} */ (null)
  let frameWin = /** @type {Window | null} */ (null)
  let cvRoot = /** @type {HTMLElement | null} */ (null)
  /** Undoes what `onFrameReady` attached inside the frame. */
  let detachFrame = /** @type {(() => void) | null} */ (null)
  /** Watches anything that reflows the sheet; both documents feed it. */
  let reflow = /** @type {ResizeObserver | null} */ (null)
  /** The preview element the pointer is on, outlined while the editor shows its line. */
  let hoverEl = /** @type {Element | null} */ (null)
  let dragging = false
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer
  let trashOpen = $state(false)
  /**
   * The compare dialog is a history entry rather than a flag — `page.state`
   * holds its two sides while it is up — so the Back button closes it, which
   * on a phone is how a dialog is expected to close. See `openCompare`.
   */
  const compare = $derived(page.state.compare ?? null)
  /** The browser's deferred install prompt, held until the user asks for it. */
  let installPrompt = $state(/** @type {BeforeInstallPromptEvent | null} */ (null))

  /** Presentation of the active file, defaulted here so the rest can assume a valid id. */
  const preset = $derived(resolvePreset(files.active?.layout))
  const theme = $derived(resolveTheme(files.active?.theme))
  const font = $derived(resolveFont(files.active?.font))
  const css = $derived(files.active?.css ?? '')
  const paper = $derived(resolvePaper(files.active?.paper))
  /** The name a running header prints, which is the CV's own rather than the file's. */
  const cvName = $derived(String(parsed?.header?.name ?? ''))

  /* Which variant fills each slot: the preset's choices with the file's own on
	   top, and then the component those compose to. Composing is cheap — it is
	   string work over sources already in memory — so it can sit on the reactive
	   graph beside everything else. */
  const choices = $derived(parts.composition(files.active))
  const composed = $derived(parts.compose(choices))

  /* The sheet's component, kept compiled. The id is the composition rather than
	   one template's: changing a variant is a choice and shouldn't sit out the
	   debounce meant for keystrokes. */
  const tpl = liveTemplate(() => ({
    id: Object.entries(choices)
      .map(([slot, variant]) => `${slot}:${variant}`)
      .join('|'),
    source: composed.source,
  }))

  /** One banner over the preview, whichever of the two is broken. */
  const bannerError = $derived(parseError ?? (tpl.error ? `Template — ${tpl.error.message}` : null))

  const saveLabel = $derived.by(() => {
    if (cv.saveError) return '⚠ not saved'
    if (cv.isViewingHistory) return 'viewing history'
    if (!cv.savedAt) return ''
    const at = cv.savedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `saved ${at}`
  })

  onMount(() => {
    start()
    cv.bindEditor((text) => editor?.replaceAll(text))

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    // The window lost focus with the pointer still on the sheet: drop the
    // indication rather than leaving it lit over a window nobody is in. Focus
    // moving *into* the preview iframe blurs this window too, so the answer is
    // read a turn later, once `hasFocus` describes the whole tree again rather
    // than the moment of handover.
    const onBlur = () =>
      setTimeout(() => {
        if (!document.hasFocus()) clearHover()
      })

    // Storage that survives eviction pressure: an offline editor that loses the CV
    // it was holding is not much of one. An installed PWA is usually granted this
    // silently; elsewhere it may prompt or be refused, and either is fine.
    void navigator.storage?.persist?.()

    // A copy that never reloads never updates, so the status bar says when one is due.
    void swUpdate.start()

    // An installed copy is registered for .yaml/.yml, and files opened from the OS
    // arrive through here rather than as a navigation.
    window.launchQueue?.setConsumer(async ({ files: handles }) => {
      for (const handle of handles) {
        const file = await handle.getFile()
        openImported(file.name, await file.text())
      }
    })

    // Fit-to-width is offered on a screen with room for it and simply not on
    // one without, where the preview is already as wide as the window.
    const wide = window.matchMedia(DESKTOP)
    const onWidth = () => (desktop = wide.matches)
    onWidth()
    wide.addEventListener('change', onWidth)

    window.addEventListener('beforeunload', flush)
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)

    // Whichever pane the user reaches for drives the other. Hovering doesn't
    // count, so a preview resting under the pointer can't take the wheel away
    // mid-keystroke. The preview's half of this is inside the frame — see
    // `onFrameReady`.
    const claimEditor = () => takeOver('editor')
    editorPane.addEventListener('wheel', claimEditor, { passive: true })
    editorPane.addEventListener('pointerdown', claimEditor)
    editorPane.addEventListener('keydown', claimEditor)
    editorPane.addEventListener('focusin', claimEditor)

    // Anything that reflows the sheet moves the rungs of the ladder. The pane
    // itself is watched too: narrowing it reflows the frame from outside.
    const resize = new ResizeObserver(() => {
      anchorsStale = true
    })
    resize.observe(previewPane)
    reflow = resize

    return () => {
      wide.removeEventListener('change', onWidth)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      editorPane.removeEventListener('wheel', claimEditor)
      editorPane.removeEventListener('pointerdown', claimEditor)
      editorPane.removeEventListener('keydown', claimEditor)
      editorPane.removeEventListener('focusin', claimEditor)
      detachFrame?.()
      resize.disconnect()
      reflow = null
      clearTimeout(toastTimer)
      cv.destroy()
    }
  })

  /**
   * The preview's document has loaded. Everything the page does to the sheet —
   * hover, click, scroll sync, even Ctrl+S — has to be bound in there: an
   * iframe's events don't bubble out to the app's window, so a listener on
   * ours would never hear them.
   * @param {{ doc: Document, win: Window, root: HTMLElement }} parts
   */
  function onFrameReady({ doc, win, root }) {
    detachFrame?.()
    frameDoc = doc
    frameWin = win
    cvRoot = root

    // Listeners rather than markup handlers: the preview is a document, not a
    // control, and this DOM isn't Svelte's to put handlers on anyway.
    const claimPreview = () => takeOver('preview')
    doc.addEventListener('mouseover', onPreviewOver)
    doc.documentElement.addEventListener('mouseleave', onPreviewLeave)
    doc.addEventListener('click', onPreviewClick)
    doc.addEventListener('keydown', onKeydown)
    win.addEventListener('wheel', claimPreview, { passive: true })
    win.addEventListener('pointerdown', claimPreview)
    win.addEventListener('touchstart', claimPreview, { passive: true })
    win.addEventListener('scroll', onPreviewScroll, { passive: true })
    reflow?.observe(doc.documentElement)
    anchorsStale = true

    detachFrame = () => {
      doc.removeEventListener('mouseover', onPreviewOver)
      doc.documentElement.removeEventListener('mouseleave', onPreviewLeave)
      doc.removeEventListener('click', onPreviewClick)
      doc.removeEventListener('keydown', onKeydown)
      win.removeEventListener('wheel', claimPreview)
      win.removeEventListener('pointerdown', claimPreview)
      win.removeEventListener('touchstart', claimPreview)
      win.removeEventListener('scroll', onPreviewScroll)
      reflow?.unobserve(doc.documentElement)
      detachFrame = null
    }
  }

  /** The frame's scrolling element — the preview's viewport is the iframe's own. */
  const scroller = () => frameDoc?.scrollingElement ?? null

  // The document is the single source of the preview: loro-codemirror keeps it in
  // step with the editor in both directions, so nothing here watches keystrokes.
  $effect(() => {
    const text = cv.yaml
    const docId = cv.docId
    if (!text) return
    if (!parsed || docId !== lastParsedDocId) {
      // First paint, and switching to a different document (tab switch, new file,
      // clear history) shouldn't wait on the debounce meant for keystrokes.
      lastParsedDocId = docId
      reparse(text)
      return
    }
    const id = setTimeout(() => reparse(text), PARSE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  })

  // Presentation changes reflow the sheet without going through the parser.
  $effect(() => {
    void tpl.component
    void tpl.css
    void theme
    void css
    void editorWidth
    void sourceHidden
    anchorsStale = true
  })

  // A tab switch or a version preview swaps the document out and scrolls both
  // panes on its own. That motion is the app's, not the user's, so sync stays
  // out of it — browsing history never drags the preview to a change.
  $effect(() => {
    void cv.docId
    void cv.viewingKey
    anchorsStale = true
    pendingEditLine = 0
    holdSync()
  })

  /** @param {string} text */
  function reparse(text) {
    const { cv: doc, lines, error } = parseCv(text)
    parseError = error
    // Both or neither: the map has to describe the CV that's on screen, so a
    // broken document leaves the last good pair in place.
    if (doc) {
      parsed = doc
      srcLines = lines
      anchorsStale = true
      if (pendingEditLine) revealEdit(pendingEditLine)
    }
  }

  /* ── Preview → source ──────────────────────────────────────────────────────
	   Every element CvSheet renders carries the `data-src` path of the YAML value
	   behind it. Hovering lights that line up in the editor, clicking puts the
	   caret on it. */

  /**
   * The `data-src` element under the pointer and the line it maps to. Paths the
   * map doesn't know — a value added since the last good parse — fall back to
   * the nearest ancestor that it does, so the jump lands close rather than
   * nowhere.
   * @param {Event} e
   */
  function srcTarget(e) {
    const el = asElement(e.target)?.closest('[data-src]') ?? null
    if (!el || !hasOwnText(el)) return null
    return { el, line: lineForPath(el.getAttribute('data-src')) }
  }

  /**
   * `instanceof Element` is per-realm, and these events come from the preview
   * frame — the app's own `Element` disowns every node in there. The node type
   * is the check that crosses a document boundary.
   * @param {EventTarget | null} target
   * @returns {Element | null}
   */
  function asElement(target) {
    const node = /** @type {Node | null} */ (target)
    return node?.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : null
  }

  /**
   * Whether an element carries text of its own — text inside a nested
   * `data-src` element belongs to that one, not to this. Only those are worth
   * pointing at: a wrapper like a whole job block is what the pointer lands on
   * every time it crosses the seam between two children, and outlining one of
   * those — or pulling the editor to its opening line — over a 1px gap makes
   * both panes jump for nothing.
   * @param {Element} el
   */
  function hasOwnText(el) {
    // The element belongs to the frame, so the walker has to come from there.
    const walk = (el.ownerDocument ?? document).createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, (node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.nodeValue?.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
        : /** @type {Element} */ (node).hasAttribute('data-src')
          ? NodeFilter.FILTER_REJECT // that element's text, not this one's
          : NodeFilter.FILTER_SKIP,
    )
    return walk.nextNode() !== null
  }

  /**
   * The source line behind a `data-src` path, or 0 when nothing in the map
   * covers it.
   * @param {string | null} path
   */
  function lineForPath(path) {
    while (path) {
      const line = srcLines?.get(path)
      if (line) return line
      const cut = path.lastIndexOf('.')
      path = cut < 0 ? null : path.slice(0, cut)
    }
    return 0
  }

  /** @param {Event} e */
  function onPreviewOver(e) {
    // Content sliding under a still pointer fires these as well as real
    // pointer moves do, and following one would haul the editor off wherever
    // the scroll just put it.
    if (previewMoving()) return
    // Outlining an element and pulling the editor to it are both reactions to
    // attention, and there is none while the window is sitting behind another one.
    if (!hoverSync || !document.hasFocus()) return
    const hit = srcTarget(e)
    if (hit?.el === hoverEl) return
    markHover(hit?.el ?? null)
    if (hit?.line && !sourceHidden) {
      // Its own scroll, not one to mirror back into the preview.
      editor?.revealLine(hit.line)
      hush('editor')
    }
  }

  /** Drop the hover indication — the outline and the peek line are one thing. */
  function clearHover() {
    markHover(null)
    editor?.clearPeek()
  }

  function onPreviewLeave() {
    clearHover()
  }

  /** @param {MouseEvent} e */
  async function onPreviewClick(e) {
    // A tap that lands while the page is still moving was aimed at whatever
    // was under the pointer a moment ago — let the scroll finish instead.
    if (previewMoving()) return
    // Leave a link's own click alone, and don't yank focus out of a selection
    // the user is in the middle of making.
    if (asElement(e.target)?.closest('a')) return
    if (frameWin?.getSelection()?.isCollapsed === false) return
    const hit = srcTarget(e)
    if (!hit?.line) return
    if (sourceHidden) {
      // Asking for the line behind a value is asking to edit it: bring the
      // source back first. The pane is kept mounted but `display: none`, so
      // CodeMirror has measured nothing since it went away and has to be told
      // to look again before it can scroll anywhere.
      setSourceHidden(false)
      await tick()
      editor?.remeasure()
    }
    editor?.revealLine(hit.line, { focus: true })
    // `revealLine` takes focus, which would otherwise hand the editor the wheel.
    takeOver('preview')
    hush('editor')
  }

  /** @param {Element | null} el */
  function markHover(el) {
    hoverEl?.classList.remove('src-hover')
    hoverEl = el
    hoverEl?.classList.add('src-hover')
  }

  /* ── Scroll sync ───────────────────────────────────────────────────────────
	   The two panes show one document at wildly different densities, so nothing
	   as simple as a shared percentage lines them up. The `data-src` map is the
	   converter: every element that carries one pairs a preview offset with a
	   source line, and a position in either pane is read off that ladder by
	   interpolating between the two rungs it falls between. */

  /** Rungs of the ladder — preview offset ↔ source line, ascending in both. */
  let anchors = /** @type {{ y: number, line: number }[]} */ ([])
  /** Every `data-src` element by source line, for pulling one thing into view. */
  let byLine = /** @type {{ line: number, el: Element }[]} */ ([])
  /** The ladder is measured from the DOM, so a reflow invalidates it. */
  let anchorsStale = true
  /** The pane the user is driving. The other one follows and never drives back. */
  let scrollMaster = /** @type {"editor" | "preview" | null} */ (null)
  /** Per pane: until when its scroll events are our doing rather than the user's. */
  const quiet = { editor: 0, preview: 0 }
  /** When the preview last moved, whichever pane set it off. */
  let previewMovedAt = 0
  /** A line the user just typed on, waiting for the preview to be re-rendered. */
  let pendingEditLine = 0

  /** @param {"editor" | "preview"} pane */
  const hush = (pane) => (quiet[pane] = performance.now() + SYNC_QUIET_MS)

  /** @param {"editor" | "preview"} pane */
  const hushed = (pane) => performance.now() < quiet[pane]

  /** Whether the preview is still moving under the pointer, tail included. */
  const previewMoving = () => performance.now() < previewMovedAt + POINTER_SETTLE_MS

  /** The user reached for a pane: it drives from here, and stops being hushed. */
  const takeOver = (/** @type {"editor" | "preview"} */ pane) => {
    scrollMaster = pane
    quiet[pane] = 0
  }

  /** Both panes are about to be rearranged by the app — sit the move out. */
  function holdSync() {
    quiet.editor = quiet.preview = performance.now() + SYNC_HOLD_MS
  }

  /**
   * Re-measure the ladder. Sorting by offset gives the order the reader sees;
   * the sidebar layout then breaks the line order, since its rail column sits
   * beside the main one rather than after it. Keeping the longest increasing
   * run drops the shorter column, rather than letting one stray rail heading
   * swallow everything below it.
   */
  function buildAnchors() {
    anchorsStale = false
    anchors = []
    byLine = []
    if (!frameWin || !cvRoot || !srcLines) return
    // Rects measured inside the frame are already relative to its viewport, so
    // the offset into the document is the rect plus how far it has scrolled.
    const scrolled = frameWin.scrollY
    /** @type {{ y: number, line: number, el: Element }[]} */
    const found = []
    for (const el of cvRoot.querySelectorAll('[data-src]')) {
      const line = lineForPath(el.getAttribute('data-src'))
      if (!line) continue
      const box = el.getBoundingClientRect()
      if (!box.height) continue // not laid out — a print-only or empty node
      found.push({ y: box.top + scrolled, line, el })
    }
    found.sort((a, b) => a.y - b.y || a.line - b.line)
    // Sorted by offset first, so ties keep the outermost element and the
    // binary search below lands on the innermost — the one worth scrolling to.
    byLine = found.map(({ line, el }) => ({ line, el })).sort((a, b) => a.line - b.line)

    // One rung per offset: interpolation needs both axes strictly increasing.
    const rungs = found.filter((a, i) => i === 0 || a.y > found[i - 1].y)
    for (const i of longestRun(rungs.map((a) => a.line))) anchors.push({ y: rungs[i].y, line: rungs[i].line })
  }

  /**
   * Indices of the longest strictly increasing run in `values`, by patience
   * sorting — so an out-of-order stretch costs its own length and no more.
   * @param {number[]} values
   * @returns {number[]}
   */
  function longestRun(values) {
    /** Index of the smallest tail seen for a run of each length. */
    const tails = /** @type {number[]} */ ([])
    const prev = /** @type {number[]} */ (new Array(values.length).fill(-1))
    for (let i = 0; i < values.length; i++) {
      let lo = 0
      let hi = tails.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (values[tails[mid]] < values[i]) lo = mid + 1
        else hi = mid
      }
      if (lo > 0) prev[i] = tails[lo - 1]
      tails[lo] = i
    }
    /** @type {number[]} */
    const out = []
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i)
    return out.reverse()
  }

  /**
   * Index of the last rung at or before `value` on the given axis.
   * @param {"y" | "line"} axis
   * @param {number} value
   */
  function rungBefore(axis, value) {
    let lo = 0
    let hi = anchors.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (anchors[mid][axis] <= value) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  /** Preview offset → source line. Past either end the nearest rung pair carries on. */
  function lineAtOffset(/** @type {number} */ y) {
    const i = Math.min(rungBefore('y', y), anchors.length - 2)
    const a = anchors[i]
    const b = anchors[i + 1]
    return a.line + ((y - a.y) / (b.y - a.y)) * (b.line - a.line)
  }

  /** Source line → preview offset — the same ladder read the other way. */
  function offsetAtLine(/** @type {number} */ line) {
    const i = Math.min(rungBefore('line', line), anchors.length - 2)
    const a = anchors[i]
    const b = anchors[i + 1]
    return a.y + ((line - a.line) / (b.line - a.line)) * (b.y - a.y)
  }

  /** Whether there is a usable ladder to read, measuring it first if it went stale. */
  function ladderReady() {
    if (sourceHidden || !frameWin) return false
    if (anchorsStale) buildAnchors()
    return anchors.length > 1
  }

  /**
   * The preview moved — put the line behind its top edge at the top of the
   * editor. The timestamp is taken whoever caused the move, sync included,
   * since the pointer has to sit out our scrolls as much as the user's.
   */
  function onPreviewScroll() {
    previewMovedAt = performance.now()
    if (!scrollSync || scrollMaster !== 'preview' || hushed('preview') || !ladderReady()) return
    const sc = scroller()
    if (!sc || !frameWin) return
    hush('editor')
    const max = sc.scrollHeight - frameWin.innerHeight
    if (sc.scrollTop <= 1) editor?.scrollToEdge('start')
    else if (sc.scrollTop >= max - 1) editor?.scrollToEdge('end')
    else editor?.scrollToLine(lineAtOffset(sc.scrollTop + PREVIEW_TOP_MARGIN))
  }

  /** The editor moved — bring what its top line renders to the top of the preview. */
  function onEditorScroll() {
    if (!scrollSync || scrollMaster !== 'editor' || hushed('editor') || !ladderReady()) return
    const line = editor?.topLine()
    const sc = scroller()
    if (line == null || !sc) return
    const edge = editor?.scrollEdge()
    hush('preview')
    if (edge === 'start') sc.scrollTop = 0
    else if (edge === 'end') sc.scrollTop = sc.scrollHeight
    else sc.scrollTop = offsetAtLine(line) - PREVIEW_TOP_MARGIN
  }

  /**
   * The user typed. The preview is a debounced re-render behind, so the line is
   * only remembered here; `revealEdit` acts on it once the new DOM is up.
   * @param {number} line
   */
  function noteEdit(line) {
    pendingEditLine = line
    takeOver('editor')
  }

  /**
   * Pull the part of the CV a fresh edit produced into view. Only when it isn't
   * already comfortably on screen — typing in the middle of a visible paragraph
   * shouldn't shunt the page about.
   * @param {number} line
   */
  async function revealEdit(line) {
    pendingEditLine = 0
    await tick()
    const sc = scroller()
    if (sourceHidden || cv.isViewingHistory || !sc || !frameWin) return
    buildAnchors()
    const el = elementForLine(line)
    if (!el) return
    // The frame's viewport *is* the preview's, so its top edge is simply zero.
    const box = el.getBoundingClientRect()
    if (box.top >= PREVIEW_TOP_MARGIN && box.bottom <= frameWin.innerHeight) return
    hush('preview')
    sc.scrollTop += box.top - EDIT_REVEAL_MARGIN
  }

  /** The rendered element for a source line — the innermost one at or before it. */
  function elementForLine(/** @type {number} */ line) {
    if (!byLine.length) return null
    let lo = 0
    let hi = byLine.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (byLine[mid].line <= line) lo = mid
      else hi = mid - 1
    }
    return byLine[lo].el
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (cv.isViewingHistory) {
        toast('Editing is paused while viewing history')
        return
      }
      cv.checkpoint('')
      toast('Version saved')
    }
    // The sheet lives in a frame, and a frame prints clipped to its box on the
    // page. Ctrl+P has to be taken over so it reaches the same export path as
    // the button rather than producing one cropped page.
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault()
      exportPDF()
    }
    // A restyle is a change in the document like an edit is, so Ctrl+Z has to
    // take one back from anywhere — the toolbar, the sheet, the popover. Inside
    // the editor it is CodeMirror's binding that pops the same stack, so this
    // stays out of the way there rather than popping it twice.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (editorPane?.contains(/** @type {Node | null} */ (e.target))) return
      e.preventDefault()
      if (e.shiftKey) cv.redo()
      else cv.undo()
    }
  }

  /** @param {string} id */
  function setPreset(id) {
    // A preset is a whole set of choices, so taking one drops the overrides
    // that were sitting on the last one — otherwise half of the look you just
    // asked for wouldn't arrive.
    restyle({ layout: id, variants: {} }, `Preset — ${presetOf(id)?.name ?? id}`)
  }

  /**
   * @param {string} slotId
   * @param {string} variantId
   */
  function setVariant(slotId, variantId) {
    const slot = parts.slots.find((s) => s.id === slotId)
    const name = slot?.variants.find((v) => v.id === variantId)?.name ?? variantId
    restyleVariant(slotId, variantId, `${slot?.name ?? slotId} — ${name}`)
  }

  /** Back to the preset's own choices, whichever axes have been moved off it. */
  function resetVariants() {
    restyle({ variants: {} }, 'Blocks — reset')
  }

  /** @param {string} id */
  function setTheme(id) {
    restyle({ theme: id }, `Theme — ${THEMES.find((t) => t.id === id)?.name ?? id}`)
  }

  /** @param {string} id */
  function setFont(id) {
    restyle({ font: id }, `Font — ${FONTS.find((f) => f.id === id)?.name ?? id}`)
  }

  /** Every paper axis, by the key it is stored under — for the history's label. */
  const PAPER_AXES = /** @type {Record<string, { id: string, name: string }[]>} */ ({
    size: PAPER_SIZES,
    orientation: ORIENTATIONS,
    header: RUNNING,
    footer: RUNNING,
  })

  /**
   * Change one thing about the page. Which thing is what the label says, since
   * `Paper — A4` and `Paper — Footer: Page` are the same axis to a reader and
   * different ones to the history.
   * @param {Partial<import('$lib/cv/theme/paper.js').Paper>} patch
   */
  function setPaper(patch) {
    const [key, id] = Object.entries(patch)[0] ?? []
    if (!key || !id) return
    const name = PAPER_AXES[key]?.find((o) => o.id === id)?.name ?? id
    const edge = key === 'header' || key === 'footer' ? `${key[0].toUpperCase()}${key.slice(1)}: ` : ''
    restylePaper(patch, `Paper — ${edge}${name}`)
  }

  /** Scale the preview to the pane, or stop. Not a restyle — see `fitPreview`. */
  function toggleFit() {
    fitPreview = !fitPreview
    write(KEYS.previewFit, String(fitPreview))
  }

  /**
   * The active file's own CSS. Unvalidated by design — it is applied inside the
   * preview frame, where nothing it says can reach the editor around it.
   *
   * The only style that is typed rather than chosen, so its record in the
   * history waits for a pause the way an edit does — see `recordStyle`.
   * @param {string} text
   */
  function setCss(text) {
    restyle({ css: text }, 'Custom CSS', true)
  }

  function toggleTheme() {
    // The sheet sits this out — paper is white — but the frame around it follows.
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    // The attribute is the app's switch; the class is what Radix's own dark
    // scales are scoped under. Set together, always — see tokens.css.
    document.documentElement.classList.toggle('dark', next === 'dark')
    dark = next === 'dark'
    syncThemeColor()
    write(KEYS.theme, next)
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

  /** @param {BeforeInstallPromptEvent} e */
  function onInstallPrompt(e) {
    e.preventDefault() // hold it back; the toolbar button decides when to ask
    installPrompt = e
  }

  function onInstalled() {
    installPrompt = null
  }

  async function installApp() {
    const prompt = installPrompt
    if (!prompt) return
    installPrompt = null // single use, accepted or dismissed
    await prompt.prompt()
  }

  /** @param {'style' | 'history'} which */
  async function toggleSidePanel(which) {
    sidePanel = sidePanel === which ? null : which
    write(KEYS.sidePanel, sidePanel ?? 'none')
    await tick()
  }

  /** @param {boolean} hidden */
  function setSourceHidden(hidden) {
    sourceHidden = hidden
    write(KEYS.sourceHidden, String(hidden))
  }

  function toggleSource() {
    setSourceHidden(!sourceHidden)
  }

  /** Couple the editor to the pointer over the preview, or stop. See `hoverSync`. */
  function toggleHoverSync() {
    hoverSync = !hoverSync
    write(KEYS.hoverSync, String(hoverSync))
    // Whatever the pointer was last on stays marked otherwise, with nothing
    // left to come along and move it.
    if (!hoverSync) clearHover()
  }

  /** Couple the two panes' scrolling, or let each keep its own place. See `scrollSync`. */
  function toggleScrollSync() {
    scrollSync = !scrollSync
    write(KEYS.scrollSync, String(scrollSync))
  }

  /** Open a fresh tab holding the shipped template — no snapshot yet, so `CvDoc` seeds one. */
  function newFile() {
    const id = files.create()
    cv.switchTo(id)
    toast('New CV from template')
  }

  /**
   * Open YAML that came from outside the editor — an OS file association today — as
   * its own tab. Seeded through `switchTo` so the tab's history starts with the
   * imported text rather than the template plus an overwrite.
   * @param {string} filename
   * @param {string} text
   */
  function openImported(filename, text) {
    const id = files.create(filename.replace(/\.(ya?ml)$/i, ''))
    cv.switchTo(id, text)
    toast(`Opened ${files.active?.name ?? filename}`)
  }

  function copyYaml() {
    navigator.clipboard
      .writeText(cv.yaml)
      .then(() => toast('YAML copied to clipboard'))
      .catch(() => toast('Copy failed — try Ctrl+A, Ctrl+C'))
  }

  /** Downloads the active file's YAML source as a `.yaml` file. */
  function saveYaml() {
    const blob = new Blob([cv.yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${files.active?.name ?? 'cv'}.yaml`
    a.click()
    URL.revokeObjectURL(url)
    toast('YAML saved')
  }

  function exportPDF() {
    if (parseError) {
      toast('Fix YAML errors before exporting')
      return
    }
    // Tagged before printing, so the mark in the history sits on exactly the
    // version that goes to the printer.
    cv.markExport()
    // The frame prints itself. Printing the app instead would put the iframe on
    // the page as a box and crop the CV to it, however many pages it wanted.
    if (!frame?.print()) toast("Preview isn't ready yet")
  }

  /** @param {string} id */
  function selectTab(id) {
    if (id === files.activeId) return
    files.switchTo(id)
    cv.switchTo(id)
  }

  function duplicateTab() {
    cv.flush() // capture the latest edits before copying the stored snapshot
    const id = files.duplicate(/** @type {string} */ (files.activeId))
    cv.switchTo(id)
    toast('Tab duplicated')
  }

  /** @param {string} id */
  function closeTab(id) {
    const closingActive = id === files.activeId
    const name = files.files.find((f) => f.id === id)?.name ?? 'File'
    const nextId = files.trash(id)
    if (closingActive) cv.switchTo(nextId)
    toast(`Moved “${name}” to trash`)
  }

  /**
   * @param {string} id
   * @param {string} name
   */
  function renameTab(id, name) {
    files.rename(id, name)
  }

  function toggleTrash() {
    trashOpen = !trashOpen
  }

  /**
   * Open the compare dialog. With nothing named, the newest text is put beside
   * the most likely thing to hold it against: the tab next to this one, or —
   * with only one tab — the version before this one.
   *
   * Opening pushes a history entry carrying the two sides, so Back is a way
   * out, and closing from inside the dialog is the same Back — see `closeCompare`.
   * @param {import('../app').CompareSource} [left]
   * @param {import('../app').CompareSource} [right]
   */
  function openCompare(left, right) {
    const id = files.activeId
    if (!id) return
    /** @type {import('../app').CompareSource} */
    const current = { fileId: id, versionKey: null }
    if (!right) {
      const neighbour = files.open.find((f) => f.id !== id)
      const previous = cv.entries[1]
      right = neighbour ? { fileId: neighbour.id, versionKey: null } : { fileId: id, versionKey: previous?.key ?? null }
    }
    pushState('', { compare: { left: left ?? current, right } })
  }

  /**
   * Close the dialog by going back over the entry that opened it, so the
   * history reads the same whether it was the X or the browser that closed it.
   */
  function closeCompare() {
    if (page.state.compare) history.back()
  }

  /**
   * A version against what is on screen: the version being previewed, if
   * there is one and it isn't this same entry, otherwise what the file says now.
   * @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry
   */
  function compareVersion(entry) {
    const id = /** @type {string} */ (files.activeId)
    const viewed = cv.viewingKey !== null && cv.viewingKey !== entry.key ? cv.viewingKey : null
    openCompare({ fileId: id, versionKey: entry.key }, { fileId: id, versionKey: viewed })
  }

  /** @param {string} id */
  function restoreTab(id) {
    files.restore(id)
    cv.switchTo(id)
    toast('Restored from trash')
  }

  /** @param {string} id */
  function purgeTab(id) {
    if (!confirm('Delete this file forever? This cannot be undone.')) return
    files.purge(id)
    toast('File deleted forever')
  }

  function emptyTrash() {
    if (!files.trashed.length) return
    if (!confirm(`Permanently delete ${files.trashed.length} file(s) from trash? This cannot be undone.`)) return
    for (const f of files.trashed) files.purge(f.id)
    toast('Trash emptied')
  }

  function dismissWelcome() {
    welcomeOpen = false
    write(KEYS.welcomeSeen, 'true')
  }

  /** @param {string} msg */
  function toast(msg) {
    toastMsg = msg
    toastOn = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toastOn = false), 2200)
  }

  /** @param {number} pct */
  function setWidth(pct) {
    editorWidth = `${Math.min(78, Math.max(18, pct))}%`
  }

  /** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
  function startDrag(e) {
    dragging = true
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
  }

  /** @param {PointerEvent} e */
  function onDrag(e) {
    if (!dragging) return
    const rect = split.getBoundingClientRect()
    setWidth(((e.clientX - rect.left) / rect.width) * 100)
  }

  /** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
  function endDrag(e) {
    if (!dragging) return
    dragging = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.classList.remove('resizing')
    if (editorWidth) write(KEYS.editorWidth, editorWidth)
  }

  /** @param {KeyboardEvent} e */
  function onDividerKey(e) {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0
    if (!step) return
    e.preventDefault()
    const current = (split.querySelector('#editor-pane')?.clientWidth ?? 0) / split.clientWidth
    setWidth(current * 100 + step)
    if (editorWidth) write(KEYS.editorWidth, editorWidth)
  }
</script>

<svelte:head>
  <title>Resume Editor</title>
</svelte:head>

<div id="app">
  <Toolbar trashCount={files.trashed.length} {trashOpen} onToggleTrash={toggleTrash} onExport={exportPDF} canInstall={!!installPrompt} onInstall={installApp} />

  <TabBar
    {files}
    onSelect={selectTab}
    onDuplicate={duplicateTab}
    onClose={closeTab}
    onRename={renameTab}
    onNew={newFile}
    onCopy={copyYaml}
    styleOpen={sidePanel === 'style'}
    onToggleStyle={() => toggleSidePanel('style')}
    historyOpen={sidePanel === 'history'}
    historyCount={cv.history.length}
    onToggleHistory={() => toggleSidePanel('history')}
    onCompare={() => openCompare()}
    onSave={saveYaml}
  />

  {#if trashOpen}
    <TrashPanel {files} onRestore={restoreTab} onPurge={purgeTab} onEmpty={emptyTrash} onClose={toggleTrash} />
  {/if}

  <!-- The drag width rides on a custom property rather than the pane's own
	     `width`, so the stacked (narrow-screen) layout can ignore it in CSS. -->
  <div id="split" bind:this={split} style:--editor-w={editorWidth}>
    <div id="editor-pane" bind:this={editorPane} class:hidden={sourceHidden}>
      {#if cv.ready}
        <!-- Re-keyed when the document is swapped (history cleared, or another
				     tab's document taken over): the binding is tied to one LoroDoc. -->
        {#key cv.docId}
          <YamlEditor
            bind:this={editor}
            loroExtensions={cv.extensions}
            readOnly={cv.isViewingHistory}
            diff={cv.diff}
            onScroll={onEditorScroll}
            onEdit={noteEdit}
          />
        {/key}
      {:else}
        <div id="boot">Loading editor…</div>
      {/if}
    </div>

    <button
      type="button"
      id="divider"
      class:hidden={sourceHidden}
      aria-label="Resize editor pane — use the arrow keys"
      onpointerdown={startDrag}
      onpointermove={onDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onkeydown={onDividerKey}
    ></button>

    <div id="preview-pane" bind:this={previewPane}>
      {#if cv.isViewingHistory}
        {@const entry = cv.viewingEntry}
        <div id="detached-banner">
          <span>Viewing “{entry?.message}” — editing is paused</span>
          <div class="t-spacer"></div>
          {#if entry}
            <button class="t-btn" onclick={() => compareVersion(entry)}>Compare</button>
            <button class="t-btn" onclick={() => cv.restore(entry)}>Restore</button>
          {/if}
          <button class="t-btn" onclick={() => cv.viewLatest()}>Back to latest</button>
        </div>
      {:else if bannerError}
        <!-- A part that doesn't compile leaves nothing to render at all. -->
        <div id="error-banner">
          <span>⚠ {bannerError}</span>
        </div>
      {/if}
      <PreviewFrame
        bind:this={frame}
        cv={parsed}
        component={tpl.component}
        templateCss={tpl.css}
        layout={preset}
        {theme}
        {font}
        {css}
        {paper}
        name={cvName}
        fit={fitPreview && desktop}
        {dark}
        onReady={onFrameReady}
      />
    </div>

    <!-- The third column, whichever panel is holding it. -->
    {#if sidePanel === 'style'}
      <StylePicker
        slots={parts.slots}
        {choices}
        {preset}
        modified={isModified(files.active, parts.slots)}
        {theme}
        {font}
        {css}
        onPreset={setPreset}
        onVariant={setVariant}
        onReset={resetVariants}
        onTheme={setTheme}
        onFont={setFont}
        {paper}
        onPaper={setPaper}
        fit={fitPreview}
        fitAvailable={desktop}
        onFit={toggleFit}
        onCss={setCss}
      />
    {:else if sidePanel === 'history' && cv.ready}
      <HistoryPanel doc={cv} {toast} onCompare={compareVersion} />
    {/if}
  </div>

  <StatusBar
    valid={!parseError}
    {saveLabel}
    {sourceHidden}
    {hoverSync}
    {scrollSync}
    updateAvailable={swUpdate.available}
    onToggleSource={toggleSource}
    onToggleHoverSync={toggleHoverSync}
    onToggleScrollSync={toggleScrollSync}
    onToggleTheme={toggleTheme}
    onUpdate={() => swUpdate.applyUpdate()}
  />
</div>

{#if welcomeOpen}
  <WelcomeOverlay onStart={dismissWelcome} />
{/if}

{#if compare && cv.ready}
  <CompareModal doc={cv} {files} left={compare.left} right={compare.right} onClose={closeCompare} />
{/if}

<div id="toast" class:show={toastOn}>{toastMsg}</div>

<style>
  /* ── Split ────────────────────────────────────── */
  #split {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  #editor-pane {
    width: var(--editor-w, 42%);
    min-width: 180px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Step 1, the app-background step, and the same fill CodeMirror's own
	     editor takes — the pane *is* the editor, so a second tone here would
	     only draw a seam through it. The preview canvas beside it is step 3,
	     which is what separates the two in either scheme. */
    background: var(--gray-1);
    transition: var(--theme-fade);
  }

  /* Kept mounted (not removed) so the Loro/CodeMirror binding stays alive —
	   Reset and Restore apply text through it even while it's out of view. */
  #editor-pane.hidden {
    display: none;
  }

  #boot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--gray-11);
  }

  /* ── Divider ──────────────────────────────────── */
  /* A rule that can be dragged rather than a bar that happens to be draggable:
	   at this weight it reads as the seam between two panes, which is what it is. */
  #divider {
    flex-shrink: 0;
    width: 3px;
    background: var(--gray-6);
    cursor: col-resize;
    transition: background 0.08s;
    position: relative;
    border: none;
    padding: 0;
  }

  /* Widens the grab target without widening the line. */
  #divider::after {
    content: '';
    position: absolute;
    inset: 0 -5px;
  }

  #divider:hover {
    background: var(--accent-9);
  }

  #divider.hidden {
    display: none;
  }

  /* ── Preview ──────────────────────────────────── */
  /* A column rather than a scroller: the frame does its own scrolling, so all
	   this pane holds is the banners stacked above it. That also retires the
	   `position: sticky` they used to need to stay put over a moving sheet. */
  #preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--gray-3);
    min-width: 0;
    transition: var(--theme-fade);
  }

  /* Mid-drag the pointer is the divider's, wherever it happens to be. The
	   class is put on <body>, which the compiler can't see from in here. */
  :global(body.resizing) #preview-pane {
    pointer-events: none;
  }

  /* Both banners are the soft container Radix builds out of a hue: step 3 as
	   the fill, step 6 as the rule under it, step 11 as the words. Red for what
	   is wrong, amber for what only wants attention. */
  #error-banner {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: var(--sp-5);
    background: var(--red-3);
    border-bottom: var(--hairline) solid var(--red-6);
    color: var(--red-11);
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    padding: var(--sp-2) var(--sp-6);
    white-space: pre-wrap;
    word-break: break-all;
  }

  #error-banner span {
    flex: 1;
    min-width: 0;
  }

  #detached-banner {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-5);
    background: var(--amber-3);
    border-bottom: var(--hairline) solid var(--amber-6);
    color: var(--amber-11);
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    padding: var(--sp-2) var(--sp-6);
    z-index: 6;
  }

  /* The shared button, restated in the banner's own hue: Radix's *outline*
	   variant, which is a step 7 alpha edge and a step 11 label over whatever is
	   behind it, hovering to the step 3 alpha wash rather than to a fill. */
  #detached-banner .t-btn {
    background: none;
    border: var(--hairline) solid var(--amber-a7);
    color: var(--amber-11);
    padding: var(--sp-1) var(--sp-3);
  }

  #detached-banner .t-btn:hover {
    background: var(--amber-a3);
    border-color: var(--amber-a8);
    color: var(--amber-11);
  }

  /* ── Toast ────────────────────────────────────── */
  #toast {
    position: fixed;
    bottom: calc(var(--bar-status) + var(--sp-5));
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    /* The two ends of the gray scale, swapped over: step 12 as the fill and
	     step 1 as the text. Nothing else in the chrome is drawn that way round,
	     which is what makes a transient message read as laid over the app
	     rather than as part of it. */
    background: var(--gray-12);
    color: var(--gray-1);
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 500;
    padding: var(--sp-3) var(--sp-5);
    border-radius: var(--corner-xs);
    box-shadow: var(--shadow-4);
    opacity: 0;
    transition:
      opacity 0.2s,
      transform 0.2s;
    pointer-events: none;
    z-index: 999;
  }

  #toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  /* ── Narrow screens ───────────────────────────── */
  /* Below roughly an 820px sheet plus a usable editor, the split stops paying
	   for itself side by side and stacks instead: editor over preview, with the
	   history panel lifted out of the flow as an overlay (see HistoryPanel). */
  @media (max-width: 900px) {
    #split {
      flex-direction: column;
    }

    /* The dragged width is a horizontal measure — meaningless once stacked. */
    #editor-pane {
      width: auto;
      min-width: 0;
      height: 45%;
      min-height: 120px;
    }

    #preview-pane {
      min-height: 0;
    }

    /* Resizing is pointer-drag along the wrong axis here; the proportions are fixed. */
    #divider {
      display: none;
    }
  }

  @media (max-width: 640px) {
    #editor-pane {
      height: 50%;
    }
  }
</style>
