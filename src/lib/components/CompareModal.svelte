<script>
  import { onMount } from 'svelte'
  import Icon from '@iconify/svelte'
  import IconClose from '@iconify-icons/lucide/x'
  import IconSwap from '@iconify-icons/lucide/arrow-left-right'
  import IconPrev from '@iconify-icons/lucide/chevron-up'
  import IconNext from '@iconify-icons/lucide/chevron-down'
  import { indentUnit, syntaxHighlighting } from '@codemirror/language'
  import { EditorState, StateEffect, StateField } from '@codemirror/state'
  import { Decoration, EditorView, drawSelection, lineNumbers } from '@codemirror/view'
  import { wrappedLineIndent } from 'codemirror-wrapped-line-indent'
  import { diffDocuments, mapLine } from '$lib/cv/format/diff.js'
  import { relaxedYaml } from '$lib/cv/format/relaxed-yaml-mode.js'
  import { storedText } from '$lib/cv/state/doc.svelte.js'
  import { highlight } from './cm-highlight.js'
  import './codemirror.css'

  /**
   * One side of the comparison: a file, at a version — or at its newest text,
   * which is `null`. Only the file being edited has versions to offer; any
   * other tab is read as it was last stored.
   * @typedef {{ fileId: string, versionKey: string | null }} SourceRef
   */

  let {
    /** @type {import('$lib/cv/state/doc.svelte.js').CvDoc} */
    doc,
    /** @type {import('$lib/cv/state/files.svelte.js').FileManager} */
    files,
    /** @type {SourceRef} */
    left,
    /** @type {SourceRef} */
    right,
    /** @type {() => void} */
    onClose,
  } = $props()

  /** How long a pane's own scroll events stay ours after we move it ourselves. */
  const SYNC_QUIET_MS = 250

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
      void doc.yaml // the head moves with every edit; a version never does
      const entry =
        ref.versionKey === null
          ? undefined
          : doc.entries.find((/** @type {import('$lib/cv/state/doc.svelte.js').HistoryEntry} */ e) => e.key === ref.versionKey)
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
  const diff = $derived(diffDocuments(textA, textB))

  /** Which hunk was last stepped to; −1 before any. */
  let hunkAt = $state(-1)

  let hostA = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  let hostB = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  /** @type {HTMLSelectElement | undefined} */
  let firstControl = $state(undefined)
  let viewA = $state(/** @type {EditorView | null} */ (null))
  let viewB = $state(/** @type {EditorView | null} */ (null))
  /** The diff the views are showing, for the handlers that read it off a click. */
  let current = /** @type {import('$lib/cv/format/diff.js').DocDiff | null} */ (null)
  /** Per pane: until when its scroll events are our doing rather than the user's. */
  const quiet = { a: 0, b: 0 }

  /** What one side's lines became. @type {import('@codemirror/state').StateEffectType<import('$lib/cv/format/diff.js').LineInfo[]>} */
  const setLines = StateEffect.define()

  const lineMark = {
    added: Decoration.line({ class: 'cm-cmp-added' }),
    removed: Decoration.line({ class: 'cm-cmp-removed' }),
    changed: Decoration.line({ class: 'cm-cmp-changed' }),
    moved: Decoration.line({ class: 'cm-cmp-moved' }),
  }
  const rangeMark = Decoration.mark({ class: 'cm-cmp-range' })

  /**
   * The tints, as decorations over the document they describe. Built once per
   * load — the text never changes underneath them, so there is nothing to map.
   * @param {import('@codemirror/state').EditorState} state
   * @param {import('$lib/cv/format/diff.js').LineInfo[]} infos
   */
  function decorate(state, infos) {
    /** @type {import('@codemirror/state').Range<Decoration>[]} */
    const ranges = []
    const n = Math.min(infos.length, state.doc.lines)
    for (let i = 0; i < n; i++) {
      const info = infos[i]
      const line = state.doc.line(i + 1)
      if (info.move !== undefined) ranges.push(lineMark.moved.range(line.from))
      if (info.kind !== 'same') ranges.push(lineMark[info.kind].range(line.from))
      for (const [from, to] of info.ranges ?? []) {
        if (to > from) ranges.push(rangeMark.range(line.from + from, Math.min(line.from + to, line.to)))
      }
    }
    return Decoration.set(ranges, true)
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
          lineNumbers(),
          drawSelection(),
          EditorView.lineWrapping,
          wrappedLineIndent,
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          relaxedYaml(),
          syntaxHighlighting(highlight),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          diffField,
          EditorView.domEventHandlers({ click: (e, v) => onClick(side, e, v) }),
        ],
      }),
    })
    view.scrollDOM.addEventListener('scroll', () => onScroll(side), { passive: true })
    return view
  }

  onMount(() => {
    const opener = document.activeElement
    if (!hostA || !hostB) return
    viewA = makeView(hostA, 'a')
    viewB = makeView(hostB, 'b')
    firstControl?.focus()
    return () => {
      viewA?.destroy()
      viewB?.destroy()
      viewA = viewB = null
      if (opener instanceof HTMLElement) opener.focus()
    }
  })

  // Both sides are reloaded whenever either source changes; the diff is one
  // thing and so is the moment it appears.
  $effect(() => {
    const d = diff
    const a = textA
    const b = textB
    if (!viewA || !viewB) return
    current = d
    load(viewA, a, d.a)
    load(viewB, b, d.b)
    hunkAt = -1
  })

  /**
   * @param {EditorView} view
   * @param {string} text
   * @param {import('$lib/cv/format/diff.js').LineInfo[]} infos
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
   * view: an edited line's other half, or the far end of a moved block.
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
    else if (info.move !== undefined) {
      const move = current.moves.find((m) => m.id === info.move)
      if (move) centre(other(side), move[other(side)][0])
    }
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

  /** @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry */
  function when(entry) {
    if (!entry.timestamp) return ''
    return new Date(entry.timestamp * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- One side's pickers: the file, and — for the file being edited, which is
     the only one whose history is loaded — the version. -->
{#snippet picker(/** @type {'a' | 'b'} */ side, /** @type {SourceRef} */ ref)}
  {@const live = ref.fileId === files.activeId}
  <div class="cmp-pick">
    {#if side === 'a'}
      <select bind:this={firstControl} aria-label="Left document" value={ref.fileId} onchange={(e) => setFile(side, e.currentTarget.value)}>
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    {:else}
      <select aria-label="Right document" value={ref.fileId} onchange={(e) => setFile(side, e.currentTarget.value)}>
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    {/if}
    <select
      aria-label="{side === 'a' ? 'Left' : 'Right'} version"
      value={ref.versionKey ?? ''}
      disabled={!live}
      title={live ? 'Which version of this file' : 'Only the open file has its history loaded'}
      onchange={(e) => setVersion(side, e.currentTarget.value)}
    >
      <option value="">Current</option>
      {#if live}
        {#each doc.entries as entry (entry.key)}
          <option value={entry.key}>{entry.message} · {when(entry)}</option>
        {/each}
      {/if}
    </select>
  </div>
{/snippet}

<div id="compare" role="dialog" aria-modal="true" aria-labelledby="compare-title">
  <div class="cmp-card">
    <div class="cmp-bar">
      <span id="compare-title" class="cmp-title">Compare</span>

      <!-- The tally doubles as the legend: each figure is set in the wash its
			     lines are drawn with. -->
      <span class="cmp-counts" aria-live="polite">
        <span class="c-add" title="Lines added">+{diff.counts.added}</span>
        <span class="c-del" title="Lines removed">−{diff.counts.removed}</span>
        <span class="c-mod" title="Lines changed">~{diff.counts.changed}</span>
        <span class="c-mov" title="Blocks moved">↕{diff.counts.moved}</span>
      </span>

      <div class="t-spacer"></div>

      <span class="cmp-step">{diff.hunks.length ? `${hunkAt < 0 ? '–' : hunkAt + 1} / ${diff.hunks.length}` : 'No differences'}</span>
      <button class="t-btn" title="Previous change" aria-label="Previous change" disabled={!diff.hunks.length} onclick={() => step(-1)}>
        <Icon icon={IconPrev} width="12" height="12" />
      </button>
      <button class="t-btn" title="Next change" aria-label="Next change" disabled={!diff.hunks.length} onclick={() => step(1)}>
        <Icon icon={IconNext} width="12" height="12" />
      </button>
      <button class="t-btn" title="Swap sides" aria-label="Swap sides" onclick={swap}>
        <Icon icon={IconSwap} width="12" height="12" />
      </button>
      <button class="t-btn" title="Close (Esc)" aria-label="Close" onclick={onClose}>
        <Icon icon={IconClose} width="12" height="12" />
      </button>
    </div>

    <div class="cmp-body">
      <div class="cmp-col">
        {@render picker('a', refA)}
        <div class="cm-host" bind:this={hostA}></div>
      </div>
      <div class="cmp-col">
        {@render picker('b', refB)}
        <div class="cm-host" bind:this={hostB}></div>
      </div>
    </div>
  </div>
</div>

<style>
  #compare {
    position: fixed;
    inset: 0;
    z-index: 1000; /* over the panels (100) and the toast (999) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-6);
    background: var(--overlay);
    backdrop-filter: blur(2px);
    animation: cmp-fade 0.2s ease;
  }

  .cmp-card {
    display: flex;
    flex-direction: column;
    width: min(1400px, 100%);
    height: min(92vh, 100%);
    overflow: hidden;
    background: var(--gray-2);
    border-radius: var(--corner-md);
    box-shadow: var(--shadow-6);
    animation: cmp-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cmp-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: var(--bar-tool);
    padding: 0 var(--sp-4);
    border-bottom: var(--hairline) solid var(--gray-6);
  }

  .cmp-title {
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
  }

  .cmp-counts {
    display: flex;
    gap: var(--sp-3);
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .c-add {
    color: var(--stat-add);
  }

  .c-del {
    color: var(--stat-del);
  }

  .c-mod {
    color: var(--amber-11);
  }

  .c-mov {
    color: var(--blue-11);
  }

  .cmp-step {
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-variant-numeric: tabular-nums;
    color: var(--gray-11);
    white-space: nowrap;
  }

  .cmp-bar .t-btn {
    padding: var(--sp-1) var(--sp-2);
  }

  .cmp-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .cmp-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .cmp-col + .cmp-col {
    border-left: var(--hairline) solid var(--gray-6);
  }

  .cmp-pick {
    flex-shrink: 0;
    display: flex;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: var(--hairline) solid var(--gray-6);
  }

  /* A field is an interactive element, so its edge is step 7. The version
	   picker takes what room the file picker leaves. */
  .cmp-pick select {
    min-width: 0;
    flex: 1;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    color: var(--gray-12);
    background: var(--gray-1);
    border: var(--hairline) solid var(--gray-7);
    border-radius: var(--corner-xs);
    padding: var(--sp-1) var(--sp-2);
  }

  .cmp-pick select:first-child {
    flex: 0 1 40%;
  }

  .cmp-pick select:focus {
    outline: none;
    border-color: var(--accent-8);
  }

  .cmp-pick select:disabled {
    opacity: 0.5;
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
      transform: translateY(10px);
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
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .cmp-col + .cmp-col {
      border-left: none;
      border-top: var(--hairline) solid var(--gray-6);
    }
  }

  /* A phone: the dialog is the screen. */
  @media (max-width: 640px) {
    #compare {
      padding: 0;
    }

    .cmp-card {
      width: 100%;
      height: 100%;
      border-radius: 0;
    }

    .cmp-bar {
      padding: 0 var(--sp-3);
      gap: var(--sp-2);
    }

    .cmp-title {
      display: none;
    }
  }
</style>
