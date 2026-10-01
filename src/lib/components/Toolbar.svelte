<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import IconTrash from '@iconify-icons/lucide/trash'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import logo from '$lib/assets/favicon.svg'
  import { commands } from '$lib/cv/state/commands.js'
  import { files, ui } from '$lib/cv/state/state.svelte.js'
  import { shortcut } from './access-keys.js'
</script>

<!-- ADS top navigation: the product on the left, its actions on the right, and
     the one primary action last. -->
<header id="toolbar">
  <div class="t-product">
    <img class="t-logo" src={logo} alt="" width="24" height="24" />
    <span class="t-title">Resume</span>
    <span class="t-subtitle">Offline-ready &amp; local editor</span>
  </div>

  <div class="ds-spacer"></div>

  <nav class="t-actions" aria-label="Document actions">
    <button class="ds-btn subtle" use:shortcut={['c', 'Compare two documents or versions']} onclick={() => commands.openCompare()}>
      <Icon icon={IconCompare} width="16" height="16" />
      <span class="ds-txt"><u>C</u>ompare</span>
    </button>
    <!-- Beside Export because both act on files rather than on the CV in front
	       of you, and only while there is something in there: an always-present
	       button for an always-empty bin is a control that never does anything. -->
    {#if files.trashed.length}
      <button id="trash-toggle" class="ds-btn subtle" class:selected={ui.trashOpen} use:shortcut={['t', 'Show the trash']} onclick={commands.toggleTrash}>
        <Icon icon={IconTrash} width="16" height="16" />
        <span class="ds-txt"><u>T</u>rash</span>
        <span class="ds-badge">{files.trashed.length}</span>
      </button>
    {/if}

    <!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	       and only until the app is installed. Elsewhere the bar looks as it always did. -->
    {#if ui.installPrompt}
      <button class="ds-btn subtle" onclick={commands.installApp} use:shortcut={['i', 'Install as an app — runs offline']}>
        <Icon icon={IconInstall} width="16" height="16" />
        <span class="ds-txt"><u>I</u>nstall</span>
      </button>
    {/if}

    <button class="ds-btn primary" use:shortcut={['x', 'Export the current CV as PDF']} onclick={commands.exportPDF}>
      <Icon icon={IconDownload} width="16" height="16" />
      <span class="ds-txt">E<u>x</u>port PDF</span>
    </button>
  </nav>
</header>

<style lang="scss">
  #toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-200);
    height: var(--bar-tool);
    padding: 0 var(--ds-space-200) 0 var(--ds-space-150);
    background: var(--ds-surface);
    border-bottom: var(--ds-border-width) solid var(--ds-border);
    z-index: 10;
    transition: var(--theme-fade);
  }

  .t-product {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    min-width: 0;
    padding: 0 var(--ds-space-050);
  }

  .t-logo {
    display: block;
    flex-shrink: 0;
    border-radius: var(--ds-radius-medium);
  }

  .t-title {
    font: var(--ds-font-heading-small);
    color: var(--ds-text);
    white-space: nowrap;
  }

  .t-subtitle {
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
    white-space: nowrap;
    padding-left: var(--ds-space-100);
    border-left: var(--ds-border-width) solid var(--ds-border);
  }

  .t-actions {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
  }

  @media (max-width: 900px) {
    .t-subtitle {
      display: none;
    }
  }

  /* At phone width the bar keeps only what can't be inferred: the product
	   name is the page title again. */
  @media (max-width: 640px) {
    #toolbar {
      gap: var(--ds-space-100);
      padding: 0 var(--ds-space-100);
    }

    .t-title {
      display: none;
    }

    .t-actions {
      gap: var(--ds-space-050);
    }
  }
</style>
