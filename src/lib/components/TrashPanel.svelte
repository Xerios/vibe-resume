<script>
	import { relativeTime } from '$lib/cv/storage.js';

	let {
		/** @type {import('$lib/cv/files.svelte.js').FileManager} */
		files,
		/** @type {(id: string) => void} */
		onRestore,
		/** @type {(id: string) => void} */
		onPurge,
		/** @type {() => void} */
		onEmpty,
		/** @type {() => void} */
		onClose
	} = $props();

	/** Ticks so the "x minutes ago" labels stay honest. */
	let now = $state(Date.now());

	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});

	/**
	 * Ignores the trash toggle button itself, so a click that closes this panel
	 * doesn't also let the button's own handler immediately reopen it.
	 * @param {HTMLElement} node
	 */
	function clickOutside(node) {
		/** @param {PointerEvent} e */
		function handle(e) {
			const target = /** @type {Element | null} */ (e.target);
			if (node.contains(/** @type {Node | null} */ (target))) return;
			if (target?.closest('#trash-toggle')) return;
			onClose();
		}
		document.addEventListener('pointerdown', handle);
		return { destroy: () => document.removeEventListener('pointerdown', handle) };
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div id="trash-panel" use:clickOutside>
	<div class="trash-head">
		<span>Trash</span>
		<span>{files.trashed.length} file{files.trashed.length === 1 ? '' : 's'}</span>
	</div>

	<ul class="trash-list">
		{#each files.trashed as f (f.id)}
			<li class="trash-row">
				<div class="trash-info">
					<span class="trash-name">{f.name}</span>
					<span class="trash-time">deleted {relativeTime(f.deletedAt, now)}</span>
				</div>
				<div class="trash-actions">
					<button class="t-btn" onclick={() => onRestore(f.id)}>Restore</button>
					<button class="trash-purge" title="Delete forever" onclick={() => onPurge(f.id)}>
						Delete
					</button>
				</div>
			</li>
		{:else}
			<li class="trash-empty">Trash is empty.</li>
		{/each}
	</ul>

	{#if files.trashed.length}
		<div class="trash-foot">
			<button onclick={onEmpty}>Empty trash</button>
		</div>
	{/if}
</div>
