/**
 * The block variants: one decision each about how one part of the sheet is
 * drawn, per file, picked in the Style panel through VariantCycle.
 *
 * A variant is not a template fragment. It is an id that render/model.js reads
 * while building the tree, and it changes what the tree says: a section title's
 * `head`, an entry's `frame`, a list's `display`, a language's meter.
 * html/sheet.css draws every such property, and the PDF is measured from what
 * it drew, so a variant needs nothing PDF-specific.
 * The first variant of each slot is its default.
 */

/** A variant option: id, name, and hint. */
export interface Variant {
  id: string
  name: string
  /** one line, shown under the name in the list */
  hint: string
}

/** A slot grouping variants for a specific part of the sheet. */
export interface Slot {
  id: string
  name: string
  variants: Variant[]
}

export const SLOTS: Slot[] = [
  {
    id: 'header',
    name: 'Header',
    variants: [
      { id: 'stacked', name: 'Stacked', hint: 'Name over the contact line, both hard left' },
      { id: 'centered', name: 'Centred', hint: 'Name, role and contact down the middle' },
      { id: 'banner', name: 'Banner', hint: 'A masthead — the name in capitals between two rules' },
    ],
  },
  {
    id: 'sectionHead',
    name: 'Section title',
    variants: [
      { id: 'ruled', name: 'Ruled', hint: 'A rule trailing every heading' },
      { id: 'ruled-both', name: 'Ruled both', hint: 'A rule either side, so the title centres' },
      { id: 'dotted', name: 'Dotted', hint: 'The trailing rule drawn as dots' },
      { id: 'dashed', name: 'Dashed', hint: 'The trailing rule broken into dashes' },
      { id: 'double', name: 'Double', hint: 'Two hairlines trailing every heading' },
      { id: 'plain', name: 'Plain', hint: 'No rule — a small tracked-out label' },
      { id: 'boxed', name: 'Boxed', hint: 'The title in an outlined box, no rule' },
      { id: 'numbered', name: 'Numbered', hint: '01 — sections counted as they come' },
    ],
  },
  {
    id: 'summary',
    name: 'Summary',
    variants: [
      { id: 'plain', name: 'Plain', hint: 'Paragraphs across the full measure' },
      { id: 'centered', name: 'Centred', hint: 'Pulled in from both margins and centred' },
      { id: 'lede', name: 'Lede', hint: 'The opening paragraph set larger' },
    ],
  },
  {
    id: 'entry',
    name: 'Entry',
    variants: [
      { id: 'plain', name: 'Plain', hint: 'Organisation and title, then dates and place, bullets under' },
      { id: 'timeline', name: 'Timeline', hint: 'Hung off a vertical rail, a dot per entry' },
      { id: 'card', name: 'Card', hint: 'Each role in an outlined box of its own' },
      { id: 'stripe', name: 'Stripe', hint: 'Each entry against a thick accent rule' },
      { id: 'minimal', name: 'Minimal', hint: 'Dashes for bullets, nothing else' },
    ],
  },
  {
    id: 'dates',
    name: 'Dates',
    variants: [
      { id: 'as-written', name: 'As written', hint: 'Each date the way the source has it' },
      { id: 'short', name: 'Mar 2020', hint: 'Months as three letters' },
      { id: 'long', name: 'March 2020', hint: 'Months spelled out' },
      { id: 'numeric', name: '03/2020', hint: 'Month and year in figures' },
      { id: 'iso', name: '2020-03', hint: 'Year first, as ISO 8601 has it' },
    ],
  },
  {
    id: 'skills',
    name: 'Skills',
    variants: [
      { id: 'stacked', name: 'Stacked', hint: 'One group under another, its rows beneath its name' },
      { id: 'inline', name: 'Inline', hint: 'One paragraph per group, its rows running on after the name' },
      { id: 'cards', name: 'Cards', hint: 'Every group in an outlined box of its own' },
      { id: 'chips', name: 'Chips', hint: 'Every skill a chip, with its logo where there is one' },
    ],
  },
  {
    id: 'stack',
    name: 'Stack',
    variants: [
      { id: 'line', name: 'Line', hint: 'Stack: one tool after another' },
      { id: 'chips', name: 'Chips', hint: 'A chip per tool, each with its logo' },
      { id: 'plain', name: 'Plain', hint: 'The same line without the label' },
      { id: 'none', name: 'None', hint: 'Hidden — the source keeps its tools' },
    ],
  },
  {
    id: 'list',
    name: 'List',
    variants: [
      { id: 'pills', name: 'Pills', hint: 'An inline list as outlined pills' },
      { id: 'lines', name: 'Lines', hint: 'One item per line' },
      { id: 'chips', name: 'Chips', hint: 'A chip per item, each with its logo' },
    ],
  },
  {
    id: 'languages',
    name: 'Languages',
    variants: [
      { id: 'rows', name: 'Rows', hint: 'Name and level, one to a row' },
      { id: 'pills', name: 'Pills', hint: 'A pill per language, its level inside it' },
      { id: 'dots', name: 'Dots', hint: 'A five-dot meter read from the level' },
      { id: 'bars', name: 'Bars', hint: 'A bar the level fills its share of' },
    ],
  },
  {
    id: 'certifications',
    name: 'Certificates',
    variants: [
      { id: 'rows', name: 'Rows', hint: 'One a line, the date out at the right' },
      { id: 'cards', name: 'Cards', hint: 'Every certificate in an outlined box of its own' },
      { id: 'compact', name: 'Compact', hint: 'One line each, the issuer following the name' },
    ],
  },
]

/**
 * Every slot's choice, falling back to its default rather than trusting the
 * ids given: a file may name a variant that has since gone, and one saved before
 * any of this names none.
 */
export function resolveVariants(choices: Record<string, string> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of SLOTS) {
    const wanted = choices?.[s.id]
    out[s.id] = s.variants.some((v) => v.id === wanted) ? (wanted as string) : s.variants[0].id
  }
  return out
}

/**
 * Whether any slot is off its default.
 */
export function isModified(choices: Record<string, string> | undefined | null): boolean {
  const now = resolveVariants(choices)
  return SLOTS.some((s) => now[s.id] !== s.variants[0].id)
}
