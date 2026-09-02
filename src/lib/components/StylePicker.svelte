<script>
  import { PRESETS } from '$lib/cv/compositions.js'
  import { FONTS } from '$lib/cv/fonts.js'
  import { ORIENTATIONS, PAPER_SIZES, RUNNING_SLOTS, resolvePaper } from '$lib/cv/paper.js'
  import { THEMES } from '$lib/cv/presets.js'
  import TemplateThumb from './TemplateThumb.svelte'
  import VariantCycle from './VariantCycle.svelte'

  let {
    /** Every slot and its variants, the user's own included. @type {import('$lib/cv/slots.js').Registry} */
    slots,
    /** Slot id → the variant in use. @type {Record<string, string>} */
    choices,
    /** The active file's preset id. @type {string} */
    preset,
    /** Whether any axis has been moved off that preset. */
    modified = false,
    /** @type {string} */
    theme,
    /** @type {string} */
    font,
    /** @type {(id: string) => void} */
    onPreset,
    /** @type {(slotId: string, variantId: string) => void} */
    onVariant,
    /** @type {() => void} */
    onReset,
    /** @type {(id: string) => void} */
    onTheme,
    /** @type {(id: string) => void} */
    onFont,
    /** The page the file prints on. @type {Partial<import('$lib/cv/paper.js').Paper>} */
    paper,
    /** @type {(patch: Partial<import('$lib/cv/paper.js').Paper>) => void} */
    onPaper,
    /** Whether the preview is scaled to fit a whole page across the pane. */
    fit = false,
    /** False where there is no room to fit one — a narrow screen, where the preview is already the width of the window. */
    fitAvailable = true,
    /** @type {() => void} */
    onFit,
    /** The active file's own CSS — see the editor at the foot of the panel. */
    css = '',
    /** @type {(text: string) => void} */
    onCss,
  } = $props()

  /**
   * Seeded into an empty editor, so the tokens worth overriding are discoverable
   * without having to read frame.css to find out what they are called.
   */
  const CSS_TEMPLATE = `#cv-root {
	--sans: Georgia, 'Times New Roman', serif;
	--accent: #157c75;
	--ink: #15211f;
	--paper: #ffffff;
}
`

  let cssOpen = $state(false)

  /* Defaulted here as everything else in this panel is, so the buttons below
	   can just compare ids. The two running-head rows are cycles over an axis
	   like a block's, so they are drawn by the same control — see RUNNING_SLOTS. */
  const page = $derived(resolvePaper(paper))
  const running = $derived({ header: page.header, footer: page.footer })

  /** What the head says the groups below are set to, the way History counts its versions. */
  const presetName = $derived((PRESETS.find((p) => p.id === preset)?.name ?? preset) + (modified ? ' — edited' : ''))
</script>

<aside id="style-pane">
  <div class="style-head">
    <span>Style</span>
    <span class="style-preset" title={presetName}>{presetName}</span>
  </div>

  <div class="style-body">
    <!-- A preset is a whole set of the choices below it, and taking one
		     replaces every one of them. That is what keeps the nine looks
		     everybody knows as one click each, now that the axes underneath are
		     the real thing. -->
    <div class="style-group">
      <span class="style-label">Preset</span>
      <div class="layout-grid">
        {#each PRESETS as p (p.id)}
          <button class="layout-opt" class:on={p.id === preset} title={p.hint} aria-pressed={p.id === preset} onclick={() => onPreset(p.id)}>
            <TemplateThumb id={p.id} />
            <span>{p.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Every axis, always all of them. The same rows turn up beside the
		     sheet when a block is hovered; this is where they are when you know
		     which one you want rather than which block. -->
    <div class="style-group">
      <div class="blocks-head">
        <span class="style-label">Blocks</span>
        {#if modified}
          <button class="blocks-reset" title="Put every block back to what this preset says" onclick={onReset}>reset</button>
        {/if}
      </div>
      <div class="blocks-list">
        {#each slots as slot (slot.id)}
          <VariantCycle {slot} {choices} onPick={onVariant} />
        {/each}
      </div>
    </div>

    <div class="style-group">
      <span class="style-label">Theme</span>
      <div class="theme-grid">
        {#each THEMES as t (t.id)}
          <button class="theme-opt" class:on={t.id === theme} title={t.name} aria-pressed={t.id === theme} onclick={() => onTheme(t.id)} data-cv-theme={t.id}>
            <span class="theme-dot"></span>
            <span>{t.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Set in the face it offers, from the `data-cv-font` on the option —
		     the same trick as the swatches above, and the same reason: one table
		     of stacks (fonts.css), no second copy to drift. -->
    <div class="style-group">
      <span class="style-label">Font</span>
      <div class="font-grid">
        {#each FONTS as f (f.id)}
          <button class="font-opt" class:on={f.id === font} title={f.hint} aria-pressed={f.id === font} onclick={() => onFont(f.id)} data-cv-font={f.id}>
            <span class="font-sample">Aa</span>
            <span>{f.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- The page itself, which is the one thing here that is not a matter of
		     taste: it is the sheet the print lands on, and the preview is sized
		     from the same numbers so that what is on screen is that page.

		     A header or a footer is drawn by the browser in the page margin, from
		     `@page` — which is also the only place a page *number* can come from,
		     since nothing in the document knows how many pages there are. Chrome
		     and Edge do that; Firefox ignores it and prints neither. -->
    <div class="style-group">
      <span class="style-label">Paper</span>
      <div class="paper-grid">
        {#each PAPER_SIZES as s (s.id)}
          <button class="paper-opt" class:on={s.id === page.size} aria-pressed={s.id === page.size} onclick={() => onPaper({ size: s.id })}>
            {s.name}
          </button>
        {/each}
      </div>
      <div class="paper-grid two">
        {#each ORIENTATIONS as o (o.id)}
          <button
            class="paper-opt"
            class:on={o.id === page.orientation}
            title={o.hint}
            aria-pressed={o.id === page.orientation}
            onclick={() => onPaper({ orientation: o.id })}>
            <span class="paper-shape" class:wide={o.id === 'landscape'}></span>
            {o.name}
          </button>
        {/each}
      </div>
      <div class="blocks-list paper-runs">
        {#each RUNNING_SLOTS as slot (slot.id)}
          <VariantCycle {slot} choices={running} onPick={(edge, mode) => onPaper({ [edge]: mode })} />
        {/each}
      </div>
      {#if fitAvailable}
        <!-- Not part of the file: this is how the preview is looked at, so it
				     stays out of the document and out of the history. -->
        <button class="paper-fit" class:on={fit} aria-pressed={fit} title="Scale the preview until a whole page fits across the pane" onclick={onFit}>
          <span class="paper-tick" aria-hidden="true">{fit ? '✓' : ''}</span>
          Fit page to pane
        </button>
      {/if}
    </div>

    <!-- Anything at all, applied last inside the preview frame. It can't
		     reach the editor around it, so there is nothing to validate. -->
    <div class="style-group">
      <button class="css-toggle" aria-expanded={cssOpen} onclick={() => (cssOpen = !cssOpen)}>
        <span class="style-label">Custom CSS</span>
        <span class="css-caret" class:on={cssOpen}>›</span>
      </button>
      {#if cssOpen}
        <textarea
          class="css-edit"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          value={css}
          placeholder={CSS_TEMPLATE}
          aria-label="Custom CSS for this CV"
          oninput={(e) => onCss(e.currentTarget.value)}></textarea>
        <p class="css-hint">
          Applies to this file only. Override the tokens on <code>#cv-root</code>, or style the sheet directly.
        </p>
      {/if}
    </div>
  </div>
</aside>

<style>
  /* The third column of the split, opposite the editor — same shape as the
	   history panel, which it takes turns with. */
  #style-pane {
    flex-shrink: 0;
    width: 288px;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-left: 1px solid var(--line);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .style-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border-bottom: 1px solid var(--line);
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* The preset in play names what the groups below are set to; it is a value
	   rather than a label, so it doesn't shout like one. */
  .style-preset {
    min-width: 0;
    letter-spacing: 0.5px;
    text-transform: none;
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Only the groups scroll — the head stays put, as it does in History. */
  .style-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* The disclosure is the label: the whole row is the hit target, so the caret
	   doesn't need one of its own. */
  .css-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
  }

  .css-toggle .style-label {
    margin-bottom: 0;
  }

  .css-toggle:hover .style-label {
    color: var(--accent-deep);
  }

  .css-caret {
    font-size: var(--ui-fs-xl);
    line-height: 1;
    color: var(--faint);
    transition: transform 0.14s;
  }

  .css-caret.on {
    transform: rotate(90deg);
  }

  .css-edit {
    display: block;
    width: 100%;
    height: 132px;
    margin-top: 7px;
    padding: 7px 8px;
    background: var(--editor-bg);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    line-height: 1.55;
    tab-size: 2;
    resize: vertical;
    white-space: pre;
    overflow: auto;
  }

  .css-edit:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* The template shows through as the placeholder, so an empty editor still
	   says which tokens are worth reaching for. */
  .css-edit::placeholder {
    color: var(--faint);
  }

  .css-hint {
    margin: 6px 0 0;
    font-size: var(--ui-fs-sm);
    line-height: 1.45;
    color: var(--faint);
  }

  .css-hint code {
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    color: var(--muted);
  }

  .style-label {
    display: block;
    margin-bottom: 6px;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .blocks-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .blocks-reset {
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--accent);
  }

  .blocks-reset:hover {
    color: var(--accent-deep);
  }

  .blocks-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .layout-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
  }

  .layout-opt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 5px 3px 4px;
    background: none;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--muted);
    transition:
      border-color 0.13s,
      color 0.13s,
      background 0.13s;
  }

  .layout-opt:hover {
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  .layout-opt.on {
    border-color: var(--accent);
    color: var(--accent-deep);
    background: var(--accent-wash);
  }

  .theme-grid,
  .font-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
  }

  /* One row per question — the sizes, then the two orientations — rather than
	   one grid of six, so that neither reads as an answer to the other. */
  .paper-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 4px;
  }

  .paper-grid.two {
    grid-template-columns: repeat(2, 1fr);
  }

  .paper-runs {
    margin-top: 8px;
  }

  .theme-opt,
  .font-opt,
  .paper-opt {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    background: none;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--muted);
    transition:
      border-color 0.13s,
      color 0.13s,
      background 0.13s;
  }

  .theme-opt:hover,
  .font-opt:hover,
  .paper-opt:hover,
  .paper-fit:hover {
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  .theme-opt.on,
  .font-opt.on,
  .paper-opt.on,
  .paper-fit.on {
    border-color: var(--accent);
    color: var(--accent-deep);
    background: var(--accent-wash);
  }

  .paper-opt {
    justify-content: center;
  }

  /* The page, at the shape the button is offering. Drawn rather than named,
	   because which way round it goes is the whole answer. */
  .paper-shape {
    flex-shrink: 0;
    width: 8px;
    height: 11px;
    border: 1.5px solid currentColor;
    border-radius: 1px;
    opacity: 0.75;
  }

  .paper-shape.wide {
    width: 11px;
    height: 8px;
  }

  /* Same face as the options above it, but it answers a different kind of
	   question — on or off, and about the pane rather than about the file — so
	   it is a full-width row with a tick rather than one of a pair. */
  .paper-fit {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 8px;
    padding: 4px 7px;
    background: none;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--muted);
    transition:
      border-color 0.13s,
      color 0.13s,
      background 0.13s;
  }

  .paper-tick {
    flex-shrink: 0;
    width: 11px;
    text-align: center;
    color: var(--accent);
  }

  /* The specimen, in the stack the option's own `data-cv-font` declares. The
	   name beside it stays in the picker's type, so the two read as label and
	   sample rather than as one mixed line. */
  .font-sample {
    flex-shrink: 0;
    width: 17px;
    font-family: var(--f-sans);
    font-size: var(--ui-fs-lg);
    font-weight: 600;
    line-height: 1;
    text-align: center;
    color: var(--ink);
  }

  /* Accent over the sheet colour it sits on, so a swatch previews the pairing.
	   The tokens come from the `data-cv-theme` on the option itself (palettes.css).

	   The light ramp whatever the app is set to, because that is what the sheet
	   renders from — a swatch that darkened with the chrome would be advertising
	   a CV the preview can no longer produce. */
  .theme-dot {
    flex-shrink: 0;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--t-accent-l);
    box-shadow:
      inset 0 0 0 3px var(--t-paper-l),
      inset 0 0 0 4px var(--t-accent-l);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
	   of the flow as an overlay, like the history and trash panels. */
  @media (max-width: 900px) {
    #style-pane {
      position: fixed;
      top: 82px;
      right: 8px;
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: 34px;
      width: min(288px, calc(100vw - 16px));
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow-pop);
      z-index: 100;
    }
  }
</style>
