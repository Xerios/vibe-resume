<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import IconTrash from '@iconify-icons/lucide/trash'
  import { shortcut } from './access-keys.js'

  let {
    /** True only while the browser has an install prompt waiting for us. */
    canInstall = false,
    /** How many files are in the trash — none, and the button isn't drawn at all. */
    trashCount = 0,
    trashOpen = false,
    /** @type {() => void} */
    onToggleTrash,
    /** @type {() => void} */
    onExport,
    /** @type {() => void} */
    onInstall,
  } = $props()
</script>

<div id="toolbar">
  <span class="t-label">Resume - Offline-ready & Local editor</span>

  <div class="t-spacer"></div>

  <!-- Beside Export because both act on files rather than on the CV in front
	     of you, and only while there is something in there: an always-present
	     button for an always-empty bin is a control that never does anything. -->
  {#if trashCount}
    <button id="trash-toggle" class="t-btn" class:on={trashOpen} use:shortcut={['t', 'Show the trash']} onclick={onToggleTrash}>
      <Icon icon={IconTrash} width="12" height="12" />
      <span class="t-txt"><u>T</u>rash</span>
      <span class="t-count">{trashCount}</span>
    </button>
  {/if}

  <button class="t-btn t-btn-pdf" use:shortcut={['x', 'Export the current CV as PDF']} onclick={onExport}>
    <Icon icon={IconDownload} width="12" height="12" />
    <span class="t-txt">E<u>x</u>port PDF</span>
  </button>

  <!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
  {#if canInstall}
    <button class="t-btn" onclick={onInstall} use:shortcut={['i', 'Install as an app — runs offline']}>
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
