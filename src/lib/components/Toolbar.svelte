<script>
	let {
		valid = true,
		/** @type {string} */
		saveLabel = '',
		historyOpen = false,
		historyCount = 0,
		/** @type {() => void} */
		onToggleTheme,
		/** @type {() => void} */
		onToggleHistory,
		/** @type {() => void} */
		onReset,
		/** @type {() => void} */
		onCopy,
		/** @type {() => void} */
		onExport
	} = $props();
</script>

<div id="toolbar">
	<span class="t-label">CV</span>
	<div id="status" class={valid ? 'ok' : 'err'}>{valid ? '✓ Valid' : '✗ Error'}</div>
	<button class="t-btn" onclick={onToggleTheme} title="Toggle dark mode" style="padding:4px 9px">
		<svg
			class="icon-moon"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
		<svg
			class="icon-sun"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
			/>
		</svg>
	</button>

	<div class="t-spacer"></div>

	<span id="save-state">{saveLabel}</span>

	<button
		class="t-btn"
		class:on={historyOpen}
		onclick={onToggleHistory}
		title="Show version history"
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
			<path d="M3 3v5h5" />
			<path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
			<path d="M12 7v5l4 2" />
		</svg>
		History
		{#if historyCount}<span class="t-count">{historyCount}</span>{/if}
	</button>

	<button class="t-btn" onclick={onReset} title="Restore the shipped template as a new version">
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
			<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
		</svg>
		Reset
	</button>

	<button class="t-btn" onclick={onCopy} title="Copy YAML to clipboard">
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
			<rect width="14" height="14" x="8" y="8" rx="2" />
			<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
		</svg>
		Copy YAML
	</button>

	<button class="t-btn t-btn-pdf" onclick={onExport} title="Export current CV as PDF">
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
		Export PDF
	</button>
</div>
