/**
 * The brand logo for one entry of a stack, as SVG path data: the sheet draws
 * it as `<path d>` inside a 24×24 `<svg>`, and the PDF reads the same path back
 * and draws it through pdfkit's own SVG path parser. No markup crosses into the
 * sheet, so a logo needs no `{@html}`.
 *
 * The logos are the bundled subset in tech-icons.js, so this never touches the
 * network. Matching is forgiving because a CV is prose: case, punctuation and
 * spacing are normalised away, then a few reductions are tried in turn, so
 * `Node.js`, `Postgres`, `TypeScript/JavaScript`, `React 18` and
 * `Docker (Swarm)` all land on a logo while `English C2` quietly doesn't.
 */

import { ICON_ALIASES, ICON_BODIES } from '../theme/tech-icons.js'

/** Parsed once per slug: a body is a run of `<path d="…"/>`. @type {Map<string, string[]>} */
const cache = new Map()

/**
 * The paths of the logo for a name, in a 24×24 box, or null when nothing
 * matches — the normal case for anything that isn't a brand.
 * @param {unknown} name
 * @returns {string[] | null}
 */
export function iconPaths(name) {
  const slug = iconSlug(name)
  if (!slug) return null
  let paths = cache.get(slug)
  if (!paths) {
    paths = [...ICON_BODIES[slug].matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])
    cache.set(slug, paths)
  }
  return paths
}

/**
 * The same shape the generator keys its tables by: lower case, no punctuation
 * except the two characters that are part of a language's name.
 * @param {string} text
 */
export const normalise = (text) =>
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
