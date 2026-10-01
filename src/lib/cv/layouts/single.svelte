<!--
	Single column — the skeleton most composed sheets are built from: the markup for all seven
	section types, and one snippet per slot that a block variant can replace.

	This file is a complete, working template on its own — it is what `classic`
	used to be — and that is deliberate. The default variant of every slot *is*
	the snippet defined here, so composing with nothing chosen hands back this
	source verbatim, and `svelte-check` type-checks the whole sheet rather than a
	pile of fragments that only mean something once assembled.

	A variant overrides a snippet by name (see compose.js). The names are the
	contract, so don't rename one without changing slots.js with it:

	  head()                 header        the top of the sheet
	  secHead(sec, path)     sectionHead   a section's title
	  summaryBody(sec, path) summary       a `text` section's paragraphs
	  entry(item, path)      entry         one role, degree or project
	  skillsBody(sec, path)  skills        a `groups` section's blocks
	  stackLine(item, path)  stack         an entry's tools
	  listBody(sec, path)    list          a `list` section's items
	  langBody(sec, path)    languages     a `levels` section's rows
	  certBody(sec, path)    certifications  a `records` section's rows
	  body()                 page          the arrangement of the whole sheet

	`data-slot` names the block a piece of the sheet was rendered by, so a
	variant that overrides a snippet carries the same attribute the default does.
	Nothing reads it since the block picker was removed. `data-src` is the older
	one and unrelated: it ties an element back to the line of YAML behind it, and
	is what makes the two panes follow each other.
-->
<script>
  import { list, md, sections, techs } from '@cv'

  /** @type {{ cv: any }} */
  let { cv } = $props()

  const secs = $derived(sections(cv))
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
      {#each list(cv.header?.contact) as line, i}{#if i > 0}<br />{/if}<span data-src="header.contact.{i}">{@html md(line)}</span>{/each}
    </div>
  </header>
{/snippet}

{#snippet body()}
  {@render head()}
  {#each secs as e}{@render block(e.sec, e.path)}{/each}
{/snippet}

<div class="sheet" data-slot="page">
  {@render body()}
</div>
