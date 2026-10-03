/**
 * How a CV is set: which layouts there are, the type each kind of text is set
 * in, and the space between things. All lengths are points.
 *
 * The sheet spends these as CSS (see html/sheet-css.js). The PDF is measured
 * from the sheet, so it is set in exactly these too, without a copy of its own.
 */

/**
 * @typedef {object} Choice
 * @property {string} id
 * @property {string} name
 * @property {string} hint  one line, shown as the option's tooltip
 */

/**
 * How the sections are arranged on the page. The two rail layouts send the
 * short, listy sections to a narrow column; the order the columns are listed
 * in a layout is the order they are *read* in, whichever side they are drawn on.
 * @type {(Choice & { columns: ('main' | 'rail')[], railSide: 'left' | 'right' | null })[]}
 */
export const LAYOUTS = [
  { id: 'single', name: 'Single column', hint: 'One column, everything in source order', columns: ['main'], railSide: null },
  { id: 'sidebar', name: 'Sidebar', hint: 'Skills and lists in a left rail, read first', columns: ['rail', 'main'], railSide: 'left' },
  { id: 'rail-right', name: 'Rail right', hint: 'The same rail on the right; the main column reads first', columns: ['main', 'rail'], railSide: 'right' },
]

export const DEFAULT_LAYOUT = 'single'

/** @param {string | undefined | null} id */
export function resolveLayout(id) {
  return LAYOUTS.some((l) => l.id === id) ? /** @type {string} */ (id) : DEFAULT_LAYOUT
}

/** @param {string | undefined | null} id */
export const layoutOf = (id) => LAYOUTS.find((l) => l.id === resolveLayout(id)) ?? LAYOUTS[0]

/** @type {Choice[]} */
export const DENSITIES = [
  { id: 'normal', name: 'Normal', hint: 'The measure and spacing the sheet is designed at' },
  { id: 'compact', name: 'Compact', hint: 'Tighter type and less air, so more fits on a page' },
]

export const DEFAULT_DENSITY = 'normal'

/** @param {string | undefined | null} id */
export function resolveDensity(id) {
  return DENSITIES.some((d) => d.id === id) ? /** @type {string} */ (id) : DEFAULT_DENSITY
}

/** The type ladder at normal density, in points. */
const SIZES = { '2xs': 7.25, xs: 8, sm: 8.75, md: 9.5, lg: 10, xl: 11, name: 23 }

/** The space between things at normal density, in points. */
const SPACE = {
  /** below the header's rule, before the first section */
  header: 14,
  /** between the name block and the rule under it */
  headerPad: 10,
  /** above every section but the first in a column */
  section: 15,
  /** between a section title and what follows it */
  title: 7,
  /** between two entries, two records, two skill blocks */
  entry: 10,
  /** between two paragraphs, and between an entry's head and its bullets */
  para: 4,
  /** between two bullets or two list rows */
  item: 3,
  /** how far a bullet's text is indented past its marker */
  indent: 11,
  /** between the main column and the rail */
  column: 20,
  /** between the columns of a two-up grid */
  grid: 22,
}

/** What compact density does to each. */
const COMPACT = { size: 0.93, space: 0.7, leading: 1.34 }

/** Of the area inside the margins, the rail's share. */
export const RAIL_SHARE = 0.31

/**
 * The sizes and spaces a density comes to.
 * @param {string | undefined | null} density
 */
export function metrics(density) {
  const compact = resolveDensity(density) === 'compact'
  const k = compact ? COMPACT.size : 1
  const s = compact ? COMPACT.space : 1
  /** @type {Record<keyof typeof SIZES, number>} */
  const size = /** @type {any} */ (Object.fromEntries(Object.entries(SIZES).map(([key, v]) => [key, round(v * k)])))
  /** @type {Record<keyof typeof SPACE, number>} */
  const space = /** @type {any} */ (Object.fromEntries(Object.entries(SPACE).map(([key, v]) => [key, round(v * s)])))
  return { size, space, leading: compact ? COMPACT.leading : 1.42 }
}

/** @param {number} v */
const round = (v) => Math.round(v * 100) / 100

/**
 * @typedef {object} TextStyle
 * @property {'text' | 'label'} family  the font choice's text face, or its label face (typefaces.js)
 * @property {number} weight
 * @property {boolean} [italic]
 * @property {keyof typeof SIZES} size
 * @property {keyof import('../theme/palettes.js').Palette | 'danger'} color
 * @property {boolean} [upper]     set in capitals
 * @property {number} [tracking]   letter spacing, pt. Kept to about a tenth of the size at most: text
 *   extraction reads a wider gap between letters as a space, and `S U M M A R Y` is not what a
 *   parser should find.
 * @property {number} [leading]    line height, if not the sheet's own
 */

/**
 * Every kind of text on the sheet. A model node names one of these as its
 * `role`; the preview makes it a class and the PDF a font, size and colour.
 * @type {Record<string, TextStyle>}
 */
export const ROLES = {
  name: { family: 'text', weight: 800, size: 'name', color: 'ink', leading: 1.1 },
  nameBanner: { family: 'text', weight: 800, size: 'name', color: 'ink', upper: true, tracking: 1.5, leading: 1.1 },
  role: { family: 'text', weight: 600, size: 'lg', color: 'accent' },
  contact: { family: 'label', weight: 400, size: 'xs', color: 'muted', leading: 1.7 },
  secTitle: { family: 'label', weight: 600, size: 'xs', color: 'deep', upper: true, tracking: 0.5 },
  body: { family: 'text', weight: 400, size: 'lg', color: 'ink' },
  lede: { family: 'text', weight: 400, size: 'xl', color: 'ink', leading: 1.45 },
  entryTitle: { family: 'text', weight: 700, size: 'xl', color: 'ink' },
  org: { family: 'text', weight: 700, size: 'xl', color: 'accent' },
  aside: { family: 'text', weight: 400, size: 'md', color: 'faint' },
  dates: { family: 'label', weight: 400, size: 'xs', color: 'faint' },
  sub: { family: 'text', weight: 400, italic: true, size: 'md', color: 'muted' },
  bullet: { family: 'text', weight: 400, size: 'md', color: 'ink' },
  stackLabel: { family: 'label', weight: 600, size: 'xs', color: 'deep', tracking: 0.5 },
  stack: { family: 'label', weight: 400, size: 'xs', color: 'muted', leading: 1.6 },
  blockTitle: { family: 'text', weight: 700, size: 'sm', color: 'deep' },
  row: { family: 'text', weight: 400, size: 'md', color: 'ink' },
  tier: { family: 'label', weight: 600, size: '2xs', color: 'accent', upper: true, tracking: 0.5 },
  itemName: { family: 'text', weight: 700, size: 'md', color: 'ink' },
  note: { family: 'text', weight: 400, size: 'sm', color: 'faint' },
  level: { family: 'label', weight: 400, size: 'xs', color: 'accent' },
  meta: { family: 'text', weight: 400, size: 'sm', color: 'muted' },
  issuer: { family: 'text', weight: 400, size: 'sm', color: 'accent' },
  tag: { family: 'text', weight: 400, size: 'sm', color: 'muted' },
  error: { family: 'label', weight: 400, size: 'md', color: 'danger' },
}

/**
 * The measurements the variants are drawn with, in points, which sheet-css.js
 * writes as custom properties for sheet.css.
 */
export const DECOR = {
  /** a chip's inner padding, the space between chips, and between logo and name */
  chipPadX: 5,
  chipPadY: 1.5,
  chipGap: 4,
  iconGap: 3,
  /** a card's padding, and its corner radius */
  cardPad: 7,
  radius: 3,
  /** the stripe's width, and the space between it and the entry */
  stripe: 3,
  stripeGap: 9,
  /** how far a timeline entry hangs from its rail, and its dot */
  timeline: 15,
  timelineDot: 7,
  /** a meter's dots, the gap between them, and a bar's size */
  meterDot: 5,
  meterGap: 2.5,
  barW: 48,
  barH: 4,
  /** the badge round the dates */
  badgePadX: 4,
  badgePadY: 1.5,
  /** the gutter a skills-rows group title hangs in, as a share of the column */
  gutter: 0.26,
  /** a chip's logo */
  icon: 9,
  /** the padding round a boxed title */
  boxPadX: 6,
  boxPadY: 3,
}

/** Not part of any palette: the colour an unknown section type is reported in. */
export const DANGER = '#b91c1c'

/** The colour links are drawn in, whatever role they sit inside. */
export const LINK_COLOR = 'deep'
