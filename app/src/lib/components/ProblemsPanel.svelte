<script>
  import Icon from '@iconify/svelte'
  import IconCircleCheck from '@iconify-icons/lucide/circle-check'
  import IconCircleX from '@iconify-icons/lucide/circle-x'
  import IconInfo from '@iconify-icons/lucide/info'
  import IconLightbulb from '@iconify-icons/lucide/lightbulb'
  import IconTriangleAlert from '@iconify-icons/lucide/triangle-alert'
  import IconWand from '@iconify-icons/lucide/wand-sparkles'
  import IconX from '@iconify-icons/lucide/x'
  import { commands } from '$lib/cv/state/commands'
  import { ui } from '$lib/cv/state/state.svelte'

  /** @typedef {import('$lib/cv/state/ui.svelte').Problem} Problem */
  /** @typedef {import('@vibe-resume/core/format').Fix} Fix */

  let {
    /** A version is being looked at: the list still reads, but nothing can be fixed. */
    readOnly = false,
    /** Select a problem in the editor. @type {(problem: Problem) => void} */
    onGo = () => {},
    /** Apply fixes as one edit. @type {(list: Array<{ problem: Problem, fix: Fix }>) => void} */
    onFix = () => {},
  } = $props()

  const ICONS = { error: IconCircleX, warning: IconTriangleAlert, info: IconInfo, hint: IconLightbulb }
  const NAMES = { error: 'Error', warning: 'Warning', info: 'Suggestion', hint: 'Hint' }

  /** How many of each, for the header — only the severities there are. */
  const counts = $derived(
    /** @type {const} */ (['error', 'warning', 'info', 'hint'])
      .map((severity) => ({ severity, n: ui.problems.filter((p) => p.severity === severity).length }))
      .filter((c) => c.n > 0),
  )

  /** Each problem that has a fix, with the first one it offers. */
  const fixable = $derived(ui.problems.filter((p) => p.fixes.length).map((problem) => ({ problem, fix: problem.fixes[0] })))
</script>

<!-- The lint as a list, under the editor: every diagnostic the gutter marks,
     in document order, each one a jump to its text and — where the fix is
     mechanical — a button that makes it. Fix all takes every first fix as one
     edit, so a single undo puts them all back. -->
<section id="problems" aria-labelledby="problems-title">
  <header class="pb-head">
    <h2 id="problems-title">{ui.hasProblems ? 'Problems' : 'Suggestions'}</h2>
    {#each counts as c (c.severity)}
      <span class="pb-count {c.severity}" title="{c.n} {NAMES[c.severity].toLowerCase()}{c.n === 1 ? '' : 's'}">
        <Icon icon={ICONS[c.severity]} width="14" height="14" />
        {c.n}
      </span>
    {/each}
    <div class="ds-spacer"></div>
    <button class="ds-btn subtle compact" disabled={readOnly || !fixable.length} onclick={() => onFix(fixable)} title="Apply every fix on offer as one edit">
      <Icon icon={IconWand} width="16" height="16" />
      <span class="ds-txt">Fix all{fixable.length ? ` (${fixable.length})` : ''}</span>
    </button>
    <button class="ds-icon-btn compact" aria-label="Close {ui.hasProblems ? 'problems' : 'suggestions'}" onclick={commands.toggleProblems}>
      <Icon icon={IconX} width="16" height="16" />
    </button>
  </header>

  {#if ui.problems.length}
    <ul class="pb-list">
      {#each ui.problems as problem, i (i)}
        <li class="pb-row">
          <button class="pb-go" onclick={() => onGo(problem)} title="Go to line {problem.line}">
            <span class="pb-sev {problem.severity}" aria-label={NAMES[problem.severity]}>
              <Icon icon={ICONS[problem.severity]} width="16" height="16" />
            </span>
            <span class="pb-msg">{problem.message}</span>
            <span class="pb-where">{problem.line}:{problem.column}</span>
          </button>
          {#each problem.fixes as fix, j (j)}
            <button class="ds-btn subtle compact pb-fix" disabled={readOnly} onclick={() => onFix([{ problem, fix }])}>
              <Icon icon={IconWand} width="14" height="14" />
              <span>{fix.label}</span>
            </button>
          {/each}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="pb-empty">
      <Icon icon={IconCircleCheck} width="16" height="16" />
      Nothing to fix.
    </p>
  {/if}
</section>

<style lang="scss">
  /* A strip along the foot of the editor pane, on the same surface: a header
     row like a side panel's, then the list, which scrolls on its own so the
     editor above keeps most of the height. */
  #problems {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    max-height: min(40%, 280px);
    border-top: var(--ds-border-width) solid var(--ds-border);
    background: var(--ds-surface);
    transition: var(--theme-fade);
  }

  .pb-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    padding: var(--ds-space-050) var(--ds-space-050) var(--ds-space-050) var(--ds-space-150);

    h2 {
      margin: 0;
      font: var(--ds-font-heading-xxsmall);
      color: var(--ds-text);
    }
  }

  .pb-count {
    display: inline-flex;
    align-items: center;
    gap: var(--ds-space-025);
    font: var(--ds-font-body-small);
    font-variant-numeric: tabular-nums;
    color: var(--ds-text-subtle);
  }

  .pb-list {
    margin: 0;
    padding: 0 0 var(--ds-space-050);
    list-style: none;
    overflow-y: auto;
  }

  .pb-row {
    display: flex;
    align-items: center;
    gap: var(--ds-space-050);
    padding-right: var(--ds-space-100);

    &:hover {
      background: var(--ds-background-neutral-subtle-hovered);
    }
  }

  /* The row itself is the jump; the fixes sit beside it. */
  .pb-go {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--ds-space-100);
    padding: var(--ds-space-050) var(--ds-space-050) var(--ds-space-050) var(--ds-space-150);
    border: 0;
    background: none;
    color: var(--ds-text);
    font: var(--ds-font-body-small);
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--ds-border-focused);
      outline-offset: -2px;
    }
  }

  .pb-sev {
    flex-shrink: 0;
    align-self: center;
    display: inline-flex;
  }

  .error {
    color: var(--ds-icon-danger);
  }

  .warning {
    color: var(--ds-icon-warning);
  }

  .info {
    color: var(--ds-icon-information);
  }

  .hint {
    color: var(--ds-icon-subtle);
  }

  .pb-msg {
    flex: 1;
    min-width: 0;
  }

  .pb-where {
    flex-shrink: 0;
    color: var(--ds-text-subtlest);
    font-variant-numeric: tabular-nums;
  }

  .pb-fix {
    flex-shrink: 0;
    gap: var(--ds-space-050);
    font: var(--ds-font-body-small);
  }

  .pb-empty {
    display: flex;
    align-items: center;
    gap: var(--ds-space-100);
    margin: 0;
    padding: var(--ds-space-050) var(--ds-space-150) var(--ds-space-100);
    font: var(--ds-font-body-small);
    color: var(--ds-text-subtlest);

    :global(svg) {
      color: var(--ds-icon-success);
    }
  }
</style>
