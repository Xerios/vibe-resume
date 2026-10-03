<script>
  import Icon from '@iconify/svelte'
  import IconChevron from '@iconify-icons/lucide/chevron-right'
  import { slide } from 'svelte/transition'

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
      <Icon icon={IconChevron} class="fold-caret" width="16" height="16" aria-hidden="true" />
      <span class="fold-label">{label}</span>
    </button>
    {#if head}
      <div class="fold-extra">{@render head()}</div>
    {/if}
  </div>

  {#if open}
    <div class="fold-body" id={bodyId} transition:slide={{ duration: 200 }}>{@render children()}</div>
  {/if}
</div>

<style lang="scss">
  /* ADS's expandable section: a rule above, a full-width header that is the
     whole hit target, a chevron that turns as it opens. */
  .fold {
    display: flex;
    flex-direction: column;
    border-bottom: var(--ds-border-width) solid var(--ds-border);

    &.open :global(.fold-caret) {
      transform: rotate(90deg);
    }
  }

  .fold-head {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-050) var(--ds-space-150) var(--ds-space-050) var(--ds-space-100);
  }

  .fold-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-050);
    height: var(--control-h);
    padding: 0 var(--ds-space-050);
    background: var(--ds-background-neutral-subtle);
    border: none;
    border-radius: var(--ds-radius-small);
    cursor: pointer;
    text-align: left;
    color: var(--ds-text);
    transition: var(--hover-fade);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }

    &:active {
      background: var(--ds-background-neutral-subtle-pressed);
    }

    &:focus-visible {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: -2px;
    }
  }

  /* Drawn by <Icon>, so the class lands on SVG the compiler never sees. */
  :global(.fold-caret) {
    flex-shrink: 0;
    color: var(--ds-icon-subtle);
    transition: transform 200ms var(--ease);
  }

  .fold-label {
    min-width: 0;
    font: var(--ds-font-heading-xsmall);
    color: var(--ds-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fold-extra {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  /* Indented to the label, so a group that is open says where it ends. */
  .fold-body {
    padding: var(--ds-space-050) var(--ds-space-200) var(--ds-space-200);
  }
</style>
