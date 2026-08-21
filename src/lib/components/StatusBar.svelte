<script>
	let {
		valid = true,
		/** @type {string} */
		saveLabel = ''
	} = $props();
</script>

<!-- The two facts the editor reports rather than asks for: whether the YAML
     parses, and when it was last written to storage. Both used to sit in the
     toolbar among the buttons, where a passive readout reads as one more
     control. -->
<div id="status-bar">
	<span id="status" class={valid ? 'ok' : 'err'}>{valid ? '✓ Valid' : '✗ Error'}</span>
	<div class="t-spacer"></div>
	{#if saveLabel}<span id="save-state">{saveLabel}</span>{/if}
</div>

<style>
	#status-bar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 24px;
		padding: 0 12px;
		background: var(--paper);
		border-top: 1px solid var(--line);
		z-index: 8;
		transition: var(--theme-fade);
	}

	#status {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 600;
		padding: 1px 7px;
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
</style>
