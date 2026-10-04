<script>
  import { onMount } from 'svelte'
  import { acceptCompletion } from '@codemirror/autocomplete'
  import { indentWithTab, standardKeymap } from '@codemirror/commands'
  import { codeFolding, foldGutter, foldKeymap, indentUnit, syntaxHighlighting } from '@codemirror/language'
  import { forEachDiagnostic, lintGutter, linter, setDiagnosticsEffect } from '@codemirror/lint'
  import { highlightSelectionMatches } from '@codemirror/search'
  import { Compartment, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
  import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    drawSelection,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers,
  } from '@codemirror/view'
  import { wrappedLineIndent } from 'codemirror-wrapped-line-indent'
  import { loadEditor } from '$lib/formats'
  import { lintCv } from '$lib/workers/index'
  import { highlight } from './cm-highlight'
  // CodeMirror builds its own DOM, so scoped styles can't reach it — its theme
  // ships as a plain stylesheet imported alongside the component instead.
  import './codemirror.scss'

  let {
    /** The source format, whose language, completion and lint the editor takes on. @type {import('@vibe-resume/core/format').FormatId} */
    format,
    /** Extensions from the Loro binding — document sync and undo/redo live here. */
    loroExtensions,
    readOnly = false,
    /** What the version on screen changed, highlighted inline. @type {import('$lib/cv/state/doc.svelte').VersionDiff | null} */
    diff = null,
    /** The editor scrolled — the page mirrors the move into the preview. */
    onScroll = () => {},
    /** A line the user just typed on, for the preview to follow. @type {(line: number) => void} */
    onEdit = () => {},
    /** What the lint has to say, kept current as the text moves. @type {(problems: import('$lib/cv/state/ui.svelte').Problem[]) => void} */
    onProblems = () => {},
  } = $props()

  /** @type {HTMLDivElement} */
  let host
  let view = $state(/** @type {EditorView | null} */ (null))
  /** The format's editor support, once it has loaded. @type {import('$lib/formats').FormatEditor | null} */
  let support = null
  const editable = new Compartment()
  const diffHighlight = new Compartment()

  /**
   * "Peek" line — the line behind whatever the pointer is on in the preview.
   * It carries its own decoration rather than moving the cursor, so hovering
   * the CV never disturbs where the caret sits or what's selected. Clicking
   * does move the caret, and `cm-activeLine` takes the highlight over then.
   */
  const setPeek = /** @type {import('@codemirror/state').StateEffectType<number | null>} */ (StateEffect.define())
  const peekMark = Decoration.line({ class: 'cm-peek-line' })
  const peekField = StateField.define({
    create: () => Decoration.none,
    /**
     * @param {import('@codemirror/view').DecorationSet} deco
     * @param {import('@codemirror/state').Transaction} tr
     */
    update(deco, tr) {
      deco = deco.map(tr.changes)
      for (const e of tr.effects) if (e.is(setPeek)) deco = e.value === null ? Decoration.none : Decoration.set([peekMark.range(e.value)])
      return deco
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  /**
   * Everything wrong with the document, as the format sees it — what won't
   * parse, what parses into a shape nothing renders, and what the writing
   * guide would change. A fix the format offers becomes one of the tooltip's
   * actions, written over the diagnostic's range as it stands by then.
   * @param {EditorView} v
   * @returns {Promise<import('@codemirror/lint').Diagnostic[]>}
   */
  async function diagnostics(v) {
    const found = /** @type {import('@vibe-resume/core/format').Diagnostic[]} */ (await lintCv(format, v.state.doc.toString()))
    const len = v.state.doc.length
    // Clamped because the linter reads a snapshot of the text: by the time the
    // worker answers, the document may already be shorter than what it saw.
    for (const d of found) {
      d.from = Math.min(Math.max(d.from, 0), len)
      d.to = Math.min(Math.max(d.to, d.from), len)
      const actions = (d.fixes ?? []).map((fix) => ({
        name: fix.label,
        /** @type {(target: EditorView, from: number, to: number) => void} */
        apply: (target, at, end) => {
          if (!target.state.readOnly) target.dispatch({ changes: { from: at, to: end, insert: fix.insert }, userEvent: 'input.fix' })
        },
      }))
      Object.assign(d, { actions })
    }
    return found
  }

  /**
   * Hand the page the diagnostics as they stand — after every lint, and after
   * every edit, which moves them. CodeMirror keeps them in document order.
   * @param {import('@codemirror/state').EditorState} state
   */
  function reportProblems(state) {
    /** @type {import('$lib/cv/state/ui.svelte').Problem[]} */
    const out = []
    forEachDiagnostic(state, (d, from, to) => {
      const line = state.doc.lineAt(from)
      out.push({
        from,
        to,
        line: line.number,
        column: from - line.from + 1,
        severity: d.severity,
        message: d.message,
        source: d.source,
        fixes: /** @type {{ fixes?: import('@vibe-resume/core/format').Fix[] }} */ (d).fixes ?? [],
        text: state.sliceDoc(from, to),
      })
    })
    onProblems(out)
  }

  /**
   * The line behind a diagnostic, tinted. The lint extension underlines only the
   * failing range; this is what makes the broken line findable while scrolling.
   * Errors only — a warning about a section's shape is worth an underline, but
   * not worth painting the line red while it's being typed.
   */
  const errorLineMark = Decoration.line({ class: 'cm-error-line' })

  /** @param {import('@codemirror/state').EditorState} state */
  function errorLines(state) {
    /** @type {number[]} */
    const starts = []
    forEachDiagnostic(state, (d, from, to) => {
      if (d.severity !== 'error') return
      for (let pos = from; ;) {
        const line = state.doc.lineAt(pos)
        if (starts[starts.length - 1] !== line.from) starts.push(line.from)
        if (line.to >= to) break
        pos = line.to + 1
      }
    })
    return Decoration.set(starts.map((at) => errorLineMark.range(at)))
  }

  /** Recomputed whenever the linter reports, and remapped as the text moves. */
  const errorLineHighlight = ViewPlugin.fromClass(
    class {
      /** @param {EditorView} view */
      constructor(view) {
        this.decorations = errorLines(view.state)
      }
      /** @param {import('@codemirror/view').ViewUpdate} update */
      update(update) {
        const relinted = update.transactions.some((tr) => tr.effects.some((e) => e.is(setDiagnosticsEffect)))
        if (update.docChanged || relinted) this.decorations = errorLines(update.state)
      }
    },
    { decorations: (v) => v.decorations },
  )

  class RemovedText extends WidgetType {
    /** @param {string} text */
    constructor(text) {
      super()
      this.text = text
    }
    /** @param {RemovedText} other */
    eq(other) {
      return other.text === this.text
    }
    toDOM() {
      const span = document.createElement('span')
      span.className = 'cm-diff-removed'
      span.textContent = this.text
      return span
    }
    ignoreEvent() {
      return true
    }
  }

  /** @param {import('$lib/cv/state/doc.svelte').VersionDiff | null} d */
  function diffDecorations(d) {
    if (!d || (d.added.length === 0 && d.removed.length === 0)) return Decoration.none
    const ranges = [
      ...d.added.filter((r) => r.to > r.from).map((r) => Decoration.mark({ class: 'cm-diff-added' }).range(r.from, r.to)),
      ...d.removed.map((r) => Decoration.widget({ widget: new RemovedText(r.text), side: -1 }).range(r.at)),
    ]
    return Decoration.set(ranges, true)
  }

  onMount(() => {
    let gone = false
    // The format's half of the editor is loaded on demand; the page re-keys
    // this component when the format changes, so it is read once.
    // svelte-ignore state_referenced_locally
    void loadEditor(format).then((loaded) => {
      if (gone) return
      support = loaded
      mountView(loaded)
    })
    return () => {
      gone = true
      onProblems([])
      if (!view) return
      view.scrollDOM.removeEventListener('scroll', fireScroll)
      view.destroy()
      view = null
    }
  })

  /** @param {import('$lib/formats').FormatEditor} lang */
  function mountView(lang) {
    const next = new EditorView({
      parent: host,
      state: EditorState.create({
        extensions: [
          lintGutter(),
          // lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          codeFolding(),
          foldGutter({
            closedText: '▶',
            openText: '▼',
          }),
          drawSelection(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          wrappedLineIndent,
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          lang.extensions(),
          syntaxHighlighting(highlight),
          // No history() here on purpose: the Loro undo plugin binds Mod-Z at
          // high precedence, and two undo stacks would fight over it. Tab comes
          // before indentWithTab because `acceptCompletion` declines unless the
          // completion tooltip is open, so Tab still indents the rest of the time.
          keymap.of([{ key: 'Tab', run: acceptCompletion }, ...standardKeymap, ...foldKeymap, indentWithTab]),
          linter(diagnostics, { delay: 300 }),
          errorLineHighlight,
          editable.of(editableExtensions(readOnly)),
          diffHighlight.of(EditorView.decorations.of(diffDecorations(diff))),
          EditorView.contentAttributes.of({ spellcheck: 'true' }),
          peekField,
          EditorView.updateListener.of(onUpdate),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(setDiagnosticsEffect)))) reportProblems(update.state)
          }),
          loroExtensions,
        ],
      }),
    })
    next.focus()
    view = next
    next.scrollDOM.addEventListener('scroll', fireScroll, { passive: true })
  }

  const fireScroll = () => onScroll()

  /**
   * Report the line the user just typed on, and only that. The Loro binding
   * replays imports and version check-outs through plain dispatches that carry
   * no user event, so nothing the app does to the document counts as an edit
   * here — which is what keeps the preview still while history is browsed.
   * @param {import('@codemirror/view').ViewUpdate} update
   */
  function onUpdate(update) {
    if (!update.docChanged) return
    if (!update.transactions.some((tr) => tr.annotation(Transaction.userEvent))) return
    let head = -1
    update.changes.iterChanges((_fromA, _toA, _fromB, toB) => (head = toB))
    if (head >= 0) onEdit(update.state.doc.lineAt(head).number)
  }

  $effect(() => {
    view?.dispatch({
      effects: editable.reconfigure(editableExtensions(readOnly)),
    })
  })

  $effect(() => {
    view?.dispatch({
      effects: diffHighlight.reconfigure(EditorView.decorations.of(diffDecorations(diff))),
    })
  })

  /** @param {boolean} locked */
  function editableExtensions(locked) {
    return [EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]
  }

  /**
   * Bring a source line into view for the preview's sake: `focus` puts the
   * caret on its value and takes focus — what a click asks for — while a plain
   * hover only lights it up, and only scrolls when the line isn't already on
   * screen. The peek decoration stays pinned to the line start, since a line
   * decoration's range has to sit there.
   * @param {number} line 1-based
   * @param {{ focus?: boolean }} [opts]
   */
  export function revealLine(line, { focus = false } = {}) {
    if (!view) return
    const doc = view.state.doc
    const info = doc.line(Math.min(Math.max(1, Math.round(line)), doc.lines))
    const at = info.from + (support?.contentColumn(info.text) ?? 0)
    view.dispatch({
      selection: focus ? { anchor: at } : undefined,
      effects: [
        setPeek.of(focus ? null : info.from),
        EditorView.scrollIntoView(focus ? at : info.from, focus ? { y: 'center' } : { y: 'nearest', yMargin: 48 }),
      ],
    })
    if (focus) view.focus()
  }

  /** Drop the peek highlight — the pointer has left the preview. */
  export function clearPeek() {
    view?.dispatch({ effects: setPeek.of(null) })
  }

  /**
   * Take the geometry again. The pane is kept mounted while the source is
   * hidden, and CodeMirror measures nothing it can't see — so everything it
   * knows about line heights is stale by the time the pane comes back.
   */
  export function remeasure() {
    view?.requestMeasure()
  }

  /**
   * Replace the whole document as a user-level edit, so the Loro binding records
   * it the same way it records typing. This is how Reset and Restore apply text.
   * @param {string} text
   */
  export function replaceAll(text) {
    if (!view || view.state.doc.toString() === text) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    })
  }

  /**
   * Select a problem's range and bring it to the middle of the editor.
   * @param {import('$lib/cv/state/ui.svelte').Problem} problem
   */
  export function goTo(problem) {
    if (!view) return
    const len = view.state.doc.length
    const from = Math.min(problem.from, len)
    view.dispatch({
      selection: { anchor: from, head: Math.min(problem.to, len) },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
    view.focus()
  }

  /**
   * Apply fixes as one edit, so one undo takes them all back. A problem whose
   * text has changed since it was found is passed over, and so is one that
   * overlaps a fix already taken — the next lint says what is left.
   * @param {Array<{ problem: import('$lib/cv/state/ui.svelte').Problem, fix: import('@vibe-resume/core/format').Fix }>} list
   */
  export function applyFixes(list) {
    if (!view || view.state.readOnly) return
    const state = view.state
    /** @type {Array<{ from: number, to: number, insert: string }>} */
    const changes = []
    for (const { problem, fix } of list.toSorted((a, b) => a.problem.from - b.problem.from)) {
      if (problem.to > state.doc.length || state.sliceDoc(problem.from, problem.to) !== problem.text) continue
      const last = changes.at(-1)
      if (last && problem.from < last.to) continue
      changes.push({ from: problem.from, to: problem.to, insert: fix.insert })
    }
    if (changes.length) view.dispatch({ changes, userEvent: 'input.fix' })
  }

  export function takeFocus() {
    view?.focus()
  }

  /** Focus the editor with the whole source selected — Select All for the app as a whole. */
  export function selectAll() {
    if (!view) return
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
    view.focus()
  }

  /**
   * The document's top edge in the scroller's own coordinates. CodeMirror
   * measures line blocks from there, while `scrollTop` counts from the top of
   * the scrollable content — this is the constant between the two.
   * @param {EditorView} v
   */
  function docOffset(v) {
    return v.documentTop - v.scrollDOM.getBoundingClientRect().top + v.scrollDOM.scrollTop
  }

  /**
   * The line at the top of the viewport, carried to a fraction through its own
   * block so a slow scroll reads as a slow move rather than line-sized jumps.
   * @returns {number | null}
   */
  export function topLine() {
    if (!view) return null
    const height = Math.max(0, view.scrollDOM.scrollTop - docOffset(view))
    const block = view.lineBlockAtHeight(height)
    const line = view.state.doc.lineAt(block.from).number
    const frac = block.height > 0 ? (height - block.top) / block.height : 0
    return line + Math.min(1, Math.max(0, frac))
  }

  /**
   * Put `line` at the top of the viewport — `topLine` run backwards, for when
   * the preview is the pane being scrolled.
   * @param {number} line
   */
  export function scrollToLine(line) {
    if (!view) return
    const doc = view.state.doc
    const n = Math.min(Math.max(1, Math.floor(line)), doc.lines)
    const block = view.lineBlockAt(doc.line(n).from)
    const frac = Math.min(1, Math.max(0, line - n))
    view.scrollDOM.scrollTop = block.top + frac * block.height + docOffset(view)
  }

  /**
   * Which end of its scroll the editor is parked against, if either. The page
   * pins the preview to the matching end rather than to an interpolated line,
   * so running one pane to the bottom always lands the other one there too.
   * @returns {'start' | 'end' | null}
   */
  export function scrollEdge() {
    if (!view) return null
    const el = view.scrollDOM
    if (el.scrollTop <= 1) return 'start'
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 1 ? 'end' : null
  }

  /** @param {'start' | 'end'} edge */
  export function scrollToEdge(edge) {
    if (!view) return
    const el = view.scrollDOM
    el.scrollTop = edge === 'start' ? 0 : el.scrollHeight - el.clientHeight
  }
</script>

<div id="cm-wrap" bind:this={host}></div>

<style lang="scss">
  /* The editor's host. Everything CodeMirror renders inside it is themed by
	   codemirror.scss, next to this file. */
  #cm-wrap {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }
</style>
