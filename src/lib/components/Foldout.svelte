<script>
  /**
   * One collapsible group, the way an inspector stacks them: a titled bar that
   * is the whole hit target, a caret that turns as it opens, and the contents
   * under it. What is folded away is remembered by whoever owns `open`, so a
   * panel comes back the shape it was left in.
   */

  /**
   * @type {{
   *   label: string,
   *   open?: boolean,
   *   onToggle: () => void,
   *   head?: import('svelte').Snippet,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { label, open = false, onToggle, head, children } = $props()

  const bodyId = $props.id()
</script>

<div class="fold" class:open>
  <!-- The extras sit beside the button rather than inside it: a control of
	     their own can't be nested in the one that folds the group. -->
  <div class="fold-head">
    <button class="fold-btn" aria-expanded={open} aria-controls={bodyId} onclick={onToggle}>
      <span class="fold-caret" aria-hidden="true">›</span>
      <span class="fold-label">{label}</span>
    </button>
    {#if head}
      <div class="fold-extra">{@render head()}</div>
    {/if}
  </div>

  {#if open}
    <div class="fold-body" id={bodyId}>{@render children()}</div>
  {/if}
</div>

<style lang="scss">
  .fold {
    display: flex;
    flex-direction: column;

    &.open .fold-caret {
      transform: rotate(90deg);
    }
  }

  /* A bar rather than a bare label: it is a thing to press, and the groups
	   below one another read as a stack of them. Alpha steps, since the panel
	   is one rung docked and another floating. */
  .fold-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2);
    background: var(--gray-a3);
    border: var(--hairline) solid var(--gray-a6);
    border-radius: var(--corner-xs);
    transition: var(--hover-fade);

    &:hover {
      background: var(--gray-a4);
    }
  }

  .fold-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;

    &:hover .fold-label,
    &:focus-visible .fold-label {
      color: var(--gray-12);
    }
  }

  .fold-caret {
    flex-shrink: 0;
    width: 9px;
    font-size: var(--ui-fs-lg);
    line-height: 1;
    text-align: center;
    color: var(--gray-11);
    transition: transform 0.14s;
  }

  /* The same voice the panel's own head speaks in — these are its sections. */
  .fold-label {
    min-width: 0;
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--gray-11);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fold-extra {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  /* Indented under its header, so a group that is open says where it ends. */
  .fold-body {
    padding: var(--sp-3) 0 var(--sp-2) var(--sp-3);
  }
</style>
