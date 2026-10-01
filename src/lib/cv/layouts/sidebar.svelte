<!--
	Sidebar — a rail down the left with skills and lists in it, and everything
	else beside it. The same skeleton as single.svelte in every other respect: a
	layout owns the section markup, so the two files carry a copy each rather
	than one importing the other, and a change to what a section *is* touches
	both. That is the price of a layout being a template you can open and edit.

	See single.svelte for the slot/snippet contract; it is the same here, and
	`body` is the one snippet that differs.
-->
<script>
  import { contact, list, md, sections, techs } from '@cv'

  /** @type {{ cv: any }} */
  let { cv } = $props()

  const secs = $derived(sections(cv))

  /** What goes to the rail unless the section itself says otherwise. */
  const RAIL_TYPES = new Set(['groups', 'list', 'levels'])

  /**
   * The short, listy sections go to the rail by default; any section can opt in
   * or out with `rail: true` / `rail: false` in the YAML. Records stay
   * in the main column, since a certificate carries an issuer and a date and
   * wants the measure for them.
   */
  const rail = $derived(secs.filter((e) => e.sec.rail ?? RAIL_TYPES.has(e.sec.type)))
  const main = $derived(secs.filter((e) => !rail.includes(e)))
</script>

{#snippet secHead(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="sec-head" data-slot="sectionHead">
    <h2 data-src="{path}.title">{@html md(sec.title)}</h2>
    <div class="bar"></div>
  </div>
{/snippet}

{#snippet stackLine(/** @type {any} */ item, /** @type {string} */ path)}
  {#if item.stack}
    <p class="stack" data-slot="stack" data-src="{path}.stack">
      <b>STACK</b> · {@html md(techs(item.stack).join(' · '))}
    </p>
  {/if}
{/snippet}

{#snippet entry(/** @type {any} */ item, /** @type {string} */ path)}
  <div class="job" data-slot="entry" data-src={path}>
    <div class="job-head">
      <p class="job-title" data-src="{path}.title">
        <!-- The space before each of these is written as `{' '}`: Svelte trims
             whitespace at the start of a block, and a newline here would be
             dropped rather than collapsed to the separator it looks like. -->
        {@html md(item.title)}{#if item.org}{' '}<span class="co" data-src="{path}.org"
            >| {@html md(item.org)}</span
          >{/if}{#if item.sideNote}{' '}<span class="side-note" data-src="{path}.sideNote">{@html md(item.sideNote)}</span>{/if}
      </p>
      {#if item.dates}<span class="job-dates" data-src="{path}.dates">{@html md(item.dates)}</span>{/if}
    </div>
    {#if item.sub}
      <p class="job-sub" data-src="{path}.sub">{@html md(item.sub)}</p>
    {/if}
    <ul class="bullets">
      {#each list(item.bullets) as b, j}
        <li data-src="{path}.bullets.{j}">{@html md(b)}</li>
      {/each}
    </ul>
    {@render stackLine(item, path)}
  </div>
{/snippet}

{#snippet summaryBody(/** @type {any} */ sec, /** @type {string} */ path)}
  {#each list(sec.paragraphs) as p, i}
    <p data-src="{path}.paragraphs.{i}">{@html md(p)}</p>
  {/each}
{/snippet}

{#snippet skillsBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="skill-grid" data-slot="skills">
    {#each list(sec.blocks) as b, i}
      <div class="skill-block" data-src="{path}.blocks.{i}">
        <h3 data-src="{path}.blocks.{i}.title">{@html md(b.title)}</h3>
        {#each list(b.rows) as r, j}
          <div class="skill-row" data-src="{path}.blocks.{i}.rows.{j}">
            {#if r.tier}<span class="tier">{@html md(r.tier)}</span> ·
            {/if}{@html md(r.text)}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet listBody(/** @type {any} */ sec, /** @type {string} */ path)}
  {#if sec.inline}
    <div class="tags" data-slot="list">
      {#each list(sec.items) as item, i}
        <span class="tag" data-src="{path}.items.{i}">{@html md(item)}</span>
      {/each}
    </div>
  {:else}
    <ul class="bullets" data-slot="list">
      {#each list(sec.items) as item, i}
        <li data-src="{path}.items.{i}">{@html md(item)}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet langBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="lang-list" data-slot="languages">
    {#each list(sec.items) as item, i}
      <div class="lang-row" data-src="{path}.items.{i}">
        <span class="lang-name" data-src="{path}.items.{i}.name">{@html md(item.name)}</span>
        {#if item.note}<span class="lang-note" data-src="{path}.items.{i}.note">{@html md(item.note)}</span>{/if}
        {#if item.level}<span class="lang-level" data-src="{path}.items.{i}.level">{@html md(item.level)}</span>{/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet certBody(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="cert-list" data-slot="certifications">
    {#each list(sec.items) as item, i}
      <div class="cert" data-src="{path}.items.{i}">
        <div class="cert-body">
          <p class="cert-name" data-src="{path}.items.{i}.name">{@html md(item.name ?? item.title)}</p>
          <!-- The separator is written as `{' · '}` for the reason the entry
               head gives: whitespace at the start of a block is trimmed. -->
          {#if item.issuer || item.note}
            <p class="cert-meta">
              {#if item.issuer}<span class="cert-issuer" data-src="{path}.items.{i}.issuer">{@html md(item.issuer)}</span
                >{/if}{#if item.issuer && item.note}{' · '}{/if}{#if item.note}<span class="cert-note" data-src="{path}.items.{i}.note"
                  >{@html md(item.note)}</span
                >{/if}
            </p>
          {/if}
        </div>
        {#if item.dates}<span class="cert-dates" data-src="{path}.items.{i}.dates">{@html md(item.dates)}</span>{/if}
      </div>
    {/each}
  </div>
{/snippet}

<!-- Not a slot: an `earlier` run has no dates and no stack, so there is nothing
     for an entry variant to vary. It still renders through `entry` for the
     ordinary case, which is what keeps a variant's markup reaching both. -->
{#snippet entries(/** @type {any} */ sec, /** @type {string} */ path)}
  {#each list(sec.items) as item, i}
    {#if item.subtype === 'earlier'}
      <div class="job earlier" data-src="{path}.items.{i}">
        <h3 data-src="{path}.items.{i}.title">{@html md(item.title)}</h3>
        <ul class="bullets">
          {#each list(item.items) as line, j}
            <li data-src="{path}.items.{i}.items.{j}">{@html md(line)}</li>
          {/each}
        </ul>
      </div>
    {:else}
      {@render entry(item, `${path}.items.${i}`)}
    {/if}
  {/each}
{/snippet}

{#snippet block(/** @type {any} */ sec, /** @type {string} */ path)}
  {#if sec.type === 'text'}
    <section class="sec-text" data-slot="summary" data-src={path}>
      {@render secHead(sec, path)}
      {@render summaryBody(sec, path)}
    </section>
  {:else if sec.type === 'groups'}
    <section class="sec-groups" data-src={path}>
      {@render secHead(sec, path)}
      {@render skillsBody(sec, path)}
    </section>
  {:else if sec.type === 'entries'}
    <section class="sec-entries" data-src={path}>
      {@render secHead(sec, path)}
      {@render entries(sec, path)}
    </section>
  {:else if sec.type === 'list'}
    <section class="sec-list" data-src={path}>
      {@render secHead(sec, path)}
      {@render listBody(sec, path)}
    </section>
  {:else if sec.type === 'levels'}
    <section class="sec-levels" data-src={path}>
      {@render secHead(sec, path)}
      {@render langBody(sec, path)}
    </section>
  {:else if sec.type === 'records'}
    <section class="sec-records" data-src={path}>
      {@render secHead(sec, path)}
      {@render certBody(sec, path)}
    </section>
  {:else if sec.type === 'table'}
    <section class="sec-table" data-src={path}>
      {@render secHead(sec, path)}
      <table class="cv-table">
        {#if list(sec.columns).length}
          <thead>
            <tr>
              {#each list(sec.columns) as col, k}
                <th data-src="{path}.columns.{k}">{@html md(col)}</th>
              {/each}
            </tr>
          </thead>
        {/if}
        <tbody>
          {#each list(sec.items) as row, i}
            <tr data-src="{path}.items.{i}">
              <td class="label" data-src="{path}.items.{i}.name">{@html md(row.name)}</td>
              <td class="value" data-src="{path}.items.{i}.value">{@html md(row.value)}</td>
              <td data-src="{path}.items.{i}.desc">{@html md(row.desc)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {:else}
    <p class="cv-unknown" data-src="{path}.type">
      Unknown section type: {@html md(sec.type)}
    </p>
  {/if}
{/snippet}

{#snippet head()}
  <header data-slot="header" data-src="header">
    <div>
      <h1 class="name" data-src="header.name">{@html md(cv.header?.name)}</h1>
      <p class="role" data-src="header.role">{@html md(cv.header?.role)}</p>
    </div>
    <div class="contact">
      {#each list(cv.header?.contact) as line, i}{#if i > 0}<br />{/if}<span data-src="header.contact.{i}">{@html contact(line)}</span>{/each}
    </div>
  </header>
{/snippet}

{#snippet body()}
  {@render head()}
  <div class="cv-cols">
    <aside class="cv-rail">
      {#each rail as e}{@render block(e.sec, e.path)}{/each}
    </aside>
    <div class="cv-main">
      {#each main as e}{@render block(e.sec, e.path)}{/each}
    </div>
  </div>
{/snippet}

<div class="sheet" data-slot="page">
  {@render body()}
</div>

<style>
  .cv-cols {
    display: flex;
    align-items: flex-start;
    gap: 26px;
    margin-top: 4px;
  }

  .cv-rail {
    flex: 0 0 31%;
    min-width: 0;
    padding-right: 24px;
    border-right: 1px solid var(--line);
  }

  .cv-main {
    flex: 1;
    min-width: 0;
  }

  /* One column is all the rail has room for, so every two-up grid in here folds
	   and the second block gets back the divider cv.css suppresses for a first
	   row of two. Written for whatever ends up in the rail rather than for skills
	   alone: any section can be sent in here with `rail: true`. */
  .cv-rail .skill-grid,
  .cv-rail .lang-list,
  .cv-rail .cert-list {
    /* `minmax(0, 1fr)` rather than `1fr`: a grid track's automatic minimum is
	     the min-content of what is in it, so a plain `1fr` lets a long line push
	     the track — and the rail with it — wider than the column it was given. */
    grid-template-columns: minmax(0, 1fr);
  }

  .cv-rail .skill-block:nth-child(2),
  .cv-rail .lang-row:nth-child(2) {
    border-top: 1px solid var(--line);
  }

  /* The skills-rows variant hangs its titles in a gutter as wide as the rail
	   itself, which has nowhere to go in here — so in the rail they go back above
	   their rows. The same rule reaches the ledger-style gutter on a section
	   title, for the same reason. */
  .cv-rail .skill-block {
    padding-left: 0;
  }

  .cv-rail .skill-block h3 {
    position: static;
    width: auto;
  }

  /* A third of a measure is narrow enough that anything which would rather not
	   wrap has to be made to: a long token in a skill row, and the chips, which
	   are drawn `nowrap` because on a full measure they should be. */
  .cv-rail {
    overflow-wrap: break-word;
  }

  /* A chip is drawn `nowrap` because on a full measure it should be one line.
	   In a third of a measure `TypeScript/JavaScript` is wider than the column,
	   so in here it may break wherever it has to.

	   `:global` because a chip is a chip variant's markup rather than this
	   layout's: read on its own this file renders none, and the compiler would
	   drop the rule as unused. Composed, the two land in the same component with
	   the same specificity, and this block is concatenated last. */
  .cv-rail :global(.tech) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  /* A heading is `nowrap` on a full measure and can't be in here: at a third of
	   one, "Certifications & Permits" — or a numbered one — is wider than the
	   column, and a heading that won't wrap pushes its own rule off the page. */
  .cv-rail .sec-head {
    flex-wrap: wrap;
  }

  .cv-rail .sec-head h2 {
    letter-spacing: 1.6px;
    white-space: normal;
  }

  .cv-rail .skill-row {
    min-width: 0;
  }

  /* A pill wide enough to wrap in a 31% rail reads worse than a line does, so
	   an inline list keeps the spacing in here and loses the shape. */
  .cv-rail .tags {
    display: block;
  }

  .cv-rail .tag {
    display: block;
    padding: 1px 0;
    border: none;
    border-radius: 0;
    font-size: var(--cv-fs-md);
  }

  @media print {
    .cv-rail {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
