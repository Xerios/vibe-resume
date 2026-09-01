<script>
  import { onMount, tick } from 'svelte'
  import { base } from '$app/paths'
  import BlockPicker from '$lib/components/BlockPicker.svelte'
  import HistoryPanel from '$lib/components/HistoryPanel.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import TabBar from '$lib/components/TabBar.svelte'
  import Toolbar from '$lib/components/Toolbar.svelte'
  import TrashPanel from '$lib/components/TrashPanel.svelte'
  import WelcomeOverlay from '$lib/components/WelcomeOverlay.svelte'
  import YamlEditor from '$lib/components/YamlEditor.svelte'
  import PreviewFrame from '$lib/cv/PreviewFrame.svelte'
  import { isModified, resolvePreset } from '$lib/cv/compositions.js'
  import { resolveFont } from '$lib/cv/fonts.js'
  import { liveTemplate } from '$lib/cv/live-template.svelte.js'
  import { resolveTheme } from '$lib/cv/presets.js'
  import { parseCv } from '$lib/cv/render.js'
  import { doc as cv, files, flush, parts, start } from '$lib/cv/state.svelte.js'
  import { KEYS, read, write } from '$lib/cv/storage.js'

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
  /** How long the block picker survives the pointer leaving the sheet, so it can be reached. */
  const PICKER_GRACE_MS = 140
  /** How long a new block has to hold the pointer before the card moves to it. */
  const PICKER_SETTLE_MS = 260
  /** How often the pointer's travel is sampled, and how far it has to go to count as travelling. */
  const POINTER_SAMPLE_MS = 70
  const POINTER_TRAVEL_PX = 4
  /** How stale a sample can be and still describe where the pointer is going. */
  const POINTER_IDLE_MS = 150
  /** How far off the pane's own edges the block picker keeps. */
  const PICKER_GAP = 8
  /** Below this much room underneath it, the block picker grows upward instead. */
  const PICKER_FLIP_AT = 170

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
  let historyOpen = $state(read(KEYS.historyOpen) !== 'false')
  let sourceHidden = $state(read(KEYS.sourceHidden) === 'true')
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
  /**
   * The block picker: which slots it offers, and where it sits in the preview
   * pane. Null when the pointer is nowhere near the sheet.
   */
  let picker = $state(/** @type {{ rows: string[], y: number, side: 'left' | 'right', flip: boolean } | null} */ (null))
  /** The preview element it is anchored to, so a scroll can move it along. */
  let pickerEl = /** @type {Element | null} */ (null)
  /** Whether the pointer is on the card itself, which is what keeps it up. */
  let pickerHeld = false
  /** The block the card will move to once the pointer settles — see `showPicker`. */
  let pendingEl = /** @type {Element | null} */ (null)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let pickerTimer
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let anchorTimer
  /* Where the pointer was last sampled inside the frame, and how far it has
	   travelled sideways since — which is how "is it on its way to the card"
	   gets answered. Sampled rather than taken per event: one mousemove moves it
	   a pixel or two, and the sign of that is noise. */
  let pointerX = 0
  let pointerDx = 0
  let pointerSampledAt = 0
  let pointerMovedAt = 0
  let dragging = false
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer
  let trashOpen = $state(false)
  /** The browser's deferred install prompt, held until the user asks for it. */
  let installPrompt = $state(/** @type {BeforeInstallPromptEvent | null} */ (null))

  /** Presentation of the active file, defaulted here so the rest can assume a valid id. */
  const preset = $derived(resolvePreset(files.active?.layout))
  const theme = $derived(resolveTheme(files.active?.theme))
  const font = $derived(resolveFont(files.active?.font))
  const css = $derived(files.active?.css ?? '')

  /* Which variant fills each slot: the preset's choices with the file's own on
	   top, and then the component those compose to. Composing is cheap — it is
	   string work over sources already in memory — so it can sit on the reactive
	   graph beside everything else. */
  const choices = $derived(parts.composition(files.active))
  const composed = $derived(parts.compose(choices))

  /* The sheet's component, kept compiled. The id is the composition rather than
	   one template's: changing a variant is a choice and shouldn't sit out the
	   debounce meant for someone typing a part's source on the other page. */
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

    // Storage that survives eviction pressure: an offline editor that loses the CV
    // it was holding is not much of one. An installed PWA is usually granted this
    // silently; elsewhere it may prompt or be refused, and either is fine.
    void navigator.storage?.persist?.()

    // An installed copy is registered for .yaml/.yml, and files opened from the OS
    // arrive through here rather than as a navigation.
    window.launchQueue?.setConsumer(async ({ files: handles }) => {
      for (const handle of handles) {
        const file = await handle.getFile()
        openImported(file.name, await file.text())
      }
    })

    window.addEventListener('beforeunload', flush)
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
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
      repositionPicker()
    })
    resize.observe(previewPane)
    reflow = resize

    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
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
    doc.addEventListener('mousemove', onPreviewMove, { passive: true })
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
      doc.removeEventListener('mousemove', onPreviewMove)
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
    showPicker(asElement(e.target)?.closest('[data-slot]') ?? null)
    const hit = srcTarget(e)
    if (hit?.el === hoverEl) return
    markHover(hit?.el ?? null)
    if (hit?.line && !sourceHidden) {
      // Its own scroll, not one to mirror back into the preview.
      editor?.revealLine(hit.line)
      hush('editor')
    }
  }

  function onPreviewLeave() {
    markHover(null)
    editor?.clearPeek()
    hidePickerSoon()
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

  /* ── Preview → variants ────────────────────────────────────────────────────
	   The other thing every element in the sheet carries is `data-slot`, naming
	   the block it was rendered by. Hovering one floats a card beside it with a
	   row per slot in the chain, so the variations of whatever is under the
	   pointer — and of everything containing it — are a click away. */

  /**
   * The slots an element belongs to, innermost first. Walked rather than read
   * off the element itself: the pointer lands on a stack line, and Entry and
   * Page are just as much what it is part of.
   * @param {Element} el
   * @returns {string[]}
   */
  function slotChain(el) {
    /** @type {string[]} */
    const out = []
    for (let node = /** @type {Element | null} */ (el); node && node !== cvRoot; node = node.parentElement) {
      const slot = node.getAttribute('data-slot')
      if (slot && !out.includes(slot)) out.push(slot)
    }
    // Density has no element of its own to hang off — it is the page's other
    // axis, so it rides along at the foot of the chain.
    if (out.includes('page')) out.push('density')
    return out
  }

  /**
   * Where the card goes for a given block: level with it, in whichever gutter
   * beside the sheet is wider.
   *
   * Rects measured inside the frame are in the frame's viewport, so they cross
   * to ours through the iframe's own box. Only the vertical offset is taken
   * from the block — the card sits against a pane edge rather than against the
   * block's, which is what keeps it on screen whatever it turns out to be as
   * wide as, and stops it sliding about as the pointer crosses blocks.
   * @param {Element} el
   */
  function placePicker(el) {
    const frameBox = frame?.rect()
    if (!frameBox || !previewPane || !cvRoot) return null
    const pane = previewPane.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const sheet = (cvRoot.querySelector('.sheet') ?? cvRoot).getBoundingClientRect()
    const gutterLeft = sheet.left + frameBox.left - pane.left
    const gutterRight = pane.width - (sheet.right + frameBox.left - pane.left)
    // Clamped, so a block scrolled half off either end still gets a card that
    // is on screen and beside it rather than past the pane.
    const y = Math.max(PICKER_GAP, Math.min(box.top + frameBox.top - pane.top, pane.height - PICKER_GAP))
    return {
      side: /** @type {'left' | 'right'} */ (gutterLeft > gutterRight ? 'left' : 'right'),
      y,
      // Low on the pane, the card grows up from here instead of down off it.
      // The threshold is deliberately generous: the tallest card is four rows.
      flip: y > pane.height - PICKER_FLIP_AT,
    }
  }

  /**
   * A block wants the card. Whether it gets it is the whole of the problem
   * below.
   * @param {Element | null} el
   */
  function showPicker(el) {
    if (pickerHeld) return // the pointer is on the card; it isn't in the frame at all
    clearTimeout(pickerTimer)
    if (!el) return hidePickerSoon()
    if (el === pickerEl) return cancelPending() // already showing this one

    // The first appearance is immediate — there is nothing on screen yet to
    // move out from under anyone. After that the card holds still until the
    // pointer settles: reaching it means crossing the blocks between here and
    // there, and following each of those in turn is what made it unreachable.
    if (!picker) return anchorPicker(el)
    pendingEl = el
    clearTimeout(anchorTimer)
    anchorTimer = setTimeout(settlePicker, PICKER_SETTLE_MS)
  }

  /**
   * The pointer has been on one block long enough to mean it — unless it is
   * still travelling toward the card, in which case the blocks under it are
   * scenery on the way and it can wait a little longer.
   */
  function settlePicker() {
    if (pickerHeld || !pendingEl) return
    if (headingForPicker()) {
      anchorTimer = setTimeout(settlePicker, PICKER_SETTLE_MS)
      return
    }
    anchorPicker(pendingEl)
  }

  /** @param {Element} el */
  function anchorPicker(el) {
    const at = placePicker(el)
    if (!at) return
    cancelPending()
    pickerEl = el
    picker = { rows: slotChain(el), ...at }
  }

  /**
   * Whether the pointer is on its way to the card: moving, and moving toward
   * the side it is pinned to. A pointer that has stopped is not on its way
   * anywhere, so dwelling anywhere — including the sheet's own margin, which
   * is one big block — hands the card over as it should.
   */
  function headingForPicker() {
    if (!picker || performance.now() - pointerMovedAt > POINTER_IDLE_MS) return false
    return picker.side === 'right' ? pointerDx > POINTER_TRAVEL_PX : pointerDx < -POINTER_TRAVEL_PX
  }

  function cancelPending() {
    clearTimeout(anchorTimer)
    pendingEl = null
  }

  /** Long enough to cross the gap onto the card, short enough not to linger. */
  function hidePickerSoon() {
    clearTimeout(pickerTimer)
    // Whatever the pointer crossed on its way out is not what it was aiming at.
    cancelPending()
    pickerTimer = setTimeout(() => {
      if (pickerHeld) return
      picker = null
      pickerEl = null
    }, PICKER_GRACE_MS)
  }

  /** @param {boolean} inside */
  function onPickerHover(inside) {
    pickerHeld = inside
    if (inside) {
      clearTimeout(pickerTimer)
      cancelPending()
    } else hidePickerSoon()
  }

  /**
   * Sample the pointer's sideways travel. Every mousemove would be a reading of
   * one or two pixels, whose sign says nothing; over `POINTER_SAMPLE_MS` it
   * says which way the pointer is going.
   * @param {MouseEvent} e
   */
  function onPreviewMove(e) {
    const now = performance.now()
    pointerMovedAt = now
    if (now - pointerSampledAt < POINTER_SAMPLE_MS) return
    pointerDx = e.clientX - pointerX
    pointerX = e.clientX
    pointerSampledAt = now
  }

  /**
   * Follow the block it is anchored to. A recompile replaces that element, so
   * the card keeps its last position until the pointer re-anchors it — which is
   * what stops it jumping away from under a click on its own arrows.
   */
  function repositionPicker() {
    if (!picker || !pickerEl?.isConnected) return
    const at = placePicker(pickerEl)
    if (at) picker = { ...picker, ...at }
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
    // The card is anchored to a block in a document that just moved under it.
    repositionPicker()
    if (scrollMaster !== 'preview' || hushed('preview') || !ladderReady()) return
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
    if (scrollMaster !== 'editor' || hushed('editor') || !ladderReady()) return
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
  }

  /** @param {string} id */
  function setPreset(id) {
    // A preset is a whole set of choices, so taking one drops the overrides
    // that were sitting on the last one — otherwise half of the look you just
    // asked for wouldn't arrive.
    if (files.activeId) files.setStyle(files.activeId, { layout: id, variants: {} })
  }

  /**
   * @param {string} slotId
   * @param {string} variantId
   */
  function setVariant(slotId, variantId) {
    if (files.activeId) files.setVariant(files.activeId, slotId, variantId)
  }

  /** Back to the preset's own choices, whichever axes have been moved off it. */
  function resetVariants() {
    if (files.activeId) files.setStyle(files.activeId, { variants: {} })
  }

  /** @param {string} id */
  function setTheme(id) {
    if (files.activeId) files.setStyle(files.activeId, { theme: id })
  }

  /** @param {string} id */
  function setFont(id) {
    if (files.activeId) files.setStyle(files.activeId, { font: id })
  }

  /**
   * The active file's own CSS. Unvalidated by design — it is applied inside the
   * preview frame, where nothing it says can reach the editor around it.
   * @param {string} text
   */
  function setCss(text) {
    if (files.activeId) files.setStyle(files.activeId, { css: text })
  }

  function toggleTheme() {
    // The preview sits this out: the sheet is paper, and paper is white.
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    syncThemeColor()
    write(KEYS.theme, next)
  }

  /**
   * Keep an installed window's titlebar on the colour of the toolbar beneath it.
   * Read from the token rather than repeated as a literal — app.html has to spell
   * the two values out only because it runs before the stylesheet lands.
   */
  function syncThemeColor() {
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    if (!paper) return
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper)
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

  async function toggleHistory() {
    historyOpen = !historyOpen
    write(KEYS.historyOpen, String(historyOpen))
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
  <Toolbar
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
    onCss={setCss}
    onExport={exportPDF}
    canInstall={!!installPrompt}
    onInstall={installApp}
  />

  <TabBar
    {files}
    onSelect={selectTab}
    onDuplicate={duplicateTab}
    onClose={closeTab}
    onRename={renameTab}
    {trashOpen}
    onToggleTrash={toggleTrash}
    onNew={newFile}
    onCopy={copyYaml}
    {historyOpen}
    historyCount={cv.history.length}
    onToggleHistory={toggleHistory}
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
            <button class="t-btn" onclick={() => cv.restore(entry)}>Restore</button>
          {/if}
          <button class="t-btn" onclick={() => cv.viewLatest()}>Back to latest</button>
        </div>
      {:else if bannerError}
        <!-- A template that doesn't compile leaves nothing to render at all,
				     and it isn't edited on this page — so the banner carries the way
				     to where it is. -->
        <div id="error-banner">
          <span>⚠ {bannerError}</span>
          {#if tpl.error && !parseError}
            <a href="{base}/template">Open template →</a>
          {/if}
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
        onReady={onFrameReady}
      />

      <!-- Over the frame rather than in it: the sheet is a document of its own,
			     and one that has to print exactly what it shows. -->
      {#if picker}
        <BlockPicker
          rows={picker.rows}
          slots={parts.slots}
          {choices}
          y={picker.y}
          side={picker.side}
          flip={picker.flip}
          onPick={setVariant}
          onHover={onPickerHover}
        />
      {/if}
    </div>

    {#if historyOpen && cv.ready}
      <HistoryPanel doc={cv} {toast} />
    {/if}
  </div>

  <StatusBar valid={!parseError} {saveLabel} {sourceHidden} onToggleSource={toggleSource} onToggleTheme={toggleTheme} />
</div>

{#if welcomeOpen}
  <WelcomeOverlay onStart={dismissWelcome} />
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
    background: var(--editor-bg);
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
    font-size: 11px;
    color: var(--faint);
  }

  /* ── Divider ──────────────────────────────────── */
  #divider {
    flex-shrink: 0;
    width: 5px;
    background: var(--line);
    cursor: col-resize;
    transition: background 0.12s;
    position: relative;
    border: none;
    padding: 0;
  }

  /* Widens the grab target without widening the line. */
  #divider::after {
    content: '';
    position: absolute;
    inset: 0 -4px;
  }

  #divider:hover {
    background: var(--accent);
  }

  #divider.hidden {
    display: none;
  }

  /* ── Preview ──────────────────────────────────── */
  /* A column rather than a scroller: the frame does its own scrolling, so all
	   this pane holds is the banners stacked above it. That also retires the
	   `position: sticky` they used to need to stay put over a moving sheet. */
  #preview-pane {
    position: relative; /* the block picker floats in here, over the frame */
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
    min-width: 0;
    transition: var(--theme-fade);
  }

  /* Mid-drag the pointer is the divider's, wherever it happens to be. The
	   class is put on <body>, which the compiler can't see from in here. */
  :global(body.resizing) #preview-pane {
    pointer-events: none;
  }

  #error-banner {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 12px;
    background: #fff0f0;
    border-bottom: 1px solid #fecaca;
    color: var(--danger);
    font-family: var(--mono);
    font-size: 11px;
    padding: 7px 24px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  #error-banner span {
    flex: 1;
    min-width: 0;
  }

  #error-banner a {
    flex-shrink: 0;
    color: inherit;
    font-weight: 600;
    white-space: nowrap;
    z-index: 5;
    transition: var(--theme-fade);
  }

  /* A tint with no token of its own — the red foreground comes from --danger. */
  :root[data-theme='dark'] #error-banner {
    background: #2a0808;
    border-bottom-color: #5a1818;
  }

  #detached-banner {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--prompt-bg);
    border-bottom: 1px solid var(--prompt);
    color: var(--prompt);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    padding: 7px 24px;
    z-index: 6;
  }

  /* The shared button, restated in the banner's own colour. */
  #detached-banner .t-btn {
    border-color: var(--prompt);
    color: var(--prompt);
    padding: 3px 9px;
  }

  #detached-banner .t-btn:hover {
    background: var(--prompt);
    color: var(--prompt-bg);
  }

  /* ── Toast ────────────────────────────────────── */
  #toast {
    position: fixed;
    bottom: 38px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: var(--accent-deep);
    color: var(--on-accent);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 7px 16px;
    border-radius: 5px;
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
