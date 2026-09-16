<script>
  import { PRESETS } from '$lib/cv/template/compositions.js'
  import { FONTS } from '$lib/cv/theme/fonts.js'
  import { ORIENTATIONS, PAPER_SIZES, RUNNING_SLOTS, resolvePaper } from '$lib/cv/theme/paper.js'
  import { THEMES } from '$lib/cv/theme/presets.js'
  import { KEYS, read, write } from '$lib/cv/state/storage.js'
  import Foldout from './Foldout.svelte'
  import TemplateThumb from './TemplateThumb.svelte'
  import VariantCycle from './VariantCycle.svelte'

  let {
    /** Every slot and its variants, the user's own included. @type {import('$lib/cv/template/slots.js').Registry} */
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
    /** The page the file prints on. @type {Partial<import('$lib/cv/theme/paper.js').Paper>} */
    paper,
    /** @type {(patch: Partial<import('$lib/cv/theme/paper.js').Paper>) => void} */
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

  /**
   * Which groups start folded open. Everything but the CSS editor, which is
   * the one thing here most files never touch.
   */
  const GROUPS_OPEN = { preset: true, blocks: true, theme: true, font: true, paper: true, css: false }

  /**
   * The panel comes back the shape it was left in. Read over the defaults
   * rather than replacing them, so a group added later takes its own default
   * instead of vanishing for everyone who has been here before.
   */
  let groups = $state(/** @type {Record<string, boolean>} */ ({ ...GROUPS_OPEN, ...readGroups() }))

  function readGroups() {
    try {
      const parsed = JSON.parse(read(KEYS.styleGroups) ?? '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  /** @param {string} id */
  function toggleGroup(id) {
    groups = { ...groups, [id]: !groups[id] }
    write(KEYS.styleGroups, JSON.stringify(groups))
  }

  /* Defaulted here as everything else in this panel is, so the buttons below
	   can just compare ids. The two running-head rows are cycles over an axis
	   like a block's, so they are drawn by the same control — see RUNNING_SLOTS. */
  const page = $derived(resolvePaper(paper))
  const running = $derived({ header: page.header, footer: page.footer })

  /** What the head says the groups below are set to, the way History counts its versions. */
  const presetName = $derived((PRESETS.find(p => p.id === preset)?.name ?? preset) + (modified ? ' — edited' : ''))
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
    <Foldout label="Preset" open={groups.preset} onToggle={() => toggleGroup('preset')}>
      <div class="layout-grid">
        {#each PRESETS as p (p.id)}
          <button class="layout-opt" class:on={p.id === preset} title={p.hint} aria-pressed={p.id === preset} onclick={() => onPreset(p.id)}>
            <TemplateThumb id={p.id} />
            <span>{p.name}</span>
          </button>
        {/each}
      </div>
    </Foldout>

    <!-- Every axis, always all of them. The same rows turn up beside the
		     sheet when a block is hovered; this is where they are when you know
		     which one you want rather than which block. -->
    <Foldout label="Blocks" open={groups.blocks} onToggle={() => toggleGroup('blocks')}>
      {#snippet head()}
        {#if modified}
          <button class="blocks-reset" title="Put every block back to what this preset says" onclick={onReset}>reset</button>
        {/if}
      {/snippet}
      <div class="blocks-list">
        {#each slots as slot (slot.id)}
          <VariantCycle {slot} {choices} onPick={onVariant} />
        {/each}
      </div>
    </Foldout>

    <Foldout label="Theme" open={groups.theme} onToggle={() => toggleGroup('theme')}>
      <div class="theme-grid">
        {#each THEMES as t (t.id)}
          <button class="theme-opt" class:on={t.id === theme} title={t.name} aria-pressed={t.id === theme} onclick={() => onTheme(t.id)} data-cv-theme={t.id}>
            <span class="theme-dot"></span>
            <span>{t.name}</span>
          </button>
        {/each}
      </div>
    </Foldout>

    <!-- Set in the face it offers, from the `data-cv-font` on the option —
		     the same trick as the swatches above, and the same reason: one table
		     of stacks (fonts.css), no second copy to drift. -->
    <Foldout label="Font" open={groups.font} onToggle={() => toggleGroup('font')}>
      <div class="font-grid">
        {#each FONTS as f (f.id)}
          <button class="font-opt" class:on={f.id === font} title={f.hint} aria-pressed={f.id === font} onclick={() => onFont(f.id)} data-cv-font={f.id}>
            <span class="font-sample">Aa</span>
            <span>{f.name}</span>
          </button>
        {/each}
      </div>
    </Foldout>

    <!-- The page itself, which is the one thing here that is not a matter of
		     taste: it is the sheet the print lands on, and the preview is sized
		     from the same numbers so that what is on screen is that page.

		     A header or a footer is drawn by the browser in the page margin, from
		     `@page` — which is also the only place a page *number* can come from,
		     since nothing in the document knows how many pages there are. Chrome
		     and Edge do that; Firefox ignores it and prints neither. -->
    <Foldout label="Paper" open={groups.paper} onToggle={() => toggleGroup('paper')}>
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
    </Foldout>

    <!-- Anything at all, applied last inside the preview frame. It can't
		     reach the editor around it, so there is nothing to validate. -->
    <Foldout label="Custom CSS" open={groups.css} onToggle={() => toggleGroup('css')}>
      <textarea
        class="css-edit"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        value={css}
        placeholder={CSS_TEMPLATE}
        aria-label="Custom CSS for this CV"
        oninput={e => onCss(e.currentTarget.value)}></textarea>
      <p class="css-hint">
        Applies to this file only. Override the tokens on <code>#cv-root</code>, or style the sheet directly.
      </p>
    </Foldout>
  </div>
</aside>

<style lang="scss">
  /* The third column of the split, opposite the editor — same shape as the
	   history panel, which it takes turns with. Docked, it is a bar's rung;
	   floating (below), it climbs one. */
  #style-pane {
    flex-shrink: 0;
    width: var(--panel-w);
    display: flex;
    flex-direction: column;
    background: var(--bg-dark);
    border-left: var(--hairline) solid var(--gray-6);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .style-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-3) var(--sp-3);
    border-bottom: var(--hairline) solid var(--gray-6);
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
  }

  /* The preset in play names what the groups below are set to; it is a value
	   rather than a label, so it doesn't shout like one. */
  .style-preset {
    min-width: 0;
    letter-spacing: 0.5px;
    text-transform: none;
    color: var(--gray-11);
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
    padding: var(--sp-3);
    display: flex;
    flex-direction: column;
    /* Tighter than it was: each group now says where it starts, so the space
	     between them no longer has to. */
    gap: var(--sp-3);
  }

  .css-edit {
    display: block;
    width: 100%;
    height: 132px;
    padding: var(--sp-3);
    background: var(--bg);
    border: var(--hairline) solid var(--gray-7);
    border-radius: var(--corner-xs);
    color: var(--gray-12);
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    line-height: 1.55;
    tab-size: 2;
    resize: vertical;
    white-space: pre;
    overflow: auto;

    &:focus {
      outline: none;
      border-color: var(--accent-8);
    }

    /* The template shows through as the placeholder, so an empty editor still
	     says which tokens are worth reaching for. */
    &::placeholder {
      color: var(--gray-10);
    }
  }

  .css-hint {
    margin: var(--sp-3) 0 0;
    font-size: var(--ui-fs-sm);
    line-height: 1.45;
    color: var(--gray-11);

    code {
      font-family: var(--mono);
      font-size: var(--ui-fs-2xs);
      color: var(--gray-12);
    }
  }

  .blocks-reset {
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 0.5px;
    /* Step 11, because this is accent used as *text* — step 9 is a fill, and
		   Radix does not guarantee it legible at 9px on a step 2 panel. */
    color: var(--accent-11);

    &:hover {
      color: var(--accent-12);
    }
  }

  .blocks-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .layout-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-1);
  }

  /* Every option here is a control on a panel that is one rung docked and
	   another floating, so the fills are alpha steps — see controls.scss. */
  .layout-opt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-1);
    background: var(--gray-a3);
    border: var(--hairline) solid var(--gray-a4);
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--gray-12);
    transition: var(--hover-fade);

    &:hover {
      background: var(--gray-a4);
      border-color: var(--gray-a7);
    }

    &.on {
      border-color: var(--accent-9);
      color: var(--accent-contrast);
      background: var(--accent-9);
    }
  }

  .theme-grid,
  .font-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sp-1);
  }

  /* One row per question — the sizes, then the two orientations — rather than
	   one grid of six, so that neither reads as an answer to the other. */
  .paper-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-1);
    margin-bottom: var(--sp-1);

    &.two {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .paper-runs {
    margin-top: var(--sp-4);
  }

  .theme-opt,
  .font-opt,
  .paper-opt {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-1) var(--sp-3);
    background: var(--gray-a3);
    border: var(--hairline) solid var(--gray-a4);
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 550;
    color: var(--gray-12);
    transition: var(--hover-fade);
  }

  .theme-opt,
  .font-opt,
  .paper-opt,
  .paper-fit {
    &:hover {
      background: var(--gray-a4);
      border-color: var(--gray-a7);
    }

    &.on {
      border-color: var(--accent-9);
      color: var(--accent-contrast);
      background: var(--accent-9);
    }
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
    border: var(--hairline) solid currentColor;
    opacity: 0.75;

    &.wide {
      width: 11px;
      height: 8px;
    }
  }

  /* Same face as the options above it, but it answers a different kind of
	   question — on or off, and about the pane rather than about the file — so
	   it is a full-width row with a tick rather than one of a pair. */
  .paper-fit {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    margin-top: var(--sp-4);
    padding: var(--sp-1) var(--sp-3);
    background: var(--gray-a3);
    border: var(--hairline) solid var(--gray-a4);
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 550;
    color: var(--gray-12);
    transition: var(--hover-fade);
  }

  .paper-tick {
    flex-shrink: 0;
    width: 11px;
    text-align: center;
    color: currentColor;
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
    color: currentColor;
  }

  /* Accent over the sheet colour it sits on, so a swatch previews the pairing.
	   The tokens come from the `data-cv-theme` on the option itself (palettes.css).

	   The light ramp whatever the app is set to, because that is what the sheet
	   renders from — a swatch that darkened with the chrome would be advertising
	   a CV the preview can no longer produce. Square like everything else here;
	   the CV's palette is data the chrome displays, not part of the chrome. */
  .theme-dot {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border-radius: var(--corner-xs);
    background: var(--t-accent-l);
    box-shadow:
      inset 0 0 0 3px var(--t-paper-l),
      inset 0 0 0 4px var(--t-accent-l);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
	   of the flow as an overlay, like the history and trash panels — and takes
	   the popover's rung and shadow with it. */
  @media (max-width: 900px) {
    #style-pane {
      position: fixed;
      top: var(--overlay-top);
      right: var(--sp-3);
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: var(--bar-status);
      width: min(var(--panel-w), calc(100vw - 2 * var(--sp-3)));
      background: var(--bg-light);
      border: var(--hairline) solid var(--gray-6);
      border-radius: var(--corner-xs);
      box-shadow: var(--shadow-ring), var(--shadow-md);
      z-index: 100;
    }
  }
</style>
