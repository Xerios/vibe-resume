<script>
  /**
   * The parts page: one part of the sheet on the left — a layout, or one block
   * variant — and the CV it helps render on the right.
   *
   * It is a page rather than a second tab in the editor pane because it is a
   * different job — one that wants the whole window, keeps its own undo stack,
   * and outlives the file you happened to be editing when you opened it. The
   * document, the file registry and the parts are module-level singletons
   * (state.svelte.js), so crossing between the two pages carries them along
   * rather than reloading them out of storage.
   *
   * The CV shown here is the active file's, read-only: nothing on this page
   * writes to the document, so there is no editor bound to it and no history to
   * keep. What is being edited is a part, and that is stored per part rather
   * than per file — every CV renders through the same ones.
   *
   * The preview composes the file's own choices with one substitution: the slot
   * of the part being edited is set to that part. Otherwise opening a variant
   * the file doesn't use would show you a sheet with none of your edit in it.
   */
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { base } from '$app/paths'
  import TemplateEditor from '$lib/components/TemplateEditor.svelte'
  import PreviewFrame from '$lib/cv/PreviewFrame.svelte'
  import { locate } from '$lib/cv/compose.js'
  import { resolvePreset } from '$lib/cv/compositions.js'
  import { resolveFont } from '$lib/cv/fonts.js'
  import { liveTemplate } from '$lib/cv/live-template.svelte.js'
  import { resolveTheme } from '$lib/cv/presets.js'
  import { parseCv } from '$lib/cv/render.js'
  import { partId } from '$lib/cv/slots.js'
  import { doc, files, flush, parts, start } from '$lib/cv/state.svelte.js'

  /** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
  let parsed = $state(/** @type {any} */ (null))

  /** The part picked here, if any; until then it is whatever the CV renders through. */
  let chosen = $state(/** @type {string | null} */ (null))

  const preset = $derived(resolvePreset(files.active?.layout))
  const theme = $derived(resolveTheme(files.active?.theme))
  const font = $derived(resolveFont(files.active?.font))
  const css = $derived(files.active?.css ?? '')

  /** What the active file renders through — the list on the left marks these. */
  const fileChoices = $derived(parts.composition(files.active))

  /**
   * Which part is open. The block picker links here with one named, and the
   * layout in use is where it starts otherwise; either falls back if the id
   * no longer resolves, which is what a deleted variant leaves behind.
   */
  const selectedId = $derived.by(() => {
    const wanted = chosen ?? page.url.searchParams.get('part')
    return wanted && parts.get(wanted) ? wanted : partId('page', fileChoices.page)
  })
  const part = $derived(parts.get(selectedId))
  const source = $derived(parts.sourceOf(selectedId))
  const inUse = $derived(!!part && fileChoices[part.slot] === part.id)

  /** The file's sheet, with the part being edited swapped into its slot. */
  const choices = $derived(part ? { ...fileChoices, [part.slot]: part.id } : fileChoices)
  const composed = $derived(parts.compose(choices))

  const tpl = liveTemplate(() => ({
    id: Object.entries(choices)
      .map(([slot, variant]) => `${slot}:${variant}`)
      .join('|'),
    source: composed.source,
  }))

  /**
   * A compile error is a line in the composed sheet, which is nobody's file.
   * Tracing it back says which part it belongs to — and only when that is the
   * one on screen can the editor put a caret on it.
   */
  const error = $derived.by(() => {
    if (!tpl.error) return null
    const at = tpl.error.line ? locate(composed, tpl.error.line) : null
    if (!at) return { message: tpl.error.message }
    if (at.id === selectedId) return { message: tpl.error.message, line: at.line }
    return { message: `${parts.get(at.id)?.name ?? at.id} — ${tpl.error.message}` }
  })

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
   * leave the preview blank while a part is being written against it.
   */
  $effect(() => {
    const { cv } = parseCv(doc.yaml)
    if (cv) parsed = cv
  })

  /** @param {string} text */
  function setSource(text) {
    parts.setSource(selectedId, text)
  }

  /** Render the CV through the part on screen. @param {string} [id] */
  function use(id = selectedId) {
    const target = parts.get(id)
    if (target && files.activeId) files.setVariant(files.activeId, target.slot, target.id)
  }

  function duplicate() {
    const id = parts.duplicate(selectedId)
    // Opened but not adopted: the copy is there to be changed first, and the
    // preview shows it either way.
    if (id) chosen = id
  }

  /** @param {string} name */
  function rename(name) {
    parts.rename(selectedId, name)
  }

  function revert() {
    if (!part?.edited) return
    if (!confirm('Throw away your changes to this part?')) return
    parts.revert(selectedId)
  }

  /**
   * Delete a variant of the user's own. Any file still choosing it falls back
   * to the slot's default the next time it resolves, so nothing else has to be
   * cleaned up here.
   */
  function remove() {
    if (!part || part.builtin) return
    if (!confirm(`Delete “${part.name}” forever?`)) return
    const id = selectedId
    chosen = null
    parts.remove(id)
  }
</script>

<svelte:head>
  <title>Parts — Resume Editor</title>
</svelte:head>

<div id="app">
  <div id="tpl-bar">
    <a class="t-btn" href="{base}/"><span>← Editor</span></a>
    <span class="t-label">Parts</span>
    <span class="tpl-preset">{preset}</span>
    <div class="t-spacer"></div>
    <span class="tpl-file">{files.active?.name ?? ''}</span>
  </div>

  <div id="tpl-split">
    <!-- Every part there is, by slot. The dot marks what the CV renders
		     through; the lit row is what is open, which are two different things
		     until Use is pressed. -->
    <nav id="tpl-parts" aria-label="Parts">
      {#each parts.slots as slot (slot.id)}
        <div class="pt-group">
          <span class="pt-slot">{slot.name}</span>
          {#each slot.variants as v (v.id)}
            <button class="pt-opt" class:on={v.partId === selectedId} title={v.hint} onclick={() => (chosen = v.partId ?? null)}>
              <span class="pt-dot" class:lit={fileChoices[slot.id] === v.id}></span>
              <span class="pt-name">{v.name}{#if v.edited}*{/if}</span>
              <!-- Which kind of file it is: a variant with markup is Svelte, one
                   that only restyles the default is plain CSS. -->
              <span class="pt-kind">{v.css === undefined ? 'svelte' : 'css'}</span>
            </button>
          {/each}
        </div>
      {/each}
    </nav>

    <div id="tpl-source">
      {#if part}
        <!-- Keyed on the part so switching one out starts a fresh undo stack
				     rather than one that spans two different files. -->
        {#key selectedId}
          <TemplateEditor
            part={{ name: part.name, source, builtin: part.builtin ?? true, edited: part.edited ?? false }}
            {error}
            {inUse}
            onChange={setSource}
            onUse={() => use()}
            onDuplicate={duplicate}
            onRename={rename}
            onRevert={revert}
            onDelete={remove}
          />
        {/key}
      {/if}
    </div>

    <div id="tpl-preview">
      {#if error}
        <div id="error-banner">⚠ {error.message}</div>
      {/if}
      <PreviewFrame cv={parsed} component={tpl.component} templateCss={tpl.css} layout={preset} {theme} {font} {css} />
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

  /* Which preset the file is on, since the parts on the left are shared by
	   every file and this one says whose sheet is on the right. */
  .tpl-preset {
    padding: 2px 8px;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .tpl-file {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--faint);
  }

  #tpl-split {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  #tpl-parts {
    flex-shrink: 0;
    width: 178px;
    padding: 8px 6px 16px;
    overflow-y: auto;
    background: var(--paper);
    border-right: 1px solid var(--line);
    transition: var(--theme-fade);
  }

  .pt-group {
    margin-bottom: 10px;
  }

  .pt-slot {
    display: block;
    padding: 0 6px 3px;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--faint);
  }

  .pt-opt {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 6px;
    background: none;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    text-align: left;
  }

  .pt-opt:hover {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  .pt-opt.on {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  /* Filled for the variant the CV is rendering through, so the list says what
	   is in use as well as what is open. */
  .pt-dot {
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 1px solid var(--line);
  }

  .pt-dot.lit {
    background: var(--accent);
    border-color: var(--accent);
  }

  .pt-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pt-kind {
    font-size: 8px;
    letter-spacing: 0.4px;
    color: var(--faint);
  }

  #tpl-source {
    display: flex;
    flex-direction: column;
    width: 44%;
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
	   is the last sheet that compiled, not what the source now says. */
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
