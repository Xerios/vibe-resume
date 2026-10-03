<script>
  import Icon from '@iconify/svelte'
  import IconLeft from '@iconify-icons/lucide/chevron-left'
  import IconRight from '@iconify-icons/lucide/chevron-right'
  import IconDown from '@iconify-icons/lucide/chevron-down'

  /**
   * One axis, as a control: `‹ Chips ›`.
   *
   * The row the Style panel lists every block slot as (render/variants.js), and
   * the same one the paper's running head and foot use.
   *
   * The arrows are the fast path and wrap at both ends; the name opens the full
   * list. One tab stop per row — the name. Left/Right on it step like the
   * arrows, Down opens the list, and the arrows themselves are mouse-only.
   */

  /**
   * @type {{
   *   slot: import('@vibe-resume/render/variants').Slot,
   *   choices: Record<string, string>,
   *   onPick: (slotId: string, variantId: string) => void,
   *   menuAlign?: 'left' | 'right',
   * }}
   */
  let { slot, choices, onPick, menuAlign = 'right' } = $props()

  const id = $props.id()

  let open = $state(false)
  let row = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  let nameBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined))
  let menu = $state(/** @type {HTMLDivElement | undefined} */ (undefined))

  const current = $derived(slot.variants.find((v) => v.id === choices[slot.id]) ?? slot.variants[0])

  /**
   * Wraps. A slot has three or four variants, and stopping at the last one
   * would mean walking back the way you came to see the first.
   * @param {number} by
   */
  function step(by) {
    const at = slot.variants.indexOf(current)
    onPick(slot.id, slot.variants[(at + by + slot.variants.length) % slot.variants.length].id)
  }

  /** @param {string} variantId */
  function pick(variantId) {
    onPick(slot.id, variantId)
    close()
  }

  function close() {
    if (!open) return
    open = false
    nameBtn?.focus()
  }

  // The list is a mode: it closes on Escape, on a click elsewhere, and on focus
  // leaving the row, and hands focus back to the name that opened it.
  $effect(() => {
    if (!open) return
    ;/** @type {HTMLElement | null | undefined} */ (menu?.querySelector('[aria-selected="true"]'))?.focus()

    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
      if (!row?.contains(/** @type {Node | null} */ (e.target))) open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  })

  /** @param {KeyboardEvent} e */
  function onNameKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      step(e.key === 'ArrowLeft' ? -1 : 1)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      open = true // the effect above puts the caret on the current option
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      close()
    }
  }

  /** @param {KeyboardEvent} e */
  function onMenuKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (!menu) return
    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role="option"]')])
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const by = e.key === 'ArrowDown' ? 1 : -1
      items[(at + by + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      // Tab leaves the row entirely; the list is not a stop of its own.
      open = false
    }
  }

  /** @param {FocusEvent} e */
  function onFocusOut(e) {
    const next = /** @type {Node | null} */ (e.relatedTarget)
    if (next && !row?.contains(next)) open = false
  }
</script>

<div class="vc-row" role="group" aria-labelledby="{id}-label" bind:this={row} onfocusout={onFocusOut}>
  <span class="vc-slot" id="{id}-label">{slot.name}</span>
  <div class="vc-cycle">
    <!-- Mouse-only: the keyboard has Left/Right on the name for the same thing. -->
    <button class="vc-arrow" tabindex="-1" aria-hidden="true" onclick={() => step(-1)}>
      <Icon icon={IconLeft} width="16" height="16" />
    </button>
    <button
      class="vc-name"
      bind:this={nameBtn}
      title={current.hint}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      onclick={() => (open ? close() : (open = true))}
      onkeydown={onNameKeydown}
    >
      <span class="vc-name-text">{current.name}</span>
      <Icon icon={IconDown} width="16" height="16" />
    </button>
    <button class="vc-arrow" tabindex="-1" aria-hidden="true" onclick={() => step(1)}>
      <Icon icon={IconRight} width="16" height="16" />
    </button>
  </div>

  {#if open}
    <!-- Over the rows around it rather than pushing them apart: this row is
         anchored to something — a block in the sheet, or a list of axes — and
         growing would move everything under it out from under the pointer. -->
    <div
      class="vc-menu ds-menu"
      class:left={menuAlign === 'left'}
      id="{id}-list"
      role="listbox"
      aria-labelledby="{id}-label"
      tabindex="-1"
      bind:this={menu}
      onkeydown={onMenuKeydown}
    >
      {#each slot.variants as v (v.id)}
        <button
          class="vc-opt ds-menu-item"
          class:selected={v.id === current.id}
          role="option"
          tabindex="-1"
          aria-selected={v.id === current.id}
          aria-describedby="{id}-{v.id}-hint"
          onclick={() => pick(v.id)}
        >
          <span class="vc-opt-name">
            {v.name}
          </span>
          <span class="vc-opt-hint" id="{id}-{v.id}-hint">{v.hint}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .vc-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    min-height: var(--control-h);
  }

  .vc-slot {
    flex: 1;
    min-width: 0;
    font: var(--ds-font-body);
    color: var(--ds-text-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A field, so it reads as something to set: the input surface inside the
     input border, the way ADS draws a select. The arrows are segments of it,
     divided off by the same border, either side of the value and its chevron. */
  .vc-cycle {
    display: flex;
    align-items: stretch;
    height: var(--control-h);
    background: var(--ds-background-input);
    border: var(--ds-border-width) solid var(--ds-border-input);
    border-radius: var(--ds-radius-small);
    overflow: hidden;
    transition: var(--hover-fade);

    &:hover {
      background: var(--ds-background-input-hovered);
    }

    &:focus-within {
      border-color: var(--ds-border-focused);
      box-shadow: inset 0 0 0 var(--ds-border-width) var(--ds-border-focused);
    }
  }

  .vc-arrow,
  .vc-name {
    display: flex;
    align-items: center;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font: var(--ds-font-body);
    transition: var(--hover-fade);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }

    &:active {
      background: var(--ds-background-neutral-subtle-pressed);
    }
  }

  .vc-arrow {
    justify-content: center;
    width: 24px;
    color: var(--ds-icon-subtle);

    &:first-child {
      border-right: var(--ds-border-width) solid var(--ds-border);
    }

    &:last-child {
      border-left: var(--ds-border-width) solid var(--ds-border);
    }

    &:hover {
      color: var(--ds-icon);
    }
  }

  .vc-name {
    gap: var(--ds-space-050);
    /* One width for every row, so the fields line up down the panel; a long
       name ellipsises rather than pushing its row out of the column. */
    width: 136px;
    min-width: 0;
    justify-content: space-between;
    padding: 0 var(--ds-space-050) 0 var(--ds-space-100);
    color: var(--ds-text);

    :global(svg) {
      flex-shrink: 0;
      color: var(--ds-icon);
    }

    &[aria-expanded='true'] {
      background: var(--ds-background-selected);
      color: var(--ds-text-selected);

      :global(svg) {
        color: var(--ds-icon-selected);
      }
    }

    &:focus-visible {
      outline: none;
    }
  }

  .vc-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Over the rows around it rather than pushing them apart. */
  .vc-menu {
    position: absolute;
    top: calc(100% + var(--ds-space-050));
    right: 0;
    z-index: 1;
    min-width: 200px;
    max-width: 280px;
    outline: none;

    &.left {
      right: auto;
      left: 0;
    }
  }

  /* A menu item with a description: the name on the body line, the hint
     under it in the subtlest small text. */
  .vc-opt {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ds-space-025);
    white-space: normal;
  }

  .vc-opt-name {
    white-space: nowrap;
  }

  .vc-opt-hint {
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
  }
</style>
