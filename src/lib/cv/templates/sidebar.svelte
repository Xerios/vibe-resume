<!--
	Sidebar — skills in a left rail beside everything else. The two columns are
	real elements here rather than a CSS trick, so nothing depends on the order
	the sections appear in the YAML.

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

  /**
   * Skills go to the rail by default; any section can opt in or out with
   * `rail: true` / `rail: false` in the YAML.
   */
  const rail = $derived(secs.filter((e) => e.sec.rail ?? e.sec.type === 'skills'))
  const main = $derived(secs.filter((e) => !rail.includes(e)))
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
  <div class="cv-cols">
    <aside class="cv-rail">
      {#each rail as e}{@render block(e.sec, e.path)}{/each}
    </aside>
    <div class="cv-main">
      {#each main as e}{@render block(e.sec, e.path)}{/each}
    </div>
  </div>
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

  @media print {
    .cv-rail {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
