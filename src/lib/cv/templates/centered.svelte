<!--
	Centered — header and section titles centred, the rules growing a second
	arm so each title sits between them.

	A template is a Svelte component handed the parsed YAML as `cv`. It renders
	inside the preview frame on top of cv.css, whose class names the markup below
	spends; this file's own <style> block is where a layout says how it differs.

	Keep the `data-src` paths: they are what ties an element back to the line of
	YAML behind it, and so what makes the two panes follow each other.
-->
<script>
  import { list, md, sections } from '@cv'

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
          <div class="job" data-src="{path}.items.{i}">
            <div class="job-head">
              <p class="job-title" data-src="{path}.items.{i}.title">
                {@html md(item.title)}
                <span class="co" data-src="{path}.items.{i}.company">| {@html md(item.company)}</span>{#if item.sideNote}
                  <span class="side-note" data-src="{path}.items.{i}.sideNote">{@html md(item.sideNote)}</span>{/if}
              </p>
              <span class="job-dates" data-src="{path}.items.{i}.dates">{@html md(item.dates)}</span>
            </div>
            <p class="job-sub" data-src="{path}.items.{i}.sub">
              {@html md(item.sub)}
            </p>
            <ul class="bullets">
              {#each list(item.bullets) as b, j}
                <li data-src="{path}.items.{i}.bullets.{j}">{@html md(b)}</li>
              {/each}
            </ul>
            {#if item.stack}
              <p class="stack" data-src="{path}.items.{i}.stack">
                <b>STACK</b> · {@html md(item.stack)}
              </p>
            {/if}
          </div>
        {/if}
      {/each}
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
  .sheet header {
    display: block;
    text-align: center;
  }

  .contact {
    text-align: center;
    margin-top: 9px;
    white-space: normal;
    line-height: 1.7;
  }

  /* The second arm: cv.css draws the rule after the title, this one before it. */
  .sec-head::before {
    content: '';
    height: 1px;
    flex: 1;
    border-top: 1px solid var(--line);
  }

  .sec-summary {
    text-align: center;
    max-width: 92%;
    margin-inline: auto;
  }
</style>
