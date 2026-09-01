<script>
  /**
   * The template page: the component the sheet is rendered by, on the left, and
   * the CV it renders on the right.
   *
   * It is a page rather than a second tab in the editor pane because it is a
   * different job — one that wants the whole window, keeps its own undo stack,
   * and outlives the file you happened to be editing when you opened it. The
   * document, the file registry and the templates are module-level singletons
   * (state.svelte.js), so crossing between the two pages carries them along
   * rather than reloading them out of storage.
   *
   * The CV shown here is the active file's, read-only: nothing on this page
   * writes to the document, so there is no editor bound to it and no history
   * to keep. What is being edited is the template, and that is stored per
   * template rather than per file.
   */
  import { onMount } from 'svelte'
  import { base } from '$app/paths'
  import TemplateEditor from '$lib/components/TemplateEditor.svelte'
  import TemplateThumb from '$lib/components/TemplateThumb.svelte'
  import PreviewFrame from '$lib/cv/PreviewFrame.svelte'
  import { liveTemplate } from '$lib/cv/live-template.svelte.js'
  import { resolveTheme } from '$lib/cv/presets.js'
  import { parseCv } from '$lib/cv/render.js'
  import { doc, files, flush, start, templates } from '$lib/cv/state.svelte.js'

  /** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
  let parsed = $state(/** @type {any} */ (null))

  /** The template being edited: the one the active file renders through. */
  const layout = $derived(templates.resolve(files.active?.layout))
  const template = $derived(templates.get(layout))
  const theme = $derived(resolveTheme(files.active?.theme))
  const css = $derived(files.active?.css ?? '')

  const tpl = liveTemplate(() => ({
    id: layout,
    source: templates.sourceOf(layout),
  }))

  onMount(() => {
    start()
    // The editor page flushes on its own way out, but a tab closed from here
    // has the same debounced writes outstanding.
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  })

  /**
   * The YAML is nobody's to edit here, but it still arrives asynchronously —
   * the document loads behind WASM — and a file with broken YAML shouldn't
   * leave the preview blank while a template is being written against it.
   */
  $effect(() => {
    const { cv } = parseCv(doc.yaml)
    if (cv) parsed = cv
  })

  /**
   * Pick a template. Choosing one here is the same act as choosing it in the
   * Style popover — the CV switches to it, and this page follows, because
   * "the template being edited" and "the template in use" are one thing.
   * @param {string} id
   */
  function select(id) {
    if (files.activeId) files.setStyle(files.activeId, { layout: id })
  }

  /** @param {string} text */
  function setSource(text) {
    templates.setSource(layout, text)
  }

  function duplicate() {
    select(templates.duplicate(layout))
  }

  /** @param {string} name */
  function rename(name) {
    templates.rename(layout, name)
  }

  function revert() {
    if (!template?.edited) return
    if (!confirm('Throw away your changes to this template?')) return
    templates.revert(layout)
  }

  /**
   * Delete a template of the user's own. Any file still pointing at it falls
   * back to the default the next time it resolves, so nothing else has to be
   * cleaned up here.
   */
  function remove() {
    if (!template || template.builtin) return
    if (!confirm(`Delete the template “${template.name}” forever?`)) return
    const id = template.id
    select(templates.resolve(null))
    templates.remove(id)
  }
</script>

<svelte:head>
  <title>Template — Resume Editor</title>
</svelte:head>

<div id="app">
  <div id="tpl-bar">
    <a class="t-btn" href="{base}/"><span>← Editor</span></a>
    <span class="t-label">Template</span>

    <!-- Which template, chosen the same way and with the same meaning as in
		     the Style popover: the CV renders through whichever is lit. -->
    <div class="tpl-list">
      {#each templates.all as t (t.id)}
        <button
          class="tpl-opt"
          class:on={t.id === layout}
          title={t.hint ?? (t.builtin ? t.name : 'Your own template')}
          aria-pressed={t.id === layout}
          onclick={() => select(t.id)}
        >
          <TemplateThumb id={t.id} />
          <span
            >{t.name}{#if t.edited}*{/if}</span
          >
        </button>
      {/each}
    </div>

    <div class="t-spacer"></div>
    <span class="tpl-file">{files.active?.name ?? ''}</span>
  </div>

  <div id="tpl-split">
    <div id="tpl-source">
      {#if template}
        <!-- Keyed on the template so switching one out starts a fresh undo
				     stack rather than one that spans two different files. -->
        {#key template.id}
          <TemplateEditor {template} error={tpl.error} onChange={setSource} onDuplicate={duplicate} onRename={rename} onRevert={revert} onDelete={remove} />
        {/key}
      {/if}
    </div>

    <div id="tpl-preview">
      {#if tpl.error}
        <div id="error-banner">⚠ {tpl.error.message}</div>
      {/if}
      <PreviewFrame cv={parsed} component={tpl.component} templateCss={tpl.css} {layout} {theme} {css} />
    </div>
  </div>
</div>

<style>
  /* The shell itself — flex column, full height — comes from base.css, which
	   both pages share. */
  #tpl-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 16px;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    z-index: 10;
    transition: var(--theme-fade);
  }

  .t-label {
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* The file the preview is of — this page edits a template, which every file
	   can share, so which CV is on the right is worth saying. */
  .tpl-file {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--faint);
  }

  .tpl-list {
    display: flex;
    align-items: stretch;
    gap: 5px;
    overflow-x: auto;
  }

  .tpl-opt {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 4px;
    background: none;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
    color: var(--muted);
    transition:
      border-color 0.13s,
      color 0.13s,
      background 0.13s;
  }

  /* Small enough to read as an icon beside the name rather than a thumbnail. */
  .tpl-opt :global(svg) {
    width: 26px;
  }

  .tpl-opt:hover {
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  .tpl-opt.on {
    border-color: var(--accent);
    color: var(--accent-deep);
    background: var(--accent-wash);
  }

  #tpl-split {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  #tpl-source {
    display: flex;
    flex-direction: column;
    width: 50%;
    min-width: 260px;
    overflow: hidden;
    background: var(--editor-bg);
    border-right: 1px solid var(--line);
    transition: var(--theme-fade);
  }

  #tpl-preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    background: var(--bg);
    transition: var(--theme-fade);
  }

  /* Same banner as the editor page's, for the same reason: what is on screen
	   is the last template that compiled, not what the source now says. */
  #error-banner {
    flex-shrink: 0;
    padding: 7px 14px;
    background: var(--cm-error-bg);
    border-bottom: 1px solid var(--line);
    color: var(--cm-error);
    font-family: var(--mono);
    font-size: 11px;
  }
</style>
