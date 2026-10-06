<script>
  import { onMount } from 'svelte'
  import Icon from '@iconify/svelte'
  import IconClose from '@iconify-icons/lucide/x'

  /**
   * @typedef {object} Props
   * @property {string} title
   * @property {number} [width] the card's width in pixels, short of a narrow screen
   * @property {() => void} onClose
   * @property {import('svelte').Snippet} children
   * @property {import('svelte').Snippet} [footer]
   */

  /** @type {Props} */
  let { title, width = 480, onClose, children, footer } = $props()

  const titleId = $props.id()

  /** @type {HTMLDivElement} */
  let card

  // Whatever the dialog marks as the thing to reach for, or the card itself, so
  // the keyboard is in the dialog rather than still in the editor beneath it.
  onMount(() => /** @type {HTMLElement} */ (card.querySelector('[data-autofocus]') ?? card).focus())

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') onClose()
  }

  /** Only a click that also began on the backdrop closes it — see WelcomeOverlay. */
  let downOnBackdrop = false
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The keyboard way out is Escape, on the window above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
  tabindex="-1"
  onpointerdown={(e) => (downOnBackdrop = e.target === e.currentTarget)}
  onclick={(e) => {
    if (downOnBackdrop && e.target === e.currentTarget) onClose()
  }}
>
  <div class="card" style:width="min({width}px, 100%)" tabindex="-1" bind:this={card}>
    <header class="head">
      <h2 id={titleId}>{title}</h2>
      <button class="ds-icon-btn" aria-label="Close" onclick={onClose}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </header>

    <div class="body">
      {@render children()}
    </div>

    {#if footer}
      <footer class="foot">
        {@render footer()}
      </footer>
    {/if}
  </div>
</div>

<style lang="scss">
  .modal {
    position: fixed;
    inset: 0;
    z-index: 1000; /* over the panels (100) and the toast (999) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ds-space-200);
    background: var(--ds-blanket);
    animation: m-fade 150ms var(--ease);
  }

  /* A floating surface, dressed like every other one here: the overlay fill
     inside the same hairline, the dialog's radius, the shadow that separates
     it from what it covers. */
  .card {
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ds-surface-overlay);
    border: var(--ds-border-width) solid var(--ds-border);
    border-radius: var(--ds-radius-xlarge);
    box-shadow: var(--ds-shadow-overlay);
    animation: m-rise 200ms var(--ease);

    &:focus {
      outline: none;
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-250) var(--ds-space-250) var(--ds-space-150);

    h2 {
      flex: 1;
      margin: 0;
      font: var(--ds-font-heading-medium);
      letter-spacing: var(--tracking-tight);
      color: var(--ds-text);
    }
  }

  /* Read rather than scanned, so it takes the prose line height. */
  .body {
    overflow-y: auto;
    padding: 0 var(--ds-space-250);
    font: var(--ds-font-body);
    line-height: var(--lh-prose);
    color: var(--ds-text-subtle);
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ds-space-100);
    padding: var(--ds-space-200) var(--ds-space-250) var(--ds-space-250);
  }

  @keyframes m-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes m-rise {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.99);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal,
    .card {
      animation: none;
    }
  }
</style>
