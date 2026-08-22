<script>
	import favicon from '$lib/assets/favicon.svg';
	// App chrome: tokens, then the base document, then the shared controls.
	// Everything else is styled inside the component it belongs to.
	import '../app.css';
	// The CV's own stylesheets are *not* loaded here — the sheet renders inside
	// an iframe and PreviewFrame.svelte writes them into it. The palettes are
	// the exception: StylePicker draws each swatch from `data-cv-theme` on the
	// option itself, so the app needs the ramps even though it has no sheet.
	import '$lib/cv/palettes.css';
	import '$lib/styles/print.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
