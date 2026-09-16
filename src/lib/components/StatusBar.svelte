<script>
  import Icon from '@iconify/svelte'
  import IconEye from '@iconify-icons/lucide/eye'
  import IconEyeOff from '@iconify-icons/lucide/eye-off'
  import IconLink2 from '@iconify-icons/lucide/link-2'
  import IconLink2Off from '@iconify-icons/lucide/link-2-off'
  import IconMoon from '@iconify-icons/lucide/moon'
  import IconMousePointer2 from '@iconify-icons/lucide/mouse-pointer-2'
  import IconMousePointer2Off from '@iconify-icons/lucide/mouse-pointer-2-off'
  import IconRefreshCw from '@iconify-icons/lucide/refresh-cw'
  import IconSun from '@iconify-icons/lucide/sun'
  import { withKey } from './access-keys.js'

  let {
    valid = true,
    /** @type {string} */
    saveLabel = '',
    sourceHidden = false,
    hoverSync = true,
    scrollSync = true,
    updateAvailable = false,
    /** @type {() => void} */
    onToggleSource,
    /** @type {() => void} */
    onToggleHoverSync,
    /** @type {() => void} */
    onToggleScrollSync,
    /** @type {() => void} */
    onToggleTheme,
    /** @type {() => void} */
    onUpdate,
  } = $props()
</script>

<!-- The bar that reports rather than asks: whether the YAML parses, and when it
     was last written to storage. The switches that decide what the window
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

    <!-- Left unlit either way: it is on to begin with, and a switch that is
	       always highlighted is furniture rather than information. The struck-out
	       pointer is what says it has been turned off. -->
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button
      class="sb-btn"
      onclick={onToggleHoverSync}
      accesskey="f"
      aria-pressed={hoverSync}
      title={withKey(hoverSync ? 'Stop the editor following the pointer over the preview' : 'Follow the pointer over the preview in the editor', 'f')}>
      {#if hoverSync}
        <Icon icon={IconMousePointer2} width="12" height="12" />
      {:else}
        <Icon icon={IconMousePointer2Off} width="12" height="12" />
      {/if}
      <span class="t-txt"><u>F</u>ollow</span>
    </button>

    <!-- Its neighbour's twin, and unlit on the same grounds: the broken link is
	       what says the two panes have stopped keeping each other's place. -->
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button
      class="sb-btn"
      onclick={onToggleScrollSync}
      accesskey="s"
      aria-pressed={scrollSync}
      title={withKey(scrollSync ? 'Stop the panes scrolling together' : 'Scroll the editor and the preview together', 'y')}>
      {#if scrollSync}
        <Icon icon={IconLink2} width="12" height="12" />
      {:else}
        <Icon icon={IconLink2Off} width="12" height="12" />
      {/if}
      <span class="t-txt"><u>S</u>croll</span>
    </button>

    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button
      class="sb-btn"
      class:on={sourceHidden}
      onclick={onToggleSource}
      accesskey="e"
      title={withKey(sourceHidden ? 'Show editor' : 'Hide editor (preview only)', 'e')}>
      {#if sourceHidden}
        <Icon icon={IconEyeOff} width="12" height="12" />
      {:else}
        <Icon icon={IconEye} width="12" height="12" />
      {/if}
      <!-- One letter, two labels: the mnemonic stays put wherever the toggle is. -->
      <span class="t-txt"><u>E</u>ditor</span>
    </button>

    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="sb-btn sb-theme" onclick={onToggleTheme} accesskey="k" title={withKey('Toggle dark mode', 'k')}>
      <Icon icon={IconMoon} class="icon-moon" width="13" height="13" />
      <Icon icon={IconSun} class="icon-sun" width="13" height="13" />
    </button>
  </div>
</div>

<style lang="scss">
  #status-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--bar-status);
    padding: 0 var(--sp-2) 0 var(--sp-4);
    background: var(--bg-dark);
    border-top: var(--hairline) solid var(--gray-6);
    z-index: 8;
    transition: var(--theme-fade);
  }

  #status {
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 0 var(--sp-2);
    border-radius: var(--corner-xs);
    transition: var(--theme-fade);

    /* Two soft containers: step 3 as the fill, step 11 as the word on it. That
	     pair is Radix's whole answer to a tinted badge — 3 is the background step
	     and 11 is guaranteed legible on it — and it holds in both schemes, so
	     neither pill needs a dark branch of its own. */
    &.ok {
      color: var(--grass-11);
      background: var(--grass-3);
    }

    &.err {
      color: var(--red-11);
      background: var(--red-3);
    }
  }

  #save-state {
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    letter-spacing: 0.3px;
    color: var(--gray-11);
    white-space: nowrap;
  }

  .sb-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* Not a .t-btn: a filled button is too much furniture for a bar this thin, so
	   these are bare and take a surface only on approach. */
  .sb-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    background: none;
    border: none;
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 550;
    color: var(--gray-11);
    white-space: nowrap;
    padding: var(--sp-1) var(--sp-3);
    transition: var(--theme-fade);

    /* Bare until approached, and then the same alpha steps every other control
	     here walks: 3 on hover, 4 held down. The label climbs from the
	     low-contrast text step to the high-contrast one at the same time. */
    &:hover {
      background: var(--gray-a3);
      color: var(--gray-12);
      transition: var(--hover-fade);
    }

    &:active {
      background: var(--gray-a4);
    }

    &.on {
      background: var(--accent-9);
      color: var(--accent-contrast);

      &:hover {
        background: var(--accent-10);
        color: var(--accent-contrast);
      }
    }

    /* Drawn by <Icon>, so the elements are ones the compiler never sees. */
    :global([stroke-width]) {
      stroke-width: 2.25;
    }
  }

  /* Amber, as everywhere else something wants attention without being wrong — the
	   detached-history banner wears the same 3/11 pair. Amber is the one hue
	   whose step 9 does not take white, which is exactly why the soft container
	   rather than the solid fill is the right way to spend it. */
  .sb-update {
    background: var(--amber-3);
    color: var(--amber-11);
    border: none;
    padding: 0 var(--sp-2);
    margin-right: var(--sp-1);
    animation: sb-update-pulse 2.4s ease-in-out infinite;

    /* Stated after `.sb-btn:hover`, whose colours it has to win against. */
    &:hover {
      background: var(--amber-4);
      color: var(--amber-11);
    }

    &:active {
      background: var(--amber-5);
    }
  }

  /* A halo that breathes rather than blinks: enough to catch the eye returning to
	   the window, not enough to sit in the corner of it nagging. */
  @keyframes sb-update-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 var(--amber-a7);
    }

    50% {
      box-shadow: 0 0 0 3px var(--amber-a7);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-update {
      animation: none;
    }
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
      gap: var(--sp-3);
      padding: 0 var(--sp-2) 0 var(--sp-3);
    }

    .sb-btn .t-txt {
      display: none;
    }
  }
</style>
