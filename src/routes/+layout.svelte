<script>
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import '$lib/cv/cv.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
