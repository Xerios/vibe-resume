<script>
	import Icon from '@iconify/svelte';
	import IconLayout from '@iconify-icons/lucide/layout-panel-left';
	import { LAYOUTS, THEMES } from '$lib/cv/presets.js';
	import { withKey } from './access-keys.js';

	let {
		/** @type {string} */
		layout,
		/** @type {string} */
		theme,
		/** @type {(id: string) => void} */
		onLayout,
		/** @type {(id: string) => void} */
		onTheme,
		/** The active file's own CSS — see the editor at the foot of the popover. */
		css = '',
		/** @type {(text: string) => void} */
		onCss
	} = $props();

	/**
	 * Seeded into an empty editor, so the tokens worth overriding are discoverable
	 * without having to read frame.css to find out what they are called.
	 */
	const CSS_TEMPLATE = `#cv-root {
	--sans: Georgia, 'Times New Roman', serif;
	--accent: #157c75;
	--ink: #15211f;
	--paper: #ffffff;
}
`;

	let open = $state(false);
	let cssOpen = $state(false);
	/** @type {HTMLDivElement} */
	let root;
	let toggle = $state(/** @type {HTMLButtonElement | undefined} */ (undefined));

	// Picking is not a commitment — the popover stays up so layouts and themes
	// can be tried against each other, and closes on Escape or a click elsewhere.
	$effect(() => {
		if (!open) return;

		/** @param {PointerEvent} e */
		const onPointerDown = (e) => {
			if (!root.contains(/** @type {Node | null} */ (e.target))) open = false;
		};
		/** @param {KeyboardEvent} e */
		const onKeydown = (e) => {
			if (e.key !== 'Escape') return;
			open = false;
			// Dismissing by keyboard has to leave focus somewhere; the button that
			// opened the popover is where it came from.
			toggle?.focus();
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeydown);
		};
	});
</script>

<!-- Wireframes of each arrangement: the names alone don't say much, and a
     thumbnail reads faster than switching to find out. -->
{#snippet thumb(/** @type {string} */ id)}
	<svg class="layout-thumb" viewBox="0 0 36 26" aria-hidden="true">
		{#if id === 'classic'}
			<rect x="3" y="3" width="17" height="4" />
			<rect x="26" y="4" width="7" height="2" opacity="0.5" />
			<rect x="3" y="9.5" width="30" height="1" class="rule" />
			<rect x="3" y="13" width="30" height="1.6" opacity="0.4" />
			<rect x="3" y="17" width="30" height="1.6" opacity="0.4" />
			<rect x="3" y="21" width="21" height="1.6" opacity="0.4" />
		{:else if id === 'compact'}
			<rect x="3" y="3" width="13" height="3" />
			<rect x="27" y="3.5" width="6" height="2" opacity="0.5" />
			<rect x="3" y="8" width="30" height="1" class="rule" />
			{#each [10.5, 13.5, 16.5, 19.5, 22.5] as y}
				<rect x="3" y={y} width="30" height="1.4" opacity="0.4" />
			{/each}
		{:else if id === 'centered'}
			<rect x="11" y="3" width="14" height="4" />
			<rect x="14" y="8.5" width="8" height="2" opacity="0.5" />
			<rect x="3" y="13" width="9" height="1" class="rule" />
			<rect x="24" y="13" width="9" height="1" class="rule" />
			<rect x="6" y="17" width="24" height="1.6" opacity="0.4" />
			<rect x="9" y="21" width="18" height="1.6" opacity="0.4" />
		{:else if id === 'sidebar'}
			<rect x="3" y="3" width="17" height="4" />
			<rect x="26" y="4" width="7" height="2" opacity="0.5" />
			<rect x="3" y="9.5" width="30" height="1" class="rule" />
			<rect x="3" y="13" width="9" height="10" opacity="0.28" />
			<rect x="15" y="13" width="18" height="1.6" opacity="0.4" />
			<rect x="15" y="17" width="18" height="1.6" opacity="0.4" />
			<rect x="15" y="21" width="12" height="1.6" opacity="0.4" />
		{:else if id === 'timeline'}
			<rect x="3" y="3" width="17" height="4" />
			<rect x="26" y="4" width="7" height="2" opacity="0.5" />
			<rect x="3" y="9.5" width="30" height="1" class="rule" />
			<rect x="5" y="13" width="1" height="10" opacity="0.35" />
			{#each [13, 17.5, 22] as y}
				<circle cx="5.5" cy={y + 0.8} r="1.8" class="rule" />
				<rect x="10" y={y} width="23" height="1.6" opacity="0.4" />
			{/each}
		{/if}
	</svg>
{/snippet}

<div class="style-picker" bind:this={root}>
	<!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
	<button
		class="t-btn"
		class:on={open}
		bind:this={toggle}
		onclick={() => (open = !open)}
		accesskey="s"
		title={withKey('Layout and theme', 's')}
		aria-expanded={open}
	>
		<Icon icon={IconLayout} width="12" height="12" />
		<span><u>S</u>tyle</span>
	</button>

	{#if open}
		<div class="style-pop">
			<div class="style-group">
				<span class="style-label">Layout</span>
				<div class="layout-grid">
					{#each LAYOUTS as l (l.id)}
						<button
							class="layout-opt"
							class:on={l.id === layout}
							title={l.hint}
							aria-pressed={l.id === layout}
							onclick={() => onLayout(l.id)}
						>
							{@render thumb(l.id)}
							<span>{l.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="style-group">
				<span class="style-label">Theme</span>
				<div class="theme-grid">
					{#each THEMES as t (t.id)}
						<button
							class="theme-opt"
							class:on={t.id === theme}
							title={t.name}
							aria-pressed={t.id === theme}
							onclick={() => onTheme(t.id)}
							data-cv-theme={t.id}
						>
							<span class="theme-dot"></span>
							<span>{t.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Anything at all, applied last inside the preview frame. It can't
			     reach the editor around it, so there is nothing to validate. -->
			<div class="style-group">
				<button
					class="css-toggle"
					aria-expanded={cssOpen}
					onclick={() => (cssOpen = !cssOpen)}
				>
					<span class="style-label">Custom CSS</span>
					<span class="css-caret" class:on={cssOpen}>›</span>
				</button>
				{#if cssOpen}
					<textarea
						class="css-edit"
						spellcheck="false"
						autocapitalize="off"
						autocomplete="off"
						value={css}
						placeholder={CSS_TEMPLATE}
						aria-label="Custom CSS for this CV"
						oninput={(e) => onCss(e.currentTarget.value)}
					></textarea>
					<p class="css-hint">
						Applies to this file only. Override the tokens on <code
							>#cv-root</code
						>, or style the sheet directly.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.style-picker {
		position: relative;
		display: flex;
	}

	.style-pop {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 268px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		box-shadow: var(--shadow-pop);
		z-index: 100;
	}

	/* The disclosure is the label: the whole row is the hit target, so the caret
	   doesn't need one of its own. */
	.css-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
	}

	.css-toggle .style-label {
		margin-bottom: 0;
	}

	.css-toggle:hover .style-label {
		color: var(--accent-deep);
	}

	.css-caret {
		font-size: 13px;
		line-height: 1;
		color: var(--faint);
		transition: transform 0.14s;
	}

	.css-caret.on {
		transform: rotate(90deg);
	}

	.css-edit {
		display: block;
		width: 100%;
		height: 132px;
		margin-top: 7px;
		padding: 7px 8px;
		background: var(--editor-bg);
		border: 1.5px solid var(--line);
		border-radius: 6px;
		color: var(--ink);
		font-family: var(--mono);
		font-size: 10.5px;
		line-height: 1.55;
		tab-size: 2;
		resize: vertical;
		white-space: pre;
		overflow: auto;
	}

	.css-edit:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* The template shows through as the placeholder, so an empty editor still
	   says which tokens are worth reaching for. */
	.css-edit::placeholder {
		color: var(--faint);
	}

	.css-hint {
		margin: 6px 0 0;
		font-size: 10px;
		line-height: 1.45;
		color: var(--faint);
	}

	.css-hint code {
		font-family: var(--mono);
		font-size: 9.5px;
		color: var(--muted);
	}

	.style-label {
		display: block;
		margin-bottom: 6px;
		font-family: var(--mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 1.8px;
		text-transform: uppercase;
		color: var(--muted);
	}

	.layout-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 5px;
	}

	.layout-opt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 5px 3px 4px;
		background: none;
		border: 1.5px solid var(--line);
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--mono);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.3px;
		color: var(--muted);
		transition:
			border-color 0.13s,
			color 0.13s,
			background 0.13s;
	}

	.layout-opt:hover {
		border-color: var(--accent);
		color: var(--accent-deep);
	}

	.layout-opt.on {
		border-color: var(--accent);
		color: var(--accent-deep);
		background: var(--accent-wash);
	}

	.layout-thumb {
		width: 100%;
		height: auto;
		fill: currentColor;
	}

	/* The accent parts of a thumbnail — rules and timeline dots. */
	.layout-thumb .rule {
		fill: var(--accent);
	}

	.theme-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 4px;
	}

	.theme-opt {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 7px;
		background: none;
		border: 1.5px solid var(--line);
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 600;
		color: var(--muted);
		transition:
			border-color 0.13s,
			color 0.13s,
			background 0.13s;
	}

	.theme-opt:hover {
		border-color: var(--accent);
		color: var(--accent-deep);
	}

	.theme-opt.on {
		border-color: var(--accent);
		color: var(--accent-deep);
		background: var(--accent-wash);
	}

	/* Accent over the sheet colour it sits on, so a swatch previews the pairing.
	   The tokens come from the `data-cv-theme` on the option itself (palettes.css).

	   The light ramp whatever the app is set to, because that is what the sheet
	   renders from — a swatch that darkened with the chrome would be advertising
	   a CV the preview can no longer produce. */
	.theme-dot {
		flex-shrink: 0;
		width: 13px;
		height: 13px;
		border-radius: 50%;
		background: var(--t-accent-l);
		box-shadow:
			inset 0 0 0 3px var(--t-paper-l),
			inset 0 0 0 4px var(--t-accent-l);
	}
</style>
