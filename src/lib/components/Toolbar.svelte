<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import IconTrash from '@iconify-icons/lucide/trash'
  import { withKey } from './access-keys.js'

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
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button id="trash-toggle" class="t-btn" class:on={trashOpen} accesskey="t" title={withKey('Show the trash', 't')} onclick={onToggleTrash}>
      <Icon icon={IconTrash} width="12" height="12" />
      <span class="t-txt"><u>T</u>rash</span>
      <span class="t-count">{trashCount}</span>
    </button>
  {/if}

  <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
  <button class="t-btn t-btn-pdf" accesskey="x" title={withKey('Export the current CV as PDF', 'x')} onclick={onExport}>
    <Icon icon={IconDownload} width="12" height="12" />
    <span class="t-txt">E<u>x</u>port PDF</span>
  </button>

  <!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	     and only until the app is installed. Elsewhere the bar looks as it always did. -->
  {#if canInstall}
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" onclick={onInstall} accesskey="i" title={withKey('Install as an app — runs offline', 'i')}>
      <Icon icon={IconInstall} width="12" height="12" />
      <span class="t-txt"><u>I</u>nstall</span>
    </button>
  {/if}
</div>

<style>
  #toolbar {
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

  /* At phone width the bar keeps only what can't be inferred: the label is
	   the page title again. */
  @media (max-width: 640px) {
    #toolbar {
      gap: 8px;
      padding: 0 10px;
    }

    .t-label {
      display: none;
    }
  }
</style>
