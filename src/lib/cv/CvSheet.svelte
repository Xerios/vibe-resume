<script>
	import { marked } from "marked";
	import { DEFAULT_LAYOUT } from "./presets.js";

	/** @type {{ cv: any, layout?: string }} */
	let { cv, layout = DEFAULT_LAYOUT } = $props();

	/**
	 * Inline Markdown → HTML. Links get target/rel, which marked won't add itself.
	 * @param {unknown} text
	 */
	function md(text) {
		if (!text) return "";
		const html = marked.parseInline(String(text).trim());
		return String(html).replace(
			/<a href=/g,
			'<a target="_blank" rel="noopener" href=',
		);
	}

	/**
	 * @param {unknown} v
	 * @returns {any[]}
	 */
	const list = (v) => (Array.isArray(v) ? v : []);

	/**
	 * Sections paired with their path into the YAML — `data-src` on the rendered
	 * elements is what lets the page scroll the editor to the matching line (see
	 * `buildLineMap` in render.js). The index has to be taken before filtering,
	 * or every path past a dropped section would point one entry too far.
	 */
	const sections = $derived(
		list(cv.sections)
			.map((sec, i) => ({ sec, path: `sections.${i}` }))
			.filter((e) => e.sec && typeof e.sec === "object"),
	);

	/**
	 * The sidebar layout is the only one that needs sections split across two
	 * columns. Skills go to the rail by default; any section can opt in or out
	 * with `rail: true` / `rail: false` in the YAML.
	 */
	const rail = $derived(
		layout === "sidebar"
			? sections.filter((e) => e.sec.rail ?? e.sec.type === "skills")
			: [],
	);
	const main = $derived(sections.filter((e) => !rail.includes(e)));
</script>

{#snippet secHead(/** @type {any} */ sec, /** @type {string} */ path)}
	<div class="sec-head">
		<h2 data-src="{path}.title">{@html md(sec.title)}</h2>
		<div class="bar"></div>
	</div>
{/snippet}

{#snippet block(/** @type {any} */ sec, /** @type {string} */ path)}
	{#if sec.type === "summary"}
		<section class="sec-summary" data-src={path}>
			{@render secHead(sec, path)}
			{#each list(sec.paragraphs) as p, i}
				<p data-src="{path}.paragraphs.{i}">{@html md(p)}</p>
			{/each}
		</section>
	{:else if sec.type === "skills"}
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
	{:else if sec.type === "experience"}
		<section class="sec-experience" data-src={path}>
			{@render secHead(sec, path)}
			{#each list(sec.items) as item, i}
				{#if item.subtype === "earlier"}
					<div class="earlier" data-src="{path}.items.{i}">
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
								<span class="co" data-src="{path}.items.{i}.company"
									>| {@html md(item.company)}</span
								>{#if item.sideNote}
									<span class="side-note" data-src="{path}.items.{i}.sideNote"
										>{@html md(item.sideNote)}</span
									>{/if}
							</p>
							<span class="job-dates" data-src="{path}.items.{i}.dates"
								>{@html md(item.dates)}</span
							>
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
	{:else if sec.type === "oss"}
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
							<td class="proj" data-src="{path}.projects.{i}.name"
								>{@html md(p.name)}</td
							>
							<td class="stars" data-src="{path}.projects.{i}.stars"
								>{@html md(p.stars)}</td
							>
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

<div class="sheet">
	<header data-src="header">
		<div>
			<h1 class="name" data-src="header.name">{@html md(cv.header?.name)}</h1>
			<p class="role" data-src="header.role">{@html md(cv.header?.role)}</p>
		</div>
		<div class="contact">
			{#each list(cv.header?.contact) as line, i}{#if i > 0}<br
					/>{/if}<span data-src="header.contact.{i}">{@html md(line)}</span
				>{/each}
		</div>
	</header>

	{#if layout === "sidebar"}
		<div class="cv-cols">
			<aside class="cv-rail">
				{#each rail as e}{@render block(e.sec, e.path)}{/each}
			</aside>
			<div class="cv-main">
				{#each main as e}{@render block(e.sec, e.path)}{/each}
			</div>
		</div>
	{:else}
		{#each sections as e}{@render block(e.sec, e.path)}{/each}
	{/if}
</div>
