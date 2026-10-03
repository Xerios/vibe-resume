<script>
  import Icon from '@iconify/svelte'
  import IconEye from '@iconify-icons/lucide/eye'
  import IconEyeOff from '@iconify-icons/lucide/eye-off'
  import IconFiles from '@iconify-icons/lucide/files'
  import IconLink2 from '@iconify-icons/lucide/link-2'
  import IconLink2Off from '@iconify-icons/lucide/link-2-off'
  import IconMaximize from '@iconify-icons/lucide/maximize'
  import IconMoon from '@iconify-icons/lucide/moon'
  import IconMousePointer2 from '@iconify-icons/lucide/mouse-pointer-2'
  import IconMousePointer2Off from '@iconify-icons/lucide/mouse-pointer-2-off'
  import IconRefreshCw from '@iconify-icons/lucide/refresh-cw'
  import IconSun from '@iconify-icons/lucide/sun'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import IconTrash from '@iconify-icons/lucide/trash'
  import { commands } from '$lib/cv/state/commands'
  import { files, ui } from '$lib/cv/state/state.svelte'
  import { swUpdate } from '$lib/sw-update.svelte'
  import { shortcut } from './access-keys'
</script>

<!-- The bar that reports. On the left, the two things done across files
     (Compare, Trash), then — only while there is one — that the source doesn't
     parse. When the file was saved, and what it is, are the editor bar's
     (EditorBar.svelte). On the right, the switches
     that decide what the window shows rather than what the CV says. -->
<div id="status-bar">
  <div class="sb-actions">
    <!-- Only while there is something in there: an always-present button for an
	       always-empty bin is a control that never does anything. -->
    {#if files.trashed.length}
      <button
        id="trash-toggle"
        class="ds-btn subtle compact sb-btn"
        class:selected={ui.trashOpen}
        use:shortcut={['t', 'Show the trash']}
        onclick={commands.toggleTrash}
      >
        <Icon icon={IconTrash} width="16" height="16" />
        <span class="ds-txt"><u>T</u>rash</span>
        <span class="ds-badge">{files.trashed.length}</span>
      </button>
    {/if}
  </div>

  <span class="sb-sep" aria-hidden="true"></span>

  {#if ui.parseError}<span id="status" class="ds-lozenge removed">Syntax error</span>{/if}
  <div class="ds-spacer"></div>

  <div class="sb-actions">
    <!-- The one thing here that asks rather than reports, so it is the one thing
	       wearing a colour. It appears only when a newer build is actually waiting. -->
    {#if swUpdate.available}
      <button class="ds-btn compact sb-update" onclick={() => swUpdate.applyUpdate()} use:shortcut={['u', 'A new version is ready — reload to use it']}>
        <Icon icon={IconRefreshCw} width="16" height="16" />
        <span class="ds-txt"><u>U</u>pdate ready</span>
      </button>
    {/if}

    <!-- Left unlit either way: it is on to begin with, and a switch that is
	       always highlighted is furniture rather than information. The struck-out
	       pointer is what says it has been turned off. -->
    <button
      class="ds-btn subtle compact sb-btn"
      onclick={commands.toggleHoverSync}
      aria-pressed={ui.hoverSync}
      use:shortcut={['f', ui.hoverSync ? 'Stop the editor following the pointer over the preview' : 'Follow the pointer over the preview in the editor']}
    >
      {#if ui.hoverSync}
        <Icon icon={IconMousePointer2} width="16" height="16" />
      {:else}
        <Icon icon={IconMousePointer2Off} width="16" height="16" />
      {/if}
      <span class="ds-txt"><u>F</u>ollow</span>
    </button>

    <!-- Its neighbour's twin, and unlit on the same grounds: the broken link is
	       what says the two panes have stopped keeping each other's place. -->
    <button
      class="ds-btn subtle compact sb-btn"
      onclick={commands.toggleScrollSync}
      aria-pressed={ui.scrollSync}
      use:shortcut={['s', ui.scrollSync ? 'Stop the panes scrolling together' : 'Scroll the editor and the preview together']}
    >
      {#if ui.scrollSync}
        <Icon icon={IconLink2} width="16" height="16" />
      {:else}
        <Icon icon={IconLink2Off} width="16" height="16" />
      {/if}
      <span class="ds-txt"><u>S</u>croll</span>
    </button>

    <!-- The preview as the PDF's pages, drawn apart. Off, the sheet is one
	       strip with the same page breaks, so either way it is what exports. -->
    <button
      class="ds-btn subtle compact sb-btn"
      class:selected={ui.pagedPreview}
      onclick={commands.togglePaged}
      aria-pressed={ui.pagedPreview}
      use:shortcut={['g', 'Show the preview as the pages the PDF will have']}
    >
      <Icon icon={IconFiles} width="16" height="16" />
      <span class="ds-txt">Pa<u>g</u>es</span>
    </button>

    <!-- About the pane rather than the file, so it lives with the other view
	       switches instead of in Style. Only where there is a split to fit into. -->
    {#if ui.desktop}
      <button
        class="ds-btn subtle compact sb-btn"
        class:selected={ui.fitPreview}
        onclick={commands.toggleFit}
        aria-pressed={ui.fitPreview}
        use:shortcut={['p', 'Scale the preview until a whole page fits across the pane']}
      >
        <Icon icon={IconMaximize} width="16" height="16" />
        <span class="ds-txt">Fit <u>P</u>age</span>
      </button>
    {/if}

    <button
      class="ds-btn subtle compact sb-btn"
      class:selected={ui.sourceHidden}
      onclick={commands.toggleSource}
      use:shortcut={['e', ui.sourceHidden ? 'Show editor' : 'Hide editor (preview only)']}
    >
      {#if ui.sourceHidden}
        <Icon icon={IconEyeOff} width="16" height="16" />
      {:else}
        <Icon icon={IconEye} width="16" height="16" />
      {/if}
      <!-- One letter, two labels: the mnemonic stays put wherever the toggle is. -->
      <span class="ds-txt"><u>E</u>ditor</span>
    </button>

    <button class="ds-icon-btn compact sb-theme" aria-label="Toggle dark mode" onclick={commands.toggleTheme} use:shortcut={['k', 'Toggle dark mode']}>
      <Icon icon={IconMoon} class="icon-moon" width="16" height="16" />
      <Icon icon={IconSun} class="icon-sun" width="16" height="16" />
    </button>
  </div>
</div>

<style lang="scss">
  /* A footer strip on the page's surface: it reports, in the small body text,
     and its switches are compact subtle buttons that only fill on approach. */
  #status-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-150);
    height: var(--bar-status);
    padding: 0 var(--ds-space-100) 0 var(--ds-space-200);
    background: var(--ds-surface);
    border-top: var(--ds-border-width) solid var(--ds-border);
    z-index: 8;
    transition: var(--theme-fade);
  }

  /* Between the file actions and the status. */
  .sb-sep {
    flex-shrink: 0;
    width: var(--ds-border-width);
    height: 16px;
    background: var(--ds-border);
  }

  .sb-actions {
    display: flex;
    align-items: center;
    gap: var(--ds-space-025);
  }

  .sb-btn {
    font: var(--ds-font-body-small);
    font-weight: var(--ds-font-weight-medium);
  }

  /* ADS's warning appearance: the one thing here that asks rather than
     reports, and only there when a newer build is actually waiting. */
  .sb-update {
    background: var(--ds-background-warning-bold);
    color: var(--ds-text-warning-inverse);
    font: var(--ds-font-body-small);
    font-weight: var(--ds-font-weight-medium);
    margin-right: var(--ds-space-050);

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background: var(--ds-background-warning-bold);
      filter: brightness(0.95);
    }
  }

  /* One toggle, two glyphs: the scheme in force decides which is drawn. */
  :global(.icon-moon) {
    display: block;
  }

  :global(.icon-sun) {
    display: none;
  }

  :root[data-theme='dark'] :global(.icon-moon) {
    display: none;
  }

  :root[data-theme='dark'] :global(.icon-sun) {
    display: block;
  }

  @media (max-width: 640px) {
    #status-bar {
      gap: var(--ds-space-100);
      padding: 0 var(--ds-space-050) 0 var(--ds-space-100);
    }
  }
</style>
