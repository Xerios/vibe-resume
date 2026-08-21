<script>
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
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="9" y="9" width="12" height="12" rx="2" />
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
			</svg>
		</button>
	</div>

	<div id="tab-actions">
		<button
			class="t-btn"
			onclick={onNew}
			title="Start a new CV from the shipped template"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<polyline points="14 2 14 8 20 8" />
				<line x1="12" y1="18" x2="12" y2="12" />
				<line x1="9" y1="15" x2="15" y2="15" />
			</svg>
			<span class="t-txt">Add new</span>
		</button>

		<button
			id="trash-toggle"
			class="t-btn"
			class:on={trashOpen}
			onclick={onToggleTrash}
			title="Trash"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="3 6 5 6 21 6" />
				<path
					d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2H8V4z"
				/>
			</svg>
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
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			<span class="t-txt">Export PDF</span>
		</button>
	</div>
</div>
