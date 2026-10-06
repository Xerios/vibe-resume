<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconBookmark from '@iconify-icons/lucide/bookmark'
  import IconRestore from '@iconify-icons/lucide/rotate-ccw'
  import IconInitial from '@iconify-icons/lucide/circle-dot'
  import IconEdit from '@iconify-icons/lucide/dot'
  import IconStyle from '@iconify-icons/lucide/palette'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import IconClose from '@iconify-icons/lucide/x'
  import { commands } from '$lib/cv/state/commands'
  import { doc } from '$lib/cv/state/state.svelte'
  import { formatBytes } from '$lib/cv/state/storage'
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

  /** @param {import('$lib/cv/state/doc.svelte').HistoryEntry} entry */
  function select(entry) {
    if (entry.key === latestKey) doc.viewLatest()
    else doc.view(entry)
  }

  /** @param {import('$lib/cv/state/doc.svelte').HistoryEntry} entry */
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

  /** @param {import('$lib/cv/state/doc.svelte').HistoryEntry} entry */
  function exactTime(entry) {
    if (!entry.timestamp) return ''
    return new Date(entry.timestamp * 1000).toLocaleString()
  }

  /**
   * The change counts worth showing: a tag moves no text, and entries too far
   * back to have been counted have none to show.
   * @param {import('$lib/cv/state/doc.svelte').HistoryEntry} entry
   */
  function counts(entry) {
    const s = entry.stats
    return s && (s.added || s.removed) ? s : null
  }

  /** @param {import('$lib/cv/state/doc.svelte').HistoryEntry} entry */
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
{#snippet mark(/** @type {import('$lib/cv/state/doc.svelte').ChangeKind} */ kind)}
  <Icon icon={MARKS[kind] ?? IconEdit} class="hist-mark" width="16" height="16" aria-hidden="true" />
{/snippet}

<aside id="history-pane" in:fly={{ y: -8, duration: 200 }}>
  <div class="hist-head">
    <div class="hist-title">
      <h2>History</h2>
      <span class="ds-badge">{doc.history.length}</span>
      <div class="ds-spacer"></div>
      <button class="ds-icon-btn" aria-label="Close history" onclick={() => commands.toggleSidePanel('history')}>
        <Icon icon={IconClose} width="16" height="16" />
      </button>
    </div>
    <form class="hist-form" onsubmit={saveCheckpoint}>
      <input class="ds-textfield compact" bind:value={name} placeholder="Name this version…" maxlength="60" disabled={doc.isViewingHistory} />
      <button class="ds-btn" type="submit" disabled={doc.isViewingHistory}>Save</button>
    </form>
  </div>

  <ul class="hist-list">
    {#each doc.entries as entry (entry.key)}
      {@const isLatest = entry.key === latestKey}
      {@const isActive = doc.viewingKey ? doc.viewingKey === entry.key : isLatest}
      <!-- How much text moved is detail about the version you are looking at,
           not something to read down the whole list, so only the row on screen
           carries it; every row's tooltip still has it. -->
      {@const stats = isActive ? counts(entry) : null}
      <li class="hist-row">
        <button class="hist-item kind-{entry.kind}" class:active={isActive} class:latest={isLatest} title={tooltip(entry)} onclick={() => select(entry)}>
          {@render mark(entry.kind)}
          <span class="hist-msg">{entry.message}</span>
          {#if entry.kind === 'export'}<span class="ds-lozenge moved">PDF</span>{/if}
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
				     has nothing to be compared with; a restyle moves no text, so the
				     comparison would show nothing. -->
        {#if !isActive && entry.kind !== 'style'}
          <button class="hist-compare ds-icon-btn compact" title="Compare with current" aria-label="Compare “{entry.message}” with current" onclick={() => commands.compareVersion(entry)}>
            <Icon icon={IconCompare} width="16" height="16" />
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
  /* An ADS side panel: the page's surface, a rule along the edge it shares
     with the preview, a header row with a title and a close button. */
  #history-pane {
    flex-shrink: 0;
    width: var(--panel-w);
    display: flex;
    flex-direction: column;
    background: var(--ds-surface);
    border-left: var(--ds-border-width) solid var(--ds-border);
    overflow: hidden;
    transition: var(--theme-fade);
  }

  .hist-head {
    flex-shrink: 0;
    padding: var(--ds-space-100) var(--ds-space-100) var(--ds-space-150) var(--ds-space-150);
    border-bottom: var(--ds-border-width) solid var(--ds-border);
  }

  .hist-title {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    margin-bottom: var(--ds-space-100);

    h2 {
      margin: 0;
      font: var(--ds-font-heading-small);
      letter-spacing: var(--tracking-tight);
      color: var(--ds-text);
    }
  }

  .hist-form {
    display: flex;
    gap: var(--ds-space-100);
    padding-right: var(--ds-space-050);

    input {
      flex: 1;
      min-width: 0;
    }
  }

  .hist-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    margin: 0;
    padding: var(--ds-space-050);
    list-style: none;
  }

  .hist-row {
    display: flex;
    align-items: center;
    gap: var(--ds-space-050);
    margin-bottom: var(--ds-space-025);

    .hist-item {
      flex: 1;
      min-width: 0;
    }
  }

  .hist-compare {
    color: var(--ds-icon-subtle);
  }

  .hist-item {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    width: 100%;
    min-height: 26px;
    text-align: left;
    background: var(--ds-background-neutral-subtle);
    border: none;
    border-radius: var(--ds-radius-small);
    cursor: pointer;
    padding: var(--ds-space-050) var(--ds-space-075);
    font: var(--ds-font-body);
    color: var(--ds-text);
    position: relative;
    transition: var(--hover-fade);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }

    &:active {
      background: var(--ds-background-neutral-subtle-pressed);
    }

    &:focus-visible {
      outline: var(--ds-border-width) solid var(--ds-border-focused);
      outline-offset: -1px;
    }

    /* The version on screen: ADS's selected fill, with the selected bar down
       the leading edge as its side navigation draws the current item. */
    &.active {
      background: var(--ds-background-selected);
      color: var(--ds-text-selected);

      &::before {
        content: '';
        position: absolute;
        inset: var(--ds-space-050) auto var(--ds-space-050) 0;
        width: var(--ds-border-width-selected);
        border-radius: var(--ds-radius-small);
        background: var(--ds-border-selected);
      }

      &:hover {
        background: var(--ds-background-selected-hovered);
      }

      .hist-msg,
      :global(.hist-mark) {
        color: var(--ds-text-selected);
      }
    }

    /* Kinds, quietest first: an ordinary edit or a restyle is background
       noise, a named version is a marker, and an export is the CV leaving the
       app and carries a lozenge to say so. */
    &.kind-edit .hist-msg,
    &.kind-style .hist-msg {
      color: var(--ds-text-subtle);
    }

    &.kind-checkpoint,
    &.kind-initial,
    &.kind-restore,
    &.kind-export {
      .hist-msg {
        font-weight: var(--ds-font-weight-semibold);
      }
    }

    &.kind-checkpoint :global(.hist-mark),
    &.kind-initial :global(.hist-mark),
    &.kind-restore :global(.hist-mark),
    &.kind-style :global(.hist-mark) {
      color: var(--ds-icon-brand);
    }

    &.kind-export :global(.hist-mark) {
      color: var(--ds-icon-warning);
    }
  }

  /* Drawn by <Icon>, so the class lands on SVG the compiler never sees. */
  :global(.hist-mark) {
    flex-shrink: 0;
    color: var(--ds-icon-subtle);
  }

  .hist-stats {
    flex-shrink: 0;
    display: flex;
    gap: var(--ds-space-050);
    font: var(--ds-font-body-small);
    font-weight: var(--ds-font-weight-semibold);
    font-variant-numeric: tabular-nums;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hist-time {
    flex-shrink: 0;
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }

  .hist-empty {
    font: var(--ds-font-body);
    color: var(--ds-text-subtlest);
    padding: var(--ds-space-250) var(--ds-space-100);
    text-align: center;
  }

  .hist-foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-075) var(--ds-space-150);
    border-top: var(--ds-border-width) solid var(--ds-border);
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }

  /* Stacked layout: there is no third column to sit in, so the panel lifts out
     of the flow onto the overlay surface, like the trash popup. Anchored on
     the tokens the bars are drawn from, so it can't drift from them. */
  @media (max-width: 900px) {
    #history-pane {
      position: fixed;
      top: calc(var(--overlay-top) + var(--ds-space-100));
      right: var(--ds-space-100);
      /* Clear of the status bar, which is fixed to the foot of the shell. */
      bottom: calc(var(--bar-status) + var(--ds-space-100));
      width: min(var(--panel-w), calc(100vw - 2 * var(--ds-space-100)));
      background: var(--ds-surface-overlay);
      border: var(--ds-border-width) solid var(--ds-border);
      border-radius: var(--ds-radius-xlarge);
      box-shadow: var(--ds-shadow-overlay);
      z-index: 100;
    }
  }
</style>
