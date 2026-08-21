<script>
	import { onMount } from 'svelte';
	import { indentWithTab, standardKeymap } from '@codemirror/commands';
	import { yaml } from '@codemirror/lang-yaml';
	import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
	import {
		Compartment,
		EditorState,
		StateEffect,
		StateField,
		Transaction
	} from '@codemirror/state';
	import {
		Decoration,
		EditorView,
		WidgetType,
		drawSelection,
		highlightActiveLine,
		highlightActiveLineGutter,
		keymap,
		lineNumbers
	} from '@codemirror/view';
	import { tags as t } from '@lezer/highlight';
	import { wrappedLineIndent } from 'codemirror-wrapped-line-indent';

	let {
		/** Extensions from the Loro binding — document sync and undo/redo live here. */
		loroExtensions,
		readOnly = false,
		/** What the version on screen changed, highlighted inline. @type {import('$lib/cv/doc.svelte.js').VersionDiff | null} */
		diff = null,
		/** The editor scrolled — the page mirrors the move into the preview. */
		onScroll = () => {},
		/** A line the user just typed on, for the preview to follow. @type {(line: number) => void} */
		onEdit = () => {}
	} = $props();

	/** @type {HTMLDivElement} */
	let host;
	let view = $state(/** @type {EditorView | null} */ (null));
	const editable = new Compartment();
	const diffHighlight = new Compartment();

	/**
	 * "Peek" line — the line behind whatever the pointer is on in the preview.
	 * It carries its own decoration rather than moving the cursor, so hovering
	 * the CV never disturbs where the caret sits or what's selected. Clicking
	 * does move the caret, and `cm-activeLine` takes the highlight over then.
	 */
	const setPeek = /** @type {import('@codemirror/state').StateEffectType<number | null>} */ (
		StateEffect.define()
	);
	const peekMark = Decoration.line({ class: 'cm-peek-line' });
	const peekField = StateField.define({
		create: () => Decoration.none,
		/**
		 * @param {import('@codemirror/view').DecorationSet} deco
		 * @param {import('@codemirror/state').Transaction} tr
		 */
		update(deco, tr) {
			deco = deco.map(tr.changes);
			for (const e of tr.effects)
				if (e.is(setPeek))
					deco = e.value === null ? Decoration.none : Decoration.set([peekMark.range(e.value)]);
			return deco;
		},
		provide: (f) => EditorView.decorations.from(f)
	});

	class RemovedText extends WidgetType {
		/** @param {string} text */
		constructor(text) {
			super();
			this.text = text;
		}
		/** @param {RemovedText} other */
		eq(other) {
			return other.text === this.text;
		}
		toDOM() {
			const span = document.createElement('span');
			span.className = 'cm-diff-removed';
			span.textContent = this.text;
			return span;
		}
		ignoreEvent() {
			return true;
		}
	}

	/** @param {import('$lib/cv/doc.svelte.js').VersionDiff | null} d */
	function diffDecorations(d) {
		if (!d || (d.added.length === 0 && d.removed.length === 0)) return Decoration.none;
		const ranges = [
			...d.added
				.filter((r) => r.to > r.from)
				.map((r) => Decoration.mark({ class: 'cm-diff-added' }).range(r.from, r.to)),
			...d.removed.map((r) =>
				Decoration.widget({ widget: new RemovedText(r.text), side: -1 }).range(r.at)
			)
		];
		return Decoration.set(ranges, true);
	}

	/**
	 * Colours come from CSS custom properties so the one highlight style serves
	 * both themes — see the `--cm-*` tokens in src/app.css.
	 */
	const highlight = HighlightStyle.define([
		{ tag: t.definition(t.propertyName), color: 'var(--cm-key)', fontWeight: '600' },
		{ tag: t.string, color: 'var(--cm-string)' },
		{ tag: t.special(t.string), color: 'var(--cm-block)' },
		{ tag: t.content, color: 'var(--cm-text)' },
		{ tag: t.lineComment, color: 'var(--cm-comment)', fontStyle: 'italic' },
		{ tag: t.meta, color: 'var(--cm-key)' },
		{ tag: [t.separator, t.punctuation, t.squareBracket, t.brace], color: 'var(--cm-punct)' },
		{ tag: [t.labelName, t.typeName], color: 'var(--cm-anchor)' },
		{ tag: t.keyword, color: 'var(--cm-key)' },
		{ tag: t.invalid, color: 'var(--cm-invalid)' }
	]);

	onMount(() => {
		const next = new EditorView({
			parent: host,
			state: EditorState.create({
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					drawSelection(),
					EditorView.lineWrapping,
					wrappedLineIndent,
					indentUnit.of('  '),
					EditorState.tabSize.of(2),
					yaml(),
					syntaxHighlighting(highlight),
					// No history() here on purpose: the Loro undo plugin binds Mod-Z at
					// high precedence, and two undo stacks would fight over it.
					keymap.of([...standardKeymap, indentWithTab]),
					editable.of(editableExtensions(readOnly)),
					diffHighlight.of(EditorView.decorations.of(diffDecorations(diff))),
					peekField,
					EditorView.updateListener.of(onUpdate),
					loroExtensions
				]
			})
		});
		next.focus();
		view = next;
		next.scrollDOM.addEventListener('scroll', fireScroll, { passive: true });
		return () => {
			next.scrollDOM.removeEventListener('scroll', fireScroll);
			next.destroy();
			view = null;
		};
	});

	const fireScroll = () => onScroll();

	/**
	 * Report the line the user just typed on, and only that. The Loro binding
	 * replays imports and version check-outs through plain dispatches that carry
	 * no user event, so nothing the app does to the document counts as an edit
	 * here — which is what keeps the preview still while history is browsed.
	 * @param {import('@codemirror/view').ViewUpdate} update
	 */
	function onUpdate(update) {
		if (!update.docChanged) return;
		if (!update.transactions.some((tr) => tr.annotation(Transaction.userEvent))) return;
		let head = -1;
		update.changes.iterChanges((_fromA, _toA, _fromB, toB) => (head = toB));
		if (head >= 0) onEdit(update.state.doc.lineAt(head).number);
	}

	$effect(() => {
		view?.dispatch({ effects: editable.reconfigure(editableExtensions(readOnly)) });
	});

	$effect(() => {
		view?.dispatch({
			effects: diffHighlight.reconfigure(EditorView.decorations.of(diffDecorations(diff)))
		});
	});

	/** @param {boolean} locked */
	function editableExtensions(locked) {
		return [EditorState.readOnly.of(locked), EditorView.editable.of(!locked)];
	}

	/**
	 * Where the content starts on a YAML line: past the indent, any `- ` sequence
	 * markers, a `key: ` and an opening quote — the character a click in the
	 * preview means to land on. A line carrying no inline value (`bullets:`, a
	 * block that continues below) falls back to its first non-space character,
	 * which still beats the indentation.
	 *
	 * Barring a quoted scalar from the key position is what keeps `text: 'ORM:
	 * Prisma'` — or a bare `- 'Analytics: Mixpanel'` — from reading as a key.
	 * @param {string} text a single line, without its newline
	 * @returns {number} column offset into `text`
	 */
	function contentColumn(text) {
		const m = /^(\s*(?:-[ \t]+)*)(?:[^\s#'"][^:]*?:[ \t]+)?/.exec(text);
		let col = m ? m[0].length : 0;
		if (col >= text.length) col = m ? m[1].length : 0; // a key with nothing after it
		if (text[col] === "'" || text[col] === '"') col++; // sit on the text, not the quote
		return Math.min(col, text.length);
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
		if (!view) return;
		const doc = view.state.doc;
		const info = doc.line(Math.min(Math.max(1, Math.round(line)), doc.lines));
		const at = info.from + contentColumn(info.text);
		view.dispatch({
			selection: focus ? { anchor: at } : undefined,
			effects: [
				setPeek.of(focus ? null : info.from),
				EditorView.scrollIntoView(
					focus ? at : info.from,
					focus ? { y: 'center' } : { y: 'nearest', yMargin: 48 }
				)
			]
		});
		if (focus) view.focus();
	}

	/** Drop the peek highlight — the pointer has left the preview. */
	export function clearPeek() {
		view?.dispatch({ effects: setPeek.of(null) });
	}

	/**
	 * Replace the whole document as a user-level edit, so the Loro binding records
	 * it the same way it records typing. This is how Reset and Restore apply text.
	 * @param {string} text
	 */
	export function replaceAll(text) {
		if (!view || view.state.doc.toString() === text) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
	}

	/**
	 * The document's top edge in the scroller's own coordinates. CodeMirror
	 * measures line blocks from there, while `scrollTop` counts from the top of
	 * the scrollable content — this is the constant between the two.
	 * @param {EditorView} v
	 */
	function docOffset(v) {
		return v.documentTop - v.scrollDOM.getBoundingClientRect().top + v.scrollDOM.scrollTop;
	}

	/**
	 * The line at the top of the viewport, carried to a fraction through its own
	 * block so a slow scroll reads as a slow move rather than line-sized jumps.
	 * @returns {number | null}
	 */
	export function topLine() {
		if (!view) return null;
		const height = Math.max(0, view.scrollDOM.scrollTop - docOffset(view));
		const block = view.lineBlockAtHeight(height);
		const line = view.state.doc.lineAt(block.from).number;
		const frac = block.height > 0 ? (height - block.top) / block.height : 0;
		return line + Math.min(1, Math.max(0, frac));
	}

	/**
	 * Put `line` at the top of the viewport — `topLine` run backwards, for when
	 * the preview is the pane being scrolled.
	 * @param {number} line
	 */
	export function scrollToLine(line) {
		if (!view) return;
		const doc = view.state.doc;
		const n = Math.min(Math.max(1, Math.floor(line)), doc.lines);
		const block = view.lineBlockAt(doc.line(n).from);
		const frac = Math.min(1, Math.max(0, line - n));
		view.scrollDOM.scrollTop = block.top + frac * block.height + docOffset(view);
	}

	/**
	 * Which end of its scroll the editor is parked against, if either. The page
	 * pins the preview to the matching end rather than to an interpolated line,
	 * so running one pane to the bottom always lands the other one there too.
	 * @returns {'start' | 'end' | null}
	 */
	export function scrollEdge() {
		if (!view) return null;
		const el = view.scrollDOM;
		if (el.scrollTop <= 1) return 'start';
		return el.scrollTop >= el.scrollHeight - el.clientHeight - 1 ? 'end' : null;
	}

	/** @param {'start' | 'end'} edge */
	export function scrollToEdge(edge) {
		if (!view) return;
		const el = view.scrollDOM;
		el.scrollTop = edge === 'start' ? 0 : el.scrollHeight - el.clientHeight;
	}

	/** The editor's current text. */
	export function getText() {
		return view ? view.state.doc.toString() : '';
	}
</script>

<div id="cm-wrap" bind:this={host}></div>
