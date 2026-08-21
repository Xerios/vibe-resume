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
