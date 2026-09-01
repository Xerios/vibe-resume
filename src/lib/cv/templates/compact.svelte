<!--
	Compact — tighter type and three skill columns, for a CV that has outgrown
	one page.

	A template is a Svelte component handed the parsed YAML as `cv`. It renders
	inside the preview frame on top of cv.css, whose class names the markup below
	spends; this file's own <style> block is where a layout says how it differs.

	Keep the `data-src` paths: they are what ties an element back to the line of
	YAML behind it, and so what makes the two panes follow each other.
-->
<script>
  import { list, md, sections, techs } from '@cv'

  /** @type {{ cv: any }} */
  let { cv } = $props()

  const secs = $derived(sections(cv))
</script>

{#snippet secHead(/** @type {any} */ sec, /** @type {string} */ path)}
  <div class="sec-head">
    <h2 data-src="{path}.title">{@html md(sec.title)}</h2>
    <div class="bar"></div>
  </div>
{/snippet}

{#snippet stackLine(/** @type {any} */ item, /** @type {string} */ path)}
  {#if item.stack}
    <p class="stack" data-src="{path}.stack">
      <b>STACK</b> · {@html md(techs(item.stack).join(' · '))}
    </p>
  {/if}
{/snippet}

{#snippet entry(/** @type {any} */ item, /** @type {string} */ path)}
  <div class="job" data-src={path}>
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
    <section class="sec-summary" data-src={path}>
      {@render secHead(sec, path)}
      {#each list(sec.paragraphs) as p, i}
        <p data-src="{path}.paragraphs.{i}">{@html md(p)}</p>
      {/each}
    </section>
  {:else if sec.type === 'skills'}
    <section class="sec-skills" data-src={path}>
      {@render secHead(sec, path)}
      <div class="skill-grid">
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
      {#if sec.inline}
        <div class="tags">
          {#each list(sec.items) as item, i}
            <span class="tag" data-src="{path}.items.{i}">{@html md(item)}</span>
          {/each}
        </div>
      {:else}
        <ul class="bullets">
          {#each list(sec.items) as item, i}
            <li data-src="{path}.items.{i}">{@html md(item)}</li>
          {/each}
        </ul>
      {/if}
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
  <header data-src="header">
    <div>
      <h1 class="name" data-src="header.name">{@html md(cv.header?.name)}</h1>
      <p class="role" data-src="header.role">{@html md(cv.header?.role)}</p>
    </div>
    <div class="contact">
      {#each list(cv.header?.contact) as line, i}{#if i > 0}<br />{/if}<span data-src="header.contact.{i}">{@html md(line)}</span>{/each}
    </div>
  </header>
{/snippet}

<div class="sheet">
  {@render head()}
  {#each secs as e}{@render block(e.sec, e.path)}{/each}
</div>

<style>
  .sheet {
    max-width: 780px;
    padding: 30px 40px 28px;
    font-size: 12.5px;
    line-height: 1.38;
  }

  .sheet header {
    padding-bottom: 11px;
  }

  .name {
    font-size: 26px;
  }

  .sheet section {
    margin-top: 14px;
  }

  .sec-head {
    margin-bottom: 7px;
  }

  .skill-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2px 22px;
  }

  /* The three-up grid moves the first-row boundary along by one block. */
  .skill-block:nth-child(3) {
    border-top: none;
  }

  .skill-row {
    font-size: 11px;
  }

  .job {
    margin-bottom: 9px;
  }

  .job-title {
    font-size: 13px;
  }

  .job-sub {
    margin: 1px 0 4px;
  }

  ul.bullets li {
    font-size: 11.5px;
    margin-bottom: 2px;
  }

  @media print {
    .sheet {
      font-size: 9.5pt !important;
    }
  }
</style>
