<script>
  import Icon from '@iconify/svelte'
  import IconEye from '@iconify-icons/lucide/eye'
  import IconEyeOff from '@iconify-icons/lucide/eye-off'
  import IconMoon from '@iconify-icons/lucide/moon'
  import IconRefreshCw from '@iconify-icons/lucide/refresh-cw'
  import IconSun from '@iconify-icons/lucide/sun'
  import { withKey } from './access-keys.js'

  let {
    valid = true,
    /** @type {string} */
    saveLabel = '',
    sourceHidden = false,
    updateAvailable = false,
    /** @type {() => void} */
    onToggleSource,
    /** @type {() => void} */
    onToggleTheme,
    /** @type {() => void} */
    onUpdate,
  } = $props()
</script>

<!-- The bar that reports rather than asks: whether the YAML parses, and when it
     was last written to storage. The two switches that decide what the window
     shows — rather than what the CV says — keep it company at the far end,
     clear of the toolbar buttons that change the document. -->
<div id="status-bar">
  <span id="status" class={valid ? 'ok' : 'err'}>{valid ? '✓ Valid' : '✗ Error'}</span>
  <div class="t-spacer"></div>
  {#if saveLabel}<span id="save-state">{saveLabel}</span>{/if}

  <div class="sb-actions">
    <!-- The one thing here that asks rather than reports, so it is the one thing
	       wearing a colour. It appears only when a newer build is actually waiting. -->
    {#if updateAvailable}
      <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
      <button class="sb-btn sb-update" onclick={onUpdate} accesskey="u" title={withKey('A new version is ready — reload to use it', 'u')}>
        <Icon icon={IconRefreshCw} width="12" height="12" />
        <span class="t-txt"><u>U</u>pdate ready</span>
      </button>
    {/if}

    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button
      class="sb-btn"
      class:on={sourceHidden}
      onclick={onToggleSource}
      accesskey="o"
      title={withKey(sourceHidden ? 'Show source' : 'Hide source (preview only)', 'o')}
    >
      {#if sourceHidden}
        <Icon icon={IconEyeOff} width="12" height="12" />
      {:else}
        <Icon icon={IconEye} width="12" height="12" />
      {/if}
      <!-- One letter, two labels: the mnemonic stays put wherever the toggle is. -->
      <span class="t-txt"
        >{#if sourceHidden}Preview <u>o</u>nly{:else}S<u>o</u>urce{/if}</span
      >
    </button>

    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="sb-btn sb-theme" onclick={onToggleTheme} accesskey="k" title={withKey('Toggle dark mode', 'k')}>
      <Icon icon={IconMoon} class="icon-moon" width="13" height="13" />
      <Icon icon={IconSun} class="icon-sun" width="13" height="13" />
    </button>
  </div>
</div>

<style>
  #status-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 26px;
    padding: 0 8px 0 12px;
    background: var(--paper);
    border-top: 1px solid var(--line);
    z-index: 8;
    transition: var(--theme-fade);
  }

  #status {
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 4px;
    transition: var(--theme-fade);
  }

  #status.ok {
    color: #1a6b3a;
    background: #e8f5ee;
  }

  #status.err {
    color: var(--danger);
    background: #fee2e2;
  }

  /* Tints with no token of their own — the red foreground comes from --danger. */
  :root[data-theme='dark'] #status.ok {
    color: #5dcc80;
    background: #082210;
  }

  :root[data-theme='dark'] #status.err {
    background: #2a0808;
  }

  #save-state {
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    letter-spacing: 0.3px;
    color: var(--faint);
    white-space: nowrap;
  }

  .sb-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /* Not a .t-btn: an outlined button is too much furniture for a 26px bar, so
	   these carry no border and answer on approach instead. */
  .sb-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--faint);
    white-space: nowrap;
    padding: 3px 7px;
    transition: var(--theme-fade);
  }

  .sb-btn:hover {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  .sb-btn.on {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  /* Amber, as everywhere else something wants attention without being wrong — the
	   detached-history banner wears the same pair. The border eats the padding back
	   so the pill still fits the 26px bar. */
  .sb-update {
    background: var(--prompt-bg);
    color: var(--prompt);
    border: 1px solid color-mix(in srgb, var(--prompt) 35%, transparent);
    padding: 2px 6px;
    margin-right: 4px;
    animation: sb-update-pulse 2.4s ease-in-out infinite;
  }

  /* Stated after `.sb-btn:hover`, whose accent colours it has to win against. */
  .sb-update:hover {
    background: var(--prompt);
    color: var(--prompt-bg);
  }

  /* A halo that breathes rather than blinks: enough to catch the eye returning to
	   the window, not enough to sit in the corner of it nagging. */
  @keyframes sb-update-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--prompt) 22%, transparent);
    }

    50% {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--prompt) 22%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-update {
      animation: none;
    }
  }

  /* Drawn by <Icon>, so the elements are ones the compiler never sees. */
  .sb-btn :global([stroke-width]) {
    stroke-width: 2.5;
  }

  /* Moon and sun are denser shapes, and were always drawn lighter than the
	   rest of the chrome. */
  .sb-theme :global([stroke-width]) {
    stroke-width: 2;
  }

  /* One toggle, two glyphs: the ramp in force decides which is drawn. */
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

  /* Phone width, as everywhere else in the chrome: the word the icon beside it
	   already says drops out. */
  @media (max-width: 640px) {
    #status-bar {
      gap: 8px;
      padding: 0 6px 0 8px;
    }

    .sb-btn .t-txt {
      display: none;
    }
  }
</style>
