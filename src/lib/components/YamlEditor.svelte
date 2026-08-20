<script>
	import { onMount } from 'svelte';
	import { indentWithTab, standardKeymap } from '@codemirror/commands';
	import { yaml } from '@codemirror/lang-yaml';
	import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
	import { Compartment, EditorState } from '@codemirror/state';
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
