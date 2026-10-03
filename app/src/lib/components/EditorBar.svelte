<script>
  import Icon from '@iconify/svelte'
  import IconCircleX from '@iconify-icons/lucide/circle-x'
  import IconInfo from '@iconify-icons/lucide/info'
  import IconTriangleAlert from '@iconify-icons/lucide/triangle-alert'
  import { commands } from '$lib/cv/state/commands'
  import { doc, look, ui } from '$lib/cv/state/state.svelte'
  import { shortcut } from './access-keys'

  /** Hints are folded in with the suggestions: neither is something that must change. */
  const errors = $derived(ui.problems.filter((p) => p.severity === 'error').length)
  const warnings = $derived(ui.problems.filter((p) => p.severity === 'warning').length)
  const suggestions = $derived(ui.problems.filter((p) => p.severity === 'info' || p.severity === 'hint').length)

  const saveLabel = $derived.by(() => {
    if (doc.saveError) return '⚠ not saved'
    if (doc.isViewingHistory) return 'viewing history'
    if (!doc.savedAt) return ''
    const at = doc.savedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `saved ${at}`
  })
</script>

<!-- The editor's own footer: what the file in it is, whether it has been kept,
     and what its lint has to say — which opens the problems list above. All of
     it is about the text, so it lives with the text rather than in the window's
     status bar. -->
<div id="editor-bar">
  <button
    class="ds-btn subtle compact eb-problems"
    class:selected={ui.problemsOpen}
    onclick={commands.toggleProblems}
    aria-pressed={ui.problemsOpen}
    use:shortcut={['b', ui.problemsOpen ? 'Hide the problems' : 'List the problems, with their fixes']}
  >
    <span class="eb-count error"><Icon icon={IconCircleX} width="14" height="14" />{errors}</span>
    <span class="eb-count warning"><Icon icon={IconTriangleAlert} width="14" height="14" />{warnings}</span>
    <span class="eb-count info"><Icon icon={IconInfo} width="14" height="14" />{suggestions}</span>
    <span class="ds-txt">Pro<u>b</u>lems</span>
  </button>

  <div class="ds-spacer"></div>

  {#if saveLabel}<span id="save-state" class:err={doc.saveError}>{saveLabel}</span>{/if}
  <span class="ds-lozenge eb-format" title="The file's format, from its name">{look.format.label}</span>
</div>

<style lang="scss">
  /* A footer strip along the foot of the editor pane, in the status bar's
     small type: it reports, and its one control only fills on approach. */
  #editor-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    height: var(--bar-status);
    padding: 0 var(--ds-space-150) 0 var(--ds-space-050);
    border-top: var(--ds-border-width) solid var(--ds-border);
    background: var(--ds-surface);
    transition: var(--theme-fade);
  }

  .eb-problems {
    gap: var(--ds-space-100);
    font: var(--ds-font-body-small);
    font-weight: var(--ds-font-weight-medium);
  }

  .eb-count {
    display: inline-flex;
    align-items: center;
    gap: var(--ds-space-025);
    font-variant-numeric: tabular-nums;
    color: var(--ds-text-subtle);
  }

  .error :global(svg) {
    color: var(--ds-icon-danger);
  }

  .warning :global(svg) {
    color: var(--ds-icon-warning);
  }

  .info :global(svg) {
    color: var(--ds-icon-information);
  }

  #save-state {
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);
    white-space: nowrap;

    &.err {
      color: var(--ds-text-danger);
    }
  }
</style>
