<script>
  import Icon from '@iconify/svelte'
  import IconCloudOff from '@iconify-icons/lucide/cloud-off'
  import IconFileCheck from '@iconify-icons/lucide/file-check'
  import IconHardDrive from '@iconify-icons/lucide/hard-drive'
  import IconShieldCheck from '@iconify-icons/lucide/shield-check'
  import IconClose from '@iconify-icons/lucide/x'
  import logo from '$lib/assets/favicon.svg'
  import { commands } from '$lib/cv/state/commands'
  import { KEYS, read } from '$lib/cv/state/storage'

  /** @type {HTMLButtonElement | undefined} */
  let startBtn = $state(undefined)

  // The overlay owns the screen while it is up, so the one thing worth reaching
  // for should already be under the cursor's keyboard equivalent.
  $effect(() => startBtn?.focus())

  // Only Escape: the start button is focused, so Enter and Space already
  // activate it without a window handler racing the button's own click.
  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') commands.dismissWelcome()
  }

  /**
   * The first launch, rather than one opened from the menu: read once, as the
   * overlay comes up, since closing it is what marks it seen.
   */
  const firstLaunch = read(KEYS.welcomeSeen) !== 'true'

  /** Playing the nudge that points a stray first-launch click at the button. */
  let nudging = $state(false)

  /**
   * A click on the backdrop closes the dialog — but only one that also *began*
   * there, so a drag that starts inside the card (selecting text, say) and is
   * let go of outside it doesn't. On first launch it is never let go of that
   * way: the click nudges the card and the button instead, so the welcome is
   * read rather than clicked past.
   */
  let downOnBackdrop = false

  function onBackdrop() {
    if (!firstLaunch) {
      commands.dismissWelcome()
      return
    }
    // Off for a frame first, so a second click restarts the animation.
    nudging = false
    requestAnimationFrame(() => (nudging = true))
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Not a <dialog>: nothing underneath is interactive yet, and the backdrop is
     part of the dimming rather than a separate layer to keep in sync. -->
<!-- The keyboard way out is Escape, on the window above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  id="welcome"
  role="dialog"
  aria-modal="true"
  aria-labelledby="welcome-title"
  tabindex="-1"
  onpointerdown={e => (downOnBackdrop = e.target === e.currentTarget)}
  onclick={e => {
    if (downOnBackdrop && e.target === e.currentTarget) onBackdrop()
  }}>
  <!-- An ADS modal: header with title and close, body, footer with the action. -->
  <div class="w-card" class:nudge={nudging}>
    <header class="w-head">
      <img src={logo} alt="" width="32" height="32" />
      <h1 id="welcome-title">Write your CV in plain text</h1>
      <button class="ds-icon-btn" aria-label="Close" onclick={commands.dismissWelcome}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </header>

    <div class="w-body">
      <p class="w-lede">An offline-ready, local-first editor. Nothing is sent to a server.</p>

      <ul class="w-points">
        <li>
          <span class="w-icon"><Icon icon={IconFileCheck} width="16" height="16" /></span>
          <span>
            <strong>A PDF machines can read</strong>
            Exports are tagged, accessible PDF/UA, so text extracts cleanly for screen readers and applicant tracking systems.
          </span>
        </li>
        <li>
          <span class="w-icon"><Icon icon={IconHardDrive} width="16" height="16" /></span>
          <span>
            <strong>Stored in this browser</strong>
            Your documents and history stay in local storage. Every exported PDF carries its source, so dropping one back in brings the CV back.
          </span>
        </li>
        <li>
          <span class="w-icon"><Icon icon={IconCloudOff} width="16" height="16" /></span>
          <span>
            <strong>No account, no upload</strong>
            There is no backend to send your CV to.
          </span>
        </li>
        <li>
          <span class="w-icon"><Icon icon={IconShieldCheck} width="16" height="16" /></span>
          <span>
            <strong>Works offline</strong>
            Install and it keeps working with the network switched off.
          </span>
        </li>
      </ul>
    </div>

    <footer class="w-foot">
      <button bind:this={startBtn} class="ds-btn primary" class:nudge={nudging} onclick={commands.dismissWelcome}>
        {firstLaunch ? 'Start writing' : 'Close'}
      </button>
    </footer>
  </div>
</div>

<style lang="scss">
  #welcome {
    position: fixed;
    inset: 0;
    z-index: 1000; /* over the panels (100) and the toast (999) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ds-space-200);
    background: var(--ds-blanket);
    animation: w-fade 200ms var(--ease);
  }

  /* ADS's small modal: 400px, the overlay surface, the large radius. */
  .w-card {
    width: min(480px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ds-surface-overlay);
    border-radius: var(--ds-radius-large);
    box-shadow: var(--ds-shadow-overlay);
    animation: w-rise 300ms var(--ease);
  }

  .w-head {
    display: flex;
    align-items: center;
    gap: var(--ds-space-150);
    padding: var(--ds-space-300) var(--ds-space-300) var(--ds-space-200);

    img {
      flex-shrink: 0;
      border-radius: var(--ds-radius-medium);
    }

    h1 {
      flex: 1;
      margin: 0;
      font: var(--ds-font-heading-medium);
      color: var(--ds-text);
    }
  }

  .w-body {
    overflow-y: auto;
    padding: var(--ds-space-025) var(--ds-space-300);
  }

  .w-lede {
    margin: 0 0 var(--ds-space-300);
    font: var(--ds-font-body);
    color: var(--ds-text);
  }

  .w-points {
    margin: 0 0 var(--ds-space-300);
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-200);

    li {
      display: flex;
      align-items: flex-start;
      gap: var(--ds-space-150);
      font: var(--ds-font-body);
      color: var(--ds-text-subtle);
    }

    strong {
      display: block;
      font: var(--ds-font-heading-xsmall);
      color: var(--ds-text);
      margin-bottom: var(--ds-space-025);
    }
  }

  /* An icon tile, the way ADS lists features: the brand icon on the palest
     brand fill. */
  .w-icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--ds-radius-medium);
    background: var(--ds-background-selected);
    color: var(--ds-icon-brand);
  }

  .w-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--ds-space-100);
    padding: var(--ds-space-300);
  }

  /* A stray click on first launch: the card bumps toward the reader and the
     button pulses, so the way out is plain. */
  .w-card.nudge {
    animation: w-bump 300ms var(--ease);
  }

  .w-foot .nudge {
    animation: w-pulse 900ms var(--ease);
  }

  @keyframes w-bump {
    50% {
      transform: scale(1.03);
    }
  }

  @keyframes w-pulse {
    from {
      box-shadow: 0 0 0 0 var(--ds-border-focused);
    }
    to {
      box-shadow: 0 0 0 10px transparent;
    }
  }

  @keyframes w-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes w-rise {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    #welcome,
    .w-card,
    .w-card.nudge {
      animation: none;
    }
  }
</style>
