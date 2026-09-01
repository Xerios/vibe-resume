<script>
  /**
   * The block picker: a card that appears beside whatever the pointer is on in
   * the preview, with a row per slot that piece of the sheet belongs to.
   *
   * Hovering an entry's stack line gives Stack, then Entry, then Page and
   * Density — innermost first, up the `data-slot` chain the layouts stamp. That
   * is what makes "browse the variations of this block" work without having to
   * aim at exactly the right element: whatever is under the pointer, the thing
   * you meant is one of the rows.
   *
   * It lives out here in the app's DOM rather than inside the preview frame, so
   * it can spend the editor's tokens, is Svelte's to render, and cannot turn up
   * in a print — which goes to the frame's own window. The page owns where it
   * sits and when it appears; this owns what it says.
   */
  import VariantCycle from './VariantCycle.svelte'

  /**
   * `rows` is the `data-slot` chain under the pointer, innermost first, and
   * `slots` the registry to read them out of — PartManager's, so a variant of
   * the user's own is offered beside the shipped ones.
   *
   * `y` tracks the block; `side` is which of the pane's own edges to sit
   * against — whichever gutter beside the sheet is wider. Pinning to the pane
   * rather than to the block's edge is what keeps the card on screen without
   * anyone having to know how wide it is, and stops it sliding left and right
   * as the pointer crosses blocks of different widths.
   *
   * `flip` is the same trick vertically: a block near the foot of the pane gets
   * a card that grows upward from `y` rather than down past the bottom. A
   * translate does it, so it stays right whatever the card's height turns out
   * to be — which depends on how many slots the block is inside.
   *
   * `pinned` says the card is being held there by a click rather than by the
   * pointer, which is the one state it has to advertise: the rows behave
   * identically, but nothing the pointer does will take it away, so it needs a
   * way to be put down.
   *
   * @type {{
   *   rows: string[],
   *   slots: import('$lib/cv/slots.js').Registry,
   *   choices: Record<string, string>,
   *   y: number,
   *   side: 'left' | 'right',
   *   flip: boolean,
   *   pinned?: boolean,
   *   onPick: (slotId: string, variantId: string) => void,
   *   onHover: (inside: boolean) => void,
   *   onClose?: () => void,
   * }}
   */
  let { rows, slots, choices, y, side, flip, pinned = false, onPick, onHover, onClose } = $props()

  const shown = $derived(rows.map((id) => slots.find((s) => s.id === id)).filter((s) => !!s))
</script>

<!-- Hover is the whole interaction, so the card has to keep itself alive while
     the pointer is on it: it sits outside the iframe, so the frame sees a
     mouseleave the moment the pointer crosses onto this. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="block-picker"
  class:left={side === 'left'}
  class:flip
  class:pinned
  style:--bp-y="{y}px"
  onmouseenter={() => onHover(true)}
  onmouseleave={() => onHover(false)}
>
  {#if pinned}
    <div class="bp-head">
      <span class="bp-pin">pinned</span>
      <button class="bp-close" title="Unpin — or press Escape" aria-label="Unpin the block picker" onclick={() => onClose?.()}>×</button>
    </div>
  {/if}
  {#each shown as slot (slot.id)}
    <VariantCycle {slot} {choices} {onPick} menuAlign={side === 'left' ? 'left' : 'right'} />
  {/each}
</div>

<style>
  .block-picker {
    position: absolute;
    top: var(--bp-y);
    right: 8px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    transition: var(--theme-fade);
  }

  .block-picker.left {
    right: auto;
    left: 8px;
  }

  /* Held by a click rather than by the pointer. The accent edge is the whole
	   of the difference — the rows are the same rows. */
  .block-picker.pinned {
    border-color: var(--accent);
  }

  .bp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 2px 3px;
    border-bottom: 1px solid var(--line);
  }

  .bp-pin {
    font-family: var(--mono);
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--accent);
  }

  .bp-close {
    padding: 0 3px 2px;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    color: var(--faint);
  }

  .bp-close:hover {
    background: var(--accent-wash);
    color: var(--accent-deep);
  }

  .block-picker.flip {
    transform: translateY(-100%);
  }

  /* Flipped, the card is above its anchor, so its own menus have to open
	   upward too or they would land back over the sheet. */
  .block-picker.flip :global(.vc-menu) {
    top: auto;
    bottom: calc(100% + 4px);
  }
</style>
