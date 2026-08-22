<script>
	/**
	 * What actually gets mounted inside the preview frame: the sheet, the guard
	 * that keeps a not-yet-parsed document from reaching it, and the boundary
	 * that catches a render it can't survive.
	 *
	 * Separate from CvSheet because PreviewFrame mounts this imperatively into
	 * another document, and `mount()` takes a component rather than markup.
	 * Deliberately styleless: a scoped style block here would be compiled into
	 * the *app's* stylesheet and never reach the frame.
	 */
	import CvSheet from "./CvSheet.svelte";
	import { DEFAULT_LAYOUT } from "./presets.js";

	/** @type {{ cv?: any, layout?: string }} */
	let { cv = null, layout = DEFAULT_LAYOUT } = $props();
</script>

<svelte:boundary>
	{#if cv}
		<CvSheet {cv} {layout} />
	{/if}
	{#snippet failed(error)}
		<div class="sheet">
			<p class="cv-unknown">
				Could not render: {error instanceof Error
					? error.message
					: String(error)}
			</p>
		</div>
	{/snippet}
</svelte:boundary>
