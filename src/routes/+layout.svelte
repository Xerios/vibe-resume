<script>
  import favicon from '$lib/assets/favicon.svg'
  // App chrome: tokens, then the base document, then the shared controls.
  // Everything else is styled inside the component it belongs to.
  import '../app.css'
  // The CV's own stylesheets are *not* loaded here — the sheet renders inside
  // an iframe and PreviewFrame.svelte writes them into it. The palettes and
  // the font stacks are the exception: StylePicker draws each option with
  // `data-cv-theme` / `data-cv-font` on the option itself, so the app needs
  // both tables even though it has no sheet.
  import '$lib/cv/theme/fonts.css'
  import '$lib/cv/theme/palettes.css'
  import '$lib/styles/print.css'

  let { children } = $props()
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link href="/fonts/gitlab-mono/gitlab-mono.css" rel="stylesheet" />
  <link href="/fonts/gitlab-sans/gitlab-sans.css" rel="stylesheet" />
</svelte:head>

{@render children()}
