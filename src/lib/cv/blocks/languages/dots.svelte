<!--
	A five-dot meter beside every language instead of the level in words. The
	level itself is still what the YAML writes — `Native`, `C2`, `Professional` —
	and `levelRating` in @cv is what reads any of those as a number, so nothing
	in the document has to be written for this variant in particular.

	A level it can't read comes back as 0, and that is the signal to print the
	words after all rather than five empty dots, which would say the opposite of
	what the CV meant.

	A variant file is an ordinary Svelte component so that `svelte-check` reads
	it; compose.js keeps its snippets and its style and drops the rest. The
	snippet name is the contract with the layouts — see layouts/single.svelte.
-->
<script>
  import { levelRating, list, md } from '@cv'
</script>

{#snippet langBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="lang-list dots" data-slot="languages">
    {#each list(sec.items) as item, i}
      {@const score = levelRating(item)}
      <div class="lang-row" data-src="{path}.items.{i}">
        <span class="lang-name" data-src="{path}.items.{i}.name">{@html md(item.name)}</span>
        {#if score}
          <span class="lang-dots" title={item.level}>
            {#each [1, 2, 3, 4, 5] as step}<span class="lang-dot" class:on={step <= score}></span>{/each}
          </span>
        {:else if item.level}
          <span class="lang-level" data-src="{path}.items.{i}.level">{@html md(item.level)}</span>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<style>
  .lang-dots {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 3px;
  }

  /* A filled dot is a 7px box whose border is thick enough to close it, rather
	   than a background: a background is what Chrome stops painting when
	   "Background graphics" is off, and a meter that prints empty is worse than
	   no meter. */
  .lang-dot {
    width: 7px;
    height: 7px;
    border: 1px solid var(--line);
    border-radius: 50%;
  }

  .lang-dot.on {
    border: 3.5px solid var(--accent);
  }
</style>
