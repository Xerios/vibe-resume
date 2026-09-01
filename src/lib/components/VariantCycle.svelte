<script>
  /**
   * One axis, as a control: `‹ Chips ›`.
   *
   * The same row serves both places a variant can be chosen — the Style
   * popover, where every slot is listed at once, and the block picker that
   * floats beside the sheet, where only the slots under the pointer are. They
   * are the same act, so they are the same control rather than two that have to
   * be kept looking alike.
   *
   * The arrows are the fast path and wrap at both ends; the name opens the full
   * list.
   */

  /**
   * @type {{
   *   slot: import('$lib/cv/slots.js').Registry[number],
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
    gap: 8px;
  }

  .vc-slot {
    flex: 1;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
  }

  .vc-cycle {
    display: flex;
    align-items: center;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }

  .vc-arrow,
  .vc-name,
  .vc-opt {
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .vc-arrow {
    padding: 2px 6px 3px;
    font-size: 13px;
    line-height: 1;
    color: var(--faint);
  }

  .vc-arrow:hover {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  .vc-name {
    min-width: 82px;
    padding: 3px 4px;
    text-align: center;
    white-space: nowrap;
  }

  .vc-name:hover,
  .vc-name[aria-expanded='true'] {
    color: var(--accent-deep);
  }

  .vc-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-width: 128px;
    padding: 4px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 7px;
    box-shadow: var(--shadow-pop);
  }

  .vc-menu.left {
    right: auto;
    left: 0;
  }

  .vc-opt {
    padding: 4px 7px;
    border-radius: 5px;
    text-align: left;
    white-space: nowrap;
  }

  .vc-opt:hover,
  .vc-opt.on {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }
</style>
