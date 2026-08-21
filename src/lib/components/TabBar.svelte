<script>
	import Icon from "@iconify/svelte";
	import IconCopy from "@iconify-icons/lucide/copy";
	import IconFilePlus from "@iconify-icons/lucide/file-plus";
	import IconTrash from "@iconify-icons/lucide/trash";
	import IconDownload from "@iconify-icons/lucide/download";

	let {
		/** @type {import('$lib/cv/files.svelte.js').FileManager} */
		files,
		/** @type {(id: string) => void} */
		onSelect,
		/** @type {() => void} */
		onDuplicate,
		/** @type {(id: string) => void} */
		onClose,
		/** @type {(id: string, name: string) => void} */
		onRename,
		trashOpen = false,
		/** @type {() => void} */
		onToggleTrash,
		/** @type {() => void} */
		onNew,
		/** @type {() => void} */
		onCopy,
		/** @type {() => void} */
		onExport,
	} = $props();

	let editingId = $state(/** @type {string | null} */ (null));
	let editValue = $state("");

	/** @param {import('$lib/cv/files.svelte.js').FileMeta} f */
	function startRename(f) {
		editingId = f.id;
		editValue = f.name;
	}

	function commitRename() {
		if (editingId) onRename(editingId, editValue);
		editingId = null;
	}

	/** @param {KeyboardEvent} e */
	function onRenameKeydown(e) {
		if (e.key === "Enter") commitRename();
		if (e.key === "Escape") editingId = null;
	}

	/** @param {HTMLInputElement} node */
	function focusAndSelect(node) {
		node.focus();
		node.select();
	}
</script>

<div id="tabbar">
	<!-- Only the tabs scroll: the actions on the right stay reachable however
	     many files are open, and on however narrow a screen. -->
	<div id="tabs">
		{#each files.open as f (f.id)}
			<div class="tab" class:active={f.id === files.activeId}>
				{#if editingId === f.id}
					<input
						class="tab-rename"
						bind:value={editValue}
						use:focusAndSelect
						onblur={commitRename}
						onkeydown={onRenameKeydown}
					/>
				{:else}
					<button
						class="tab-select"
						title={f.name}
						onclick={() => onSelect(f.id)}
						ondblclick={() => startRename(f)}
					>
						{f.name}
					</button>
				{/if}
				<button
					class="tab-close"
					title="Close (moves to trash)"
					onclick={() => onClose(f.id)}
				>
					×
				</button>
			</div>
		{/each}
		<button
			id="tab-add"
			onclick={onDuplicate}
			title="Duplicate the current file into a new tab"
		>
			<Icon icon={IconCopy} width="12" height="12" />
		</button>
	</div>

	<div id="tab-actions">
		<button
			class="t-btn"
			onclick={onNew}
			title="Start a new CV from the shipped template"
		>
			<Icon icon={IconFilePlus} width="12" height="12" />
			<span class="t-txt">Add new</span>
		</button>

		<button
			id="trash-toggle"
			class="t-btn"
			class:on={trashOpen}
			onclick={onToggleTrash}
			title="Trash"
		>
			<Icon icon={IconTrash} width="12" height="12" />
			<span class="t-txt">Trash</span>
			{#if files.trashed.length}<span class="t-count"
					>{files.trashed.length}</span
				>{/if}
		</button>
		<button
			class="t-btn t-btn-pdf"
			onclick={onExport}
			title="Export current CV as PDF"
		>
			<Icon icon={IconDownload} width="12" height="12" />
			<span class="t-txt">Export PDF</span>
		</button>
	</div>
</div>

<style>
	#tabbar {
		flex-shrink: 0;
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 10px;
		background: var(--editor-chrome);
		border-bottom: 1px solid var(--line);
		z-index: 9;
		transition: var(--theme-fade);
	}

	/* The scroller, so a long row of tabs never pushes #tab-actions out of reach.
	   Its scrollbar is hidden: 34px leaves no room for one that isn't overlaid. */
	#tabs {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 3px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	#tabs::-webkit-scrollbar {
		display: none;
	}

	#tab-actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tab {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 1px;
		background: none;
		border: 1.5px solid transparent;
		border-radius: 5px;
		transition: var(--theme-fade);
	}

	.tab:hover {
		background: var(--accent-wash);
	}

	.tab.active {
		background: var(--paper);
		border-color: var(--line);
	}

	.tab-select {
		display: block;
		max-width: 150px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--muted);
		padding: 6px 4px 6px 9px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tab.active .tab-select {
		color: var(--accent-deep);
		font-weight: 600;
	}

	.tab-rename {
		max-width: 150px;
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--ink);
		background: var(--paper);
		border: 1px solid var(--accent);
		border-radius: 3px;
		margin: 3px 4px 3px 9px;
		padding: 3px 5px;
	}

	.tab-rename:focus {
		outline: none;
	}

	.tab-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		margin-right: 6px;
		background: none;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		color: var(--faint);
		font-size: 13px;
		line-height: 1;
		padding: 0;
	}

	.tab-close:hover {
		background: var(--line);
		color: var(--danger);
	}

	#tab-add {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: none;
		border: 1.5px dashed var(--line);
		border-radius: 5px;
		cursor: pointer;
		color: var(--muted);
		padding: 0;
		margin-left: 2px;
		transition:
			border-color 0.13s,
			color 0.13s;
	}

	#tab-add:hover {
		border-color: var(--accent);
		color: var(--accent-deep);
		border-style: solid;
	}

	/* Matches the weight .t-btn gives its icons; the glyph is drawn by <Icon>,
	   so the compiler never sees the element to scope it. */
	#tab-add :global([stroke-width]) {
		stroke-width: 2.5;
	}

	@media (max-width: 640px) {
		#tabbar {
			gap: 6px;
			padding: 0 6px;
		}

		.tab-select,
		.tab-rename {
			max-width: 104px;
		}
	}
</style>
