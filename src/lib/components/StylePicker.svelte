<script>
	import { LAYOUTS, THEMES } from '$lib/cv/presets.js';

	let {
		/** @type {string} */
		layout,
		/** @type {string} */
		theme,
		/** @type {(id: string) => void} */
		onLayout,
		/** @type {(id: string) => void} */
		onTheme
	} = $props();

	let open = $state(false);
	/** @type {HTMLDivElement} */
	let root;

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
			if (e.key === 'Escape') open = false;
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
	<button
		class="t-btn"
		class:on={open}
		onclick={() => (open = !open)}
		title="Layout and theme"
		aria-expanded={open}
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
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<line x1="9" y1="3" x2="9" y2="21" />
			<line x1="9" y1="11" x2="21" y2="11" />
		</svg>
		Style
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
		</div>
	{/if}
</div>
