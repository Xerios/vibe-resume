<script>
	import Icon from '@iconify/svelte';
	import IconHistory from '@iconify-icons/lucide/history';
	import IconEye from '@iconify-icons/lucide/eye';
	import IconEyeOff from '@iconify-icons/lucide/eye-off';
	import IconInstall from '@iconify-icons/lucide/arrow-down-to-line';
	import IconMoon from '@iconify-icons/lucide/moon';
	import IconSun from '@iconify-icons/lucide/sun';
	import StylePicker from './StylePicker.svelte';
	import { withKey } from './access-keys.js';

	let {
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

	<div class="t-spacer"></div>

	<StylePicker {layout} {theme} {onLayout} {onTheme} />

	<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
	<button
		class="t-btn"
		class:on={historyOpen}
		onclick={onToggleHistory}
		accesskey="h"
		title={withKey('Show version history', 'h')}
	>
		<Icon icon={IconHistory} width="12" height="12" />
		<span class="t-txt"><u>H</u>istory</span>
		{#if historyCount}<span class="t-count">{historyCount}</span>{/if}
	</button>

	<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
	<button
		class="t-btn"
		class:on={sourceHidden}
		onclick={onToggleSource}
		accesskey="o"
		title={withKey(sourceHidden ? 'Show source' : 'Hide source (preview only)', 'o')}
	>
		{#if sourceHidden}
			<Icon icon={IconEyeOff} width="12" height="12" />
		{:else}
			<Icon icon={IconEye} width="12" height="12" />
		{/if}
		<!-- One letter, two labels: the mnemonic stays put wherever the toggle is. -->
		<span class="t-txt">{#if sourceHidden}Preview <u>o</u>nly{:else}S<u>o</u>urce{/if}</span>
	</button>

	<!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
	{#if canInstall}
		<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
		<button
			class="t-btn"
			onclick={onInstall}
			accesskey="i"
			title={withKey('Install as an app — runs offline', 'i')}
		>
			<Icon icon={IconInstall} width="12" height="12" />
			<span class="t-txt"><u>I</u>nstall</span>
		</button>
	{/if}

	<!-- Last in the bar on purpose: the app-chrome theme is a setting, not an
	     editing action, so it sits apart from the buttons that change the CV. -->
	<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
	<button
		class="t-btn t-btn-icon"
		onclick={onToggleTheme}
		accesskey="k"
		title={withKey('Toggle dark mode', 'k')}
	>
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
	   the page title again. */
	@media (max-width: 640px) {
		#toolbar {
			gap: 8px;
			padding: 0 10px;
		}

		.t-label {
			display: none;
		}
	}
</style>
