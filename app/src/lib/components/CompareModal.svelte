<script>
  import { onMount } from 'svelte'
  import Icon from '@iconify/svelte'
  import IconClose from '@iconify-icons/lucide/x'
  import IconSwap from '@iconify-icons/lucide/arrow-left-right'
  import IconPrev from '@iconify-icons/lucide/chevron-up'
  import IconNext from '@iconify-icons/lucide/chevron-down'
  import { indentUnit, syntaxHighlighting } from '@codemirror/language'
  import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
  import { Decoration, EditorView, WidgetType, drawSelection, lineNumbers } from '@codemirror/view'
  import { wrappedLineIndent } from 'codemirror-wrapped-line-indent'
  import { mapLine } from '@vibe-resume/core/diff'
  import { formatOf, loadEditor } from '$lib/formats'
  import { commands } from '$lib/cv/state/commands'
  import { storedText } from '$lib/cv/state/doc.svelte'
  import { KEYS, read, write } from '$lib/cv/state/storage'
  import { doc, files } from '$lib/cv/state/state.svelte'
  import { diffText } from '$lib/workers/index'
  import { highlight } from './cm-highlight'
  import './codemirror.scss'

  /**
   * One side of the comparison: a file, at a version — or at its newest text,
   * which is `null`. Only the file being edited has versions to offer; any
   * other tab is read as it was last stored.
   * @typedef {{ fileId: string, versionKey: string | null }} SourceRef
   */

  let {
    /** @type {SourceRef} */
    left,
    /** @type {SourceRef} */
    right,
  } = $props()

  /** How long a pane's own scroll events stay ours after we move it ourselves. */
  const SYNC_QUIET_MS = 250

  /**
   * How the dialog is set up, kept between visits. Which kinds of ribbon the
   * gutter draws: additions and removals start hidden, since the panes already
   * show them in place and a CV edited for a while is mostly ribbons for them,
   * which buries the kind only the gutter can show — what an edited line
   * became. Line numbers start off: a CV is read by its sections, not its lines.
   */
  const PREFS = { changesOnly: false, numbered: false, added: false, removed: false, changed: true }

  /** @typedef {keyof typeof PREFS} Pref */

  /** Read over the defaults, so a setting added later takes its own default. */
  function readPrefs() {
    try {
      const saved = JSON.parse(read(KEYS.compare) ?? '{}')
      /** @type {Partial<typeof PREFS>} */
      const out = {}
      for (const key of /** @type {Pref[]} */ (Object.keys(PREFS))) if (typeof saved?.[key] === 'boolean') out[key] = saved[key]
      return out
    } catch {
      return {}
    }
  }

  let prefs = $state({ ...PREFS, ...readPrefs() })

  /** @param {Pref} key */
  function flip(key) {
    prefs[key] = !prefs[key]
    write(KEYS.compare, JSON.stringify(prefs))
  }

  // Starting points only: the pickers own the sides from here, and the dialog
  // is re-created each time it opens, so the props never move underneath.
  // svelte-ignore state_referenced_locally
  let refA = $state(left)
  // svelte-ignore state_referenced_locally
  let refB = $state(right)

  /** Other tabs' text, read once each while the dialog is up. @type {Map<string, string>} */
  const stored = new Map()

  /** @param {SourceRef} ref */
  function resolve(ref) {
    if (ref.fileId === files.activeId) {
      void doc.text // the head moves with every edit; a version never does
      const entry =
        ref.versionKey === null ? undefined : doc.entries.find((/** @type {import('$lib/cv/state/doc.svelte').HistoryEntry} */ e) => e.key === ref.versionKey)
      return entry ? doc.textAt(entry) : doc.headText()
    }
    let text = stored.get(ref.fileId)
    if (text === undefined) {
      text = storedText(ref.fileId) ?? ''
      stored.set(ref.fileId, text)
    }
    return text
  }

  const textA = $derived(resolve(refA))
  const textB = $derived(resolve(refB))

  /** What the dialog shows before the first diff lands: nothing, and nothing to step to. @type {import('@vibe-resume/core/diff').DocDiff} */
  const NO_DIFF = { a: [], b: [], hunks: [], anchors: [], counts: { added: 0, removed: 0, changed: 0 } }

  /**
   * The newest diff, with the two texts it is of. It is worked out in a
   * worker, so it lands a moment after the texts change, and the panes load
   * the texts and their tints together off this rather than the text first.
   */
  let result = $state.raw(/** @type {{ a: string, b: string, diff: import('@vibe-resume/core/diff').DocDiff } | null} */ (null))
  const diff = $derived(result?.diff ?? NO_DIFF)

  $effect(() => {
    const a = textA
    const b = textB
    let wanted = true
    diffText(a, b).then((d) => {
      if (wanted) result = { a, b, diff: d }
    })
    // A newer pair was asked for before this one answered.
    return () => (wanted = false)
  })

  /** Which hunk was last stepped to; −1 before any. */
  let hunkAt = $state(-1)

  let hostA = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  let hostB = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  /** @type {HTMLSelectElement | undefined} */
  let firstControl = $state(undefined)
  let viewA = $state(/** @type {EditorView | null} */ (null))
  let viewB = $state(/** @type {EditorView | null} */ (null))
  /** The diff the views are showing, for the handlers that read it off a click. */
  let current = /** @type {import('@vibe-resume/core/diff').DocDiff | null} */ (null)
  /** Per pane: until when its scroll events are our doing rather than the user's. */
  const quiet = { a: 0, b: 0 }
  /** The gutter between the panes, where each difference is drawn across. @type {SVGSVGElement | undefined} */
  let gutter = $state(undefined)

  /** What one side's lines became. @type {import('@codemirror/state').StateEffectType<import('@vibe-resume/core/diff').LineInfo[]>} */
  const setLines = StateEffect.define()

  const lineMark = {
    added: Decoration.line({ class: 'cm-cmp-added' }),
    removed: Decoration.line({ class: 'cm-cmp-removed' }),
    changed: Decoration.line({ class: 'cm-cmp-changed' }),
  }
  const rangeMark = Decoration.mark({ class: 'cm-cmp-range' })

  /**
   * The tints, as decorations over the document they describe. Built once per
   * load — the text never changes underneath them, so there is nothing to map.
   * @param {import('@codemirror/state').EditorState} state
   * @param {import('@vibe-resume/core/diff').LineInfo[]} infos
   */
  function decorate(state, infos) {
    /** @type {import('@codemirror/state').Range<Decoration>[]} */
    const ranges = []
    const n = Math.min(infos.length, state.doc.lines)
    for (let i = 0; i < n; i++) {
      const info = infos[i]
      const line = state.doc.line(i + 1)
      if (info.kind !== 'same') ranges.push(lineMark[info.kind].range(line.from))
      for (const [from, to] of info.ranges ?? []) {
        if (to > from) ranges.push(rangeMark.range(line.from + from, Math.min(line.from + to, line.to)))
      }
    }
    return Decoration.set(ranges, true)
  }

  /* ── Changes only ────────────────────────────────────────────────────────
	   Runs of lines that are the same on both sides fold away into a marker
	   saying how many there are, keeping a few lines either side of every
	   difference so it can still be read in place. A marker opens on a click.
	   Each pane folds its own lines; the scroll sync reads across the folds
	   the same way it reads across wrapped lines, by the blocks CodeMirror
	   measures. */

  /** Lines kept either side of a difference. */
  const FOLD_CONTEXT = 3
  /** A run shorter than this stays: a marker for two lines saves nothing. */
  const FOLD_MIN = 4

  /** Whether the panes number their lines — `prefs.numbered`. One compartment serves both views. */
  const numbers = new Compartment()
  /** Each pane's language, which is its own file's format. */
  const language = new Compartment()

  /** The folds for one pane, as line ranges. @type {import('@codemirror/state').StateEffectType<[number, number][]>} */
  const setFolds = StateEffect.define()
  /** Open the fold that starts at this position. @type {import('@codemirror/state').StateEffectType<number>} */
  const openFold = StateEffect.define()

  class FoldMarker extends WidgetType {
    /** @param {number} count */
    constructor(count) {
      super()
      this.count = count
    }

    /** @param {FoldMarker} other */
    eq(other) {
      return other.count === this.count
    }

    /** @param {EditorView} view */
    toDOM(view) {
      const el = document.createElement('button')
      el.className = 'cm-cmp-fold'
      el.textContent = `${this.count} unchanged ${this.count === 1 ? 'line' : 'lines'}`
      el.title = 'Show these lines'
      el.addEventListener('click', () => view.dispatch({ effects: openFold.of(view.posAtDOM(el)) }))
      return el
    }
  }

  const foldField = StateField.define({
    create: () => Decoration.none,
    /**
     * @param {import('@codemirror/view').DecorationSet} folds
     * @param {import('@codemirror/state').Transaction} tr
     */
    update(folds, tr) {
      folds = folds.map(tr.changes)
      for (const e of tr.effects) {
        if (e.is(setFolds)) {
          const text = tr.state.doc
          folds = Decoration.set(
            e.value.map(([first, last]) =>
              Decoration.replace({ widget: new FoldMarker(last - first + 1), block: true }).range(text.line(first).from, text.line(last).to),
            ),
          )
        } else if (e.is(openFold)) {
          const at = e.value
          folds = folds.update({ filter: (from, to) => at < from || at > to })
        }
      }
      return folds
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  /**
   * The runs of one side's lines that are nothing but the same, less the
   * context kept around each difference.
   * @param {import('@vibe-resume/core/diff').LineInfo[]} infos
   * @returns {[number, number][]}
   */
  function foldsFor(infos) {
    const keep = new Uint8Array(infos.length)
    infos.forEach((l, i) => {
      if (l.kind === 'same') return
      for (let k = Math.max(0, i - FOLD_CONTEXT); k <= Math.min(infos.length - 1, i + FOLD_CONTEXT); k++) keep[k] = 1
    })
    /** @type {[number, number][]} */
    const runs = []
    for (let i = 0; i < infos.length;) {
      if (keep[i]) {
        i++
        continue
      }
      const from = i
      while (i < infos.length && !keep[i]) i++
      if (i - from >= FOLD_MIN) runs.push([from + 1, i])
    }
    return runs
  }

  const diffField = StateField.define({
    create: () => Decoration.none,
    /**
     * @param {import('@codemirror/view').DecorationSet} deco
     * @param {import('@codemirror/state').Transaction} tr
     */
    update(deco, tr) {
      for (const e of tr.effects) if (e.is(setLines)) return decorate(tr.state, e.value)
      return deco.map(tr.changes)
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  /**
   * A read-only editor for one side. Nothing of the real editor's — no Loro,
   * no lint, no completion — just the language and the colours.
   * @param {HTMLDivElement} host
   * @param {'a' | 'b'} side
   */
  function makeView(host, side) {
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        extensions: [
          numbers.of(prefs.numbered ? lineNumbers() : []),
          drawSelection(),
          EditorView.lineWrapping,
          wrappedLineIndent,
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          language.of([]),
          syntaxHighlighting(highlight),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          diffField,
          foldField,
          EditorView.domEventHandlers({ click: (e, v) => onClick(side, e, v) }),
          // Lines wrap, and are only measured once they are drawn, so where
          // a line sits can move without anything being scrolled.
          EditorView.updateListener.of((u) => {
            if (u.geometryChanged || u.heightChanged || u.viewportChanged) redrawLinks()
          }),
        ],
      }),
    })
    view.scrollDOM.addEventListener(
      'scroll',
      () => {
        redrawLinks()
        onScroll(side)
      },
      { passive: true },
    )
    return view
  }

  onMount(() => {
    const opener = document.activeElement
    if (!hostA || !hostB) return
    viewA = makeView(hostA, 'a')
    viewB = makeView(hostB, 'b')
    firstControl?.focus()
    // Not passive, so the wheel over the gutter scrolls the panes and nothing
    // behind the dialog.
    gutter?.addEventListener('wheel', onGutterWheel, { passive: false })
    return () => {
      cancelAnimationFrame(linkFrame)
      cancelAnimationFrame(flingFrame)
      gutter?.removeEventListener('wheel', onGutterWheel)
      viewA?.destroy()
      viewB?.destroy()
      viewA = viewB = null
      if (opener instanceof HTMLElement) opener.focus()
    }
  })

  // Both sides are reloaded whenever either source changes; the diff is one
  // thing and so is the moment it appears.
  $effect(() => {
    if (!result || !viewA || !viewB) return
    const { a, b, diff: d } = result
    current = d
    load(viewA, a, d.a)
    load(viewB, b, d.b)
    hunkAt = -1
    redrawLinks()
  })

  $effect(() => {
    const ext = prefs.numbered ? lineNumbers() : []
    for (const v of [viewA, viewB]) v?.dispatch({ effects: numbers.reconfigure(ext) })
  })

  // Each side is coloured as the format its file is in.
  $effect(() => {
    for (const [v, ref] of /** @type {const} */ ([
      [viewA, refA],
      [viewB, refB],
    ])) {
      const id = formatOf(files.files.find((f) => f.id === ref.fileId)?.name).id
      if (v) void loadEditor(id).then((ed) => v.dispatch({ effects: language.reconfigure(ed.language()) }))
    }
  })

  // After the load above, so the folds are laid over the text they are of.
  // Turning the option on or off folds again from scratch, which also closes
  // whatever was opened by hand.
  $effect(() => {
    if (!result || !viewA || !viewB) return
    const { diff: d } = result
    viewA.dispatch({ effects: setFolds.of(prefs.changesOnly ? foldsFor(d.a) : []) })
    viewB.dispatch({ effects: setFolds.of(prefs.changesOnly ? foldsFor(d.b) : []) })
  })

  /**
   * @param {EditorView} view
   * @param {string} text
   * @param {import('@vibe-resume/core/diff').LineInfo[]} infos
   */
  function load(view, text, infos) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      effects: setLines.of(infos),
      scrollIntoView: false,
    })
    view.scrollDOM.scrollTop = 0
  }

  /* ── Scroll sync ─────────────────────────────────────────────────────────
	   The two texts differ in length wherever they differ at all, so the other
	   pane can't simply be put at the same offset. The diff's anchors are the
	   converter: every pair of lines it matched is a rung, and a position on
	   one side is read across by interpolating between the two rungs it falls
	   between — the same ladder the editor and the preview share. */

  /** @param {'a' | 'b'} side */
  const hush = (side) => (quiet[side] = performance.now() + SYNC_QUIET_MS)

  /** @param {'a' | 'b'} side */
  const hushed = (side) => performance.now() < quiet[side]

  /** @param {'a' | 'b'} side */
  const other = (side) => (side === 'a' ? 'b' : 'a')

  /** @param {'a' | 'b'} side */
  const viewOf = (side) => (side === 'a' ? viewA : viewB)

  /** @param {'a' | 'b'} side */
  function onScroll(side) {
    const from = viewOf(side)
    const to = viewOf(other(side))
    if (!from || !to || !current || hushed(side)) return
    hush(other(side))
    const edge = scrollEdge(from)
    if (edge) scrollToEdge(to, edge)
    else scrollToLine(to, mapLine(current.anchors, side, topLine(from)))
  }

  /**
   * The document's top edge in the scroller's own coordinates — the constant
   * between what CodeMirror measures line blocks from and what `scrollTop`
   * counts from.
   * @param {EditorView} v
   */
  function docOffset(v) {
    return v.documentTop - v.scrollDOM.getBoundingClientRect().top + v.scrollDOM.scrollTop
  }

  /** The line at the top of the viewport, carried to a fraction through its own block. @param {EditorView} v */
  function topLine(v) {
    const height = Math.max(0, v.scrollDOM.scrollTop - docOffset(v))
    const block = v.lineBlockAtHeight(height)
    const line = v.state.doc.lineAt(block.from).number
    const frac = block.height > 0 ? (height - block.top) / block.height : 0
    return line + Math.min(1, Math.max(0, frac))
  }

  /** Put `line` at the top of the viewport. @param {EditorView} v @param {number} line */
  function scrollToLine(v, line) {
    const text = v.state.doc
    const n = Math.min(Math.max(1, Math.floor(line)), text.lines)
    const block = v.lineBlockAt(text.line(n).from)
    const frac = Math.min(1, Math.max(0, line - n))
    v.scrollDOM.scrollTop = block.top + frac * block.height + docOffset(v)
  }

  /** @param {EditorView} v @returns {'start' | 'end' | null} */
  function scrollEdge(v) {
    const el = v.scrollDOM
    if (el.scrollTop <= 1) return 'start'
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 1 ? 'end' : null
  }

  /** @param {EditorView} v @param {'start' | 'end'} edge */
  function scrollToEdge(v, edge) {
    const el = v.scrollDOM
    el.scrollTop = edge === 'start' ? 0 : el.scrollHeight - el.clientHeight
  }

  /**
   * Bring a line to the middle of a pane. Ours, so the sync sits it out.
   * @param {'a' | 'b'} side
   * @param {number} line
   */
  function centre(side, line) {
    const v = viewOf(side)
    if (!v) return
    const n = Math.min(Math.max(1, Math.round(line)), v.state.doc.lines)
    hush(side)
    v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(n).from, { y: 'center' }) })
  }

  /**
   * A click on a line that has a counterpart brings the counterpart into
   * view: an edited line's other half.
   * @param {'a' | 'b'} side
   * @param {MouseEvent} e
   * @param {EditorView} v
   */
  function onClick(side, e, v) {
    if (!current) return
    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos === null) return
    const line = v.state.doc.lineAt(pos).number
    const info = current[side][line - 1]
    if (!info) return
    if (info.twin !== undefined) centre(other(side), info.twin)
  }

  /* ── The gutter ───────────────────────────────────────────────────────────
	   Every difference is drawn across the gap between the panes as a ribbon
	   from where it is on the left to where it is on the right: a change joins
	   its two halves, and an addition or a removal narrows to the point the
	   other side would have it. Drawn in screen space off the line
	   blocks CodeMirror already measures, so it follows both panes as they
	   scroll; the SVG clips whatever is out of view. */

  /**
   * One ribbon. `a` and `b` are the first line on each side, for bringing the
   * difference into view.
   * @typedef {{ id: string, d: string, kind: 'added' | 'removed' | 'changed', title: string, a: number, b: number }} Link
   */

  /** @type {Link[]} */
  let links = $state([])
  let linkFrame = 0

  /** Redraw on the next frame — scrolling fires faster than it paints. */
  function redrawLinks() {
    if (!linkFrame) linkFrame = requestAnimationFrame(() => ((linkFrame = 0), drawLinks()))
  }

  /**
   * The y of a line in the gutter. A fraction is that far down the line, so a
   * point mapped across from the other side lands between the right two lines.
   * @param {EditorView} v
   * @param {number} line
   * @param {number} top  the gutter's top, on screen
   */
  function yAt(v, line, top) {
    const text = v.state.doc
    const n = Math.min(Math.max(1, Math.floor(line)), text.lines)
    const block = v.lineBlockAt(text.line(n).from)
    return v.documentTop + block.top + Math.min(1, Math.max(0, line - n)) * block.height - top
  }

  /**
   * Top and bottom of a run of lines in the gutter — or, for a side that has
   * none, the point where the other side's first line maps to.
   * @param {EditorView} v
   * @param {[number, number] | null} range
   * @param {() => number} where  the line to point at when there is no range
   * @param {number} top
   * @returns {[number, number]}
   */
  function extent(v, range, where, top) {
    if (!range) {
      const y = yAt(v, where(), top)
      return [y, y]
    }
    const last = Math.min(Math.max(1, range[1]), v.state.doc.lines)
    return [yAt(v, range[0], top), yAt(v, last, top) + v.lineBlockAt(v.state.doc.line(last).from).height]
  }

  /**
   * A ribbon from `[a1, a2]` on the left edge to `[b1, b2]` on the right, the
   * two long sides curving the same way so a band that climbs reads as one.
   * @param {number} w
   * @param {[number, number]} a
   * @param {[number, number]} b
   */
  function ribbon(w, [a1, a2], [b1, b2]) {
    const m = w / 2
    // A point still needs a thickness to be seen.
    if (a2 - a1 < 2) [a1, a2] = [a1 - 1, a1 + 1]
    if (b2 - b1 < 2) [b1, b2] = [b1 - 1, b1 + 1]
    return `M0 ${a1} C${m} ${a1} ${m} ${b1} ${w} ${b1} L${w} ${b2} C${m} ${b2} ${m} ${a2} 0 ${a2} Z`
  }

  /** @param {[number, number] | null} r */
  const lines = (r) => (r ? (r[0] === r[1] ? `line ${r[0]}` : `lines ${r[0]}–${r[1]}`) : '')

  function drawLinks() {
    const d = current
    const w = gutter?.clientWidth ?? 0
    // Stacked, the gutter isn't shown: there is no across to draw.
    if (!gutter || !viewA || !viewB || !d || !w) {
      links = []
      return
    }
    const top = gutter.getBoundingClientRect().top
    /** @type {Link[]} */
    const out = []
    d.hunks.forEach((/** @type {import('@vibe-resume/core/diff').Hunk} */ h, /** @type {number} */ i) => {
      const ya = extent(/** @type {EditorView} */ (viewA), h.a, () => mapLine(d.anchors, 'b', h.b?.[0] ?? 1), top)
      const yb = extent(/** @type {EditorView} */ (viewB), h.b, () => mapLine(d.anchors, 'a', h.a?.[0] ?? 1), top)
      const kind = /** @type {Link['kind']} */ (h.kind)
      const what = kind === 'added' ? `Added — ${lines(h.b)}` : kind === 'removed' ? `Removed — ${lines(h.a)}` : `Changed — ${lines(h.a)} → ${lines(h.b)}`
      out.push({
        id: `h${i}`,
        d: ribbon(w, ya, yb),
        kind,
        title: what,
        a: h.a?.[0] ?? mapLine(d.anchors, 'b', h.b?.[0] ?? 1),
        b: h.b?.[0] ?? mapLine(d.anchors, 'a', h.a?.[0] ?? 1),
      })
    })
    links = out
  }

  /* ── Scrolling the gutter ────────────────────────────────────────────────
	   The gutter scrolls the text the way either pane does — a wheel, or a
	   finger dragged along it — by moving the right-hand pane and letting the
	   sync bring the left one along, exactly as if the right one had been
	   scrolled. A touch only takes over once it has moved, so a tap on a
	   ribbon is still a tap; and a flick carries on after the finger lifts. */

  /** How far a touch has to move before it is a drag rather than a tap. */
  const DRAG_SLOP = 6
  /** Per millisecond, how much of a flick's speed is kept. */
  const FLING_KEEP = 0.995
  /** Below this, in px/ms, a flick has stopped. */
  const FLING_STOP = 0.02

  /** @type {{ id: number, y: number, at: number, speed: number, moved: boolean, travel: number } | null} */
  let drag = null
  let flingFrame = 0

  /** @param {number} by */
  const scrollBy = (by) => {
    if (viewB) viewB.scrollDOM.scrollTop += by
  }

  /** @param {WheelEvent} e */
  function onGutterWheel(e) {
    if (!viewB) return
    e.preventDefault()
    const unit =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE ? viewB.defaultLineHeight : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewB.scrollDOM.clientHeight : 1
    scrollBy(e.deltaY * unit)
  }

  /** @param {PointerEvent} e */
  function onGutterDown(e) {
    // A mouse scrolls with its wheel; dragging one is for selecting.
    if (e.pointerType === 'mouse') return
    cancelAnimationFrame(flingFrame)
    drag = { id: e.pointerId, y: e.clientY, at: performance.now(), speed: 0, moved: false, travel: 0 }
  }

  /** @param {PointerEvent} e */
  function onGutterMove(e) {
    if (!drag || e.pointerId !== drag.id) return
    const dy = drag.y - e.clientY
    const now = performance.now()
    drag.travel += Math.abs(dy)
    if (!drag.moved && drag.travel > DRAG_SLOP) {
      drag.moved = true
      gutter?.setPointerCapture(drag.id)
    }
    if (drag.moved) {
      scrollBy(dy)
      drag.speed = dy / Math.max(1, now - drag.at)
    }
    drag.y = e.clientY
    drag.at = now
  }

  /** @param {PointerEvent} e */
  function onGutterUp(e) {
    if (!drag || e.pointerId !== drag.id) return
    const { moved, speed, at } = drag
    drag = null
    // A finger that stopped before it lifted isn't flicking.
    if (!moved || performance.now() - at > 100) return
    let v = speed
    let last = performance.now()
    const coast = (/** @type {number} */ now) => {
      const dt = now - last
      last = now
      v *= FLING_KEEP ** dt
      if (Math.abs(v) < FLING_STOP) return
      scrollBy(v * dt)
      flingFrame = requestAnimationFrame(coast)
    }
    flingFrame = requestAnimationFrame(coast)
  }

  /** Bring both ends of a ribbon into view. @param {Link} link */
  function follow(link) {
    centre('a', link.a)
    centre('b', link.b)
  }

  /* ── Stepping ─────────────────────────────────────────────────────────── */

  /** @param {1 | -1} by */
  function step(by) {
    const hunks = diff.hunks
    if (!hunks.length) return
    hunkAt = (hunkAt + by + hunks.length) % hunks.length
    const h = hunks[hunkAt]
    // A side with nothing to show is scrolled to where the thing would be.
    centre('a', h.a ? h.a[0] : mapLine(diff.anchors, 'b', /** @type {number} */ (h.b?.[0])))
    centre('b', h.b ? h.b[0] : mapLine(diff.anchors, 'a', /** @type {number} */ (h.a?.[0])))
  }

  function swap() {
    ;[refA, refB] = [refB, refA]
  }

  /**
   * @param {'a' | 'b'} side
   * @param {string} fileId
   */
  function setFile(side, fileId) {
    const ref = { fileId, versionKey: null }
    if (side === 'a') refA = ref
    else refB = ref
  }

  /**
   * @param {'a' | 'b'} side
   * @param {string} key  '' is the newest text
   */
  function setVersion(side, key) {
    const ref = { fileId: side === 'a' ? refA.fileId : refB.fileId, versionKey: key || null }
    if (side === 'a') refA = ref
    else refB = ref
  }

  /* ── The version picker ──────────────────────────────────────────────────
	   Versions are grouped by when they were made — today, yesterday, earlier
	   this week, then a month at a time — and each says its time only as
	   precisely as its group leaves open: "5 min ago" today, a clock time
	   yesterday, a weekday this week, a date before that. */

  /** Ticks so "5 min ago" stays true while the dialog is up. */
  let now = $state(Date.now())

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(id)
  })

  /** @typedef {import('$lib/cv/state/doc.svelte').HistoryEntry} HistoryEntry */

  /** @type {Intl.DateTimeFormatOptions} */
  const clock = { hour: 'numeric', minute: '2-digit' }

  /** Midnight at the start of the day `t` falls in, `days` days on. @param {number} t @param {number} [days] */
  function dayStart(t, days = 0) {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + days)
    return d.getTime()
  }

  /**
   * Which group a version goes in, and how its time reads inside it.
   * @param {HistoryEntry} entry
   * @returns {{ group: string, time: string }}
   */
  function when(entry) {
    if (!entry.timestamp) return { group: 'Undated', time: '' }
    const t = entry.timestamp * 1000
    const d = new Date(t)
    const today = dayStart(now)
    if (t >= today) {
      const mins = Math.max(0, Math.round((now - t) / 60_000))
      const time = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : d.toLocaleTimeString(undefined, clock)
      return { group: 'Today', time }
    }
    if (t >= dayStart(now, -1)) return { group: 'Yesterday', time: d.toLocaleTimeString(undefined, clock) }
    if (t >= dayStart(now, -6)) {
      return { group: 'This week', time: d.toLocaleString(undefined, { weekday: 'long', ...clock }) }
    }
    const thisYear = d.getFullYear() === new Date(now).getFullYear()
    return {
      group: d.toLocaleDateString(undefined, thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' }),
      time: d.toLocaleString(undefined, { month: 'short', day: 'numeric', ...clock }),
    }
  }

  /**
   * The open file's versions, newest first, in runs that share a group. A
   * restyle moves no text, so as a version to compare it is the one before
   * it under another name, and is left out.
   */
  const versionGroups = $derived.by(() => {
    /** @type {{ label: string, items: { entry: HistoryEntry, time: string }[] }[]} */
    const out = []
    for (const entry of doc.entries) {
      if (entry.kind === 'style') continue
      const { group, time } = when(entry)
      const last = out[out.length - 1]
      if (last?.label === group) last.items.push({ entry, time })
      else out.push({ label: group, items: [{ entry, time }] })
    }
    return out
  })

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      commands.closeCompare()
    }
  }

  /**
   * A click on the backdrop closes the dialog — but only one that also *began*
   * there, so a drag that starts inside the card (selecting text, say) and is
   * let go of outside it doesn't.
   */
  let downOnBackdrop = false
</script>

<svelte:window onkeydown={onKeydown} />

<!-- One side's pickers: the file, and — for the file being edited, which is
     the only one whose history is loaded — the version. -->
{#snippet picker(/** @type {'a' | 'b'} */ side, /** @type {SourceRef} */ ref)}
  {@const live = ref.fileId === files.activeId}
  <div class="cmp-pick">
    {#if side === 'a'}
      <select
        class="ds-select compact"
        bind:this={firstControl}
        aria-label="Left document"
        value={ref.fileId}
        onchange={(e) => setFile(side, e.currentTarget.value)}
      >
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}{f.id === files.activeId ? ' (active)' : ''}</option>
        {/each}
      </select>
    {:else}
      <select class="ds-select compact" aria-label="Right document" value={ref.fileId} onchange={(e) => setFile(side, e.currentTarget.value)}>
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}{f.id === files.activeId ? ' (active)' : ''}</option>
        {/each}
      </select>
    {/if}
    <select
      class="ds-select compact"
      aria-label="{side === 'a' ? 'Left' : 'Right'} version"
      value={ref.versionKey ?? ''}
      disabled={!live}
      title={live ? 'Which version of this file' : 'Only the open file has its history loaded'}
      onchange={(e) => setVersion(side, e.currentTarget.value)}
    >
      <option value="">Current</option>
      {#if live && versionGroups.length}
        <!-- Drawn as a rule where the browser supports one in a list, and
             skipped where it doesn't. -->
        <hr />
        {#each versionGroups as group (group.label)}
          <optgroup label={group.label}>
            {#each group.items as { entry, time } (entry.key)}
              <option value={entry.key}>{entry.message}{time ? ` · ${time}` : ''}</option>
            {/each}
          </optgroup>
        {/each}
      {/if}
    </select>
  </div>
{/snippet}

<!-- A switch for one setting. A kind of difference brings its colour, which
     the switch is filled with while on, so the row doubles as the legend; and
     its count, which is the tally the header used to carry. -->
{#snippet toggle(
  /** @type {Pref} */ key,
  /** @type {string} */ label,
  /** @type {string} */ title,
  /** @type {string | null} */ tone = null,
  /** @type {number | null} */ count = null,
)}
  <button class="cmp-switch {tone ?? ''}" role="switch" aria-checked={prefs[key]} {title} onclick={() => flip(key)}>
    <span class="track" aria-hidden="true"></span>
    <span class="label">{label}</span>
    {#if count !== null}<span class="count">{count}</span>{/if}
  </button>
{/snippet}

<!-- The keyboard way out is Escape, on the window above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="compare"
  role="dialog"
  aria-modal="true"
  aria-labelledby="compare-title"
  tabindex="-1"
  onpointerdown={(e) => (downOnBackdrop = e.target === e.currentTarget)}
  onclick={(e) => {
    if (downOnBackdrop && e.target === e.currentTarget) commands.closeCompare()
  }}
>
  <div class="cmp-card">
    <header class="cmp-bar">
      <h2 id="compare-title" class="cmp-title">Compare</h2>

      <!-- Stepping sits in the middle, over the gap the two panes are read
           across, rather than off to one side of them. -->
      <div class="cmp-nav">
        <button class="ds-icon-btn" title="Previous change" aria-label="Previous change" disabled={!diff.hunks.length} onclick={() => step(-1)}>
          <Icon icon={IconPrev} width="16" height="16" />
        </button>
        <span class="cmp-step" aria-live="polite">{diff.hunks.length ? `${hunkAt < 0 ? '–' : hunkAt + 1} / ${diff.hunks.length}` : 'No differences'}</span>
        <button class="ds-icon-btn" title="Next change" aria-label="Next change" disabled={!diff.hunks.length} onclick={() => step(1)}>
          <Icon icon={IconNext} width="16" height="16" />
        </button>
      </div>

      <button class="ds-icon-btn cmp-close" title="Close (Esc)" aria-label="Close" onclick={commands.closeCompare}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </header>

    <div class="cmp-body">
      <div class="cmp-col a">
        {@render picker('a', refA)}
        <div class="cm-host" bind:this={hostA}></div>
      </div>
      <div class="cmp-swap">
        <button class="ds-icon-btn" title="Swap sides" aria-label="Swap sides" onclick={swap}>
          <Icon icon={IconSwap} width="16" height="16" />
        </button>
      </div>
      <svg
        class="cmp-links"
        bind:this={gutter}
        aria-hidden="true"
        onpointerdown={onGutterDown}
        onpointermove={onGutterMove}
        onpointerup={onGutterUp}
        onpointercancel={onGutterUp}
      >
        {#each links.filter((l) => prefs[l.kind]) as link (link.id)}
          <!-- Pointer only: the same jump is a click on either end's lines, and
               the step buttons reach every difference from the keyboard. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <path class="link {link.kind}" d={link.d} onclick={() => follow(link)}><title>{link.title}</title></path>
        {/each}
      </svg>
      <div class="cmp-col b">
        {@render picker('b', refB)}
        <div class="cm-host" bind:this={hostB}></div>
      </div>
    </div>
    <footer class="cmp-foot">
      <!-- What the gutter draws, then how the panes read. -->
      <div class="cmp-switches ribbons" role="group" aria-label="Ribbons">
        {@render toggle('added', 'Added', 'Ribbons for lines added', 'added', diff.counts.added)}
        {@render toggle('removed', 'Removed', 'Ribbons for lines removed', 'removed', diff.counts.removed)}
        {@render toggle('changed', 'Changed', 'Ribbons for lines changed', 'changed', diff.counts.changed)}
      </div>
      <div class="cmp-switches" role="group" aria-label="View">
        {@render toggle('changesOnly', 'Changes only', 'Fold away the lines that are the same on both sides')}
        {@render toggle('numbered', 'Line numbers', 'Number the lines in both panes')}
      </div>
      <div class="ds-spacer"></div>
      <button class="ds-btn primary" onclick={commands.closeCompare}>Done</button>
    </footer>
  </div>
</div>

<style lang="scss">
  #compare {
    position: fixed;
    inset: 0;
    z-index: 1000; /* over the panels (100) and the toast (999) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ds-space-500) var(--ds-space-300);
    background: var(--ds-blanket);
    animation: cmp-fade 200ms var(--ease);
  }

  /* ADS's x-large modal: header, a body that takes the room, a footer. */
  .cmp-card {
    display: flex;
    flex-direction: column;
    width: min(1400px, 100%);
    height: 100%;
    overflow: hidden;
    background: var(--ds-surface-overlay);
    border-radius: var(--ds-radius-large);
    box-shadow: var(--ds-shadow-overlay);
    animation: cmp-rise 300ms var(--ease);
  }

  /* Title, stepping and close as three columns, so the stepping is centred
     on the dialog — over the gutter — whatever the other two measure. */
  .cmp-bar {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--ds-space-150);
    padding: var(--ds-space-300) var(--ds-space-300) var(--ds-space-200);
  }

  .cmp-title {
    margin: 0 var(--ds-space-100) 0 0;
    font: var(--ds-font-heading-medium);
    color: var(--ds-text);
  }

  .cmp-close {
    justify-self: end;
  }

  .cmp-nav {
    display: flex;
    align-items: center;
    gap: var(--ds-space-050);
  }

  .cmp-step {
    min-width: 4em;
    text-align: center;
    font: var(--ds-font-body-small);
    font-variant-numeric: tabular-nums;
    color: var(--ds-text-subtle);
    white-space: nowrap;
  }

  .cmp-switches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-050) var(--ds-space-200);

    & + & {
      padding-left: var(--ds-space-200);
      border-left: var(--ds-border-width) solid var(--ds-border);
    }
  }

  /* ADS's toggle: a pill with a knob that crosses it, filled while on. A
     kind's switch fills with that kind's colour, the one its ribbons and its
     lines are edged in, so the row is the legend as well. */
  .cmp-switch {
    --on: var(--ds-background-brand-bold);
    display: inline-flex;
    align-items: center;
    gap: var(--ds-space-075);
    padding: 0;
    border: none;
    background: none;
    color: var(--ds-text);
    font: var(--ds-font-body-small);
    cursor: pointer;

    &.added {
      --on: var(--ds-border-success);
    }

    &.removed {
      --on: var(--ds-border-danger);
    }

    &.changed {
      --on: var(--ds-border-warning);
    }

    .track {
      position: relative;
      flex-shrink: 0;
      width: 28px;
      height: 16px;
      border-radius: 8px;
      background: var(--ds-background-neutral-bold);
      transition: background-color 120ms var(--ease);

      &::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--ds-surface);
        transition: transform 120ms var(--ease);
      }
    }

    &[aria-checked='true'] .track {
      background: var(--on);

      &::after {
        transform: translateX(12px);
      }
    }

    &:focus-visible {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: 2px;
      border-radius: var(--ds-radius-small);
    }

    .count {
      min-width: 1.5em;
      padding: 0 var(--ds-space-050);
      border-radius: var(--ds-radius-small);
      background: var(--ds-background-neutral);
      color: var(--ds-text-subtle);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cmp-switch .track,
    .cmp-switch .track::after {
      transition: none;
    }
  }

  /* Two panes with a gutter between them: the swap button across from the
     pickers, and under it the ribbons. The panes are subgrids so the gutter's
     two rows are exactly the picker bar and the text. */
  .cmp-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) calc(2 * var(--ds-space-400)) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    margin: 0 var(--ds-space-300);
  }

  .cmp-foot {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-150) var(--ds-space-200);
    padding: var(--ds-space-200) var(--ds-space-300) var(--ds-space-300);
  }

  .cmp-col {
    grid-row: 1 / 3;
    display: grid;
    grid-template-rows: subgrid;
    min-width: 0;
    min-height: 0;
    background: var(--ds-surface);
    border: var(--ds-border-width) solid var(--ds-border);
    border-radius: var(--ds-radius-medium);
    overflow: hidden;

    &.a {
      grid-column: 1;
    }

    &.b {
      grid-column: 3;
    }
  }

  .cmp-swap {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cmp-links {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* A finger dragged here scrolls the panes, by hand — see onGutterMove. */
    touch-action: none;
  }

  /* The tint each kind marks its changed characters with — the lines' own
     wash is too pale to read as a thin band — edged in its border colour. */
  .link {
    cursor: pointer;
    stroke-width: 1;
    transition: fill-opacity 120ms var(--ease);
    fill-opacity: 0.8;

    &:hover {
      fill-opacity: 1;
    }

    &.added {
      fill: var(--cm-diff-add-range);
      stroke: var(--ds-border-success);
    }

    &.removed {
      fill: var(--cm-diff-del-range);
      stroke: var(--ds-border-danger);
    }

    &.changed {
      fill: var(--cm-diff-mod-range);
      stroke: var(--ds-border-warning);
    }
  }

  .cmp-pick {
    flex-shrink: 0;
    display: flex;
    gap: var(--ds-space-100);
    padding: var(--ds-space-100);
    border-bottom: var(--ds-border-width) solid var(--ds-border);
    background: var(--ds-surface-sunken);

    /* The version picker takes what room the file picker leaves. */
    select {
      min-width: 0;
      flex: 1;

      &:first-child {
        flex: 0 1 40%;
      }
    }
  }

  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  @keyframes cmp-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes cmp-rise {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    #compare,
    .cmp-card {
      animation: none;
    }
  }

  /* Stacked: one document over the other, each with its picker over it, so
     which is which is never in doubt while scrolling. */
  @media (max-width: 900px) {
    .cmp-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto auto minmax(0, 1fr);
    }

    .cmp-col.a {
      grid-column: 1;
      grid-row: 1 / 3;
    }

    .cmp-col.b {
      grid-column: 1;
      grid-row: 4 / 6;
    }

    /* Between the two, and turned to point at them. */
    .cmp-swap {
      grid-column: 1;
      grid-row: 3;
      padding: var(--ds-space-050) 0;

      :global(svg) {
        transform: rotate(90deg);
      }
    }

    /* No gutter, so nothing for the ribbon switches to switch. */
    .cmp-links,
    .cmp-switches.ribbons {
      display: none;
    }

    .cmp-switches + .cmp-switches {
      padding-left: 0;
      border-left: none;
    }
  }

  /* A phone: the dialog is the screen. */
  @media (max-width: 640px) {
    #compare {
      padding: 0;
    }

    .cmp-card {
      border-radius: 0;
    }

    .cmp-bar,
    .cmp-foot {
      padding: var(--ds-space-150);
    }

    .cmp-body {
      margin: 0;
    }

    .cmp-col {
      border-radius: 0;
      border-left: none;
      border-right: none;
    }
  }
</style>
