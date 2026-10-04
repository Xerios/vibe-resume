/**
 * How a CV is set: the type each kind of text is set in, and the space
 * between things. There is one layout — a single column read top to bottom —
 * because that is what a PDF parser reads most reliably. All lengths are points.
 *
 * The sheet spends these as CSS (see html/sheet-css.js). The PDF is measured
 * from the sheet, so it is set in exactly these too, without a copy of its own.
 */

/** A choice option: id, name, and tooltip hint. */
export interface Choice {
  id: string
  name: string
  /** one line, shown as the option's tooltip */
  hint: string
}

export const DENSITIES: Choice[] = [
  { id: 'normal', name: 'Normal', hint: 'The measure and spacing the sheet is designed at' },
  { id: 'compact', name: 'Compact', hint: 'Smaller labels and less air, so more fits on a page' },
]

export const DEFAULT_DENSITY = 'normal'

export function resolveDensity(id: string | undefined | null): string {
  return DENSITIES.some((d) => d.id === id) ? (id as string) : DEFAULT_DENSITY
}

/** The type ladder at normal density, in points. */
const SIZES = { '2xs': 7.25, xs: 8, sm: 8.75, md: 10, lg: 10, xl: 11, name: 23 }

/**
 * The sizes running text is set at — bullets, rows, paragraphs — and the
 * least any density takes them to: most faces read best at 10–12pt.
 */
const TEXT_SIZES = new Set(['md', 'lg', 'xl'])
const TEXT_MIN = 10

/** The space between things at normal density, in points. */
const SPACE = {
  /** below the header's rule, before the first section */
  header: 14,
  /** between the name block and the rule under it */
  headerPad: 10,
  /** above every section but the first */
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
}

/** What compact density does to each. */
const COMPACT = { size: 0.93, space: 0.7, leading: 1.34 }

/**
 * The sizes and spaces a density comes to.
 */
export function metrics(density: string | undefined | null) {
  const compact = resolveDensity(density) === 'compact'
  const k = compact ? COMPACT.size : 1
  const s = compact ? COMPACT.space : 1
  const size = Object.fromEntries(Object.entries(SIZES).map(([key, v]) => [key, round(TEXT_SIZES.has(key) ? Math.max(TEXT_MIN, v * k) : v * k)])) as Record<
    keyof typeof SIZES,
    number
  >
  const space = Object.fromEntries(Object.entries(SPACE).map(([key, v]) => [key, round(v * s)])) as Record<keyof typeof SPACE, number>
  return { size, space, leading: compact ? COMPACT.leading : 1.42 }
}

const round = (v: number): number => Math.round(v * 100) / 100

/** Text styling configuration: font, weight, size, color, and optional decorations. */
export interface TextStyle {
  /** the font choice's text face, or its label face (typefaces.js) */
  family: 'text' | 'label'
  weight: number
  italic?: boolean
  size: keyof typeof SIZES
  color: keyof import('./theme/palettes').Palette | 'danger'
  /** set in capitals */
  upper?: boolean
  /**
   * letter spacing, pt. Kept to about a tenth of the size at most: text
   * extraction reads a wider gap between letters as a space, and `S U M M A R Y` is not what a
   * parser should find.
   */
  tracking?: number
  /** line height, if not the sheet's own */
  leading?: number
}

/**
 * Every kind of text on the sheet. A model node names one of these as its
 * `role`; the preview makes it a class and the PDF a font, size and colour.
 */
export const ROLES: Record<string, TextStyle> = {
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
  /** the room a logo takes in its line, and how far past that it is drawn on
      every side, so it reads larger without moving anything */
  icon: 9,
  iconBleed: 1,
  /** the space between a skill group's name and its rows */
  hangGap: 10,
  /** the padding round a boxed title */
  boxPadX: 6,
  boxPadY: 3,
}

/** Not part of any palette: the colour an unknown section type is reported in. */
export const DANGER = '#b91c1c'

/** The colour links are drawn in, whatever role they sit inside. */
export const LINK_COLOR = 'deep'
