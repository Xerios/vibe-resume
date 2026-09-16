<script>
  import Icon from '@iconify/svelte'
  import IconChevron from '@iconify-icons/lucide/chevron-down'
  import IconCopy from '@iconify-icons/lucide/copy'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconFilePlus from '@iconify-icons/lucide/file-plus'
  import IconPencil from '@iconify-icons/lucide/pencil'
  import IconTrash from '@iconify-icons/lucide/trash'
  import IconLayout from '@iconify-icons/lucide/layout-panel-left'
  import IconHistory from '@iconify-icons/lucide/history'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import { commands } from '$lib/cv/state/commands.js'
  import { doc, files, ui } from '$lib/cv/state/state.svelte.js'
  import { shortcut } from './access-keys.js'
  import { fly } from 'svelte/transition'

  let editingId = $state(/** @type {string | null} */ (null))
  let editValue = $state('')
  /** The tab being dragged, while it is being dragged. */
  let dragId = $state(/** @type {string | null} */ (null))
  /** Whether the active tab's menu — everything you can do to this file — is showing. */
  let menuOpen = $state(false)
  /**
   * Where that menu is drawn. It is positioned against the viewport rather than
   * against the tab, because #tabs scrolls: a box positioned inside it is
   * clipped by the scroller on both axes, however far it overhangs.
   */
  let menuAt = $state({ x: 0, y: 0 })

  let menuGroup = $state(/** @type {HTMLDivElement | undefined} */ (undefined))
  let moreBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined))
  let menu = $state(/** @type {HTMLDivElement | undefined} */ (undefined))

  // A menu is a mode: it closes on Escape, on a click elsewhere, and on focus
  // leaving it, and hands focus back to the button that opened it.
  $effect(() => {
    if (!menuOpen) return
    menu?.querySelector('button')?.focus()

    /** @param {PointerEvent} e */
    const onPointerDown = e => {
      if (!menuGroup?.contains(/** @type {Node | null} */ (e.target))) menuOpen = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  })

  /** @param {import('$lib/cv/state/files.svelte.js').FileMeta} f */
  function startRename(f) {
    editingId = f.id
    editValue = f.name
  }

  function commitRename() {
    if (editingId) commands.renameTab(editingId, editValue)
    editingId = null
  }

  /** @param {KeyboardEvent} e */
  function onRenameKeydown(e) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') editingId = null
  }

  /**
   * Renaming is a double-click for the pointer and F2 for the keyboard — the
   * two gestures every file list has trained people to try. The menu offers it
   * a third time, for whoever went looking there first.
   * @param {KeyboardEvent} e
   * @param {import('$lib/cv/state/files.svelte.js').FileMeta} f
   */
  function onTabKeydown(e, f) {
    // Alt+arrows are the drag below, for whoever isn't holding a pointer.
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      moveTab(f.id, e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    if (e.key !== 'F2') return
    e.preventDefault()
    startRename(f)
  }

  /**
   * Move a tab one place along the row. The each block is keyed, so the DOM
   * node moves rather than being rebuilt and the key that did this keeps it.
   * @param {string} id
   * @param {1 | -1} by
   */
  function moveTab(id, by) {
    const ids = files.open.map((/** @type {import('$lib/cv/state/files.svelte.js').FileMeta} */ f) => f.id)
    const to = ids.indexOf(id) + by
    if (to < 0 || to >= ids.length) return
    // Left means "take that tab's place"; right means "go past it".
    files.reorder(id, by < 0 ? ids[to] : (ids[to + 1] ?? null))
  }

  /**
   * Dragging a tab reorders as it goes rather than dropping a marker and
   * settling up at the end: the row is short and the tabs are wide, so the
   * order under the pointer is the clearest preview of the order being asked
   * for. The menu is closed on the way in, because it is placed against the
   * viewport and the tab it belongs to is about to move.
   * @param {DragEvent} e
   * @param {import('$lib/cv/state/files.svelte.js').FileMeta} f
   */
  function onTabDragStart(e, f) {
    dragId = f.id
    menuOpen = false
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    // Firefox starts no drag at all unless the payload is set.
    e.dataTransfer.setData('text/plain', f.id)
  }

  /**
   * @param {DragEvent} e
   * @param {import('$lib/cv/state/files.svelte.js').FileMeta} f
   */
  function onTabDragOver(e, f) {
    if (!dragId || dragId === f.id) return
    e.preventDefault() // this is a drop target
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

    const rect = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect()
    const ids = files.open.map((/** @type {import('$lib/cv/state/files.svelte.js').FileMeta} */ x) => x.id)
    const at = ids.indexOf(f.id)
    // Past the middle of a tab is a request to be on its far side.
    const before = e.clientX > rect.left + rect.width / 2 ? (ids[at + 1] ?? null) : f.id
    files.reorder(dragId, before)
  }

  /** The order is already what the drag asked for; this only ends it. @param {DragEvent} e */
  function onTabDrop(e) {
    if (!dragId) return
    e.preventDefault() // no snap-back animation
    dragId = null
  }

  /** @param {HTMLInputElement} node */
  function focusAndSelect(node) {
    node.focus()
    node.select()
  }

  /** Measure the caret first: the menu is placed against the viewport. */
  function openMenu() {
    const rect = moreBtn?.getBoundingClientRect()
    if (rect) menuAt = { x: rect.left, y: rect.bottom + 6 }
    menuOpen = true
  }

  /** Run a menu choice and put focus back where the menu was opened from. */
  function pick(/** @type {() => void} */ action) {
    menuOpen = false
    moreBtn?.focus()
    action()
  }

  /** @param {KeyboardEvent} e */
  function onMoreKeydown(e) {
    if (e.key !== 'ArrowDown' || menuOpen) return
    e.preventDefault()
    openMenu() // the effect above puts the caret on the first item
  }

  /** @param {KeyboardEvent} e */
  function onMenuKeydown(e) {
    if (e.key === 'Escape') {
      menuOpen = false
      moreBtn?.focus()
      return
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step || !menu) return
    e.preventDefault()
    const items = [...menu.querySelectorAll('button')]
    const at = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
    items[(at + step + items.length) % items.length]?.focus()
  }

  /** @param {FocusEvent} e */
  function onMenuFocusOut(e) {
    const next = /** @type {Node | null} */ (e.relatedTarget)
    if (next && !menuGroup?.contains(next)) menuOpen = false
  }
</script>

<div id="tabbar">
  <!-- Only the tabs scroll: everything after them stays reachable however
	     many files are open, and on however narrow a screen. Scrolling them takes
	     the menu down with it, since it is placed where the caret was. -->
  <!-- A list, and the tabs its items: the row has an order that the drag below
	     changes, which is the one thing a screen reader has to be told about it. -->
  <div id="tabs" role="list" onscroll={() => (menuOpen = false)}>
    {#each files.open as f (f.id)}
      {@const active = f.id === files.activeId}
      <!-- Dragged by the tab as a whole, but not while it is being renamed:
			     a draggable ancestor takes the pointer away from the input inside it,
			     and selecting the text you are editing stops working. -->
      <div
        class="tab"
        role="listitem"
        class:active
        class:dragging={dragId === f.id}
        draggable={editingId !== f.id}
        ondragstart={e => onTabDragStart(e, f)}
        ondragover={e => onTabDragOver(e, f)}
        ondrop={onTabDrop}
        ondragend={() => (dragId = null)}>
        {#if editingId === f.id}
          <input class="tab-rename" bind:value={editValue} use:focusAndSelect onblur={commitRename} onkeydown={onRenameKeydown} />
        {:else}
          <button
            class="tab-select"
            title="{f.name} — double-click or F2 to rename, drag or Alt+← → to reorder"
            onclick={() => commands.selectTab(f.id)}
            ondblclick={() => startRename(f)}
            onkeydown={e => onTabKeydown(e, f)}>
            {f.name}
          </button>
          <!-- Everything that can be done to a file is behind this one caret,
					     and only the tab being worked on carries it: a row of trash cans
					     invited a mis-click on the wrong file, and four actions can't sit
					     in a tab as buttons. Deleting is last and set apart, for the same
					     reason. -->
          {#if active}
            <div class="tab-menu-group" bind:this={menuGroup}>
              <button
                class="tab-more"
                bind:this={moreBtn}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Actions for {f.name}"
                title="What can be done to this CV"
                onclick={() => (menuOpen ? (menuOpen = false) : openMenu())}
                onkeydown={onMoreKeydown}>
                <Icon icon={IconChevron} width="11" height="11" />
              </button>

              {#if menuOpen}
                <div
                  class="tab-menu"
                  role="menu"
                  tabindex="-1"
                  bind:this={menu}
                  style:left="{menuAt.x}px"
                  style:top="{menuAt.y}px"
                  onkeydown={onMenuKeydown}
                  onfocusout={onMenuFocusOut}
                  in:fly={{ y: -8, duration: 200 }}>
                  <button class="menu-item" role="menuitem" onclick={() => pick(commands.duplicateTab)}>
                    <Icon icon={IconCopy} width="12" height="12" />
                    <span>Duplicate</span>
                  </button>
                  <button class="menu-item" role="menuitem" onclick={() => pick(() => startRename(f))}>
                    <Icon icon={IconPencil} width="12" height="12" />
                    <span>Rename</span>
                  </button>
                  <button class="menu-item" role="menuitem" onclick={() => pick(commands.saveYaml)}>
                    <Icon icon={IconDownload} width="12" height="12" />
                    <span>Export YAML</span>
                  </button>
                  <button class="menu-item" role="menuitem" onclick={() => pick(() => commands.openCompare())}>
                    <Icon icon={IconCompare} width="12" height="12" />
                    <span>Compare</span>
                  </button>
                  <div class="menu-sep"></div>
                  <button class="menu-item danger" role="menuitem" onclick={() => pick(() => commands.closeTab(f.id))}>
                    <Icon icon={IconTrash} width="12" height="12" />
                    <span>Move to trash</span>
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <!-- One way to open a tab, and one button for it: a CV from the template.
	     Copying this one is a thing done to a file, so it lives in the tab's own
	     menu with the rest of them. -->
  <button class="tab-new" use:shortcut={['n', 'New CV from the template']} onclick={commands.newFile}>
    <Icon icon={IconFilePlus} width="12" height="12" />
  </button>

  <div class="t-spacer"></div>

  <div id="tab-actions">
    <!-- Beside History because the two are one control between them: they take
	       turns in the column to the right of the preview. -->
    <button class="t-btn" class:on={ui.sidePanel === 'style'} use:shortcut={['t', 'Template, theme and font']} onclick={() => commands.toggleSidePanel('style')}>
      <Icon icon={IconLayout} width="12" height="12" />
      <span class="t-txt"><u>T</u>hemes</span>
    </button>
    <button class="t-btn" class:on={ui.sidePanel === 'history'} use:shortcut={['h', 'Show version history']} onclick={() => commands.toggleSidePanel('history')}>
      <Icon icon={IconHistory} width="12" height="12" />
      <span class="t-txt"><u>H</u>istory</span>
      {#if doc.history.length}<span class="t-count">{doc.history.length}</span>{/if}
    </button>
  </div>
</div>

<style lang="scss">
  #tabbar {
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: stretch;
    gap: var(--sp-3);
    height: var(--bar-tabs);
    padding: 0 var(--sp-3) 0 0;
    /* The bottom rung, with the canvas: the tabs are cut into it. */
    background: var(--bg-darker);
    border-bottom: var(--hairline) solid var(--gray-6);
    z-index: 9;
    transition: var(--theme-fade);
  }

  /* Sized to its tabs and no wider, so the control that opens another one sits
	   against the last of them rather than across the bar. Shrinks — and scrolls —
	   only once there are more tabs than room. Its scrollbar is hidden: a bar
	   this thin leaves no room for one that isn't overlaid. */
  #tabs {
    flex: 0 1 auto;
    display: flex;
    align-items: stretch;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  #tab-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* Full-height cells divided by a rule rather than pills floating in a bar:
	   the tabs are a strip of the window, and the active one is a hole cut
	   through to the pane below it — the same rung as the editor. */
  .tab {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    border: none;
    border-right: var(--hairline) solid var(--gray-6);
    transition: var(--theme-fade);
    background: var(--bg-dark);
    border-radius: 5px 5px 0 0;

    /* An alpha step rather than a solid one: the tab is a hole in the bar with
	     nothing of its own behind it, so the hover has to tint whatever is. */
    &:hover {
      background: var(--gray-a3);
      transition: var(--hover-fade);
    }

    &.active {
      background: var(--bg);
      /* The one mark that says which: a rule in the accent at step 9 along the
		     top edge, inset so it can't add to the height of the bar. */
      box-shadow: inset 0 2px 0 0 var(--accent-9);

      .tab-select {
        color: var(--gray-12);
        font-weight: 600;
      }
    }

    /* No caret alongside to balance the label against. */
    &:not(.active) .tab-select {
      padding-right: var(--sp-4);
    }

    /* The tab in hand, while the row rearranges itself around it. Faded rather
	     than lifted: it is still in the row, in the place it would land. */
    &.dragging {
      opacity: 0.5;
    }
  }

  .tab-select {
    display: block;
    max-width: 150px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    color: var(--gray-11);
    padding: 0 var(--sp-1) 0 var(--sp-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-rename {
    max-width: 150px;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    color: var(--gray-12);
    background: var(--bg);
    border: var(--hairline) solid var(--accent-8);
    border-radius: var(--corner-xs);
    margin: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3);
    padding: var(--sp-1) var(--sp-2);

    &:focus {
      outline: none;
    }
  }

  /* ── What can be done to this file ────────────── */
  .tab-menu-group {
    display: flex;
    align-items: center;
  }

  .tab-more {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: var(--sp-2);
    background: none;
    border: none;
    border-radius: var(--corner-xs);
    cursor: pointer;
    color: var(--gray-11);
    padding: 0;

    &:hover,
    &[aria-expanded='true'] {
      background: var(--accent-9);
      color: var(--accent-contrast);
    }
  }

  /* ── Open another tab ─────────────────────────── */
  /* Square, and the width of the gutter it sits in. Dashed while it is only an
	   offer; solid and lit once it is being taken. */
  .tab-new {
    flex-shrink: 0;
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: none;
    border: var(--hairline) dashed var(--gray-7);
    border-radius: var(--corner-xs);
    cursor: pointer;
    color: var(--gray-11);
    padding: 0;
    transition: var(--hover-fade);

    &:hover,
    &:focus-visible {
      background: var(--accent-9);
      border-style: solid;
      border-color: var(--accent-9);
      color: var(--accent-contrast);
    }
  }

  /* Matches the weight .t-btn gives its icons; the glyphs are drawn by <Icon>,
	   so the compiler never sees the elements to scope them. */
  .tab-new :global([stroke-width]),
  .tab-more :global([stroke-width]) {
    stroke-width: 2.25;
  }

  /* Fixed, and placed where the caret was — see `menuAt`. */
  .tab-menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    padding: var(--sp-1);
    /* A popover is the raised rung, and the shadow says the rest. The ring
	     inside the shadow holds its edge; a border as well would state it twice. */
    background: var(--bg-light);
    border-radius: var(--corner-xs);
    box-shadow: var(--shadow-ring), var(--shadow-md);
    z-index: 100;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    background: none;
    border: none;
    border-radius: var(--corner-xs);
    cursor: pointer;
    font-family: var(--sans);
    font-size: var(--ui-fs-sm);
    font-weight: 550;
    color: var(--gray-12);
    text-align: left;
    white-space: nowrap;
    padding: var(--sp-2) var(--sp-4) var(--sp-2) var(--sp-3);
    transition: var(--hover-fade);

    /* The highlighted row of a menu is the solid step, not a soft one: it is
	     pointing at what Enter will do, and that wants the full-strength hue. */
    &:hover,
    &:focus-visible {
      background: var(--accent-9);
      color: var(--accent-contrast);
      outline: none;
    }

    /* Same shape in red, because red 9 takes the same contrast colour. */
    &.danger:hover,
    &.danger:focus-visible {
      background: var(--red-9);
      color: var(--accent-contrast);
    }
  }

  .menu-sep {
    height: var(--hairline);
    margin: var(--sp-1) var(--sp-2);
    background: var(--gray-6);
  }

  @media (max-width: 640px) {
    #tabbar {
      gap: var(--sp-2);
      padding: 0 var(--sp-2) 0 0;
    }

    .tab-select,
    .tab-rename {
      max-width: 104px;
    }
  }
</style>
