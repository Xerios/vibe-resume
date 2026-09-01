<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import StylePicker from './StylePicker.svelte'
  import { withKey } from './access-keys.js'

  let {
    /** True only while the browser has an install prompt waiting for us. */
    canInstall = false,
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
    /** The active file's own CSS, and the setter behind the picker's editor. */
    css = '',
    /** @type {(text: string) => void} */
    onCss,
    /** @type {() => void} */
    onExport,
    /** @type {() => void} */
    onInstall,
  } = $props()
</script>

<div id="toolbar">
  <span class="t-label">Resume - Offline-ready & Local editor</span>

  <div class="t-spacer"></div>

  <StylePicker {slots} {choices} {preset} {modified} {theme} {font} {css} {onPreset} {onVariant} {onReset} {onTheme} {onFont} {onCss} />

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
