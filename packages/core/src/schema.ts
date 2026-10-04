/**
 * What a CV is made of, as data: the section types and what each holds.
 * README.md's table says the same in prose. The Markdown reader decides a
 * section's type against it, and the editor's completion offers its types.
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
  entries: { holds: 'items', item: ['subtype', 'title', 'org', 'dates', 'sub', 'sideNote', 'summary', 'bullets', 'stack', 'methodologies', 'notes', 'items'] },
  list: { holds: 'items', item: null, extra: ['inline'] },
  levels: { holds: 'items', item: ['name', 'level', 'note', 'rating'] },
  records: { holds: 'items', item: ['name', 'issuer', 'dates', 'note'] },
  table: { holds: 'items', item: ['name', 'value', 'desc'], extra: ['columns'] },
}
