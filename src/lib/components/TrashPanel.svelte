<script>
  import { relativeTime } from '$lib/cv/state/storage.js'

  let {
    /** @type {import('$lib/cv/state/files.svelte.js').FileManager} */
    files,
    /** @type {(id: string) => void} */
    onRestore,
    /** @type {(id: string) => void} */
    onPurge,
    /** @type {() => void} */
    onEmpty,
    /** @type {() => void} */
    onClose,
  } = $props()

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
      onClose()
    }
    document.addEventListener('pointerdown', handle)
    return { destroy: () => document.removeEventListener('pointerdown', handle) }
  }

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div id="trash-panel" use:clickOutside>
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
          <button class="t-btn" onclick={() => onRestore(f.id)}>Restore</button>
          <button class="trash-purge" title="Delete forever" onclick={() => onPurge(f.id)}> Delete </button>
        </div>
      </li>
    {:else}
      <li class="trash-empty">Trash is empty.</li>
    {/each}
  </ul>

  {#if files.trashed.length}
    <div class="trash-foot">
      <button onclick={onEmpty}>Empty trash</button>
    </div>
  {/if}
</div>

<style>
  #trash-panel {
    position: fixed;
    top: 82px;
    right: 16px;
    width: 280px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    z-index: 100;
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .trash-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .trash-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
  }

  .trash-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 5px;
  }

  .trash-row:hover {
    background: var(--accent-wash);
  }

  .trash-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .trash-name {
    font-size: var(--ui-fs-md);
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trash-time {
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    color: var(--faint);
  }

  .trash-actions {
    flex-shrink: 0;
    display: flex;
    gap: 4px;
  }

  /* Not a .t-btn: deleting forever should not look like the Restore button
	   sitting next to it, and turns red only on approach. */
  .trash-purge {
    background: none;
    border: 1.5px solid var(--line);
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--faint);
    padding: 4px 8px;
    transition:
      border-color 0.13s,
      color 0.13s;
  }

  .trash-purge:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  .trash-empty {
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--faint);
    padding: 14px 8px;
    line-height: 1.6;
  }

  .trash-foot {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 6px 10px;
    border-top: 1px solid var(--line);
  }

  .trash-foot button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    color: var(--faint);
    text-decoration: underline;
  }

  .trash-foot button:hover {
    color: var(--danger);
  }
</style>
