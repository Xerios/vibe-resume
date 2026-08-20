<script>
	import { onMount, tick } from 'svelte';
	import HistoryPanel from '$lib/components/HistoryPanel.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import YamlEditor from '$lib/components/YamlEditor.svelte';
	import { CvDoc } from '$lib/cv/doc.svelte.js';
	import { buildCV, parseCv } from '$lib/cv/render.js';
	import { KEYS, read, write } from '$lib/cv/storage.js';

	const PARSE_DEBOUNCE_MS = 250;

	const cv = new CvDoc();

	/** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
	let parsed = $state(/** @type {any} */ (null));
	let parseError = $state(/** @type {string | null} */ (null));

	let historyOpen = $state(read(KEYS.historyOpen) !== 'false');
	let editorWidth = $state(read(KEYS.editorWidth));
	let toastMsg = $state('');
	let toastOn = $state(false);

	let editor = $state(/** @type {YamlEditor | undefined} */ (undefined));
	/** @type {HTMLDivElement} */
	let split;
	let dragging = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let toastTimer;

	const previewHtml = $derived.by(() => {
		if (!parsed) return '';
		try {
			return buildCV(parsed);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return `<div class="sheet"><p class="cv-unknown">Could not render: ${escapeHtml(msg)}</p></div>`;
		}
	});

	const saveLabel = $derived.by(() => {
		if (cv.saveError) return '⚠ not saved';
		if (cv.isViewingHistory) return 'viewing history';
		if (!cv.savedAt) return '';
		const at = cv.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		return `saved ${at}`;
	});

	onMount(() => {
		cv.bindEditor((text) => editor?.replaceAll(text));
		cv.init();

		const flush = () => cv.flush();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flush();
		};

		window.addEventListener('beforeunload', flush);
		window.addEventListener('keydown', onKeydown);
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			window.removeEventListener('beforeunload', flush);
			window.removeEventListener('keydown', onKeydown);
			document.removeEventListener('visibilitychange', onVisibility);
			clearTimeout(toastTimer);
			cv.destroy();
		};
	});

	// The document is the single source of the preview: loro-codemirror keeps it in
	// step with the editor in both directions, so nothing here watches keystrokes.
	$effect(() => {
		const text = cv.yaml;
		if (!text) return;
		if (!parsed) {
			reparse(text); // first paint shouldn't wait on the debounce
			return;
		}
		const id = setTimeout(() => reparse(text), PARSE_DEBOUNCE_MS);
		return () => clearTimeout(id);
	});

	/** @param {string} text */
	function reparse(text) {
		const { cv: doc, error } = parseCv(text);
		parseError = error;
		if (doc) parsed = doc;
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			if (cv.isViewingHistory) {
				toast('Editing is paused while viewing history');
				return;
			}
			cv.checkpoint('');
			toast('Version saved');
		}
	}

	function toggleTheme() {
		const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		write(KEYS.theme, next);
	}

	async function toggleHistory() {
		historyOpen = !historyOpen;
		write(KEYS.historyOpen, String(historyOpen));
		await tick();
	}

	function resetYaml() {
		cv.reset();
		toast('Reset to template');
	}

	function copyYaml() {
		navigator.clipboard
			.writeText(cv.yaml)
			.then(() => toast('YAML copied to clipboard'))
			.catch(() => toast('Copy failed — try Ctrl+A, Ctrl+C'));
	}

	function exportPDF() {
		if (parseError) {
			toast('Fix YAML errors before exporting');
			return;
		}
		window.print();
	}

	/** @param {string} msg */
	function toast(msg) {
		toastMsg = msg;
		toastOn = true;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastOn = false), 2200);
	}

	/** @param {number} pct */
	function setWidth(pct) {
		editorWidth = `${Math.min(78, Math.max(18, pct))}%`;
	}

	/** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
	function startDrag(e) {
		dragging = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		document.body.classList.add('resizing');
	}

	/** @param {PointerEvent} e */
	function onDrag(e) {
		if (!dragging) return;
		const rect = split.getBoundingClientRect();
		setWidth(((e.clientX - rect.left) / rect.width) * 100);
	}

	/** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
	function endDrag(e) {
		if (!dragging) return;
		dragging = false;
		e.currentTarget.releasePointerCapture(e.pointerId);
		document.body.classList.remove('resizing');
		if (editorWidth) write(KEYS.editorWidth, editorWidth);
	}

	/** @param {KeyboardEvent} e */
	function onDividerKey(e) {
		const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
		if (!step) return;
		e.preventDefault();
		const current = (split.querySelector('#editor-pane')?.clientWidth ?? 0) / split.clientWidth;
		setWidth(current * 100 + step);
		if (editorWidth) write(KEYS.editorWidth, editorWidth);
	}

	/** @param {string} s */
	function escapeHtml(s) {
		return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
	}
</script>

<svelte:head>
	<title>Sam M. — CV Editor</title>
</svelte:head>

<div id="app">
	<Toolbar
		valid={!parseError}
		{saveLabel}
		{historyOpen}
		historyCount={cv.history.length}
		onToggleTheme={toggleTheme}
		onToggleHistory={toggleHistory}
		onReset={resetYaml}
		onCopy={copyYaml}
		onExport={exportPDF}
	/>

	<div id="split" bind:this={split}>
		<div id="editor-pane" style:width={editorWidth}>
			<div id="editor-header">
				<span class="editor-badge" class:readonly={cv.isViewingHistory}>
					{cv.isViewingHistory ? 'Read only' : 'YAML'}
				</span>
				<span class="editor-file">cv.yaml</span>
			</div>
			{#if cv.ready}
				<!-- Re-keyed when the document is swapped (history cleared, or another
				     tab's document taken over): the binding is tied to one LoroDoc. -->
				{#key cv.docId}
					<YamlEditor
						bind:this={editor}
						loroExtensions={cv.extensions}
						readOnly={cv.isViewingHistory}
					/>
				{/key}
			{:else}
				<div id="boot">Loading editor…</div>
			{/if}
		</div>

		<button
			type="button"
			id="divider"
			aria-label="Resize editor pane — use the arrow keys"
			onpointerdown={startDrag}
			onpointermove={onDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onkeydown={onDividerKey}
		></button>

		<div id="preview-pane">
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
			{:else if parseError}
				<div id="error-banner">⚠ {parseError}</div>
			{/if}
			<div id="cv-root">{@html previewHtml}</div>
		</div>

		{#if historyOpen && cv.ready}
			<HistoryPanel doc={cv} {toast} />
		{/if}
	</div>
</div>

<div id="toast" class:show={toastOn}>{toastMsg}</div>
