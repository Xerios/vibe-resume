<!--
	The same reading of a language's level as the dots variant, drawn as a bar
	instead: a track the width of the column with the level's share of it filled
	in. Reads as a measurement where the dots read as a rating, which is the
	whole difference between them.

	`levelRating` is what turns `Native` or `C1` into the fifths the bar is drawn
	in; a level it can't read prints as the words it was written as.
-->
<script>
  import { levelRating, list, md } from '@cv'
</script>

{#snippet langBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="lang-list bars" data-slot="languages">
    {#each list(sec.items) as item, i}
      {@const score = levelRating(item)}
      <div class="lang-row" data-src="{path}.items.{i}">
        <span class="lang-name" data-src="{path}.items.{i}.name">{@html md(item.name)}</span>
        {#if score}
          <span class="lang-bar" title={item.level}>
            <span class="lang-fill" style:width="{score * 20}%"></span>
          </span>
        {:else if item.level}
          <span class="lang-level" data-src="{path}.items.{i}.level">{@html md(item.level)}</span>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<style>
  /* Both halves are rules rather than fills, so the bar prints: a border is
	   painted whatever the print dialog says about background graphics. The fill
	   sits on top of the track and is only ever as wide as its share. */
  .lang-bar {
    position: relative;
    flex: 0 0 74px;
    align-self: center;
    height: 0;
    border-top: 3px solid var(--line);
  }

  .lang-fill {
    position: absolute;
    left: 0;
    top: -3px;
    height: 0;
    border-top: 3px solid var(--accent);
  }
</style>
