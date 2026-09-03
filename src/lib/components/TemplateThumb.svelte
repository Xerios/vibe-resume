<script>
  /**
   * A preset's thumbnail: the wireframe drawn beside its name in the Style
   * popover. The names alone don't say much, and a sketch reads faster than
   * switching to find out.
   *
   * It stands for the preset as it ships. Change an axis and it goes on saying
   * where you started from, which is the honest thing for it to say — nothing
   * here can sketch an arbitrary set of choices.
   */

  /** @type {{ id: string }} */
  let { id } = $props()
</script>

<svg viewBox="0 0 36 26" aria-hidden="true">
  {#if id === 'classic'}
    <rect x="3" y="3" width="17" height="4" />
    <rect x="26" y="4" width="7" height="2" opacity="0.5" />
    <rect x="3" y="9.5" width="30" height="1" class="rule" />
    <rect x="3" y="13" width="30" height="1.6" opacity="0.4" />
    <rect x="3" y="17" width="30" height="1.6" opacity="0.4" />
    <rect x="3" y="21" width="21" height="1.6" opacity="0.4" />
  {:else if id === 'compact'}
    <rect x="3" y="3" width="13" height="3" />
    <rect x="27" y="3.5" width="6" height="2" opacity="0.5" />
    <rect x="3" y="8" width="30" height="1" class="rule" />
    {#each [10.5, 13.5, 16.5, 19.5, 22.5] as y}
      <rect x="3" {y} width="30" height="1.4" opacity="0.4" />
    {/each}
  {:else if id === 'centered'}
    <rect x="11" y="3" width="14" height="4" />
    <rect x="14" y="8.5" width="8" height="2" opacity="0.5" />
    <rect x="3" y="13" width="9" height="1" class="rule" />
    <rect x="24" y="13" width="9" height="1" class="rule" />
    <rect x="6" y="17" width="24" height="1.6" opacity="0.4" />
    <rect x="9" y="21" width="18" height="1.6" opacity="0.4" />
  {:else if id === 'sidebar'}
    <rect x="3" y="3" width="17" height="4" />
    <rect x="26" y="4" width="7" height="2" opacity="0.5" />
    <rect x="3" y="9.5" width="30" height="1" class="rule" />
    <rect x="3" y="13" width="9" height="10" opacity="0.28" />
    <rect x="15" y="13" width="18" height="1.6" opacity="0.4" />
    <rect x="15" y="17" width="18" height="1.6" opacity="0.4" />
    <rect x="15" y="21" width="12" height="1.6" opacity="0.4" />
  {:else if id === 'timeline'}
    <rect x="3" y="3" width="17" height="4" />
    <rect x="26" y="4" width="7" height="2" opacity="0.5" />
    <rect x="3" y="9.5" width="30" height="1" class="rule" />
    <rect x="5" y="13" width="1" height="10" opacity="0.35" />
    {#each [13, 17.5, 22] as y}
      <circle cx="5.5" cy={y + 0.8} r="1.8" class="rule" />
      <rect x="10" {y} width="23" height="1.6" opacity="0.4" />
    {/each}
  {:else if id === 'ledger'}
    <rect x="3" y="3" width="17" height="4" />
    <rect x="26" y="4" width="7" height="2" opacity="0.5" />
    <rect x="3" y="9.5" width="8" height="1" class="rule" />
    <rect x="13" y="9.5" width="20" height="1" class="rule" />
    {#each [13, 17, 21] as y}
      <rect x="3" {y} width="7" height="1.6" class="rule" opacity="0.55" />
      <rect x="13" {y} width="20" height="1.6" opacity="0.4" />
    {/each}
  {:else if id === 'minimal'}
    <rect x="3" y="3" width="15" height="3.5" />
    <rect x="27" y="4" width="6" height="1.6" opacity="0.5" />
    <rect x="3" y="11" width="7" height="1.4" opacity="0.55" />
    <rect x="3" y="14.5" width="30" height="1.4" opacity="0.35" />
    <rect x="3" y="19" width="6" height="1.4" opacity="0.55" />
    <rect x="3" y="22.5" width="24" height="1.4" opacity="0.35" />
  {:else if id === 'cards'}
    <rect x="3" y="3" width="15" height="3.5" />
    <rect x="27" y="4" width="6" height="1.6" opacity="0.5" />
    <rect x="3" y="9" width="30" height="1" class="rule" />
    {#each [12, 18.5] as y}
      <rect x="3" {y} width="30" height="5" rx="1.4" fill="none" class="card" />
      <rect x="5" y={y + 1.7} width="14" height="1.5" opacity="0.4" />
    {/each}
  {:else if id === 'tech'}
    <rect x="3" y="3" width="15" height="3.5" />
    <rect x="27" y="4" width="6" height="1.6" opacity="0.5" />
    <rect x="3" y="9" width="30" height="1" class="rule" />
    <rect x="3" y="12.5" width="26" height="1.5" opacity="0.4" />
    {#each [[3, 8], [13, 6], [21, 9]] as [x, w]}
      <rect {x} y="17" width={w} height="4" rx="2" fill="none" class="card" />
      <circle cx={x + 2.4} cy="19" r="1" class="rule" />
    {/each}
    <rect x="3" y="23" width="18" height="1.5" opacity="0.4" />
  {:else if id === 'editorial'}
    <rect x="3" y="2.5" width="30" height="1.6" class="rule" />
    <rect x="3" y="6" width="17" height="3.5" />
    <rect x="3" y="11" width="30" height="1" opacity="0.25" />
    {#each [14.5, 20] as y}
      <rect x="3" y={y - 0.5} width="3" height="1.4" class="rule" />
      <rect x="7.5" y={y - 0.5} width="10" height="1.4" opacity="0.45" />
      <rect x="3" y={y + 2.5} width="1.6" height="3.5" class="rule" opacity="0.55" />
      <rect x="7" y={y + 2.7} width="26" height="1.4" opacity="0.4" />
    {/each}
  {:else if id === 'brief'}
    <rect x="3" y="3" width="13" height="3" />
    <rect x="24" y="3.5" width="9" height="2" opacity="0.5" />
    <rect x="3" y="7.5" width="30" height="1" class="rule" />
    {#each [9.5, 12, 14.5] as y}
      <rect x="3" {y} width="7" height="1.3" opacity="0.6" />
      <rect x="11.5" {y} width="21.5" height="1.3" opacity="0.35" />
    {/each}
    {#each [17.5, 20, 22.5] as y}
      <rect x="3" {y} width="13" height="1.3" opacity="0.35" />
      <rect x="20" {y} width="13" height="1.3" opacity="0.35" />
    {/each}
  {:else if id === 'profile'}
    <rect x="3" y="3" width="15" height="3.5" />
    <rect x="3" y="8" width="19" height="1.6" opacity="0.5" />
    <rect x="3" y="11.5" width="30" height="1" class="rule" />
    <rect x="3" y="14" width="18" height="1.6" opacity="0.4" />
    <rect x="3" y="17.5" width="18" height="1.6" opacity="0.4" />
    <rect x="3" y="21" width="12" height="1.6" opacity="0.4" />
    <rect x="24" y="14" width="9" height="9" opacity="0.28" />
    {#each [15.5, 18.5, 21.5] as y}
      <circle cx="26" cy={y} r="1" class="rule" />
      <circle cx="29" cy={y} r="1" class="rule" opacity="0.4" />
    {/each}
  {:else if id === 'dossier'}
    <rect x="3" y="3" width="15" height="3.5" />
    <rect x="27" y="4" width="6" height="1.6" opacity="0.5" />
    <rect x="3" y="9" width="11" height="4" rx="1.2" fill="none" class="card" />
    <rect x="3" y="15" width="19" height="1.6" opacity="0.4" />
    <rect x="25" y="14.8" width="8" height="2.4" rx="1.2" fill="none" class="card" />
    <rect x="3" y="19" width="14" height="4" rx="1.2" fill="none" class="card" />
    <rect x="19" y="19" width="14" height="4" rx="1.2" fill="none" class="card" />
  {:else}
    <rect x="3" y="3" width="30" height="20" rx="2" opacity="0.18" />
    <rect x="7" y="7" width="13" height="3" />
    <rect x="7" y="13" width="22" height="1.6" opacity="0.4" />
    <rect x="7" y="17" width="16" height="1.6" opacity="0.4" />
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
    fill: currentColor;
  }

  /* The accent parts — rules, timeline dots, the logo on a chip. */
  .rule {
    fill: var(--accent-9);
  }

  /* Outlined rather than filled, the way the templates they stand for are. */
  .card {
    stroke: currentColor;
    stroke-width: 0.8;
    opacity: 0.45;
  }
</style>
