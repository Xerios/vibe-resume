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
		onToggleTrash
	} = $props();

	let editingId = $state(/** @type {string | null} */ (null));
	let editValue = $state('');

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
		if (e.key === 'Enter') commitRename();
		if (e.key === 'Escape') editingId = null;
	}

	/** @param {HTMLInputElement} node */
	function focusAndSelect(node) {
		node.focus();
		node.select();
	}
</script>

<div id="tabbar">
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
				<button class="tab-close" title="Close (moves to trash)" onclick={() => onClose(f.id)}>
					×
				</button>
			</div>
		{/each}
		<button id="tab-add" onclick={onDuplicate} title="New tab (duplicates the current file)">
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
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
		</button>
	</div>

	<div class="t-spacer"></div>

	<button id="trash-toggle" class="t-btn" class:on={trashOpen} onclick={onToggleTrash} title="Trash">
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
		Trash
		{#if files.trashed.length}<span class="t-count">{files.trashed.length}</span>{/if}
	</button>
</div>
