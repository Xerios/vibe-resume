<script>
	import { formatBytes } from "$lib/cv/storage.js";

	let {
		/** @type {import('$lib/cv/doc.svelte.js').CvDoc} */
		doc,
		/** @type {(msg: string) => void} */
		toast,
	} = $props();

	let name = $state("");
	/** Ticks so the "x minutes ago" labels stay honest. */
	let now = $state(Date.now());

	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});

	const latestKey = $derived(doc.entries[0]?.key);

	/** @param {SubmitEvent} e */
	function saveCheckpoint(e) {
		e.preventDefault();
		const label = name.trim();
		doc.checkpoint(label);
		toast(label ? `Saved “${label}”` : "Version saved");
		name = "";
	}

	/** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
	function select(entry) {
		if (entry.key === latestKey) doc.viewLatest();
		else doc.view(entry);
	}

	/** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
	function ago(entry) {
		if (!entry.timestamp) return "unknown time";
		const secs = Math.max(0, Math.round(now / 1000 - entry.timestamp));
		if (secs < 60) return "just now";
		if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
		if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`;
		return new Date(entry.timestamp * 1000).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	}

	/** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
	function exactTime(entry) {
		if (!entry.timestamp) return "";
		return new Date(entry.timestamp * 1000).toLocaleString();
	}

	/** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
	function tooltip(entry) {
		const when = exactTime(entry);
		const ops = entry.key === latestKey ? "latest" : `${entry.length} ops`;
		return when ? `${when} — ${ops}` : ops;
	}

	function clearHistory() {
		if (
			!confirm(
				"Delete every past version? The current text is kept, the rest is gone.",
			)
		)
			return;
		doc.clearHistory();
		toast("History cleared");
	}
</script>

<aside id="history-pane">
	<div class="hist-head">
		<div class="hist-title">
			<span>History</span>
			<span
				>{doc.history.length} version{doc.history.length === 1 ? "" : "s"}</span
			>
		</div>
		<form class="hist-form" onsubmit={saveCheckpoint}>
			<input
				bind:value={name}
				placeholder="Name this version…"
				maxlength="60"
				disabled={doc.isViewingHistory}
			/>
			<button class="t-btn" type="submit" disabled={doc.isViewingHistory}
				>Save</button
			>
		</form>
	</div>

	<ul class="hist-list">
		{#each doc.entries as entry (entry.key)}
			{@const isLatest = entry.key === latestKey}
			{@const isActive = doc.viewingKey
				? doc.viewingKey === entry.key
				: isLatest}
			<li class="hist-row">
				<button
					class="hist-item"
					class:active={isActive}
					class:latest={isLatest}
					title={tooltip(entry)}
					onclick={() => select(entry)}
				>
					<span class="hist-msg">{entry.message}</span>
					<span class="hist-time">{ago(entry)}</span>
				</button>
				<!-- {#if isActive && !isLatest}
					<button class="hist-restore" onclick={() => doc.restore(entry)}>
						Restore this version
					</button>
				{/if} -->
			</li>
		{:else}
			<li class="hist-empty">
				No versions yet. Edits are recorded automatically as you type.
			</li>
		{/each}
	</ul>

	<div class="hist-foot">
		<span title="Size of the CRDT snapshot in localStorage">
			{formatBytes(doc.snapshotBytes)} stored
		</span>
		<button onclick={clearHistory}>Clear history</button>
	</div>
</aside>
