<script>
	import Icon from '@iconify/svelte';
	import IconHistory from '@iconify-icons/lucide/history';
	import IconEye from '@iconify-icons/lucide/eye';
	import IconEyeOff from '@iconify-icons/lucide/eye-off';
	import IconInstall from '@iconify-icons/lucide/arrow-down-to-line';
	import IconMoon from '@iconify-icons/lucide/moon';
	import IconSun from '@iconify-icons/lucide/sun';
	import StylePicker from './StylePicker.svelte';

	let {
		valid = true,
		/** @type {string} */
		saveLabel = '',
		historyOpen = false,
		historyCount = 0,
		sourceHidden = false,
		/** True only while the browser has an install prompt waiting for us. */
		canInstall = false,
		/** @type {string} */
		layout,
		/** @type {string} */
		theme,
		/** @type {(id: string) => void} */
		onLayout,
		/** @type {(id: string) => void} */
		onTheme,
		/** @type {() => void} */
		onToggleTheme,
		/** @type {() => void} */
		onToggleHistory,
		/** @type {() => void} */
		onToggleSource,
		/** @type {() => void} */
		onInstall
	} = $props();
</script>

<div id="toolbar">
	<span class="t-label">CV</span>
	<div id="status" class={valid ? 'ok' : 'err'}>{valid ? '✓ Valid' : '✗ Error'}</div>

	<div class="t-spacer"></div>

	<span id="save-state">{saveLabel}</span>

	<StylePicker {layout} {theme} {onLayout} {onTheme} />

	<button
		class="t-btn"
		class:on={historyOpen}
		onclick={onToggleHistory}
		title="Show version history"
	>
		<Icon icon={IconHistory} width="12" height="12" />
		<span class="t-txt">History</span>
		{#if historyCount}<span class="t-count">{historyCount}</span>{/if}
	</button>

	<button
		class="t-btn"
		class:on={sourceHidden}
		onclick={onToggleSource}
		title={sourceHidden ? 'Show source' : 'Hide source (preview only)'}
	>
		{#if sourceHidden}
			<Icon icon={IconEyeOff} width="12" height="12" />
		{:else}
			<Icon icon={IconEye} width="12" height="12" />
		{/if}
		<span class="t-txt">{sourceHidden ? 'Preview only' : 'Source'}</span>
	</button>

	<!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
	{#if canInstall}
		<button class="t-btn" onclick={onInstall} title="Install as an app — runs offline">
			<Icon icon={IconInstall} width="12" height="12" />
			<span class="t-txt">Install</span>
		</button>
	{/if}

	<!-- Last in the bar on purpose: the app-chrome theme is a setting, not an
	     editing action, so it sits apart from the buttons that change the CV. -->
	<button class="t-btn t-btn-icon" onclick={onToggleTheme} title="Toggle dark mode">
		<Icon icon={IconMoon} class="icon-moon" width="13" height="13" />
		<Icon icon={IconSun} class="icon-sun" width="13" height="13" />
	</button>
</div>

<style>
	#toolbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 46px;
		padding: 0 16px;
		background: var(--paper);
		border-bottom: 1px solid var(--line);
		z-index: 10;
		transition: var(--theme-fade);
	}

	.t-label {
		font-family: var(--mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 1.8px;
		text-transform: uppercase;
		color: var(--muted);
	}

	#status {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		padding: 3px 9px;
		border-radius: 4px;
		transition: var(--theme-fade);
	}

	#status.ok {
		color: #1a6b3a;
		background: #e8f5ee;
	}

	#status.err {
		color: var(--danger);
		background: #fee2e2;
	}

	/* Tints with no token of their own — the red foreground comes from --danger. */
	:root[data-theme='dark'] #status.ok {
		color: #5dcc80;
		background: #082210;
	}

	:root[data-theme='dark'] #status.err {
		background: #2a0808;
	}

	#save-state {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.3px;
		color: var(--faint);
		white-space: nowrap;
	}

	/* One toggle, two glyphs: the ramp in force decides which is drawn. Both
	   are rendered by <Icon>, so the classes land on SVG the compiler never
	   sees — hence :global. */
	:global(.icon-moon) {
		display: block;
	}

	:global(.icon-sun) {
		display: none;
	}

	:root[data-theme='dark'] :global(.icon-moon) {
		display: none;
	}

	:root[data-theme='dark'] :global(.icon-sun) {
		display: block;
	}

	/* At phone width the bar keeps only what can't be inferred: the label is
	   the page title again, and the save state is a reassurance, not news. */
	@media (max-width: 640px) {
		#toolbar {
			gap: 8px;
			padding: 0 10px;
		}

		.t-label,
		#save-state {
			display: none;
		}
	}
</style>
