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
  import { commands } from '$lib/cv/state/commands.js'
  import { storedText } from '$lib/cv/state/doc.svelte.js'
  import { doc, files } from '$lib/cv/state/state.svelte.js'
  import { highlight } from './cm-highlight.js'
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
    provide: f => EditorView.decorations.from(f),
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
  const hush = side => (quiet[side] = performance.now() + SYNC_QUIET_MS)

  /** @param {'a' | 'b'} side */
  const hushed = side => performance.now() < quiet[side]

  /** @param {'a' | 'b'} side */
  const other = side => (side === 'a' ? 'b' : 'a')

  /** @param {'a' | 'b'} side */
  const viewOf = side => (side === 'a' ? viewA : viewB)

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
      const move = current.moves.find(m => m.id === info.move)
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
      <select class="ds-select compact" bind:this={firstControl} aria-label="Left document" value={ref.fileId} onchange={e => setFile(side, e.currentTarget.value)}>
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    {:else}
      <select class="ds-select compact" aria-label="Right document" value={ref.fileId} onchange={e => setFile(side, e.currentTarget.value)}>
        {#each files.open as f (f.id)}
          <option value={f.id}>{f.name}</option>
        {/each}
      </select>
    {/if}
    <select
      class="ds-select compact"
      aria-label="{side === 'a' ? 'Left' : 'Right'} version"
      value={ref.versionKey ?? ''}
      disabled={!live}
      title={live ? 'Which version of this file' : 'Only the open file has its history loaded'}
      onchange={e => setVersion(side, e.currentTarget.value)}>
      <option value="">Current</option>
      {#if live}
        {#each doc.entries as entry (entry.key)}
          <option value={entry.key}>{entry.message} · {when(entry)}</option>
        {/each}
      {/if}
    </select>
  </div>
{/snippet}

<!-- The keyboard way out is Escape, on the window above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="compare"
  role="dialog"
  aria-modal="true"
  aria-labelledby="compare-title"
  tabindex="-1"
  onpointerdown={e => (downOnBackdrop = e.target === e.currentTarget)}
  onclick={e => {
    if (downOnBackdrop && e.target === e.currentTarget) commands.closeCompare()
  }}>
  <div class="cmp-card">
    <header class="cmp-bar">
      <h2 id="compare-title" class="cmp-title">Compare</h2>

      <!-- The tally doubles as the legend: each figure is set in the wash its
			     lines are drawn with. -->
      <span class="cmp-counts" aria-live="polite">
        <span class="ds-lozenge success" title="Lines added">+{diff.counts.added} added</span>
        <span class="ds-lozenge removed" title="Lines removed">−{diff.counts.removed} removed</span>
        <span class="ds-lozenge moved" title="Lines changed">~{diff.counts.changed} changed</span>
        <span class="ds-lozenge information" title="Blocks moved">↕{diff.counts.moved} moved</span>
      </span>

      <div class="ds-spacer"></div>

      <span class="cmp-step">{diff.hunks.length ? `${hunkAt < 0 ? '–' : hunkAt + 1} / ${diff.hunks.length}` : 'No differences'}</span>
      <div class="cmp-nav">
        <button class="ds-icon-btn" title="Previous change" aria-label="Previous change" disabled={!diff.hunks.length} onclick={() => step(-1)}>
          <Icon icon={IconPrev} width="16" height="16" />
        </button>
        <button class="ds-icon-btn" title="Next change" aria-label="Next change" disabled={!diff.hunks.length} onclick={() => step(1)}>
          <Icon icon={IconNext} width="16" height="16" />
        </button>
      </div>
      <button class="ds-icon-btn" title="Close (Esc)" aria-label="Close" onclick={commands.closeCompare}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </header>

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

    <footer class="cmp-foot">
      <button class="ds-btn subtle" onclick={swap}>
        <Icon icon={IconSwap} width="16" height="16" />
        Swap sides
      </button>
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

  .cmp-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-150);
    padding: var(--ds-space-300) var(--ds-space-300) var(--ds-space-200);
  }

  .cmp-title {
    margin: 0 var(--ds-space-100) 0 0;
    font: var(--ds-font-heading-medium);
    color: var(--ds-text);
  }

  .cmp-counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ds-space-050);
    font-variant-numeric: tabular-nums;
  }

  .cmp-step {
    font: var(--ds-font-body-small);
    font-variant-numeric: tabular-nums;
    color: var(--ds-text-subtlest);
    white-space: nowrap;
  }

  .cmp-nav {
    display: flex;
    gap: var(--ds-space-025);
  }

  .cmp-body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 0 var(--ds-space-300);
    border: var(--ds-border-width) solid var(--ds-border);
    border-radius: var(--ds-radius-medium);
    overflow: hidden;
  }

  .cmp-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--ds-surface);

    & + & {
      border-left: var(--ds-border-width) solid var(--ds-border);
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

  .cmp-foot {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: var(--ds-space-100);
    padding: var(--ds-space-300);
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
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .cmp-col + .cmp-col {
      border-left: none;
      border-top: var(--ds-border-width) solid var(--ds-border);
    }

    .cmp-counts {
      display: none;
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
      border-radius: 0;
      border-left: none;
      border-right: none;
    }
  }
</style>
