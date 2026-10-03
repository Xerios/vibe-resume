<script>
  import favicon from '$lib/assets/favicon.svg'
  // App chrome: tokens, then the base document, then the shared controls.
  // Everything else is styled inside the component it belongs to.
  import '../app.scss'
  // The CV's own stylesheets are *not* loaded here — the sheet renders inside
  // an iframe and PreviewFrame.svelte writes them into it.
  import '$lib/styles/print.scss'

  let { children } = $props()

  /* Where a native context menu is still worth having: the editor, a text
     field, anything editable. Everywhere else the menu only offers Back,
     Reload and View Source over a button, so it's noise. The preview never
     reaches here — a contextmenu inside the iframe doesn't bubble out — so
     right-clicking the sheet keeps its menu, spellcheck and Copy included. */
  const SELECTABLE = '#cm-wrap, input, textarea, [contenteditable="true"]'

  /** @param {MouseEvent} e */
  function onContextMenu(e) {
    const target = e.target
    if (target instanceof Element && target.closest(SELECTABLE)) return
    e.preventDefault()
  }
</script>

<svelte:window oncontextmenu={onContextMenu} />

<svelte:head>
  <link rel="icon" href={favicon} />
  <link href="/fonts/gitlab-mono/gitlab-mono.css" rel="stylesheet" />
  <link href="/fonts/gitlab-sans/gitlab-sans.css" rel="stylesheet" />
</svelte:head>

{@render children()}
