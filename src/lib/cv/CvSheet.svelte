<script>
	import { marked } from 'marked';

	let { cv } = $props();

	/**
	 * Inline Markdown → HTML. Links get target/rel, which marked won't add itself.
	 * @param {unknown} text
	 */
	function md(text) {
		if (!text) return '';
		const html = marked.parseInline(String(text).trim());
		return String(html).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
	}

	/**
	 * @param {unknown} v
	 * @returns {any[]}
	 */
	const list = (v) => (Array.isArray(v) ? v : []);
</script>

{#snippet secHead(/** @type {unknown} */ title)}
	<div class="sec-head"><h2>{@html md(title)}</h2><div class="bar"></div></div>
{/snippet}

<div class="sheet">
	<header>
		<div>
			<h1 class="name">{@html md(cv.header?.name)}</h1>
			<p class="role">{@html md(cv.header?.role)}</p>
		</div>
		<div class="contact">
			{#each list(cv.header?.contact) as line, i}{#if i > 0}<br />{/if}{@html md(line)}{/each}
		</div>
	</header>

	{#each list(cv.sections) as sec}
		{#if sec && typeof sec === 'object'}
			{#if sec.type === 'summary'}
				<section class="summary">
					{@render secHead(sec.title)}
					{#each list(sec.paragraphs) as p}
						<p>{@html md(p)}</p>
					{/each}
				</section>
			{:else if sec.type === 'skills'}
				<section>
					{@render secHead(sec.title)}
					<div class="skill-grid">
						{#each list(sec.blocks) as b}
							<div class="skill-block">
								<h3>{@html md(b.title)}</h3>
								{#each list(b.rows) as r}
									<div class="skill-row">{#if r.tier}<span class="tier">{@html md(r.tier)}</span> · {/if}{@html md(r.text)}</div>
								{/each}
							</div>
						{/each}
					</div>
				</section>
			{:else if sec.type === 'experience'}
				<section>
					{@render secHead(sec.title)}
					{#each list(sec.items) as item}
						{#if item.subtype === 'earlier'}
							<div class="job earlier">
								<h3>{@html md(item.title)}</h3>
								<ul class="bullets">
									{#each list(item.items) as line}
										<li>{@html md(line)}</li>
									{/each}
								</ul>
							</div>
						{:else}
							<div class="job">
								<div class="job-head">
									<p class="job-title">{@html md(item.title)} <span class="co">| {@html md(item.company)}</span>{#if item.sideNote} <span class="side-note">{@html md(item.sideNote)}</span>{/if}</p>
									<span class="job-dates">{@html md(item.dates)}</span>
								</div>
								<p class="job-sub">{@html md(item.sub)}</p>
								<ul class="bullets">
									{#each list(item.bullets) as b}
										<li>{@html md(b)}</li>
									{/each}
								</ul>
								{#if item.stack}
									<p class="stack"><b>STACK</b> · {@html md(item.stack)}</p>
								{/if}
							</div>
						{/if}
					{/each}
				</section>
			{:else if sec.type === 'oss'}
				<section>
					{@render secHead(sec.title)}
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
							{#each list(sec.projects) as p}
								<tr>
									<td class="proj">{@html md(p.name)}</td>
									<td class="stars">{@html md(p.stars)}</td>
									<td>{@html md(p.desc)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{:else}
				<p class="cv-unknown">Unknown section type: {@html md(sec.type)}</p>
			{/if}
		{/if}
	{/each}
</div>
