<script>
  /**
   * A selectable card: the raised surface at rest, and ADS's selected border and
   * fill once chosen. The border is always drawn, transparent at rest, so
   * picking one doesn't shift the grid it sits in. Whatever else the button
   * needs (`title`, `onclick`, `data-*`) goes straight onto the element.
   */

  /**
   * @type {{
   *   selected: boolean,
   *   center?: boolean,
   *   big?: boolean,
   *   children: import('svelte').Snippet,
   * } & Omit<import('svelte/elements').HTMLButtonAttributes, 'children'>}
   */
  let { selected, center = false, big = false, children, ...rest } = $props()
</script>

<button class="toggle-btn" class:selected class:center class:big aria-pressed={selected} {...rest}>
  {@render children()}
</button>

<style lang="scss">
  .toggle-btn {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    width: 100%;
    min-height: var(--control-h);
    padding: var(--ds-space-050) var(--ds-space-100);
    background: var(--ds-background-input);
    border: var(--ds-border-width) solid var(--ds-border);
    border-radius: var(--ds-radius-small);
    cursor: pointer;
    font: var(--ds-font-body);
    color: var(--ds-text);
    transition: var(--hover-fade);

    &.center {
      justify-content: center;
    }

    /* The roomy option: its content stacked and centred, for a picture over a
       caption rather than a glyph beside a label. Still a field, not a card —
       it does not rise, and it casts nothing. */
    &.big {
      flex-direction: column;
      justify-content: center;
      gap: var(--ds-space-050);
      padding: var(--ds-space-075) var(--ds-space-050);
      font: var(--ds-font-body-small);
      font-weight: var(--ds-font-weight-medium);
    }

    &:hover {
      background: var(--ds-background-input-hovered);
      border-color: var(--ds-border-hovered);
    }

    &:focus-visible {
      outline: none;
      border-color: var(--ds-border-focused);
    }

    /* Chosen: the selected fill inside the accent's own edge. The border stays
       one pixel, so nothing around it moves. */
    &.selected {
      background: var(--ds-background-selected);
      border-color: var(--ds-border-selected);
      color: var(--ds-text-selected);

      &:hover {
        background: var(--ds-background-selected-hovered);
        border-color: var(--ds-border-selected);
      }
    }
  }
</style>
