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

	/**
	 * The change counts worth showing: a tag moves no text, and entries too far
	 * back to have been counted have none to show.
	 * @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry
	 */
	function counts(entry) {
		const s = entry.stats;
		return s && (s.added || s.removed) ? s : null;
	}

	/** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
	function tooltip(entry) {
		const parts = [exactTime(entry)];
		const s = counts(entry);
		if (s) parts.push(`+${s.added} −${s.removed} characters`);
		if (entry.key === latestKey) parts.push("latest");
		return parts.filter(Boolean).join(" — ");
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

<!-- One glyph per kind of moment, so the list can be read down the left edge:
     a dot is a plain edit, everything else is something the user asked for. -->
{#snippet mark(/** @type {import('$lib/cv/doc.svelte.js').ChangeKind} */ kind)}
	<svg
		class="hist-mark"
		width="11"
		height="11"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if kind === "export"}
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<path d="M7 10l5 5 5-5M12 15V3" />
		{:else if kind === "checkpoint"}
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
		{:else if kind === "restore"}
			<path d="M3 3v5h5" />
			<path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
		{:else if kind === "initial"}
			<circle cx="12" cy="12" r="8" />
			<circle cx="12" cy="12" r="2.5" fill="currentColor" />
		{:else}
			<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
		{/if}
	</svg>
{/snippet}

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
			{@const stats = counts(entry)}
			<li class="hist-row">
				<button
					class="hist-item kind-{entry.kind}"
					class:active={isActive}
					class:latest={isLatest}
					title={tooltip(entry)}
					onclick={() => select(entry)}
				>
					{@render mark(entry.kind)}
					<span class="hist-msg">{entry.message}</span>
					{#if stats}
						<span class="hist-stats">
							{#if stats.added}<span class="stat-add">+{stats.added}</span>{/if}
							{#if stats.removed}<span class="stat-del">−{stats.removed}</span
								>{/if}
						</span>
					{/if}
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
