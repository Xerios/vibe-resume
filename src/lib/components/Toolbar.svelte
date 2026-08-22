<script>
	import Icon from "@iconify/svelte";
	import IconDownload from "@iconify-icons/lucide/download";
	import IconInstall from "@iconify-icons/lucide/arrow-down-to-line";
	import StylePicker from "./StylePicker.svelte";
	import { withKey } from "./access-keys.js";

	let {
		/** True only while the browser has an install prompt waiting for us. */
		canInstall = false,
		/** @type {import('$lib/cv/templates.svelte.js').Template[]} */
		templates,
		/** The active file's template id. @type {string} */
		layout,
		/** @type {string} */
		theme,
		/** @type {(id: string) => void} */
		onLayout,
		/** @type {(id: string) => void} */
		onTheme,
		/** The active file's own CSS, and the setter behind the picker's editor. */
		css = "",
		/** @type {(text: string) => void} */
		onCss,
		/** @type {() => void} */
		onExport,
		/** @type {() => void} */
		onInstall,
	} = $props();
</script>

<div id="toolbar">
	<span class="t-label">Resume - Offline-ready & Local editor</span>

	<div class="t-spacer"></div>

	<StylePicker
		{templates}
		{layout}
		{theme}
		{css}
		{onLayout}
		{onTheme}
		{onCss}
	/>

	<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
	<button
		class="t-btn t-btn-pdf"
		accesskey="x"
		title={withKey("Export the current CV as PDF", "x")}
		onclick={onExport}
	>
		<Icon icon={IconDownload} width="12" height="12" />
		<span class="t-txt">E<u>x</u>port PDF</span>
	</button>

	<!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
	{#if canInstall}
		<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
		<button
			class="t-btn"
			onclick={onInstall}
			accesskey="i"
			title={withKey("Install as an app — runs offline", "i")}
		>
			<Icon icon={IconInstall} width="12" height="12" />
			<span class="t-txt"><u>I</u>nstall</span>
		</button>
	{/if}
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
