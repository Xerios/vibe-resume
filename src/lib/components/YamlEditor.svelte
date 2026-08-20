<script>
	import { onMount } from 'svelte';
	import { indentWithTab, standardKeymap } from '@codemirror/commands';
	import { yaml } from '@codemirror/lang-yaml';
	import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
	import { Compartment, EditorState } from '@codemirror/state';
	import {
		EditorView,
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
		readOnly = false
	} = $props();

	/** @type {HTMLDivElement} */
	let host;
	let view = $state(/** @type {EditorView | null} */ (null));
	const editable = new Compartment();

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
