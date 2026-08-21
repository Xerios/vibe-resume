<script>
	import favicon from '$lib/assets/favicon.svg';
	// App chrome: tokens, then the base document, then the shared controls.
	// Everything else is styled inside the component it belongs to.
	import '../app.css';
	// The CV sheet — global, since its markdown is injected with {@html}.
	import '$lib/cv/cv.css';
	// After cv.css: the presets re-point its tokens and override its rules.
	import '$lib/cv/presets.css';
	// Last, so its token flip outranks the dark ramp.
	import '$lib/styles/print.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
