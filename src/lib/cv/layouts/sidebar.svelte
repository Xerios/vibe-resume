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
  import { list, md, sections, techs } from '@cv'

  /** @type {{ cv: any }} */
  let { cv } = $props()

  const secs = $derived(sections(cv))

  /**
   * Skills go to the rail by default; any section can opt in or out with
   * `rail: true` / `rail: false` in the YAML.
   */
  const rail = $derived(secs.filter((e) => e.sec.rail ?? (e.sec.type === 'skills' || e.sec.type === 'list')))
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
        {@html md(item.title)}{#if item.company || item.school}{' '}<span class="co" data-src={item.company ? `${path}.company` : `${path}.school`}
            >| {@html md(item.company ?? item.school)}</span
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
  {#if sec.type === 'summary'}
    <section class="sec-summary" data-slot="summary" data-src={path}>
      {@render secHead(sec, path)}
      {@render summaryBody(sec, path)}
    </section>
  {:else if sec.type === 'skills'}
    <section class="sec-skills" data-src={path}>
      {@render secHead(sec, path)}
      {@render skillsBody(sec, path)}
    </section>
  {:else if sec.type === 'experience'}
    <section class="sec-experience" data-src={path}>
      {@render secHead(sec, path)}
      {@render entries(sec, path)}
    </section>
  {:else if sec.type === 'education'}
    <section class="sec-education" data-src={path}>
      {@render secHead(sec, path)}
      {@render entries(sec, path)}
    </section>
  {:else if sec.type === 'projects'}
    <section class="sec-projects" data-src={path}>
      {@render secHead(sec, path)}
      {@render entries(sec, path)}
    </section>
  {:else if sec.type === 'list'}
    <section class="sec-list" data-src={path}>
      {@render secHead(sec, path)}
      {@render listBody(sec, path)}
    </section>
  {:else if sec.type === 'oss'}
    <section class="sec-oss" data-src={path}>
      {@render secHead(sec, path)}
      <table class="oss">
        {#if sec.hasHeader}
          <thead>
            <tr>
              <th>Project</th>
              <th>Stars / Users</th>
              <th>Description</th>
            </tr>
          </thead>
        {/if}
        <tbody>
          {#each list(sec.projects) as p, i}
            <tr data-src="{path}.projects.{i}">
              <td class="proj" data-src="{path}.projects.{i}.name">{@html md(p.name)}</td>
              <td class="stars" data-src="{path}.projects.{i}.stars">{@html md(p.stars)}</td>
              <td data-src="{path}.projects.{i}.desc">{@html md(p.desc)}</td>
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

  /* One column of skills is all the rail has room for, so every block after
	   the first needs the divider that cv.css's two-up grid suppresses. */
  .cv-rail .skill-grid {
    grid-template-columns: 1fr;
  }

  .cv-rail .skill-block:nth-child(2) {
    border-top: 1px solid var(--line);
  }

  .cv-rail .sec-head h2 {
    letter-spacing: 1.6px;
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
    font-size: 12px;
  }

  @media print {
    .cv-rail {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
