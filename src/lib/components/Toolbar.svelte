<script>
  import Icon from '@iconify/svelte'
  import IconDownload from '@iconify-icons/lucide/download'
  import IconHistory from '@iconify-icons/lucide/history'
  import IconInstall from '@iconify-icons/lucide/arrow-down-to-line'
  import IconLayout from '@iconify-icons/lucide/layout-panel-left'
  import logo from '$lib/assets/favicon.svg'
  import { commands } from '$lib/cv/state/commands.js'
  import { doc, ui } from '$lib/cv/state/state.svelte.js'
  import { shortcut } from './access-keys.js'
  import TabBar from './TabBar.svelte'
</script>

<!-- One bar across the top: the files on the left, the product in the
     middle, the two panels and the one primary action on the right. The two
     sides share what is left over equally, which is what keeps the name in
     the middle; it gives up its subtitle, then its name, then its logo as the
     bar narrows. -->
<header id="toolbar">
  <div class="t-side t-left">
    <TabBar />
  </div>

  <div class="t-product">
    <img class="t-logo" src={logo} alt="" width="24" height="24" />
    <span class="t-title">Resume</span>
    <span class="t-subtitle">Offline-ready &amp; local editor</span>
  </div>

  <nav class="t-side t-right" aria-label="Panels and export">
    <!-- Beside History because the two are one control between them: they take
	       turns in the column to the right of the preview. -->
    <button
      class="ds-btn subtle"
      class:selected={ui.sidePanel === 'style'}
      use:shortcut={['t', 'Template, theme and font']}
      onclick={() => commands.toggleSidePanel('style')}
    >
      <Icon icon={IconLayout} width="16" height="16" />
      <span class="ds-txt"><u>T</u>hemes</span>
    </button>
    <button
      class="ds-btn subtle"
      class:selected={ui.sidePanel === 'history'}
      use:shortcut={['h', 'Show version history']}
      onclick={() => commands.toggleSidePanel('history')}
    >
      <Icon icon={IconHistory} width="16" height="16" />
      <span class="ds-txt"><u>H</u>istory</span>
      {#if doc.history.length}<span class="ds-badge">{doc.history.length}</span>{/if}
    </button>

    <!-- Only ever shown when the browser has offered us a prompt, which is Chromium
	       and only until the app is installed. Elsewhere the bar looks as it always did. -->
    {#if ui.installPrompt}
      <button class="ds-btn subtle" onclick={commands.installApp} use:shortcut={['i', 'Install as an app — runs offline']}>
        <Icon icon={IconInstall} width="16" height="16" />
        <span class="ds-txt"><u>I</u>nstall</span>
      </button>
    {/if}

    <button class="ds-btn primary" use:shortcut={['x', 'Export the current CV as PDF']} onclick={commands.exportPDF}>
      <Icon icon={IconDownload} width="16" height="16" />
      <span class="ds-txt">E<u>x</u>port PDF</span>
    </button>
  </nav>
</header>

<style lang="scss">
  #toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    height: var(--bar-tool);
    background: var(--ds-surface-sunken);
    /* The bar's bottom rule. An inset shadow rather than a border so the open
       tab, which stands on the bar's bottom edge, paints over it. */
    box-shadow: inset 0 calc(-1 * var(--ds-border-width)) 0 var(--ds-border);
    z-index: 10;
    transition: var(--theme-fade);
    /* The product name answers to the bar's width, not the window's. */
    container: topbar / inline-size;
  }

  /* Equal shares of what the middle leaves: that is what centres it. */
  .t-side {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
  }

  .t-left {
    align-items: stretch;
  }

  /* Never clipped: the buttons keep their width, and the tabs scroll instead. */
  .t-right {
    align-items: center;
    justify-content: flex-end;
    gap: var(--ds-space-100);
    min-width: max-content;
    padding: 0 var(--ds-space-200) 0 var(--ds-space-100);
  }

  .t-product {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: 0 var(--ds-space-200);
    overflow: hidden;
  }

  .t-logo {
    display: block;
    flex-shrink: 0;
    border-radius: var(--ds-radius-medium);
  }

  .t-title {
    font: var(--ds-font-heading-small);
    color: var(--ds-text);
    white-space: nowrap;
  }

  .t-subtitle {
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
    white-space: nowrap;
    padding-left: var(--ds-space-100);
    border-left: var(--ds-border-width) solid var(--ds-border);
  }

  /* The name gives way a piece at a time as the bar narrows: subtitle, then
     title, then the logo. At phone width the buttons drop to their icons
     (controls.scss), which frees room for the logo again, until even that
     goes on the narrowest screens. */
  @container topbar (max-width: 1080px) {
    .t-subtitle {
      display: none;
    }
  }

  @container topbar (max-width: 880px) {
    .t-title {
      display: none;
    }
  }

  @container topbar (min-width: 641px) and (max-width: 780px) {
    .t-product {
      display: none;
    }
  }

  @container topbar (max-width: 360px) {
    .t-product {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .t-product {
      padding: 0 var(--ds-space-100);
    }

    .t-right {
      gap: var(--ds-space-050);
      padding: 0 var(--ds-space-100) 0 var(--ds-space-050);
    }
  }
</style>
