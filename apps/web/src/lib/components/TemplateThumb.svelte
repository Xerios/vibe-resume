<script>
  /**
   * A layout's thumbnail: the wireframe drawn beside its name in the Style
   * panel. A sketch says which side the rail is on faster than a name does.
   */

  /** @type {{ id: string }} */
  let { id } = $props()
</script>

<svg viewBox="0 0 36 26" aria-hidden="true">
  <rect x="3" y="3" width="17" height="4" />
  <rect x="26" y="4" width="7" height="2" opacity="0.5" />
  <rect x="3" y="9.5" width="30" height="1" class="rule" />
  {#if id === 'sidebar'}
    <rect x="3" y="13" width="9" height="10" opacity="0.28" />
    <rect x="15" y="13" width="18" height="1.6" opacity="0.4" />
    <rect x="15" y="17" width="18" height="1.6" opacity="0.4" />
    <rect x="15" y="21" width="12" height="1.6" opacity="0.4" />
  {:else if id === 'rail-right'}
    <rect x="3" y="13" width="18" height="1.6" opacity="0.4" />
    <rect x="3" y="17" width="18" height="1.6" opacity="0.4" />
    <rect x="3" y="21" width="12" height="1.6" opacity="0.4" />
    <rect x="24" y="13" width="9" height="10" opacity="0.28" />
  {:else}
    <rect x="3" y="13" width="30" height="1.6" opacity="0.4" />
    <rect x="3" y="17" width="30" height="1.6" opacity="0.4" />
    <rect x="3" y="21" width="21" height="1.6" opacity="0.4" />
  {/if}
</svg>

<style lang="scss">
  svg {
    width: 100%;
    height: auto;
    fill: currentColor;
  }

  /* The accent part — the rule under the header. */
  .rule {
    fill: var(--ds-icon-brand);
  }
</style>
