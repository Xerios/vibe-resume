<script>
  import Icon from '@iconify/svelte'
  import IconChevron from '@iconify-icons/lucide/chevron-down'
  import IconCopy from '@iconify-icons/lucide/copy'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconPencil from '@iconify-icons/lucide/pencil'
  import IconTrash from '@iconify-icons/lucide/trash'
  import IconCompare from '@iconify-icons/lucide/git-compare'
  import { commands } from '$lib/cv/state/commands.js'
  import { files } from '$lib/cv/state/state.svelte.js'
  import { fly } from 'svelte/transition'

  let editingId = $state(/** @type {string | null} */ (null))
  let editValue = $state('')
  /** The tab being dragged, while it is being dragged. */
  let dragId = $state(/** @type {string | null} */ (null))
  /** Whether a tab's menu — everything you can do to this file — is showing. */
  let menuOpen = $state(false)
  /** The tab that menu is for: the active one from the caret, any one from a right-click. */
  let menuId = $state(/** @type {string | null} */ (null))
  /** What had focus when the menu opened, so closing it can hand focus back. */
  let returnTo = $state(/** @type {HTMLElement | null} */ (null))
  const menuFile = $derived(files.open.find((/** @type {import('$lib/cv/state/files.svelte.js').FileMeta} */ f) => f.id === menuId))
  /**
   * Where that menu is drawn. It is positioned against the viewport rather than
   * against the tab, because #tabs scrolls: a box positioned inside it is
   * clipped by the scroller on both axes, however far it overhangs.
   */
  let menuAt = $state({ x: 0, y: 0 })

  let moreBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined))
  let menu = $state(/** @type {HTMLDivElement | undefined} */ (undefined))

  // A menu is a mode: it closes on Escape, on a click elsewhere, and on focus
  // leaving it, and hands focus back to the button that opened it.
  $effect(() => {
    if (!menuOpen) return
    // The tab the menu is for was closed or trashed from under it.
    if (!menuFile) {
      menuOpen = false
      return
    }
    menu?.querySelector('button')?.focus()

    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
      if (!inMenu(/** @type {Node | null} */ (e.target))) menuOpen = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  })

  /** Whether a node is the menu or the caret that toggles it. @param {Node | null} node */
  function inMenu(node) {
    return !!node && (!!menu?.contains(node) || !!moreBtn?.contains(node))
  }

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
    menuId = files.activeId
    returnTo = moreBtn ?? null
    menuOpen = true
  }

  /**
   * Right-click opens the same menu at the pointer, for the tab under it —
   * which stays as it was: asking what can be done to a file isn't asking to
   * switch to it. While renaming, the input keeps the browser's own menu (cut,
   * copy, paste).
   * @param {MouseEvent} e
   * @param {import('$lib/cv/state/files.svelte.js').FileMeta} f
   */
  function onTabContextMenu(e, f) {
    if (editingId === f.id) return
    e.preventDefault()
    menuAt = { x: e.clientX, y: e.clientY }
    menuId = f.id
    returnTo = /** @type {HTMLElement} */ (e.currentTarget).querySelector('.tab-select')
    menuOpen = true
  }

  /** Run a menu choice and put focus back where the menu was opened from. */
  function pick(/** @type {() => void} */ action) {
    menuOpen = false
    returnTo?.focus()
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
      returnTo?.focus()
      return
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step || !menu) return
    e.preventDefault()
    const items = [...menu.querySelectorAll('button')]
    const at = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
    items[(at + step + items.length) % items.length]?.focus()
  }

  /**
   * Only the bare bar counts — not a tab, whose own double-click renames it.
   * @param {MouseEvent} e
   */
  function onBarDblClick(e) {
    const target = /** @type {HTMLElement} */ (e.target)
    if (target === e.currentTarget || target.id === 'tabs') commands.newFile()
  }

  /** @param {FocusEvent} e */
  function onMenuFocusOut(e) {
    const next = /** @type {Node | null} */ (e.relatedTarget)
    if (next && !inMenu(next)) menuOpen = false
  }
</script>

<!-- The empty bar beside the tabs opens a new one on a double-click, as in a
     browser. The Menu in the toolbar has New CV for the keyboard. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="tabbar" ondblclick={onBarDblClick}>
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
        ondragstart={(e) => onTabDragStart(e, f)}
        ondragover={(e) => onTabDragOver(e, f)}
        ondrop={onTabDrop}
        oncontextmenu={(e) => onTabContextMenu(e, f)}
        ondragend={() => (dragId = null)}
      >
        {#if editingId === f.id}
          <input class="tab-rename ds-textfield compact" bind:value={editValue} use:focusAndSelect onblur={commitRename} onkeydown={onRenameKeydown} />
        {:else}
          <button
            class="tab-select"
            title="{f.name} — double-click or F2 to rename, drag or Alt+← → to reorder"
            onclick={() => commands.selectTab(f.id)}
            ondblclick={() => startRename(f)}
            onkeydown={(e) => onTabKeydown(e, f)}
          >
            {f.name}
          </button>
          <!-- Everything that can be done to a file is behind this one caret,
					     and only the tab being worked on carries it: a row of trash cans
					     invited a mis-click on the wrong file, and four actions can't sit
					     in a tab as buttons. Deleting is last and set apart, for the same
					     reason. -->
          {#if active}
            <div class="tab-menu-group">
              <button
                class="tab-more ds-icon-btn compact"
                bind:this={moreBtn}
                aria-haspopup="menu"
                aria-expanded={menuOpen && menuId === f.id}
                aria-label="Actions for {f.name}"
                title="What can be done to this CV"
                onclick={() => (menuOpen && menuId === f.id ? (menuOpen = false) : openMenu())}
                onkeydown={onMoreKeydown}
              >
                <Icon icon={IconChevron} width="16" height="16" />
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  {#if menuOpen && menuFile}
    {@const f = menuFile}
    <div
      class="tab-menu ds-menu"
      role="menu"
      tabindex="-1"
      bind:this={menu}
      style:left="{menuAt.x}px"
      style:top="{menuAt.y}px"
      onkeydown={onMenuKeydown}
      onfocusout={onMenuFocusOut}
      in:fly={{ y: -8, duration: 200 }}
    >
      <button class="ds-menu-item" role="menuitem" onclick={() => pick(() => commands.duplicateTab(f.id))}>
        <Icon icon={IconCopy} width="16" height="16" />
        <span>Duplicate</span>
      </button>
      <button class="ds-menu-item" role="menuitem" onclick={() => pick(() => startRename(f))}>
        <Icon icon={IconPencil} width="16" height="16" />
        <span>Rename</span>
      </button>
      <button class="ds-menu-item" role="menuitem" onclick={() => pick(() => commands.saveYaml(f.id))}>
        <Icon icon={IconDownload} width="16" height="16" />
        <span>Export YAML</span>
      </button>
      <button
        class="ds-menu-item"
        role="menuitem"
        onclick={() =>
          pick(() =>
            commands.openCompare(
              { fileId: f.id, versionKey: null },
              f.id === files.activeId ? undefined : { fileId: /** @type {string} */ (files.activeId), versionKey: null },
            ),
          )}
      >
        <Icon icon={IconCompare} width="16" height="16" />
        <span>Compare</span>
      </button>
      <div class="ds-menu-sep"></div>
      <button class="ds-menu-item danger" role="menuitem" onclick={() => pick(() => commands.closeTab(f.id))}>
        <Icon icon={IconTrash} width="16" height="16" />
        <span>Move to trash</span>
      </button>
    </div>
  {/if}
</div>

<style lang="scss">
  /* The tabs, at the left of the top bar and standing on its bottom edge. The
     open file's tab is lifted onto the editor's surface and joined to it —
     bordered on three sides, open at the bottom, over the bar's rule — with
     the brand colour along its top edge; the rest sit back in the bar. */
  /* Fills the left of the bar, so the space past the last tab is its own and
     takes the double-click. */
  #tabbar {
    flex: 1 1 auto;
    position: relative;
    display: flex;
    align-items: stretch;
    gap: var(--ds-space-100);
    min-width: 0;
    height: 100%;
    padding-left: var(--ds-space-100);
  }

  /* Sized to its tabs and no wider, so the control that opens another one sits
     against the last of them rather than across the bar. Shrinks — and scrolls —
     only once there are more tabs than room. Its scrollbar is hidden: a strip
     this thin leaves no room for one that isn't overlaid. */
  #tabs {
    flex: 0 1 auto;
    display: flex;
    align-items: flex-end;
    gap: var(--ds-space-025);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .tab {
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--ds-space-025);
    height: calc(var(--bar-tool) - var(--ds-space-150));
    padding: 0 var(--ds-space-075) 0 var(--ds-space-100);
    color: var(--ds-text-subtle);
    /* A resting tab is still a tab: the neutral fill and a hairline on three
       sides, so its shape reads against the strip without competing with the
       one that is open. */
    background: var(--ds-background-neutral);
    border: var(--ds-border-width) solid var(--ds-border);
    border-bottom: none;
    border-radius: var(--ds-radius-large) var(--ds-radius-large) 0 0;
    transition: var(--hover-fade);

    &:hover:not(.active) {
      color: var(--ds-text);
      background: var(--ds-background-neutral-hovered);
    }

    &.active {
      color: var(--ds-text);
      background: var(--ds-surface);
      box-shadow: 1px 1px 3px var(--ds-background-neutral-bold);
      z-index: 1;
    }

    /* No caret alongside to balance the label against. */
    &:not(.active) .tab-select {
      padding-right: var(--ds-space-075);
    }

    /* The tab in hand, while the row rearranges itself around it. Faded rather
       than lifted: it is still in the row, in the place it would land. */
    &.dragging {
      opacity: 0.5;
    }
  }

  .tab-select {
    display: block;
    max-width: 180px;
    height: var(--control-h);
    background: none;
    border: none;
    border-radius: var(--ds-radius-small);
    cursor: pointer;
    font: var(--ds-font-body);
    font-weight: var(--ds-font-weight-medium);
    color: inherit;
    padding: 0 var(--ds-space-050);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:focus-visible {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: -2px;
    }
  }

  .tab-rename {
    width: 180px;
  }

  /* ── What can be done to this file ────────────── */
  .tab-menu-group {
    display: flex;
    align-items: center;
  }

  /* Fixed, and placed where the caret was — see `menuAt`. */
  .tab-menu {
    position: fixed;
    z-index: 100;
  }

  @media (max-width: 640px) {
    #tabbar {
      gap: var(--ds-space-050);
      padding-left: var(--ds-space-050);
    }

    .tab-select,
    .tab-rename {
      max-width: 112px;
    }
  }
</style>
