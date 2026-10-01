<script>
  import Icon from '@iconify/svelte'
  import IconCloudOff from '@iconify-icons/lucide/cloud-off'
  import IconHardDrive from '@iconify-icons/lucide/hard-drive'
  import IconShieldCheck from '@iconify-icons/lucide/shield-check'
  import IconClose from '@iconify-icons/lucide/x'
  import logo from '$lib/assets/favicon.svg'
  import { commands } from '$lib/cv/state/commands.js'

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
   * A click on the backdrop closes the dialog — but only one that also *began*
   * there, so a drag that starts inside the card (selecting text, say) and is
   * let go of outside it doesn't.
   */
  let downOnBackdrop = false

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
    if (downOnBackdrop && e.target === e.currentTarget) commands.dismissWelcome()
  }}>
  <!-- An ADS modal: header with title and close, body, footer with the action. -->
  <div class="w-card">
    <header class="w-head">
      <img src={logo} alt="" width="32" height="32" />
      <h1 id="welcome-title">Write your CV in plain text</h1>
      <button class="ds-icon-btn" aria-label="Close" onclick={commands.dismissWelcome}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </header>

    <div class="w-body">
      <p class="w-lede">
        An offline-ready, local-first editor. Nothing is sent to a server — every keystroke, version and export is processed on your own machine.
      </p>

      <ul class="w-points">
        <li>
          <span class="w-icon"><Icon icon={IconCloudOff} width="16" height="16" /></span>
          <span>
            <strong>No account, no upload</strong>
            There is no backend to send your CV to.
          </span>
        </li>
        <li>
          <span class="w-icon"><Icon icon={IconHardDrive} width="16" height="16" /></span>
          <span>
            <strong>Stored in this browser</strong>
            Your documents and their version history stay in local storage.
          </span>
        </li>
        <li>
          <span class="w-icon"><Icon icon={IconShieldCheck} width="16" height="16" /></span>
          <span>
            <strong>Works offline</strong>
            Install it and it keeps working with the network switched off.
          </span>
        </li>
      </ul>

      <div class="ds-section-message warning">
        <span>Clearing your browser data clears your CVs — export a PDF to keep one.</span>
      </div>
    </div>

    <footer class="w-foot">
      <button bind:this={startBtn} class="ds-btn primary" onclick={commands.dismissWelcome}>Start writing</button>
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
    .w-card {
      animation: none;
    }
  }
</style>
