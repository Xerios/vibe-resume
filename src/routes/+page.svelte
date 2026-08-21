<script>
	import { onMount, tick } from 'svelte';
	import HistoryPanel from '$lib/components/HistoryPanel.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import TrashPanel from '$lib/components/TrashPanel.svelte';
	import YamlEditor from '$lib/components/YamlEditor.svelte';
	import CvSheet from '$lib/cv/CvSheet.svelte';
	import { CvDoc } from '$lib/cv/doc.svelte.js';
	import { FileManager } from '$lib/cv/files.svelte.js';
	import { resolveLayout, resolveTheme } from '$lib/cv/presets.js';
	import { parseCv } from '$lib/cv/render.js';
	import { KEYS, read, write } from '$lib/cv/storage.js';

	const PARSE_DEBOUNCE_MS = 250;

	const cv = new CvDoc();
	const files = new FileManager();
	/** Which document `parsed` reflects — used to bypass the debounce when a tab switch swaps it out from under us. */
	let lastParsedDocId = -1;

	/** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
	let parsed = $state(/** @type {any} */ (null));
	let parseError = $state(/** @type {string | null} */ (null));

	let historyOpen = $state(read(KEYS.historyOpen) !== 'false');
	let sourceHidden = $state(read(KEYS.sourceHidden) === 'true');
	let editorWidth = $state(read(KEYS.editorWidth));
	let toastMsg = $state('');
	let toastOn = $state(false);

	let editor = $state(/** @type {YamlEditor | undefined} */ (undefined));
	/** @type {HTMLDivElement} */
	let split;
	let dragging = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let toastTimer;
	let trashOpen = $state(false);

	/** Presentation of the active file, defaulted here so the rest can assume a valid id. */
	const layout = $derived(resolveLayout(files.active?.layout));
	const theme = $derived(resolveTheme(files.active?.theme));

	const saveLabel = $derived.by(() => {
		if (cv.saveError) return '⚠ not saved';
		if (cv.isViewingHistory) return 'viewing history';
		if (!cv.savedAt) return '';
		const at = cv.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		return `saved ${at}`;
	});

	onMount(() => {
		files.init();
		cv.bindEditor((text) => editor?.replaceAll(text));
		cv.init(/** @type {string} */ (files.activeId));

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
		const docId = cv.docId;
		if (!text) return;
		if (!parsed || docId !== lastParsedDocId) {
			// First paint, and switching to a different document (tab switch, new file,
			// clear history) shouldn't wait on the debounce meant for keystrokes.
			lastParsedDocId = docId;
			reparse(text);
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

	/** @param {string} id */
	function setLayout(id) {
		if (files.activeId) files.setStyle(files.activeId, { layout: id });
	}

	/** @param {string} id */
	function setTheme(id) {
		if (files.activeId) files.setStyle(files.activeId, { theme: id });
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

	function toggleSource() {
		sourceHidden = !sourceHidden;
		write(KEYS.sourceHidden, String(sourceHidden));
	}

	/** Open a fresh tab holding the shipped template — no snapshot yet, so `CvDoc` seeds one. */
	function newFile() {
		const id = files.create();
		cv.switchTo(id);
		toast('New CV from template');
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

	/** @param {string} id */
	function selectTab(id) {
		if (id === files.activeId) return;
		files.switchTo(id);
		cv.switchTo(id);
	}

	function duplicateTab() {
		cv.flush(); // capture the latest edits before copying the stored snapshot
		const id = files.duplicate(/** @type {string} */ (files.activeId));
		cv.switchTo(id);
		toast('Tab duplicated');
	}

	/** @param {string} id */
	function closeTab(id) {
		const closingActive = id === files.activeId;
		const name = files.files.find((f) => f.id === id)?.name ?? 'File';
		const nextId = files.trash(id);
		if (closingActive) cv.switchTo(nextId);
		toast(`Moved “${name}” to trash`);
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	function renameTab(id, name) {
		files.rename(id, name);
	}

	function toggleTrash() {
		trashOpen = !trashOpen;
	}

	/** @param {string} id */
	function restoreTab(id) {
		files.restore(id);
		cv.switchTo(id);
		toast('Restored from trash');
	}

	/** @param {string} id */
	function purgeTab(id) {
		if (!confirm('Delete this file forever? This cannot be undone.')) return;
		files.purge(id);
		toast('File deleted forever');
	}

	function emptyTrash() {
		if (!files.trashed.length) return;
		if (!confirm(`Permanently delete ${files.trashed.length} file(s) from trash? This cannot be undone.`))
			return;
		for (const f of files.trashed) files.purge(f.id);
		toast('Trash emptied');
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
		{sourceHidden}
		{layout}
		{theme}
		onLayout={setLayout}
		onTheme={setTheme}
		onToggleTheme={toggleTheme}
		onToggleHistory={toggleHistory}
		onToggleSource={toggleSource}
	/>

	<TabBar
		{files}
		onSelect={selectTab}
		onDuplicate={duplicateTab}
		onClose={closeTab}
		onRename={renameTab}
		{trashOpen}
		onToggleTrash={toggleTrash}
		onNew={newFile}
		onCopy={copyYaml}
		onExport={exportPDF}
	/>

	{#if trashOpen}
		<TrashPanel {files} onRestore={restoreTab} onPurge={purgeTab} onEmpty={emptyTrash} onClose={toggleTrash} />
	{/if}

	<!-- The drag width rides on a custom property rather than the pane's own
	     `width`, so the stacked (narrow-screen) layout can ignore it in CSS. -->
	<div id="split" bind:this={split} style:--editor-w={editorWidth}>
		<div id="editor-pane" class:hidden={sourceHidden}>
			{#if cv.ready}
				<!-- Re-keyed when the document is swapped (history cleared, or another
				     tab's document taken over): the binding is tied to one LoroDoc. -->
				{#key cv.docId}
					<YamlEditor
						bind:this={editor}
						loroExtensions={cv.extensions}
						readOnly={cv.isViewingHistory}
						diff={cv.diff}
					/>
				{/key}
			{:else}
				<div id="boot">Loading editor…</div>
			{/if}
		</div>

		<button
			type="button"
			id="divider"
			class:hidden={sourceHidden}
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
			<div id="cv-root" data-cv-layout={layout} data-cv-theme={theme}>
				<svelte:boundary>
					{#if parsed}
						<CvSheet cv={parsed} {layout} />
					{/if}
					{#snippet failed(error)}
						<div class="sheet">
							<p class="cv-unknown">
								Could not render: {error instanceof Error ? error.message : String(error)}
							</p>
						</div>
					{/snippet}
				</svelte:boundary>
			</div>
		</div>

		{#if historyOpen && cv.ready}
			<HistoryPanel doc={cv} {toast} />
		{/if}
	</div>
</div>

<div id="toast" class:show={toastOn}>{toastMsg}</div>
