/**
 * What a template is handed to work with — the `@cv` module every template
 * imports (`import { md, list, sections } from '@cv'`).
 *
 * It is a real module, aliased in vite.config.js so the built-in templates in
 * `templates/` type-check like any other source file. At runtime the compiler
 * in compile-template.js resolves the same specifier to this same module, so a
 * template the user has edited spends exactly what the shipped ones do.
 *
 * Everything here is deliberately small: a template's job is markup, and what
 * it can't reasonably write itself is inline Markdown, a defensive list, the
 * section/path pairing the preview's line mapping depends on, the stack line
 * read as a list of tools and the logo for one, and a language's level read as
 * a number the meter variants can draw.
 */

import { marked } from 'marked'
import { ICON_ALIASES, ICON_BODIES } from '../theme/tech-icons.js'

/**
 * Inline Markdown → HTML. Links get target/rel, which marked won't add itself.
 * Used through `{@html md(...)}`, which is why it is a template's business
 * rather than the app's: nothing else in the frame renders user prose.
 * @param {unknown} text
 */
export function md(text) {
  if (!text) return ''
  const html = marked.parseInline(String(text).trim())
  return String(html).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=')
}

/**
 * A list, whatever the YAML actually said. A half-typed document is the normal
 * case here — the preview re-renders on a keystroke — so every `{#each}` in a
 * template goes through this rather than trusting the shape.
 * @param {unknown} v
 * @returns {any[]}
 */
export const list = (v) => (Array.isArray(v) ? v : [])

/**
 * The document's sections, each paired with its path into the YAML.
 *
 * That path is what a template stamps on the elements it renders as
 * `data-src`, and what lets the page scroll the editor to the line behind
 * whatever the pointer is on (see `buildLineMap` in render.js). The index has
 * to be taken before the filter, or every path past a dropped section would
 * point one entry too far — which is the whole reason this is a helper and not
 * a `map` in each template.
 *
 * @param {any} cv
 * @returns {{ sec: any, path: string }[]}
 */
export function sections(cv) {
  return list(cv?.sections)
    .map((sec, i) => ({ sec, path: `sections.${i}` }))
    .filter((e) => e.sec && typeof e.sec === 'object')
}

/**
 * A stack line as the list of things in it: `React, Node.js, PostgreSQL` and
 * the YAML list of the same three both come back as three entries.
 *
 * A CV writes a stack either way and neither is wrong, so the templates read
 * it through here rather than each deciding. The separators are the ones that
 * turn up between tools — a slash isn't one of them, because `TypeScript/JS`
 * and `CI/CD` are single entries.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function techs(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (!value) return []
  return String(value)
    .split(/[,;·•]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The logo for one entry of a stack, as an `<svg>` to be spent through
 * `{@html}` — or `''` when nothing matches, which is the normal case for
 * anything that isn't a brand.
 *
 * The icons are the bundled subset in tech-icons.js, so this never touches the
 * network. Matching is forgiving because a CV is prose: case, punctuation and
 * spacing are normalised away, then a few reductions are tried in turn, so
 * `Node.js`, `Postgres`, `TypeScript/JavaScript`, `React 18` and
 * `Docker (Swarm)` all land on a logo while `English C2` quietly doesn't.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function techIcon(name) {
  const slug = iconSlug(name)
  return slug ? `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">${ICON_BODIES[slug]}</svg>` : ''
}

/**
 * How strong a language is, on a scale of five, or 0 when nothing said.
 *
 * A CV writes this either as a number (`rating: 4`) or as a word, and the words
 * are two vocabularies at once — the CEFR letters and the ones people actually
 * write. Both are read here rather than in each meter variant, so `Native`,
 * `C2`, `Fluent` and `5` all fill the same five dots and an unrecognised level
 * quietly fills none, which is the signal a variant needs to fall back to
 * printing the words instead.
 *
 * @param {any} item  a `languages` entry — `{ name, level?, rating? }`
 * @returns {number} 0–5
 */
export function levelRating(item) {
  const rating = Number(item?.rating)
  if (Number.isFinite(rating) && rating > 0) return Math.min(5, Math.round(rating))

  const level = normalise(String(item?.level ?? ''))
  if (!level) return 0
  for (const [score, words] of LEVELS) {
    if (words.some((w) => level.startsWith(w))) return score
  }
  return 0
}

/**
 * Strongest first, so that `nativeorbilingual` is read as native rather than
 * stopping at the `b` levels, and matched on the start of the level so that
 * `C1 — professional` lands with `C1`.
 * @type {[number, string[]][]}
 */
const LEVELS = [
  [5, ['native', 'bilingual', 'mothertongue', 'c2', 'fluent', 'expert', '5']],
  [4, ['c1', 'advanced', 'professional', 'proficient', 'business', '4']],
  [3, ['b2', 'upperintermediate', 'intermediate', 'conversational', 'working', '3']],
  [2, ['b1', 'preintermediate', 'limited', 'basic', 'elementary', '2']],
  [1, ['a2', 'a1', 'beginner', 'novice', 'starter', '1']],
]

/**
 * The same shape the generator keys its tables by: lower case, no punctuation
 * except the two characters that are part of a language's name.
 * @param {string} text
 */
const normalise = (text) =>
  text
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll(/[^a-z0-9+#]/g, '')

/**
 * What to look an entry up as, most literal first. Each reduction drops
 * something a CV adds and a brand name doesn't have: a parenthetical, a
 * category prefix, an alternative after a slash, a version number.
 * @param {unknown} name
 * @returns {string | null}
 */
function iconSlug(name) {
  if (!name) return null
  const text = String(name).trim()
  const bare = text.replaceAll(/\([^)]*\)/g, ' ')
  const tail = bare.slice(bare.lastIndexOf(':') + 1)

  for (const candidate of [text, bare, tail, tail.split('/')[0], tail.replace(/\s+v?\d+(\.\d+)*\s*$/, '')]) {
    const key = normalise(candidate)
    if (!key) continue
    if (Object.hasOwn(ICON_BODIES, key)) return key
    if (Object.hasOwn(ICON_ALIASES, key)) return ICON_ALIASES[key]
  }
  return null
}
