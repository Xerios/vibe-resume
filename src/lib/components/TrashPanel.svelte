<script>
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
    <span>Trash</span>
    <span>{files.trashed.length} file{files.trashed.length === 1 ? '' : 's'}</span>
  </div>

  <ul class="trash-list">
    {#each files.trashed as f (f.id)}
      <li class="trash-row">
        <div class="trash-info">
          <span class="trash-name">{f.name}</span>
          <span class="trash-time">deleted {relativeTime(f.deletedAt, now)}</span>
        </div>
        <div class="trash-actions">
          <button class="t-btn" onclick={() => commands.restoreTab(f.id)}>Restore</button>
          <button class="trash-purge" title="Delete forever" onclick={() => commands.purgeTab(f.id)}> Delete </button>
        </div>
      </li>
    {:else}
      <li class="trash-empty">Trash is empty.</li>
    {/each}
  </ul>

  {#if files.trashed.length}
    <div class="trash-foot">
      <button onclick={commands.emptyTrash}>Empty trash</button>
    </div>
  {/if}
</div>

<style lang="scss">
  /* A popover: the raised rung, and the popover shadow to reinforce it. */
  #trash-panel {
    position: fixed;
    top: var(--overlay-top);
    right: var(--sp-4);
    width: 252px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-light);
    border: var(--hairline) solid var(--gray-6);
    border-radius: var(--corner-xs);
    box-shadow: var(--shadow-ring), var(--shadow-md);
    z-index: 100;
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .trash-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-2) var(--sp-4);
    border-bottom: var(--hairline) solid var(--gray-6);
    background: var(--bg-light);
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
  }

  .trash-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: var(--sp-1);
    list-style: none;
  }

  .trash-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--corner-xs);

    /* An alpha step: a solid 3 would sink below the raised rung it is on. */
    &:hover {
      background: var(--gray-a3);
    }
  }

  .trash-info {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .trash-name {
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--gray-12);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trash-time {
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    color: var(--gray-11);
  }

  .trash-actions {
    flex-shrink: 0;
    display: flex;
    gap: var(--sp-1);
  }

  /* Not a .t-btn: deleting forever should not look like the Restore button
	   sitting next to it, so it is bare until approached and then goes red. */
  .trash-purge {
    background: none;
    border: var(--hairline) solid var(--gray-a4);
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 550;
    color: var(--gray-11);
    padding: var(--sp-1) var(--sp-3);
    transition: var(--hover-fade);

    &:hover {
      background: var(--red-9);
      border-color: var(--red-9);
      color: var(--accent-contrast);
    }

    &:active {
      background: var(--red-10);
      border-color: var(--red-10);
    }
  }

  .trash-empty {
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    color: var(--gray-11);
    padding: var(--sp-6) var(--sp-3);
    line-height: 1.6;
  }

  .trash-foot {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: var(--sp-2) var(--sp-3);
    border-top: var(--hairline) solid var(--gray-6);

    button {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      font-family: var(--mono);
      font-size: var(--ui-fs-2xs);
      color: var(--gray-11);
      text-decoration: underline;

      &:hover {
        color: var(--red-11);
      }
    }
  }
</style>
