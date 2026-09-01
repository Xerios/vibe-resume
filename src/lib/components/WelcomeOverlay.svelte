<script>
  import Icon from '@iconify/svelte'
  import IconCloudOff from '@iconify-icons/lucide/cloud-off'
  import IconHardDrive from '@iconify-icons/lucide/hard-drive'
  import IconShieldCheck from '@iconify-icons/lucide/shield-check'

  let {
    /** @type {() => void} */
    onStart,
  } = $props()

  /** @type {HTMLButtonElement | undefined} */
  let startBtn = $state(undefined)

  // The overlay owns the screen while it is up, so the one thing worth reaching
  // for should already be under the cursor's keyboard equivalent.
  $effect(() => startBtn?.focus())

  // Only Escape: the start button is focused, so Enter and Space already
  // activate it without a window handler racing the button's own click.
  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') onStart()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Not a <dialog>: nothing underneath is interactive yet, and the backdrop is
     part of the dimming rather than a separate layer to keep in sync. -->
<div id="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
  <div class="w-card">
    <p class="w-eyebrow">Resume Editor</p>
    <h1 id="welcome-title">Write your CV in plain text.</h1>

    <p class="w-lede">
      An offline-ready, local-first editor. Nothing is sent to a server — every keystroke, version and export is processed on your own machine.
    </p>

    <ul class="w-points">
      <li>
        <Icon icon={IconCloudOff} width="14" height="14" />
        <span>
          <strong>No account, no upload.</strong> There is no backend to send your CV to.
        </span>
      </li>
      <li>
        <Icon icon={IconHardDrive} width="14" height="14" />
        <span>
          <strong>Stored in this browser.</strong> Your documents and their version history stay in local storage.
        </span>
      </li>
      <li>
        <Icon icon={IconShieldCheck} width="14" height="14" />
        <span>
          <strong>Works offline.</strong> Install it and it keeps working with the network switched off.
        </span>
      </li>
    </ul>

    <button bind:this={startBtn} class="w-start" onclick={onStart}> Start writing </button>

    <p class="w-foot">Clearing your browser data clears your CVs — export a PDF to keep one.</p>
  </div>
</div>

<style>
  #welcome {
    position: fixed;
    inset: 0;
    z-index: 1000; /* over the panels (100) and the toast (999) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: transparent;
    backdrop-filter: blur(3px);
    animation: w-fade 0.25s ease;
  }

  .w-card {
    width: min(460px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: 30px 32px 26px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-pop);
    animation: w-rise 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .w-eyebrow {
    margin: 0 0 10px;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--accent);
  }

  h1 {
    margin: 0 0 12px;
    font-family: var(--sans);
    font-size: 21px;
    font-weight: 650;
    line-height: 1.25;
    color: var(--ink);
  }

  .w-lede {
    margin: 0 0 20px;
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.6;
    color: var(--muted);
  }

  .w-points {
    margin: 0 0 24px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .w-points li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-family: var(--sans);
    font-size: 12px;
    line-height: 1.55;
    color: var(--muted);
  }

  /* Iconify's lucide ships at stroke-width 2; the chrome runs bolder. */
  .w-points :global([stroke-width]) {
    stroke-width: 2.5;
  }

  .w-points li :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--accent);
  }

  .w-points strong {
    font-weight: 620;
    color: var(--ink);
  }

  /* The only way out of the overlay, so it is filled rather than outlined —
	   the same weight Export carries in the toolbar. */
  .w-start {
    width: 100%;
    padding: 10px;
    background: var(--accent);
    border: 1.5px solid var(--accent);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--on-accent);
    transition:
      background-color 0.13s,
      border-color 0.13s;
  }

  .w-start:hover {
    background: var(--accent-deep);
    border-color: var(--accent-deep);
  }

  .w-foot {
    margin: 14px 0 0;
    font-family: var(--mono);
    font-size: 9.5px;
    line-height: 1.6;
    text-align: center;
    color: var(--faint);
  }

  @keyframes w-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes w-rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    #welcome,
    .w-card {
      animation: none;
    }
  }
</style>
