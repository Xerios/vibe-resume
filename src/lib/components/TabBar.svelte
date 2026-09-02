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
  import { withKey } from './access-keys.js'

  let {
    /** @type {import('$lib/cv/files.svelte.js').FileManager} */
    files,
    /** @type {(id: string) => void} */
    onSelect,
    /** @type {() => void} */
    onDuplicate,
    /** @type {(id: string) => void} */
    onClose,
    /** @type {(id: string, name: string) => void} */
    onRename,
    /** @type {() => void} */
    onNew,
    /** @type {() => void} */
    onCopy,
    /** The two panels share the split's third column, so only one is ever on. */
    styleOpen = false,
    /** @type {() => void} */
    onToggleStyle,
    historyOpen = false,
    historyCount = 0,
    /** @type {() => void} */
    onToggleHistory,
    /** @type {() => void} */
    onSave,
  } = $props()

  let editingId = $state(/** @type {string | null} */ (null))
  let editValue = $state('')
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

  /** @param {import('$lib/cv/files.svelte.js').FileMeta} f */
  function startRename(f) {
    editingId = f.id
    editValue = f.name
  }

  function commitRename() {
    if (editingId) onRename(editingId, editValue)
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
   * @param {import('$lib/cv/files.svelte.js').FileMeta} f
   */
  function onTabKeydown(e, f) {
    if (e.key !== 'F2') return
    e.preventDefault()
    startRename(f)
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
  <div id="tabs" onscroll={() => (menuOpen = false)}>
    {#each files.open as f (f.id)}
      {@const active = f.id === files.activeId}
      <div class="tab" class:active>
        {#if editingId === f.id}
          <input class="tab-rename" bind:value={editValue} use:focusAndSelect onblur={commitRename} onkeydown={onRenameKeydown} />
        {:else}
          <button
            class="tab-select"
            title="{f.name} — double-click or F2 to rename"
            onclick={() => onSelect(f.id)}
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
                  onfocusout={onMenuFocusOut}>
                  <button class="menu-item" role="menuitem" onclick={() => pick(onDuplicate)}>
                    <Icon icon={IconCopy} width="12" height="12" />
                    <span>Duplicate</span>
                  </button>
                  <button class="menu-item" role="menuitem" onclick={() => pick(() => startRename(f))}>
                    <Icon icon={IconPencil} width="12" height="12" />
                    <span>Rename</span>
                  </button>
                  <button class="menu-item" role="menuitem" onclick={() => pick(onSave)}>
                    <Icon icon={IconDownload} width="12" height="12" />
                    <span>Export YAML</span>
                  </button>
                  <div class="menu-sep"></div>
                  <button class="menu-item danger" role="menuitem" onclick={() => pick(() => onClose(f.id))}>
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
  <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
  <button class="tab-new" accesskey="n" title={withKey('New CV from the template', 'n')} onclick={onNew}>
    <Icon icon={IconFilePlus} width="12" height="12" />
  </button>

  <div class="t-spacer"></div>

  <div id="tab-actions">
    <!-- Beside History because the two are one control between them: they take
	       turns in the column to the right of the preview. -->
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" class:on={styleOpen} accesskey="t" title={withKey('Template, theme and font', 't')} onclick={onToggleStyle}>
      <Icon icon={IconLayout} width="12" height="12" />
      <span class="t-txt"><u>T</u>hemes</span>
    </button>
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" class:on={historyOpen} accesskey="h" title={withKey('Show version history', 'h')} onclick={onToggleHistory}>
      <Icon icon={IconHistory} width="12" height="12" />
      <span class="t-txt"><u>H</u>istory</span>
      {#if historyCount}<span class="t-count">{historyCount}</span>{/if}
    </button>
  </div>
</div>

<style>
  #tabbar {
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    background: var(--editor-chrome);
    border-bottom: 1px solid var(--line);
    z-index: 9;
    transition: var(--theme-fade);
  }

  /* Sized to its tabs and no wider, so the control that opens another one sits
	   against the last of them rather than across the bar. Shrinks — and scrolls —
	   only once there are more tabs than room. Its scrollbar is hidden: 34px
	   leaves no room for one that isn't overlaid. */
  #tabs {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  #tabs::-webkit-scrollbar {
    display: none;
  }

  #tab-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tab {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    background: none;
    border: 1.5px solid transparent;
    border-radius: 5px;
    transition: var(--theme-fade);
  }

  .tab:hover {
    background: var(--accent-wash);
  }

  .tab.active {
    background: var(--paper);
    border-color: var(--line);
  }

  .tab-select {
    display: block;
    max-width: 150px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--muted);
    padding: 6px 4px 6px 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* No caret alongside to balance the label against. */
  .tab:not(.active) .tab-select {
    padding-right: 9px;
  }

  .tab.active .tab-select {
    color: var(--accent-deep);
    font-weight: 600;
  }

  .tab-rename {
    max-width: 150px;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--accent);
    border-radius: 3px;
    margin: 3px 4px 3px 9px;
    padding: 3px 5px;
  }

  .tab-rename:focus {
    outline: none;
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
    width: 18px;
    height: 18px;
    margin-right: 5px;
    background: none;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--faint);
    padding: 0;
  }

  .tab-more:hover,
  .tab-more[aria-expanded='true'] {
    background: var(--line);
    color: var(--accent-deep);
  }

  /* ── Open another tab ─────────────────────────── */
  .tab-new {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 23px;
    height: 22px;
    background: none;
    border: 1.5px dashed var(--line);
    border-radius: 5px;
    cursor: pointer;
    color: var(--muted);
    padding: 0;
    transition:
      border-color 0.13s,
      color 0.13s;
  }

  .tab-new:hover,
  .tab-new:focus-visible {
    background: var(--accent-wash);
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  /* Matches the weight .t-btn gives its icons; the glyphs are drawn by <Icon>,
	   so the compiler never sees the elements to scope them. */
  .tab-new :global([stroke-width]),
  .tab-more :global([stroke-width]) {
    stroke-width: 2.5;
  }

  /* Fixed, and placed where the caret was — see `menuAt`. */
  .tab-menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    z-index: 100;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: var(--ui-fs-sm);
    font-weight: 600;
    color: var(--muted);
    text-align: left;
    white-space: nowrap;
    padding: 5px 9px 5px 7px;
  }

  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--accent-wash);
    color: var(--accent-deep);
    outline: none;
  }

  .menu-item.danger:hover,
  .menu-item.danger:focus-visible {
    background: var(--line);
    color: var(--danger);
  }

  .menu-sep {
    height: 1px;
    margin: 2px 4px;
    background: var(--line);
  }

  @media (max-width: 640px) {
    #tabbar {
      gap: 6px;
      padding: 0 6px;
    }

    .tab-select,
    .tab-rename {
      max-width: 104px;
    }
  }
</style>
