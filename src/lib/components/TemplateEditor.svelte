<script>
	/**
	 * The second editor: the Svelte component behind the sheet, rather than the
	 * YAML in it.
	 *
	 * CodeMirror again, but with none of the document plumbing next door — a
	 * template is plain text in localStorage, not a CRDT, so this one keeps an
	 * ordinary `history()` and pushes every change straight out through
	 * `onChange`.
	 *
	 * Compiling is the page's job, not this component's: the result has to reach
	 * the preview frame, and the error that comes back arrives here as a prop.
	 */
	import { onMount } from "svelte";
	import {
		defaultKeymap,
		history,
		historyKeymap,
		indentWithTab,
	} from "@codemirror/commands";
	import {
		bracketMatching,
		codeFolding,
		foldGutter,
		foldKeymap,
		indentUnit,
		syntaxHighlighting,
	} from "@codemirror/language";
	import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
	import { Compartment, EditorState } from "@codemirror/state";
	import {
		Decoration,
		EditorView,
		drawSelection,
		highlightActiveLine,
		highlightActiveLineGutter,
		keymap,
		lineNumbers,
	} from "@codemirror/view";
	import { svelte } from "@replit/codemirror-lang-svelte";
	import { highlight } from "./cm-highlight.js";
	import "./codemirror.css";

	let {
		/** @type {import('$lib/cv/templates.svelte.js').Template} */
		template,
		/** @type {(text: string) => void} */
		onChange,
		/** What the last compile said, if it failed. @type {{ message: string, line?: number } | null} */
		error = null,
		/** @type {() => void} */
		onDuplicate,
		/** @type {(name: string) => void} */
		onRename,
		/** @type {() => void} */
		onRevert,
		/** @type {() => void} */
		onDelete,
	} = $props();

	/** @type {HTMLDivElement} */
	let host;
	let view = $state(/** @type {EditorView | null} */ (null));
	const errorLine = new Compartment();

	/** The failing line, tinted the way a YAML error is next door. */
	const errorMark = Decoration.line({ class: "cm-error-line" });

	/** @param {EditorState} state */
	function errorDecorations(state) {
		const line = error?.line;
		if (!line || line > state.doc.lines) return EditorView.decorations.of(Decoration.none);
		return EditorView.decorations.of(
			Decoration.set([errorMark.range(state.doc.line(line).from)]),
		);
	}

	onMount(() => {
		const next = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: template.source,
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					codeFolding(),
					foldGutter({ closedText: "▶", openText: "▼" }),
					drawSelection(),
					bracketMatching(),
					highlightSelectionMatches(),
					EditorView.lineWrapping,
					indentUnit.of("\t"),
					EditorState.tabSize.of(2),
					svelte(),
					syntaxHighlighting(highlight),
					// This editor owns its undo stack — nothing else writes to the
					// document, so there is no second one to collide with.
					history(),
					keymap.of([
						...defaultKeymap,
						...historyKeymap,
						...foldKeymap,
						...searchKeymap,
						indentWithTab,
					]),
					errorLine.of(EditorView.decorations.of(Decoration.none)),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChange(update.state.doc.toString());
					}),
				],
			}),
		});
		view = next;
		return () => {
			next.destroy();
			view = null;
		};
	});

	/**
	 * Take a source the user didn't type — Revert puts the shipped text back
	 * without the template's id changing, so the view has to be told.
	 */
	$effect(() => {
		const text = template.source;
		if (!view || view.state.doc.toString() === text) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: text },
		});
	});

	$effect(() => {
		void error;
		if (view) view.dispatch({ effects: errorLine.reconfigure(errorDecorations(view.state)) });
	});

	/** Put the caret on whatever the compiler complained about. */
	function jumpToError() {
		const line = error?.line;
		if (!view || !line || line > view.state.doc.lines) return;
		const at = view.state.doc.line(line).from;
		view.dispatch({
			selection: { anchor: at },
			effects: EditorView.scrollIntoView(at, { y: "center" }),
		});
		view.focus();
	}

	/**
	 * Take the geometry again — the pane is kept mounted while the other editor
	 * is on top, and CodeMirror measures nothing it can't see.
	 */
	export function remeasure() {
		view?.requestMeasure();
	}

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	function commitName(e) {
		onRename(e.currentTarget.value);
		// The manager de-duplicates, so what it kept may not be what was typed.
		e.currentTarget.value = template.name;
	}
</script>

<div id="tpl-pane">
	<div id="tpl-head">
		{#if template.builtin}
			<span class="tpl-name" title="Built-in templates keep the name they ship with"
				>{template.name}</span
			>
			{#if template.edited}<span class="tpl-badge">edited</span>{/if}
		{:else}
			<input
				class="tpl-name tpl-rename"
				value={template.name}
				aria-label="Template name"
				spellcheck="false"
				onchange={commitName}
				onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
			/>
		{/if}

		<div class="t-spacer"></div>

		<button class="t-btn" onclick={onDuplicate} title="Copy this template into one of your own"
			>Duplicate</button
		>
		{#if template.builtin}
			<button
				class="t-btn"
				onclick={onRevert}
				disabled={!template.edited}
				title="Put the shipped source back">Revert</button
			>
		{:else}
			<button class="t-btn tpl-delete" onclick={onDelete} title="Delete this template"
				>Delete</button
			>
		{/if}
	</div>

	<div id="tpl-cm" bind:this={host}></div>

	{#if error}
		<button id="tpl-error" onclick={jumpToError}>
			<span>⚠</span>
			{#if error.line}<b>Line {error.line}</b>{/if}
			<span class="tpl-error-msg">{error.message}</span>
		</button>
	{/if}
</div>

<style>
	#tpl-pane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	#tpl-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		background: var(--editor-chrome);
		border-bottom: 1px solid var(--line);
	}

	.tpl-name {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		color: var(--ink);
		padding: 2px 4px;
	}

	.tpl-rename {
		width: 140px;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
	}

	.tpl-rename:hover {
		border-color: var(--line);
	}

	.tpl-rename:focus {
		outline: none;
		border-color: var(--accent);
		background: var(--paper);
	}

	.tpl-badge {
		font-family: var(--mono);
		font-size: 9px;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--accent-deep);
		background: var(--accent-wash);
		border-radius: 999px;
		padding: 2px 7px;
	}

	.tpl-delete:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	#tpl-cm {
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	/* The whole strip is the hit target: a compile error always has somewhere to
	   go, and the line number alone is a small thing to aim at. */
	#tpl-error {
		flex-shrink: 0;
		display: flex;
		align-items: baseline;
		gap: 7px;
		width: 100%;
		padding: 6px 10px;
		background: var(--cm-error-bg);
		border: none;
		border-top: 1px solid var(--line);
		color: var(--cm-error);
		font-family: var(--mono);
		font-size: 10.5px;
		line-height: 1.5;
		text-align: left;
		cursor: pointer;
	}

	#tpl-error:hover {
		background: color-mix(in srgb, var(--cm-error) 12%, transparent);
	}

	.tpl-error-msg {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
