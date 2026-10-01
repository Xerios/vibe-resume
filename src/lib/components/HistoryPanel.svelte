<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconBookmark from '@iconify-icons/lucide/bookmark'
  import IconRestore from '@iconify-icons/lucide/rotate-ccw'
  import IconInitial from '@iconify-icons/lucide/circle-dot'
  import IconEdit from '@iconify-icons/lucide/dot'
  import IconStyle from '@iconify-icons/lucide/palette'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import { commands } from '$lib/cv/state/commands.js'
  import { doc } from '$lib/cv/state/state.svelte.js'
  import { formatBytes } from '$lib/cv/state/storage.js'
  import { fly } from 'svelte/transition'

  /** The glyph for each kind of change; anything unrecognised reads as an edit. */
  const MARKS = {
    export: IconDownload,
    checkpoint: IconBookmark,
    restore: IconRestore,
    initial: IconInitial,
    style: IconStyle,
    edit: IconEdit,
  }

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
    commands.checkpoint(name)
    name = ''
  }

  /** @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry */
  function select(entry) {
    if (entry.key === latestKey) doc.viewLatest()
    else doc.view(entry)
  }

  /** @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry */
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

  /** @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry */
  function exactTime(entry) {
    if (!entry.timestamp) return ''
    return new Date(entry.timestamp * 1000).toLocaleString()
  }

  /**
   * The change counts worth showing: a tag moves no text, and entries too far
   * back to have been counted have none to show.
   * @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry
   */
  function counts(entry) {
    const s = entry.stats
    return s && (s.added || s.removed) ? s : null
  }

  /** @param {import('$lib/cv/state/doc.svelte.js').HistoryEntry} entry */
  function tooltip(entry) {
    const parts = [exactTime(entry)]
    const s = counts(entry)
    if (s) parts.push(`+${s.added} −${s.removed} characters`)
    if (entry.key === latestKey) parts.push('latest')
    return parts.filter(Boolean).join(' — ')
  }

</script>

<!-- One glyph per kind of moment, so the list can be read down the left edge:
     a dot is a plain edit, everything else is something the user asked for. -->
{#snippet mark(/** @type {import('$lib/cv/state/doc.svelte.js').ChangeKind} */ kind)}
  <Icon icon={MARKS[kind] ?? IconEdit} class="hist-mark" width="11" height="11" aria-hidden="true" />
{/snippet}

<aside id="history-pane" in:fly={{ y: -8, duration: 200 }}>
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
        <!-- Always drawn rather than on hover, since a finger has no hover.
				     The version on screen is what everything is compared against, so it
				     has nothing to be compared with. -->
        {#if !isActive}
          <button class="hist-compare" title="Compare with current" aria-label="Compare “{entry.message}” with current" onclick={() => commands.compareVersion(entry)}>
            <Icon icon={IconCompare} width="11" height="11" />
          </button>
        {/if}
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
  </div>
</aside>

<style lang="scss">
  /* Docked, the panel is a bar's rung; floating (below), it climbs one. */
  #history-pane {
    flex-shrink: 0;
    width: var(--panel-w);
    display: flex;
    flex-direction: column;
    background: var(--bg-dark);
    border-left: var(--hairline) solid var(--gray-6);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .hist-head {
    flex-shrink: 0;
    padding: var(--sp-3) var(--sp-3);
    border-bottom: var(--hairline) solid var(--gray-6);
    /* The head is the panel's own toolbar, and casts like one. */
    box-shadow: var(--bar-shadow);
    position: relative;
    z-index: 1;
  }

  .hist-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
    margin-bottom: var(--sp-3);
  }

  .hist-form {
    display: flex;
    gap: var(--sp-2);

    input {
      flex: 1;
      min-width: 0;
      font-family: var(--sans);
      font-size: var(--ui-fs-sm);
      color: var(--gray-12);
      background: var(--bg);
      /* A field is an interactive element, so its edge is step 7 — the border
	       step — rather than the step 6 the panel's own rules take. */
      border: var(--hairline) solid var(--gray-7);
      border-radius: var(--corner-xs);
      box-shadow: var(--inset-shadow);
      padding: var(--sp-1) var(--sp-3);

      &:focus {
        outline: none;
        border-color: var(--accent-8);
        box-shadow: var(--inset-shadow), var(--focus-halo);
      }

      &::placeholder {
        color: var(--gray-10);
      }
    }
  }

  .hist-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: var(--sp-1);
    list-style: none;
  }

  .hist-row {
    display: flex;
    align-items: stretch;
    gap: var(--sp-1);
    margin-bottom: var(--hairline);

    .hist-item {
      flex: 1;
      min-width: 0;
    }
  }

  /* Step 9 at rest — ornament beside the row, like a line number — lifting to
	   the accent's text step under the pointer. */
  .hist-compare {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 22px;
    background: none;
    border: var(--hairline) solid transparent;
    border-radius: var(--corner-xs);
    cursor: pointer;
    padding: 0;
    color: var(--gray-9);
    transition: var(--hover-fade);

    &:hover,
    &:focus-visible {
      background: var(--gray-a3);
      color: var(--accent-11);
    }

    :global([stroke-width]) {
      stroke-width: 2.25;
    }
  }

  .hist-item {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    width: 100%;
    text-align: left;
    background: none;
    border: var(--hairline) solid transparent;
    border-radius: var(--corner-xs);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-3);
    font-family: var(--sans);
    color: var(--gray-12);
    position: relative;
    transition: var(--hover-fade);

    /* An alpha step: the panel is one rung docked and another floating. */
    &:hover {
      background: var(--gray-a3);
    }

    /* The row being previewed is *selected*, which is step 5's one job — and it
	     is the accent's step 5, because which version is on screen is the panel's
	     whole subject. Step 12 of the same scale is the text that goes on it. */
    &.active {
      border-color: transparent;
      background: var(--accent-5);
      color: var(--accent-12);
    }

    /* Kinds, quietest first: an ordinary edit is background noise, a named version
	     is a marker, and an export is the CV leaving the app — the loudest of the
	     three, so its rule comes last and wins over `.latest` on the same row. */
    &.kind-edit .hist-msg {
      font-weight: 500;
      color: var(--gray-11);
    }

    &.kind-checkpoint :global(.hist-mark),
    &.kind-initial :global(.hist-mark),
    &.kind-restore :global(.hist-mark) {
      color: var(--accent-11);
    }

    /* A restyle changed no text, so it reads as quietly as an edit does — the
	     glyph is what says which of the two it was. */
    &.kind-style .hist-msg {
      font-weight: 500;
      color: var(--gray-11);
    }

    &.kind-style :global(.hist-mark) {
      color: var(--accent-11);
    }

    &.latest .hist-msg {
      color: var(--accent-11);
    }

    &.kind-export {
      background: var(--amber-3);
      border-color: transparent;

      &.active {
        background: var(--accent-5);
      }

      :global(.hist-mark),
      .hist-msg {
        color: var(--amber-11);
      }

      &.active :global(.hist-mark),
      &.active .hist-msg {
        color: var(--accent-12);
      }

      .hist-msg {
        font-weight: 700;
        letter-spacing: 0.2px;
      }
    }
  }

  /* Drawn by <Icon>, so the class lands on SVG the compiler never sees. */
  :global(.hist-mark) {
    flex-shrink: 0;
    align-self: center;
    color: var(--gray-11);
  }

  :global(.hist-mark [stroke-width]) {
    stroke-width: 2.25;
  }

  .hist-stats {
    flex-shrink: 0;
    display: flex;
    gap: var(--sp-2);
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hist-time {
    flex-shrink: 0;
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    color: var(--gray-11);
  }

  .hist-empty {
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    color: var(--gray-11);
    padding: var(--sp-6) var(--sp-3);
    line-height: 1.6;
  }

  .hist-foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    border-top: var(--hairline) solid var(--gray-6);
    font-family: var(--mono);
    font-size: var(--ui-fs-2xs);
    color: var(--gray-11);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
	   of the flow as an overlay, like the trash panel — and takes the popover's
	   rung and shadow with it. Anchored on the tokens the bars are drawn from,
	   so it can't drift from them when the density moves. */
  @media (max-width: 900px) {
    #history-pane {
      position: fixed;
      top: var(--overlay-top);
      right: var(--sp-3);
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: var(--bar-status);
      width: min(var(--panel-w), calc(100vw - 2 * var(--sp-3)));
      background: var(--bg-light);
      border: var(--hairline) solid var(--gray-6);
      border-radius: var(--corner-xs);
      box-shadow: var(--shadow-ring), var(--shadow-md);
      z-index: 100;
    }
  }
</style>
