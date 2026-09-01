<!--
	Every skill as a chip with its logo, the tier kept as a label in front of the
	row it belongs to. `techs` is what splits a row's text into tools, so a row
	written as prose (`React, Node.js, PostgreSQL`) chips as readily as a list.
-->
<script>
  import { list, md, techIcon, techs } from '@cv'
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

{#snippet skillsBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="skill-grid" data-slot="skills">
    {#each list(sec.blocks) as b, i}
      <div class="skill-block" data-src="{path}.blocks.{i}">
        <h3 data-src="{path}.blocks.{i}.title">{@html md(b.title)}</h3>
        {#each list(b.rows) as r, j}
          <div class="skill-row chips" data-src="{path}.blocks.{i}.rows.{j}">
            {#if r.tier}<span class="tier">{@html md(r.tier)}</span>{/if}
            {#each techs(r.text) as t}{@render chip(t, null)}{/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
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
    font-size: 10px;
    line-height: 1.7;
    color: var(--muted);
    white-space: nowrap;
  }

  /* The `<svg>` techIcon hands back is injected rather than written here, so
	   the compiler puts no scoping class on it; :global is how the rule reaches
	   it. Its size comes from the 1em it was drawn at, against this font-size. */
  .tech .logo {
    display: inline-flex;
    font-size: 11.5px;
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

  .skill-row.chips {
    margin: 3px 0 6px;
  }

  .tier {
    margin-right: 2px;
  }
</style>
