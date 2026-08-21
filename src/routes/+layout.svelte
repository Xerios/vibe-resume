<script>
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import '$lib/cv/cv.css';
	// After cv.css: the presets re-point its tokens and override its rules.
	import '$lib/cv/presets.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
