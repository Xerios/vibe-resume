<!--
	The tools as a line, without the STACK label in front of them — the same
	information, one word quieter.
-->
<script>
  import { md, techs } from '@cv'
</script>

{#snippet stackLine(/** @type {any} */ item, /** @type {string} */ path)}
  {#if item.stack}
    <p class="stack" data-slot="stack" data-src="{path}.stack">
      {@html md(techs(item.stack).join(' · '))}
    </p>
  {/if}
{/snippet}
