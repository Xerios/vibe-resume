<!--
	An `inline: true` list as logo chips — certifications and tools read as the
	same kind of thing as an entry's stack when they are set the same way.

	A list that isn't inline stays a run of bullets: pills on separate lines
	would be a worse list, not a different-looking one.
-->
<script>
  import { list, md, techIcon } from '@cv'
</script>

<!-- Repeated verbatim in the other chip variants rather than shared. A variant
     has to stand on its own — `skills` is free to be chips while `stack` is a
     plain line — and compose.js drops the duplicate definition when more than
     one of them is chosen at once. -->
{#snippet chip(/** @type {string} */ text, /** @type {string | null} */ path)}
  {@const icon = techIcon(text)}
  <span class="tech" data-src={path}
    >{#if icon}<span class="logo">{@html icon}</span>{/if}{@html md(text)}</span
  >
{/snippet}

{#snippet listBody(/** @type {any} */ sec, /** @type {string} */ path)}
  {#if sec.inline}
    <div class="tags chips" data-slot="list">
      {#each list(sec.items) as item, i}{@render chip(item, `${path}.items.${i}`)}{/each}
    </div>
  {:else}
    <ul class="bullets" data-slot="list">
      {#each list(sec.items) as item, i}
        <li data-src="{path}.items.{i}">{@html md(item)}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 4px;
  }

  .tech {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px 1px 6px;
    border: 1px solid var(--line);
    border-radius: 100px;
    font-family: var(--mono);
    font-size: var(--cv-fs-xs);
    line-height: 1.7;
    color: var(--muted);
    white-space: nowrap;
  }

  /* The `<svg>` techIcon hands back is injected rather than written here, so
	   the compiler puts no scoping class on it; :global is how the rule reaches
	   it. Its size comes from the 1em it was drawn at, against this font-size. */
  .tech .logo {
    display: inline-flex;
    font-size: var(--cv-fs-sm);
    color: var(--accent-deep);
  }

  .tech .logo :global(svg) {
    display: block;
  }

  @media print {
    .tech {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  .tags.chips {
    gap: 3px 4px;
  }
</style>
