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
    padding: var(--sp-6);
    /* Radix's overlay: black alpha, the one scale that does not flip with the
	     scheme — a scrim darkens what is behind it either way round. */
    background: var(--overlay);
    backdrop-filter: blur(2px);
    animation: w-fade 0.25s ease;
  }

  .w-card {
    width: min(430px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: var(--sp-6) var(--sp-6) var(--sp-5);
    background: var(--gray-2);
    border-radius: var(--corner-md);
    box-shadow: var(--shadow-6);
    animation: w-rise 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .w-eyebrow {
    margin: 0 0 var(--sp-3);
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--accent-11);
  }

  h1 {
    margin: 0 0 var(--sp-4);
    font-family: var(--sans);
    font-size: var(--ui-fs-2xl);
    font-weight: 650;
    line-height: 1.25;
    color: var(--gray-12);
  }

  .w-lede {
    margin: 0 0 var(--sp-5);
    font-family: var(--sans);
    font-size: var(--ui-fs-lg);
    line-height: 1.6;
    color: var(--gray-11);
  }

  .w-points {
    margin: 0 0 var(--sp-6);
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .w-points li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    font-family: var(--sans);
    font-size: var(--ui-fs-md);
    line-height: 1.55;
    color: var(--gray-11);
  }

  /* Iconify's lucide ships at stroke-width 2; the chrome runs bolder. */
  .w-points :global([stroke-width]) {
    stroke-width: 2.25;
  }

  .w-points li :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--accent-11);
  }

  .w-points strong {
    font-weight: 620;
    color: var(--gray-12);
  }

  /* The only way out of the overlay, so it is lit rather than bare — the same
	   weight Export carries in the toolbar. */
  .w-start {
    width: 100%;
    padding: var(--sp-3);
    background: var(--accent-9);
    border: none;
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-md);
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--accent-contrast);
    transition: var(--hover-fade);
  }

  .w-start:hover {
    background: var(--accent-10);
  }

  .w-foot {
    margin: var(--sp-5) 0 0;
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    line-height: 1.6;
    text-align: center;
    color: var(--gray-11);
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
