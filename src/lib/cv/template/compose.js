/**
 * Layout + variants → one Svelte component source, which compile-template.js
 * then compiles exactly as it used to compile a whole template.
 *
 * The layout is a complete, working sheet on its own, and every slot's default
 * variant *is* a snippet it already defines. So composing is subtraction rather
 * than construction: take the layout, swap out the snippets whose slot has a
 * non-default variant chosen, and concatenate the stylesheets. Choose nothing
 * and you get the layout verbatim.
 *
 * ── Why one component and not several ──
 *
 * Compiling each fragment separately and importing them would be tidier, and it
 * is the wrong shape here. Svelte scopes a component's CSS to the markup in
 * that same component, so a style-only variant — most of them — would have to
 * write `:global(.job)`, which then loses on specificity to any scoped `.job`
 * rule in the component that owns the markup. Assembling into one component
 * gives every rule the same scoping class, so plain cascade order decides,
 * which is how the templates this replaces worked against cv.css.
 *
 * ── What a variant contributes ──
 *
 * Its snippets and its style block. Everything else in the file — the script,
 * any stray markup — is there so `svelte-check` will read it as a component,
 * and is dropped. A snippet whose name the layout doesn't define (`chip`) is
 * appended ahead of the rest instead of replacing anything, and de-duplicated:
 * three chip variants each carry their own copy so that any one of them can be
 * chosen alone, and choosing two must not declare it twice. The first in slot
 * order wins, so editing `chip` in one of them while another is also in use
 * changes nothing — the price of each variant standing on its own.
 */

import { SLOTS, partId, variant } from './slots.js'

/**
 * @typedef {object} Composed
 * @property {string} source          the component to compile
 * @property {{ id: string, from: number, lines: number }[]} map
 *   which part each run of lines came from, 1-based, for turning a compile
 *   error's line back into a line in the part being edited
 */

/**
 * @param {Record<string, string>} choices  slot id → variant id, already resolved
 * @param {{
 *   slots?: import('./slots.js').Registry,
 *   source?: (id: string, shipped: string) => string,
 * }} [opts]
 *   `slots` is the registry to compose out of — PartManager's, when the user
 *   has variants of their own; `source` is where a part's edited text comes
 *   from, when there is one.
 * @returns {Composed}
 */
export function compose(choices, opts) {
  const slots = opts?.slots ?? SLOTS
  /** The source a part is composed from: whatever has been edited over it, else what ships. */
  const sourceOf = (/** @type {string} */ id, /** @type {string} */ shipped) => opts?.source?.(id, shipped) ?? shipped

  const page = variant('page', choices.page, slots)
  // A style-only page variant layers onto the default layout rather than being
  // one, which is the same rule every other slot follows.
  const layoutVariant = page?.layout ? page : slots[0].variants[0]
  const layoutId = partId('page', layoutVariant.id)
  const layout = split(sourceOf(layoutId, layoutVariant.layout ?? ''))

  /** @type {{ id: string, text: string }[]} */
  const styles = []
  /** @type {Map<string, { id: string, text: string }>} */
  const extras = new Map()
  /** snippet name → the chunk replacing the layout's. @type {Map<string, { id: string, text: string }>} */
  const swaps = new Map()
  /** Every `@cv` name any chosen part imports; the layout's import line is rewritten to their union. */
  const imports = new Set(cvImports(layout.script))

  for (const s of slots) {
    const v = variant(s.id, choices[s.id], slots)
    // The default has no source: it is the snippet the layout already renders.
    if (!v || v === s.variants[0]) continue
    const id = partId(s.id, v.id)

    if (v.css !== undefined || (s.id === 'page' && !v.layout)) {
      styles.push({ id, text: sourceOf(id, v.css ?? '') })
      continue
    }
    if (v.svelte === undefined) continue

    const frag = split(sourceOf(id, v.svelte))
    for (const name of cvImports(frag.script)) imports.add(name)
    if (frag.style.trim()) styles.push({ id, text: frag.style })

    for (const block of snippets(frag.markup)) {
      const text = frag.markup.slice(block.start, block.end)
      if (block.name === s.snippet) swaps.set(block.name, { id, text })
      else if (!extras.has(block.name)) extras.set(block.name, { id, text })
    }
  }

  /** @type {{ id: string, text: string }[]} */
  const chunks = []
  chunks.push({ id: layoutId, text: `${layout.before}<script>\n${rewriteImports(layout.script, imports)}\n</script>\n` })
  for (const extra of extras.values()) chunks.push({ id: extra.id, text: `\n${extra.text}\n` })

  // The layout's markup, with each swapped snippet cut out and the variant's
  // put in its place. Walked in order so the chunks stay in source order and
  // the line map below comes out ascending.
  let at = 0
  for (const block of snippets(layout.markup)) {
    const swap = swaps.get(block.name)
    if (!swap) continue
    chunks.push({ id: layoutId, text: layout.markup.slice(at, block.start) })
    chunks.push(swap)
    at = block.end
  }
  chunks.push({ id: layoutId, text: layout.markup.slice(at) })

  if (layout.style.trim()) styles.push({ id: layoutId, text: layout.style })
  if (styles.length) {
    chunks.push({ id: layoutId, text: '\n<style>\n' })
    for (const style of styles) chunks.push({ id: style.id, text: `${style.text.trim()}\n\n` })
    chunks.push({ id: layoutId, text: '</style>\n' })
  }

  return join(chunks)
}

/**
 * A `.svelte` file as its three parts. The tags are matched on their own line
 * because that is how every file here is written, and because a looser match
 * would find one inside a comment or a template literal.
 * @param {string} source
 */
function split(source) {
  const script = /^<script(?:\s[^>]*)?>\r?\n([\s\S]*?)\r?\n<\/script>[^\S\n]*$/m.exec(source)
  const style = /^<style(?:\s[^>]*)?>\r?\n([\s\S]*?)\r?\n<\/style>[^\S\n]*$/m.exec(source)

  let before = ''
  let markup = source
  if (script) {
    before = source.slice(0, script.index)
    markup = source.slice(script.index + script[0].length)
  }
  if (style) {
    // The style block is at the foot, so cutting it out of whichever region it
    // landed in leaves the markup whole.
    markup = markup.replace(style[0], '')
    if (!script) before = ''
  }

  return { before, script: script?.[1] ?? '', markup: markup.replace(/^\n+/, ''), style: style?.[1] ?? '' }
}

/**
 * Every top-level snippet in a run of markup, with the span it occupies. A
 * depth counter rather than a regex for the closing tag: a snippet may hold
 * another, and the first `{/snippet}` after the header would then close the
 * wrong one.
 * @param {string} markup
 * @returns {{ name: string, start: number, end: number }[]}
 */
function snippets(markup) {
  /** @type {{ name: string, start: number, end: number }[]} */
  const out = []
  const token = /\{#snippet\s+([A-Za-z_$][\w$]*)|\{\/snippet\}/g
  let depth = 0
  let open = /** @type {{ name: string, start: number } | null} */ (null)

  for (let m = token.exec(markup); m; m = token.exec(markup)) {
    if (m[1] !== undefined) {
      if (depth === 0) open = { name: m[1], start: m.index }
      depth++
      continue
    }
    depth--
    if (depth === 0 && open) {
      out.push({ name: open.name, start: open.start, end: m.index + m[0].length })
      open = null
    }
  }
  return out
}

/** The names a script imports from `@cv`. @param {string} script */
function cvImports(script) {
  const m = /^\s*import\s*\{([^}]*)\}\s*from\s*'@cv'/m.exec(script)
  return m ? m[1].split(',').map((n) => n.trim()).filter(Boolean) : []
}

/**
 * Point the layout's `@cv` import at everything the composed sheet now needs —
 * `techIcon` only turns up once a chip variant is in play, and an import that
 * isn't there is a compile error rather than a missing logo.
 * @param {string} script
 * @param {Set<string>} names
 */
function rewriteImports(script, names) {
  const line = `import { ${[...names].toSorted().join(', ')} } from '@cv'`
  return /^\s*import\s*\{[^}]*\}\s*from\s*'@cv'.*$/m.test(script)
    ? script.replace(/^(\s*)import\s*\{[^}]*\}\s*from\s*'@cv'.*$/m, (_, indent) => `${indent}${line}`)
    : script
}

/**
 * Chunks → the source, and the line each part's run starts at. Runs of the same
 * part are folded together so the map reads as a handful of spans rather than
 * one per chunk.
 * @param {{ id: string, text: string }[]} chunks
 * @returns {Composed}
 */
function join(chunks) {
  /** @type {{ id: string, from: number, lines: number }[]} */
  const map = []
  let source = ''
  let line = 1

  for (const chunk of chunks) {
    if (!chunk.text) continue
    const lines = chunk.text.split('\n').length - 1
    const last = map[map.length - 1]
    if (last && last.id === chunk.id) last.lines += lines
    else map.push({ id: chunk.id, from: line, lines })
    source += chunk.text
    line += lines
  }
  return { source, map }
}

/**
 * Where a line of the composed source came from: which part, and which line of
 * that part's own source. What the template editor points a compile error at.
 * @param {Composed} composed
 * @param {number} line  1-based, in the composed source
 * @returns {{ id: string, line: number } | null}
 */
export function locate(composed, line) {
  const span = composed.map.find((s) => line >= s.from && line < s.from + s.lines)
  return span ? { id: span.id, line: line - span.from + 1 } : null
}
