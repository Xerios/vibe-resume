<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import IconTrash from '@iconify-icons/lucide/trash'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import { commands } from '$lib/cv/state/commands.js'
  import { files, ui } from '$lib/cv/state/state.svelte.js'
  import { shortcut } from './access-keys.js'
</script>

<div id="toolbar">
  <span class="t-label">Resume - Offline-ready & Local editor</span>

  <div class="t-spacer"></div>
  <button class="t-btn" use:shortcut={['c', 'Compare two documents or versions']} onclick={() => commands.openCompare()}>
    <Icon icon={IconCompare} width="12" height="12" />
    <span class="t-txt"><u>C</u>ompare</span>
  </button>
  <!-- Beside Export because both act on files rather than on the CV in front
	     of you, and only while there is something in there: an always-present
	     button for an always-empty bin is a control that never does anything. -->
  {#if files.trashed.length}
    <button id="trash-toggle" class="t-btn" class:on={ui.trashOpen} use:shortcut={['t', 'Show the trash']} onclick={commands.toggleTrash}>
      <Icon icon={IconTrash} width="12" height="12" />
      <span class="t-txt"><u>T</u>rash</span>
      <span class="t-count">{files.trashed.length}</span>
    </button>
  {/if}

  <button class="t-btn t-btn-pdf" use:shortcut={['x', 'Export the current CV as PDF']} onclick={commands.exportPDF}>
    <Icon icon={IconDownload} width="12" height="12" />
    <span class="t-txt">E<u>x</u>port PDF</span>
  </button>

  <!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
  {#if ui.installPrompt}
    <button class="t-btn" onclick={commands.installApp} use:shortcut={['i', 'Install as an app — runs offline']}>
      <Icon icon={IconInstall} width="12" height="12" />
      <span class="t-txt"><u>I</u>nstall</span>
    </button>
  {/if}
</div>

<style lang="scss">
  #toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--bar-tool);
    padding: 0 var(--sp-4);
    background: var(--bg-dark);
    border-bottom: var(--hairline) solid var(--gray-6);
    /* The bar casts onto the strip below it, so it reads as a lid rather than
	     as a band of the same wall. */
    box-shadow: var(--bar-shadow);
    z-index: 10;
    transition: var(--theme-fade);
  }

  .t-label {
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
  }

  /* At phone width the bar keeps only what can't be inferred: the label is
	   the page title again. */
  @media (max-width: 640px) {
    #toolbar {
      gap: var(--sp-3);
      padding: 0 var(--sp-3);
    }

    .t-label {
      display: none;
    }
  }
</style>
