<script>
  import Icon from '@iconify/svelte'
  import IconClose from '@iconify-icons/lucide/x'
  import { commands } from '$lib/cv/state/commands.js'
  import { look, parts } from '$lib/cv/state/state.svelte.js'
  import { PRESETS } from '$lib/cv/template/compositions.js'
  import { FONTS } from '$lib/cv/theme/fonts.js'
  import { ORIENTATIONS, PAPER_SIZES, RUNNING_SLOTS } from '$lib/cv/theme/paper.js'
  import { THEMES } from '$lib/cv/theme/presets.js'
  import { KEYS, read, write } from '$lib/cv/state/storage.js'
  import Foldout from './Foldout.svelte'
  import TemplateThumb from './TemplateThumb.svelte'
  import ToggleButton from './ToggleButton.svelte'
  import VariantCycle from './VariantCycle.svelte'
  import { fly } from 'svelte/transition'

  /** Which groups start folded open — all of them. */
  const GROUPS_OPEN = { preset: true, blocks: true, theme: true, font: true, paper: true }

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

  /* The two running-head rows are cycles over an axis like a block's, so they
	   are drawn by the same control — see RUNNING_SLOTS. */
  const running = $derived({ header: look.paper.header, footer: look.paper.footer })

  /** What the head says the groups below are set to, the way History counts its versions. */
  const presetName = $derived((PRESETS.find((p) => p.id === look.preset)?.name ?? look.preset) + (look.modified ? ' — edited' : ''))
</script>

<aside id="style-pane" in:fly={{ y: -8, duration: 200 }}>
  <div class="style-head">
    <div class="style-head-text">
      <h2>Style</h2>
      <span class="style-preset" title={presetName}>{presetName}</span>
    </div>
    <button class="ds-icon-btn" aria-label="Close style" onclick={() => commands.toggleSidePanel('style')}>
      <Icon icon={IconClose} width="16" height="16" />
    </button>
  </div>

  <div class="style-body">
    <!-- A preset is a whole set of the choices below it, and taking one
		     replaces every one of them. That is what keeps the nine looks
		     everybody knows as one click each, now that the axes underneath are
		     the real thing. -->
    <Foldout label="Preset" open={groups.preset} onToggle={() => toggleGroup('preset')}>
      <div class="layout-grid">
        {#each PRESETS as p (p.id)}
          <ToggleButton big selected={p.id === look.preset} title={p.hint} onclick={() => commands.setPreset(p.id)}>
            <TemplateThumb id={p.id} />
            <span>{p.name}</span>
          </ToggleButton>
        {/each}
      </div>
    </Foldout>

    <!-- Every axis, always all of them. The same rows turn up beside the
		     sheet when a block is hovered; this is where they are when you know
		     which one you want rather than which block. -->
    <Foldout label="Blocks" open={groups.blocks} onToggle={() => toggleGroup('blocks')}>
      {#snippet head()}
        {#if look.modified}
          <button class="blocks-reset ds-btn subtle compact" title="Put every block back to what this preset says" onclick={commands.resetVariants}
            >Reset</button
          >
        {/if}
      {/snippet}
      <div class="blocks-list">
        {#each parts.slots as slot (slot.id)}
          <VariantCycle {slot} choices={look.choices} onPick={commands.setVariant} />
        {/each}
      </div>
    </Foldout>

    <Foldout label="Theme" open={groups.theme} onToggle={() => toggleGroup('theme')}>
      <div class="theme-grid">
        {#each THEMES as t (t.id)}
          <ToggleButton selected={t.id === look.theme} title={t.name} onclick={() => commands.setTheme(t.id)} data-cv-theme={t.id}>
            <span class="theme-dot"></span>
            <span>{t.name}</span>
          </ToggleButton>
        {/each}
      </div>
    </Foldout>

    <!-- Set in the face it offers, from the `data-cv-font` on the option —
		     the same trick as the swatches above, and the same reason: one table
		     of stacks (fonts.css), no second copy to drift. -->
    <Foldout label="Font" open={groups.font} onToggle={() => toggleGroup('font')}>
      <div class="font-grid">
        {#each FONTS as f (f.id)}
          <ToggleButton selected={f.id === look.font} title={f.hint} onclick={() => commands.setFont(f.id)} data-cv-font={f.id}>
            <span class="font-sample">Aa</span>
            <span>{f.name}</span>
          </ToggleButton>
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
          <ToggleButton center selected={s.id === look.paper.size} onclick={() => commands.setPaper({ size: s.id })}>
            {s.name}
          </ToggleButton>
        {/each}
      </div>
      <div class="paper-grid two">
        {#each ORIENTATIONS as o (o.id)}
          <ToggleButton center selected={o.id === look.paper.orientation} title={o.hint} onclick={() => commands.setPaper({ orientation: o.id })}>
            <span class="paper-shape" class:wide={o.id === 'landscape'}></span>
            {o.name}
          </ToggleButton>
        {/each}
      </div>
      <div class="blocks-list paper-runs">
        {#each RUNNING_SLOTS as slot (slot.id)}
          <VariantCycle {slot} choices={running} onPick={(edge, mode) => commands.setPaper({ [edge]: mode })} />
        {/each}
      </div>
    </Foldout>
  </div>
</aside>

<style lang="scss">
  /* The third column of the split, opposite the editor — the same ADS side
     panel as History, which it takes turns with. */
  #style-pane {
    flex-shrink: 0;
    width: var(--panel-w);
    display: flex;
    flex-direction: column;
    background: var(--ds-surface);
    border-left: var(--ds-border-width) solid var(--ds-border);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .style-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-150) var(--ds-space-150) var(--ds-space-150) var(--ds-space-200);
    border-bottom: var(--ds-border-width) solid var(--ds-border);
  }

  .style-head-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-025);

    h2 {
      margin: 0;
      font: var(--ds-font-heading-small);
      color: var(--ds-text);
    }
  }

  /* The preset in play names what the groups below are set to. */
  .style-preset {
    min-width: 0;
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
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
    display: flex;
    flex-direction: column;
  }

  .blocks-list {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-050);
  }

  .layout-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--ds-space-100);
  }

  .theme-grid,
  .font-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--ds-space-100);
  }

  /* One row per question — the sizes, then the two orientations — rather than
     one grid of six, so that neither reads as an answer to the other. */
  .paper-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--ds-space-100);
    margin-bottom: var(--ds-space-100);

    &.two {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .paper-runs {
    margin-top: var(--ds-space-150);
  }

  /* The page, at the shape the button is offering. Drawn rather than named,
     because which way round it goes is the whole answer. */
  .paper-shape {
    flex-shrink: 0;
    width: 9px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-radius: 1px;

    &.wide {
      width: 12px;
      height: 9px;
    }
  }

  /* The specimen, in the stack the option's own `data-cv-font` declares. The
     name beside it stays in the picker's type, so the two read as label and
     sample rather than as one mixed line. */
  .font-sample {
    flex-shrink: 0;
    width: 20px;
    font-family: var(--f-sans);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    text-align: center;
    color: currentColor;
  }

  /* Accent over the sheet colour it sits on, so a swatch previews the pairing.
     The tokens come from the `data-cv-theme` on the option itself (palettes.css).

     The light ramp whatever the app is set to, because that is what the sheet
     renders from — a swatch that darkened with the chrome would be advertising
     a CV the preview can no longer produce. */
  .theme-dot {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    border-radius: var(--ds-radius-full);
    background: var(--t-accent-l);
    box-shadow:
      inset 0 0 0 4px var(--t-paper-l),
      inset 0 0 0 5px var(--t-accent-l);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
     of the flow onto the overlay surface, like History and Trash. */
  @media (max-width: 900px) {
    #style-pane {
      position: fixed;
      top: calc(var(--overlay-top) + var(--ds-space-100));
      right: var(--ds-space-100);
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: calc(var(--bar-status) + var(--ds-space-100));
      width: min(var(--panel-w), calc(100vw - 2 * var(--ds-space-100)));
      background: var(--ds-surface-overlay);
      border: none;
      border-radius: var(--ds-radius-large);
      box-shadow: var(--ds-shadow-overlay);
      z-index: 100;
    }
  }
</style>
