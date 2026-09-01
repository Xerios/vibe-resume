<!--
	Minimal — no rules, no filled marks, nothing but type and the space around
	it. Sections are told apart by how far they sit from each other.

	The one thing it keeps from cv.css is the line under the name, and even that
	is thinned. It is the quietest of the nine on paper, and the cheapest to
	print: there is almost nothing on it that isn't text.

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
    max-width: 760px;
    padding: 48px 54px 40px;
    font-size: 13px;
    line-height: 1.52;
  }

  .sheet header {
    align-items: baseline;
    padding-bottom: 4px;
    border-bottom-width: 1px;
  }

  .name {
    font-size: 27px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }

  .role {
    color: var(--muted);
    font-weight: 500;
  }

  .contact {
    color: var(--faint);
  }

  /* Space is the only separator, so there is more of it. */
  .sheet section {
    margin-top: 26px;
  }

  .sec-head {
    margin-bottom: 8px;
  }

  .sec-head h2 {
    font-size: 9.5px;
    letter-spacing: 3.2px;
    color: var(--faint);
  }

  .sec-head .bar {
    display: none;
  }

  .skill-block {
    padding: 4px 0;
    border-top: none;
  }

  .job-title {
    font-size: 13.5px;
    font-weight: 600;
  }

  .job-title .co {
    color: var(--ink);
    font-weight: 400;
  }

  /* A rule rather than a diamond: nothing on this sheet is filled in, which is
	   also why none of it depends on a printer's background graphics. */
  ul.bullets li::before {
    top: 9px;
    width: 6px;
    height: 0;
    background: none;
    border-top: 1px solid var(--faint);
    border-radius: 0;
    transform: none;
  }

  .earlier ul.bullets li::before {
    top: 9px;
    width: 6px;
    height: 0;
    border-radius: 0;
  }

  .stack {
    color: var(--faint);
  }

  table.oss thead th {
    border-bottom-color: var(--line);
  }
</style>
