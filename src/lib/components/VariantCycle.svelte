<script>
  /**
   * One axis, as a control: `‹ Chips ›`.
   *
   * The row the Style popover lists every slot as, and the same one the paper's
   * running-head axes use.
   *
   * The arrows are the fast path and wrap at both ends; the name opens the full
   * list.
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

  let open = $state(false)

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
</script>

<div class="vc-row">
  <span class="vc-slot">{slot.name}</span>
  <div class="vc-cycle">
    <button class="vc-arrow" aria-label="Previous {slot.name.toLowerCase()}" onclick={() => step(-1)}>‹</button>
    <button class="vc-name" title={current.hint} aria-expanded={open} onclick={() => (open = !open)}>
      {current.name}
    </button>
    <button class="vc-arrow" aria-label="Next {slot.name.toLowerCase()}" onclick={() => step(1)}>›</button>
  </div>

  {#if open}
    <!-- Over the rows around it rather than pushing them apart: this row is
         anchored to something — a block in the sheet, or a list of axes — and
         growing would move everything under it out from under the pointer. -->
    <div class="vc-menu" class:left={menuAlign === 'left'}>
      {#each slot.variants as v (v.id)}
        <button class="vc-opt" class:on={v.id === current.id} title={v.hint} onclick={() => onPick(slot.id, v.id)}>
          {v.name}{#if v.edited}*{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
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
	   of the chrome's grouped buttons are drawn as. */
  .vc-cycle {
    display: flex;
    align-items: stretch;
    background: var(--gray-3);
    border: var(--hairline) solid var(--gray-a6);
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
    font-size: var(--ui-fs-2xs);
    font-weight: 600;
    color: var(--gray-12);
    transition: var(--hover-fade);
  }

  .vc-arrow {
    padding: 0 var(--sp-3);
    font-size: var(--ui-fs-lg);
    line-height: 1;
    color: var(--gray-11);
  }

  .vc-arrow:hover {
    background: var(--accent-9);
    color: var(--accent-contrast);
  }

  .vc-arrow:active {
    background: var(--accent-10);
  }

  .vc-name {
    min-width: 78px;
    padding: var(--sp-1) var(--sp-2);
    border-left: var(--hairline) solid var(--gray-a6);
    border-right: var(--hairline) solid var(--gray-a6);
    text-align: center;
    white-space: nowrap;
  }

  .vc-name:hover,
  .vc-name[aria-expanded='true'] {
    background: var(--gray-4);
    color: var(--gray-12);
  }

  .vc-menu {
    position: absolute;
    top: calc(100% + var(--sp-1));
    right: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 128px;
    padding: var(--sp-1);
    background: var(--gray-2);
    border: var(--hairline) solid var(--gray-6);
    border-radius: var(--corner-xs);
    box-shadow: var(--shadow-4);
  }

  .vc-menu.left {
    right: auto;
    left: 0;
  }

  .vc-opt {
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--corner-xs);
    text-align: left;
    white-space: nowrap;
  }

  .vc-opt:hover {
    background: var(--gray-3);
    color: var(--gray-12);
  }

  .vc-opt.on {
    background: var(--accent-9);
    color: var(--accent-contrast);
  }
</style>
