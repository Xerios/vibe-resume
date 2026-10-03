/**
 * What a CV is made of, as data: the section types, what each holds, and the
 * keys every level of the document accepts. README.md's table says the same
 * in prose. Every format reads into this shape, and the YAML editor's lint
 * and completion are both driven by it.
 */

/**
 * Every section type, and what it holds.
 *
 * `holds` is the key the section's content lives under; `item` is the keys an
 * entry may carry, or null when the entries are plain text. `extra` is what the
 * type adds to the keys every section has.
 */
export const SECTIONS: Record<string, { holds: string; item: string[] | null; extra?: string[] }> = {
  text: { holds: 'paragraphs', item: null },
  groups: { holds: 'blocks', item: ['title', 'rows'] },
  entries: { holds: 'items', item: ['subtype', 'title', 'org', 'dates', 'sub', 'sideNote', 'bullets', 'stack', 'items'] },
  list: { holds: 'items', item: null, extra: ['inline'] },
  levels: { holds: 'items', item: ['name', 'level', 'note', 'rating'] },
  records: { holds: 'items', item: ['name', 'issuer', 'dates', 'note'] },
  table: { holds: 'items', item: ['name', 'value', 'desc'], extra: ['columns'] },
}

/** The keys any section may carry, whatever its type. */
export const SECTION_KEYS = ['type', 'title', 'rail']
/** A `groups` block's rows, which are a level deeper than anything else gets. */
export const ROW_KEYS = ['tier', 'text']
/** The document itself. */
export const ROOT_KEYS = ['header', 'sections']
export const HEADER_KEYS = ['name', 'role', 'contact', 'lang']
