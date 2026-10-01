import { migrateTree } from '../format/migrate.js'
import { parse } from '../format/relaxed-yaml.js'

/**
 * Parse the editor's source into a CV object, plus the map that ties every
 * value back to the line it came from.
 *
 * The document isn't quite YAML — see relaxed-yaml.js for what the dialect
 * drops and why. The parser hands back the tree and the line map from one pass
 * and never throws, so the only thing that can fail here is a document with
 * nothing usable in it.
 *
 * That line map is what a template stamps onto the elements it renders as
 * `data-src`, which is what lets the preview point back at the YAML behind
 * whatever the pointer is on. Every node is keyed by its dotted path —
 * `sections.2.items.0.bullets.1` — and a mapping entry is placed on its *key*:
 * `title: Summary` and a `bullets:` block both want the line you'd click to
 * edit them, not wherever the value happens to begin.
 *
 * A document in the old section types — an earlier version being looked at in
 * the history — is read as the current ones, so it still renders.
 *
 * @param {string} yaml
 * @returns {{ cv: any, lines: Map<string, number>, error: null } | { cv: null, lines: null, error: string }}
 */
export function parseCv(yaml) {
  const { value, lines, diagnostics } = parse(yaml)
  if (!value || typeof value !== 'object') return { cv: null, lines: null, error: 'Document is empty' }
  const broken = diagnostics.find((d) => d.severity === 'error')
  return broken ? { cv: null, lines: null, error: broken.message } : { cv: migrateTree(value), lines, error: null }
}
