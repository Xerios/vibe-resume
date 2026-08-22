<script>
	/**
	 * A template's thumbnail: the wireframe drawn in the Style popover and on the
	 * template page. The names alone don't say much, and a sketch reads faster
	 * than switching to find out.
	 *
	 * Only the five that ship have one. A template of your own gets the neutral
	 * sheet at the foot, since nothing here can know what its markup does.
	 */

	/** @type {{ id: string }} */
	let { id } = $props();
</script>

<svg viewBox="0 0 36 26" aria-hidden="true">
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
	{:else}
		<rect x="3" y="3" width="30" height="20" rx="2" opacity="0.18" />
		<rect x="7" y="7" width="13" height="3" />
		<rect x="7" y="13" width="22" height="1.6" opacity="0.4" />
		<rect x="7" y="17" width="16" height="1.6" opacity="0.4" />
	{/if}
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		fill: currentColor;
	}

	/* The accent parts — rules and timeline dots. */
	.rule {
		fill: var(--accent);
	}
</style>
