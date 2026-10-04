<script>
  /**
   * The CV as HTML: a straight walk over the model in render/model.js. This
   * is the one layout there is. The PDF is drawn from what this lays out,
   * measured by pdf/measure.js.
   *
   * The DOM comes out in the model's reading order, and the stylesheet decides
   * where each part is drawn. Every node that stands for a YAML value carries
   * its path as `data-src`, which is what the page uses to tie the preview back
   * to the editor.
   *
   * What a block variant changes arrives as a property on a node (`frame`,
   * `display`, `marker`, `head`, a header `style`), and lands here as a class or
   * a data attribute for sheet.css to draw. Decoration is a real element rather
   * than a CSS pseudo-element, so that measure.js can find it: rules, marks, a
   * chip's logo, a section's number. Every piece of it is `aria-hidden`, which is
   * also what tells measure.js to draw it as an artifact.
   *
   * What the PDF should know beyond what is printed rides on attributes:
   * `data-actual` is what a styled span says (a date range spelled out),
   * `<time datetime>` each end of it, `data-title` a section's title, and `lang`
   * the CV's language.
   *
   * Styleless on purpose: this is mounted into the preview frame, and a scoped
   * style block here would compile into the app's stylesheet instead. The rules
   * are html/sheet.css and html/sheet-css.js, both written into the frame.
   *
   * Every block that contains text starts and ends on its element, with no
   * whitespace around it: Svelte trims whitespace at the edges of a block, and
   * that is what keeps two runs from being set apart by a space nobody wrote.
   */

  /** @typedef {import('../model').Block} Block */
  /** @typedef {import('../model').Text} Text */
  /** @typedef {import('../model').List} List */
  /** @typedef {import('../model').Meter} Meter */
  /** @typedef {import('../inline').Run} Run */

  /**
   * `pages` is how many pages the paginator (paginate.js) found, and only drawn
   * when `paged`: a card per page behind the sheet, the running head and foot
   * in its margins.
   * @type {{
   *   model: import('../model').Model | null,
   *   paged?: boolean,
   *   pages?: number,
   *   running?: { header: string, footer: string, name: string },
   * }}
   */
  let { model, paged = false, pages = 1, running = { header: 'none', footer: 'none', name: '' } } = $props()

  /** @param {Text['kind']} kind */
  const tagOf = (kind) => ({ H1: 'h1', H2: 'h2', H3: 'h3', P: 'p' })[kind]

  /** @param {Run} r */
  const runTag = (r) => (r.datetime ? 'time' : r.code ? 'code' : r.strong ? 'strong' : r.em ? 'em' : r.del ? 'del' : 'span')

  /** Marks the tag can't carry on its own, for a run that has more than one. @param {Run} r */
  const runClass = (r) => [r.strong && 'b', r.em && 'i', r.del && 's'].filter(Boolean).join(' ') || undefined

  /** Mail and phone links hand off to an app, and a new tab would only be left open and blank. @param {string} href */
  const external = (href) => !/^(mailto|tel):/i.test(href)

  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0')

  /** A heading's plain text, as the PDF titles its section with. @param {Text} t */
  const titleOf = (t) => t.spans.flatMap((s) => s.runs.map((/** @type {import('../inline').Run} */ r) => r.text)).join('')

  const DOTS = [1, 2, 3, 4, 5]

  /** The two margins a running head or foot can stand in. */
  const EDGES = /** @type {('header' | 'footer')[]} */ (['header', 'footer'])

  /** The marks, as paths in a box of their own, in points. */
  const MARKS = {
    bullet: { box: 5.3, d: 'M2.65 0L5.3 2.65L2.65 5.3L0 2.65Z' },
    dot: { box: 3.75, d: 'M0 1.875a1.875 1.875 0 1 0 3.75 0a1.875 1.875 0 1 0 -3.75 0Z' },
    dash: { box: 5, d: 'M0 2.125h5v0.75h-5Z' },
  }

  /**
   * What stands in one margin of page `i`, as `[left, centre, right]`.
   * @param {string} mode
   * @param {number} i
   * @param {'header' | 'footer'} edge
   */
  function marginText(mode, i, edge) {
    if (mode === 'none' || (edge === 'header' && i === 0)) return null
    const num = `${i + 1} / ${pages}`
    const name = running.name.trim()
    if (mode === 'name') return name ? ['', name, ''] : null
    if (mode === 'page') return ['', num, '']
    if (mode === 'both') return name ? [name, '', num] : ['', '', num]
    return null
  }
</script>

{#snippet runs(/** @type {Run[]} */ list)}
  {#each list as r}
    {#if r.href}
      <a href={r.href} target={external(r.href) ? '_blank' : undefined} rel={external(r.href) ? 'noopener' : undefined}
        ><svelte:element this={runTag(r)} class={runClass(r)} datetime={r.datetime}>{r.text}</svelte:element></a
      >
    {:else}
      <svelte:element this={runTag(r)} class={runClass(r)} datetime={r.datetime}>{r.text}</svelte:element>
    {/if}
  {/each}
{/snippet}

{#snippet text(/** @type {Text} */ node, /** @type {string} */ cls = '')}
  <svelte:element this={tagOf(node.kind)} class={[cls, node.align === 'center' && 'center'].filter(Boolean).join(' ') || undefined} data-src={node.src}
    >{#each node.spans as s}<span class="r-{s.role}" data-src={s.src} data-actual={s.actual}>{@render runs(s.runs)}</span>{/each}</svelte:element
  >
{/snippet}

{#snippet meter(/** @type {Meter} */ node)}
  <span class="meter m-{node.style} aside" role="img" aria-label={node.alt} data-src={node.src}>
    {#if node.style === 'dots'}
      {#each DOTS as d}<i class:on={d <= node.value}></i>{/each}
    {:else}
      <i style:width="{(node.value / 5) * 100}%"></i>
    {/if}
  </span>
{/snippet}

{#snippet svg(/** @type {string} */ cls, /** @type {number} */ box, /** @type {string[]} */ paths)}
  <svg class={cls} viewBox="0 0 {box} {box}" aria-hidden="true">
    {#each paths as d}<path {d} />{/each}
  </svg>
{/snippet}

{#snippet list(/** @type {List} */ node)}
  {#if node.display === 'chips'}
    <ul class="cv-chips" data-src={node.src}>
      {#each node.items as item}
        <li class="chip" data-src={item.src}>
          {#if item.icon}{@render svg('chip-icon', 24, item.icon)}{/if}
          {#each item.body as b}
            {@render block(b)}
          {/each}
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="cv-list m-{node.marker}" class:inline={node.display === 'inline'} data-src={node.src}>
      {#each node.items as item, i}
        <li class={item.frame ? `f-${item.frame}` : undefined} data-src={item.src}>
          {#if node.display === 'inline' && i > 0}<span class="sep" aria-hidden="true">·</span>{/if}
          {#if node.marker !== 'none'}{@render svg('mark', MARKS[node.marker].box, [MARKS[node.marker].d])}{/if}
          {#each item.body as b}
            {@render block(b)}
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet block(/** @type {Block} */ node)}
  {#if node.kind === 'Row'}
    <div class="cv-row">
      {@render text(node.main)}
      {#if node.aside.kind === 'Meter'}
        {#if node.aside.label}
          <div class="aside meter-label">
            {@render text(node.aside.label)}
            {@render meter(node.aside)}
          </div>
        {:else}
          {@render meter(node.aside)}
        {/if}
      {:else}
        {@render text(node.aside, 'aside')}
      {/if}
    </div>
  {:else if node.kind === 'L'}
    {@render list(node)}
  {:else if node.kind === 'Div'}
    <div class="cv-div {node.frame ? `f-${node.frame}` : ''}" class:keep={node.keep} class:split={node.split} data-src={node.src}>
      {#if node.frame === 'timeline'}<span class="tl-rail" aria-hidden="true"></span><span class="tl-dot" aria-hidden="true"></span>{/if}
      {#each node.body as b}
        {@render block(b)}
      {/each}
    </div>
  {:else}
    {@render text(node)}
  {/if}
{/snippet}

{#if model}
  <div class="sheet" class:paged lang={model.lang} style:--pages={pages}>
    {#if paged}
      <div class="pages" aria-hidden="true" data-skip>
        {#each { length: pages } as _, i}
          <div class="page" style:--i={i}>
            {#each EDGES as edge}
              {@const parts = marginText(running[edge], i, edge)}
              {#if parts}
                <div class="page-{edge}">
                  {#each parts as part}<span>{part}</span>{/each}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <header class="cv-head" data-style={model.header.style} data-src="header">
      <div class="cv-id">
        {@render text(model.header.name)}
        {#if model.header.role}
          {@render text(model.header.role)}
        {/if}
        {#each model.header.left as line}
          {@render text(line)}
        {/each}
      </div>
      {#if model.header.contact}
        <div class="cv-contact">
          {@render list(model.header.contact)}
        </div>
      {/if}
    </header>

    <div class="cv-body">
      {#each model.sections as sec}
        <section class="cv-sec" data-src={sec.src} data-title={sec.title ? titleOf(sec.title) : undefined}>
          {#if sec.title}
            <div class="sec-head" data-head={sec.head}>
              {#if sec.head === 'numbered'}<span class="num" aria-hidden="true">{pad(sec.number)}</span>{/if}
              {#if sec.head === 'ruled-both'}<span class="rule" aria-hidden="true"></span>{/if}
              {@render text(sec.title)}
              <span class="rule" aria-hidden="true"></span>
            </div>
          {/if}
          {#each sec.body as b}
            {@render block(b)}
          {/each}
        </section>
      {/each}
    </div>
  </div>
{/if}
