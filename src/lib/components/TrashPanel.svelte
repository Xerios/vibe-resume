<script>
  import Icon from '@iconify/svelte'
  import IconClose from '@iconify-icons/lucide/x'
  import { commands } from '$lib/cv/state/commands.js'
  import { files } from '$lib/cv/state/state.svelte.js'
  import { relativeTime } from '$lib/cv/state/storage.js'
  import { fly, scale } from 'svelte/transition'

  /** Ticks so the "x minutes ago" labels stay honest. */
  let now = $state(Date.now())

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(id)
  })

  /**
   * Ignores the trash toggle button itself, so a click that closes this panel
   * doesn't also let the button's own handler immediately reopen it.
   * @param {HTMLElement} node
   */
  function clickOutside(node) {
    /** @param {PointerEvent} e */
    function handle(e) {
      const target = /** @type {Element | null} */ (e.target)
      if (node.contains(/** @type {Node | null} */ (target))) return
      if (target?.closest('#trash-toggle')) return
      commands.closeTrash()
    }
    document.addEventListener('pointerdown', handle)
    return { destroy: () => document.removeEventListener('pointerdown', handle) }
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') commands.closeTrash()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div id="trash-panel" use:clickOutside in:fly={{ y: -8, duration: 200 }}>
  <div class="trash-head">
    <h2 class="trash-title">Trash</h2>
    <span class="ds-badge">{files.trashed.length}</span>
    <div class="ds-spacer"></div>
    <button class="ds-icon-btn compact" aria-label="Close trash" onclick={commands.closeTrash}>
      <Icon icon={IconClose} width="16" height="16" />
    </button>
  </div>

  <ul class="trash-list">
    {#each files.trashed as f (f.id)}
      <li class="trash-row">
        <div class="trash-info">
          <span class="trash-name">{f.name}</span>
          <span class="trash-time">deleted {relativeTime(f.deletedAt, now)}</span>
        </div>
        <div class="trash-actions">
          <button class="ds-btn compact" onclick={() => commands.restoreTab(f.id)}>Restore</button>
          <button class="ds-btn subtle compact trash-purge" title="Delete forever" onclick={() => commands.purgeTab(f.id)}>Delete</button>
        </div>
      </li>
    {:else}
      <li class="trash-empty">Trash is empty.</li>
    {/each}
  </ul>
</div>

<style lang="scss">
  /* An ADS popup: the overlay surface and its shadow, a header row, a list. */
  #trash-panel {
    position: fixed;
    top: calc(var(--overlay-top) + var(--ds-space-100));
    right: var(--ds-space-200);
    width: var(--panel-w);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--ds-surface-overlay);
    border-radius: var(--ds-radius-large);
    box-shadow: var(--ds-shadow-overlay);
    z-index: 100;
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .trash-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-150) var(--ds-space-150) var(--ds-space-100) var(--ds-space-200);
  }

  .trash-title {
    margin: 0;
    font: var(--ds-font-heading-small);
    color: var(--ds-text);
  }

  .trash-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: 0 var(--ds-space-100) var(--ds-space-100);
    list-style: none;
  }

  .trash-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ds-space-150);
    padding: var(--ds-space-100);
    border-radius: var(--ds-radius-small);
    transition: var(--hover-fade);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }
  }

  .trash-info {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-025);
    min-width: 0;
  }

  .trash-name {
    font: var(--ds-font-body);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trash-time {
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }

  .trash-actions {
    flex-shrink: 0;
    display: flex;
    gap: var(--ds-space-050);
  }

  /* Deleting forever should not look like the Restore button beside it: it is
     a subtle button in the danger text colour, and only fills when approached. */
  .trash-purge {
    color: var(--ds-text-danger);

    &:hover:not(:disabled) {
      background: var(--ds-background-danger);
    }

    &:active:not(:disabled) {
      background: var(--ds-background-danger-hovered);
    }
  }

  .trash-empty {
    font: var(--ds-font-body);
    color: var(--ds-text-subtlest);
    padding: var(--ds-space-300) var(--ds-space-100);
    text-align: center;
  }
</style>
