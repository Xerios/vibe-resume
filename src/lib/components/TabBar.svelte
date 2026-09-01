<script>
  import Icon from '@iconify/svelte'
  import IconChevron from '@iconify-icons/lucide/chevron-down'
  import IconCopy from '@iconify-icons/lucide/copy'
  import IconFilePlus from '@iconify-icons/lucide/file-plus'
  import IconTrash from '@iconify-icons/lucide/trash'
  import IconLayout from '@iconify-icons/lucide/layout-panel-left'
  import IconHistory from '@iconify-icons/lucide/history'
  import IconSave from '@iconify-icons/lucide/save'
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
  /** Whether the second way to open a tab — duplicating this one — is showing. */
  let menuOpen = $state(false)

  /** @type {HTMLDivElement} */
  let newGroup
  let moreBtn = $state(/** @type {HTMLButtonElement | undefined} */ (undefined))
  let menu = $state(/** @type {HTMLDivElement | undefined} */ (undefined))

  // A menu is a mode: it closes on Escape, on a click elsewhere, and on focus
  // leaving it, and hands focus back to the button that opened it.
  $effect(() => {
    if (!menuOpen) return
    menu?.querySelector('button')?.focus()

    /** @param {PointerEvent} e */
    const onPointerDown = (e) => {
      if (!newGroup.contains(/** @type {Node | null} */ (e.target))) menuOpen = false
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
   * two gestures every file list has trained people to try.
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
    menuOpen = true // the effect above puts the caret on the first item
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
    if (next && !newGroup.contains(next)) menuOpen = false
  }
</script>

<div id="tabbar">
  <!-- Only the tabs scroll: everything after them stays reachable however
	     many files are open, and on however narrow a screen. -->
  <div id="tabs">
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
            onkeydown={(e) => onTabKeydown(e, f)}
          >
            {f.name}
          </button>
          <!-- Closing is deleting here — it moves the file to the trash — so
					     the button says so, and only the tab being worked on carries
					     one: a row of trash cans invites a mis-click on the wrong file. -->
          {#if active}
            <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
            <button class="tab-close" accesskey="w" title={withKey('Move this CV to the trash', 'w')} onclick={() => onClose(f.id)}>
              <Icon icon={IconTrash} width="11" height="11" />
            </button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <!-- Both ways to open a tab, in one control at the end of the row: the click
	     starts a CV from the template, the caret also offers this one copied.
	     Outside #tabs, so the menu isn't clipped by that scroller. -->
  <div class="tab-new" class:open={menuOpen} bind:this={newGroup}>
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="tab-new-main" accesskey="n" title={withKey('New CV from the template', 'n')} onclick={onNew}>
      <Icon icon={IconFilePlus} width="12" height="12" />
    </button>
    <button
      class="tab-new-more"
      bind:this={moreBtn}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label="More ways to open a tab"
      onclick={() => (menuOpen = !menuOpen)}
      onkeydown={onMoreKeydown}
    >
      <Icon icon={IconChevron} width="10" height="10" />
    </button>

    {#if menuOpen}
      <div class="new-menu" role="menu" tabindex="-1" bind:this={menu} onkeydown={onMenuKeydown} onfocusout={onMenuFocusOut}>
        <button class="new-item" role="menuitem" onclick={() => pick(onNew)}>
          <Icon icon={IconFilePlus} width="12" height="12" />
          <span><u>N</u>ew from template</span>
        </button>
        <button class="new-item" role="menuitem" onclick={() => pick(onDuplicate)}>
          <Icon icon={IconCopy} width="12" height="12" />
          <span><u>D</u>uplicate this CV</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="t-spacer"></div>

  <div id="tab-actions">
    <!-- Beside History because the two are one control between them: they take
	       turns in the column to the right of the preview. -->
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" class:on={styleOpen} accesskey="s" title={withKey('Template, theme and font', 's')} onclick={onToggleStyle}>
      <Icon icon={IconLayout} width="12" height="12" />
      <span class="t-txt"><u>S</u>tyle</span>
    </button>
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" class:on={historyOpen} accesskey="h" title={withKey('Show version history', 'h')} onclick={onToggleHistory}>
      <Icon icon={IconHistory} width="12" height="12" />
      <span class="t-txt"><u>H</u>istory</span>
      {#if historyCount}<span class="t-count">{historyCount}</span>{/if}
    </button>
    <!-- svelte-ignore a11y_accesskey (accesskey is the mnemonic itself here — see access-keys.js) -->
    <button class="t-btn" accesskey="y" title={withKey('Save the YAML to a file', 'y')} onclick={onSave}>
      <Icon icon={IconSave} width="12" height="12" />
      <span class="t-txt">Save <u>Y</u>AML</span>
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
    font-size: 10.5px;
    color: var(--muted);
    padding: 6px 4px 6px 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* No close button alongside to balance the label against. */
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
    font-size: 10.5px;
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

  .tab-close {
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

  .tab-close:hover {
    background: var(--line);
    color: var(--danger);
  }

  /* ── Open another tab ─────────────────────────── */
  .tab-new {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    height: 22px;
    border: 1.5px dashed var(--line);
    border-radius: 5px;
    color: var(--muted);
    transition:
      border-color 0.13s,
      color 0.13s;
  }

  .tab-new:hover,
  .tab-new:focus-within,
  .tab-new.open {
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  .tab-new > button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    padding: 0;
  }

  .tab-new > button:hover {
    background: var(--accent-wash);
  }

  /* Each half rounds only its outer corners, so a hover fill stops at the seam
	   instead of pulling away from it. Both beat `.tab-new > button` on
	   specificity — which is also what lets the divider survive its `border: none`. */
  .tab-new > .tab-new-main {
    width: 23px;
    border-radius: 4px 0 0 4px;
  }

  .tab-new > .tab-new-more {
    width: 15px;
    border-left: 1px solid var(--line);
    border-radius: 0 4px 4px 0;
  }

  .tab-new:hover > .tab-new-more,
  .tab-new:focus-within > .tab-new-more,
  .tab-new.open > .tab-new-more {
    border-left-color: var(--accent);
  }

  /* Matches the weight .t-btn gives its icons; the glyphs are drawn by <Icon>,
	   so the compiler never sees the elements to scope them. */
  .tab-new :global([stroke-width]) {
    stroke-width: 2.5;
  }

  .new-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
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

  .new-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--muted);
    text-align: left;
    white-space: nowrap;
    padding: 5px 9px 5px 7px;
  }

  .new-item:hover,
  .new-item:focus-visible {
    background: var(--accent-wash);
    color: var(--accent-deep);
    outline: none;
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
