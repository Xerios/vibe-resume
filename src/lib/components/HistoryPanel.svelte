<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconBookmark from '@iconify-icons/lucide/bookmark'
  import IconRestore from '@iconify-icons/lucide/rotate-ccw'
  import IconInitial from '@iconify-icons/lucide/circle-dot'
  import IconEdit from '@iconify-icons/lucide/dot'
  import IconStyle from '@iconify-icons/lucide/palette'
  import { formatBytes } from '$lib/cv/storage.js'

  /** The glyph for each kind of change; anything unrecognised reads as an edit. */
  const MARKS = {
    export: IconDownload,
    checkpoint: IconBookmark,
    restore: IconRestore,
    initial: IconInitial,
    style: IconStyle,
    edit: IconEdit,
  }

  let {
    /** @type {import('$lib/cv/doc.svelte.js').CvDoc} */
    doc,
    /** @type {(msg: string) => void} */
    toast,
  } = $props()

  let name = $state('')
  /** Ticks so the "x minutes ago" labels stay honest. */
  let now = $state(Date.now())

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(id)
  })

  const latestKey = $derived(doc.entries[0]?.key)

  /** @param {SubmitEvent} e */
  function saveCheckpoint(e) {
    e.preventDefault()
    const label = name.trim()
    doc.checkpoint(label)
    toast(label ? `Saved “${label}”` : 'Version saved')
    name = ''
  }

  /** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
  function select(entry) {
    if (entry.key === latestKey) doc.viewLatest()
    else doc.view(entry)
  }

  /** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
  function ago(entry) {
    if (!entry.timestamp) return 'unknown time'
    const secs = Math.max(0, Math.round(now / 1000 - entry.timestamp))
    if (secs < 60) return 'just now'
    if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
    if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`
    return new Date(entry.timestamp * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  /** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
  function exactTime(entry) {
    if (!entry.timestamp) return ''
    return new Date(entry.timestamp * 1000).toLocaleString()
  }

  /**
   * The change counts worth showing: a tag moves no text, and entries too far
   * back to have been counted have none to show.
   * @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry
   */
  function counts(entry) {
    const s = entry.stats
    return s && (s.added || s.removed) ? s : null
  }

  /** @param {import('$lib/cv/doc.svelte.js').HistoryEntry} entry */
  function tooltip(entry) {
    const parts = [exactTime(entry)]
    const s = counts(entry)
    if (s) parts.push(`+${s.added} −${s.removed} characters`)
    if (entry.key === latestKey) parts.push('latest')
    return parts.filter(Boolean).join(' — ')
  }

  function clearHistory() {
    if (!confirm('Delete every past version? The current text is kept, the rest is gone.')) return
    doc.clearHistory()
    toast('History cleared')
  }
</script>

<!-- One glyph per kind of moment, so the list can be read down the left edge:
     a dot is a plain edit, everything else is something the user asked for. -->
{#snippet mark(/** @type {import('$lib/cv/doc.svelte.js').ChangeKind} */ kind)}
  <Icon icon={MARKS[kind] ?? IconEdit} class="hist-mark" width="11" height="11" aria-hidden="true" />
{/snippet}

<aside id="history-pane">
  <div class="hist-head">
    <div class="hist-title">
      <span>History</span>
      <span>{doc.history.length} version{doc.history.length === 1 ? '' : 's'}</span>
    </div>
    <form class="hist-form" onsubmit={saveCheckpoint}>
      <input bind:value={name} placeholder="Name this version…" maxlength="60" disabled={doc.isViewingHistory} />
      <button class="t-btn" type="submit" disabled={doc.isViewingHistory}>Save</button>
    </form>
  </div>

  <ul class="hist-list">
    {#each doc.entries as entry (entry.key)}
      {@const isLatest = entry.key === latestKey}
      {@const isActive = doc.viewingKey ? doc.viewingKey === entry.key : isLatest}
      {@const stats = counts(entry)}
      <li class="hist-row">
        <button class="hist-item kind-{entry.kind}" class:active={isActive} class:latest={isLatest} title={tooltip(entry)} onclick={() => select(entry)}>
          {@render mark(entry.kind)}
          <span class="hist-msg">{entry.message}</span>
          {#if stats}
            <span class="hist-stats">
              {#if stats.added}<span class="stat-add">+{stats.added}</span>{/if}
              {#if stats.removed}<span class="stat-del">−{stats.removed}</span>{/if}
            </span>
          {/if}
          <span class="hist-time">{ago(entry)}</span>
        </button>
        <!-- {#if isActive && !isLatest}
					<button class="hist-restore" onclick={() => doc.restore(entry)}>
						Restore this version
					</button>
				{/if} -->
      </li>
    {:else}
      <li class="hist-empty">No versions yet. Edits are recorded automatically as you type.</li>
    {/each}
  </ul>

  <div class="hist-foot">
    <span title="Size of the CRDT snapshot in localStorage">
      {formatBytes(doc.snapshotBytes)} stored
    </span>
    <button onclick={clearHistory}>Clear history</button>
  </div>
</aside>

<style>
  #history-pane {
    flex-shrink: 0;
    width: 288px;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border-left: 1px solid var(--line);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .hist-head {
    flex-shrink: 0;
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
  }

  .hist-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .hist-form {
    display: flex;
    gap: 5px;
  }

  .hist-form input {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--ink);
    background: var(--editor-bg);
    border: 1.5px solid var(--line);
    border-radius: 5px;
    padding: 4px 8px;
  }

  .hist-form input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .hist-form input::placeholder {
    color: var(--faint);
  }

  .hist-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
  }

  .hist-row {
    margin-bottom: 1px;
  }

  .hist-item {
    display: flex;
    align-items: baseline;
    gap: 7px;
    width: 100%;
    text-align: left;
    background: none;
    border: 1.5px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    padding: 4px 8px;
    font-family: var(--sans);
    color: var(--ink);
    position: relative;
    transition:
      background 0.12s,
      border-color 0.12s;
  }

  .hist-item:hover {
    background: var(--accent-wash);
  }

  .hist-item.active {
    border-color: var(--accent);
    background: var(--accent-wash);
  }

  /* Drawn by <Icon>, so the class lands on SVG the compiler never sees. */
  :global(.hist-mark) {
    flex-shrink: 0;
    align-self: center;
    color: var(--faint);
  }

  :global(.hist-mark [stroke-width]) {
    stroke-width: 2.5;
  }

  /* Kinds, quietest first: an ordinary edit is background noise, a named version
	   is a marker, and an export is the CV leaving the app — the loudest of the
	   three, so its rule comes last and wins over `.latest` on the same row. */
  .hist-item.kind-edit .hist-msg {
    font-weight: 500;
    color: var(--muted);
  }

  .hist-item.kind-checkpoint :global(.hist-mark),
  .hist-item.kind-initial :global(.hist-mark),
  .hist-item.kind-restore :global(.hist-mark) {
    color: var(--accent);
  }

  /* A restyle changed no text, so it reads as quietly as an edit does — the
	   glyph is what says which of the two it was. */
  .hist-item.kind-style .hist-msg {
    font-weight: 500;
    color: var(--muted);
  }

  .hist-item.kind-style :global(.hist-mark) {
    color: var(--accent);
  }

  .hist-item.latest .hist-msg {
    color: var(--accent-deep);
  }

  .hist-item.kind-export {
    background: var(--prompt-bg);
    border-color: color-mix(in srgb, var(--prompt) 28%, transparent);
  }

  .hist-item.kind-export:hover {
    border-color: var(--prompt);
  }

  .hist-item.kind-export.active {
    border-color: var(--accent);
  }

  .hist-item.kind-export :global(.hist-mark),
  .hist-item.kind-export .hist-msg {
    color: var(--prompt);
  }

  .hist-item.kind-export .hist-msg {
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .hist-stats {
    flex-shrink: 0;
    display: flex;
    gap: 5px;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    font-weight: 600;
    letter-spacing: -0.2px;
  }

  .stat-add {
    color: var(--stat-add);
  }

  .stat-del {
    color: var(--stat-del);
  }

  .hist-msg {
    flex: 1;
    min-width: 0;
    font-size: var(--ui-fs-md);
    font-weight: 600;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hist-time {
    flex-shrink: 0;
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    color: var(--faint);
  }

  .hist-empty {
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--faint);
    padding: 14px 8px;
    line-height: 1.6;
  }

  .hist-foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-top: 1px solid var(--line);
    font-family: var(--mono);
    font-size: var(--ui-fs-xs);
    color: var(--faint);
  }

  .hist-foot button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    color: var(--faint);
    text-decoration: underline;
  }

  .hist-foot button:hover {
    color: var(--danger);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
	   of the flow as an overlay, like the trash panel. */
  @media (max-width: 900px) {
    #history-pane {
      position: fixed;
      top: 82px;
      right: 8px;
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: 34px;
      width: min(288px, calc(100vw - 16px));
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow-pop);
      z-index: 100;
    }
  }
</style>
