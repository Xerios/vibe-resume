<script>
	import { onMount } from 'svelte';
	import { indentWithTab, standardKeymap } from '@codemirror/commands';
	import { yaml } from '@codemirror/lang-yaml';
	import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
	import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
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
		diff = null
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
					loroExtensions
				]
			})
		});
		next.focus();
		view = next;
		return () => {
			next.destroy();
			view = null;
		};
	});

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
	 * Bring a source line into view for the preview's sake: `focus` puts the
	 * caret on it and takes focus — what a click asks for — while a plain hover
	 * only lights it up, and only scrolls when the line isn't already on screen.
	 * @param {number} line 1-based
	 * @param {{ focus?: boolean }} [opts]
	 */
	export function revealLine(line, { focus = false } = {}) {
		if (!view) return;
		const doc = view.state.doc;
		const info = doc.line(Math.min(Math.max(1, Math.round(line)), doc.lines));
		view.dispatch({
			selection: focus ? { anchor: info.from } : undefined,
			effects: [
				setPeek.of(focus ? null : info.from),
				EditorView.scrollIntoView(info.from, focus ? { y: 'center' } : { y: 'nearest', yMargin: 48 })
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

	/** The editor's current text. */
	export function getText() {
		return view ? view.state.doc.toString() : '';
	}
</script>

<div id="cm-wrap" bind:this={host}></div>
