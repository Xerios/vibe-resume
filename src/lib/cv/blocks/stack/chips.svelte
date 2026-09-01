<!--
	An entry's tools as chips, each with its brand logo — Tech's, and the one
	stack variant that needs markup rather than CSS, since a logo has to come
	from `techIcon`.

	A variant file is an ordinary Svelte component so that `svelte-check` reads
	it. compose.js keeps its snippets and its style and drops everything else,
	so the script here is for the type checker rather than for the sheet. The
	snippet name is the contract with the layouts — see the list at the top of
	layouts/single.svelte.
-->
<script>
  import { md, techIcon, techs } from '@cv'
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

{#snippet stackLine(/** @type {any} */ item, /** @type {string} */ path)}
  {#if item.stack}
    <div class="stack chips" data-slot="stack" data-src="{path}.stack">
      {#each techs(item.stack) as t}{@render chip(t, null)}{/each}
    </div>
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

  .stack.chips {
    margin-top: 7px;
  }
</style>
