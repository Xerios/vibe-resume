<script>
  /**
   * One axis, as a control: `‹ Chips ›`.
   *
   * The row the Style popover lists every slot as, and the same one the paper's
   * running-head axes use.
   *
   * The arrows are the fast path and wrap at both ends; the name opens the full
   * list. One tab stop per row — the name. Left/Right on it step like the
   * arrows, Down opens the list, and the arrows themselves are mouse-only.
   */

  /**
   * @type {{
   *   slot: import('$lib/cv/template/slots.js').Registry[number],
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

  const current = $derived(slot.variants.find(v => v.id === choices[slot.id]) ?? slot.variants[0])

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
    /** @type {HTMLElement | null | undefined} */
    menu?.querySelector('[aria-selected="true"]')?.focus()

    /** @param {PointerEvent} e */
    const onPointerDown = e => {
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
    <button class="vc-arrow" tabindex="-1" aria-hidden="true" onclick={() => step(-1)}>‹</button>
    <button
      class="vc-name"
      bind:this={nameBtn}
      title={current.hint}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      onclick={() => (open ? close() : (open = true))}
      onkeydown={onNameKeydown}>
      {current.name}
    </button>
    <button class="vc-arrow" tabindex="-1" aria-hidden="true" onclick={() => step(1)}>›</button>
  </div>

  {#if open}
    <!-- Over the rows around it rather than pushing them apart: this row is
         anchored to something — a block in the sheet, or a list of axes — and
         growing would move everything under it out from under the pointer. -->
    <div
      class="vc-menu"
      class:left={menuAlign === 'left'}
      id="{id}-list"
      role="listbox"
      aria-labelledby="{id}-label"
      tabindex="-1"
      bind:this={menu}
      onkeydown={onMenuKeydown}>
      {#each slot.variants as v (v.id)}
        <button
          class="vc-opt"
          class:on={v.id === current.id}
          role="option"
          tabindex="-1"
          aria-selected={v.id === current.id}
          aria-describedby="{id}-{v.id}-hint"
          onclick={() => pick(v.id)}>
          <span class="vc-opt-name">
            {v.name}{#if v.edited}<span class="vc-edited" title="Edited">*</span>{/if}
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
    gap: var(--sp-4);
  }

  .vc-slot {
    flex: 1;
    font-family: var(--sans);
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--gray-11);
    white-space: nowrap;
  }

  /* Three cells in one box, hairline-divided — the segmented control the rest
	   of the chrome's grouped buttons are drawn as. Alpha steps throughout, since
	   the panel it sits in is a different rung docked and floating. */
  .vc-cycle {
    display: flex;
    align-items: stretch;
    background: var(--gray-a3);
    border: var(--hairline) solid var(--gray-a4);
    border-radius: var(--corner-xs);
    overflow: hidden;
  }

  .vc-arrow,
  .vc-name,
  .vc-opt {
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--gray-12);
    transition: var(--hover-fade);
  }

  .vc-arrow {
    padding: 0 var(--sp-3);
    font-size: var(--ui-fs-lg);
    line-height: 1;
    color: var(--gray-11);

    &:hover {
      background: var(--accent-9);
      color: var(--accent-contrast);
    }

    &:active {
      background: var(--accent-10);
    }
  }

  .vc-name {
    min-width: 78px;
    padding: var(--sp-1) var(--sp-2);
    border-left: var(--hairline) solid var(--gray-a6);
    border-right: var(--hairline) solid var(--gray-a6);
    text-align: center;
    white-space: nowrap;

    &:hover,
    &[aria-expanded='true'] {
      background: var(--gray-a4);
      color: var(--gray-12);
    }

    &:focus-visible {
      outline: 2px solid var(--accent-9);
      outline-offset: -2px;
    }
  }

  /* The raised rung under the popover shadow, like every other menu. */
  .vc-menu {
    position: absolute;
    top: calc(100% + var(--sp-1));
    right: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 128px;
    max-width: 240px;
    padding: var(--sp-1);
    background: var(--bg-light);
    border: var(--hairline) solid var(--gray-6);
    border-radius: var(--corner-xs);
    box-shadow: var(--shadow-ring), var(--shadow-md);
    outline: none;
    gap: var(--sp-2);

    &.left {
      right: auto;
      left: 0;
    }
  }

  .vc-opt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--corner-xs);
    text-align: left;

    &:hover,
    &:focus-visible {
      background: var(--gray-a3);
      color: var(--gray-12);
      outline: none;
    }

    &.on {
      background: var(--accent-9);
      color: var(--accent-contrast);

      .vc-opt-hint {
        color: inherit;
        opacity: 0.8;
      }
    }

    &.on:focus-visible {
      background: var(--accent-10);
    }
  }

  .vc-opt-name {
    white-space: nowrap;
    font-size: var(--ui-fs-md);
  }

  .vc-opt-hint {
    font-weight: 400;
    color: var(--gray-11);
    line-height: 1.3;
  }
</style>
