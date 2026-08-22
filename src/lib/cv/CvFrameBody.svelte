<script>
	/**
	 * What actually gets mounted inside the preview frame: the active template,
	 * the guard that keeps a not-yet-parsed document from reaching it, and the
	 * boundary that catches a render it can't survive.
	 *
	 * The template arrives as a component rather than being imported, because it
	 * was compiled from text a moment ago (see compile-template.js). A compile
	 * error never gets this far — the page keeps showing the last template that
	 * worked — but a template that compiles and then throws on this particular
	 * CV is exactly what the boundary is for.
	 *
	 * Deliberately styleless: a scoped style block here would be compiled into
	 * the *app's* stylesheet and never reach the frame.
	 */

	/** @type {{ cv?: any, component?: any }} */
	let { cv = null, component = null } = $props();
</script>

<!-- Keyed on the template: a boundary that has caught an error stays failed
     until it is rebuilt, and a recompile is the user's way of saying "try
     again". -->
{#key component}
	<svelte:boundary>
		{#if cv && component}
			{@const Template = component}
			<Template {cv} />
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
{/key}
