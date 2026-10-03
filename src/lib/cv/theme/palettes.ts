/**
 * How a CV is *painted*: one palette per theme id, as data.
 *
 * The sheet turns them into custom properties (see html/sheet-css.js), the PDF
 * takes the colours the sheet was drawn in, and StylePicker draws its swatches
 * from them. That keeps a single copy, so the three can't drift apart.
 *
 * Light only: the sheet is paper whatever the app around it is set to, and
 * what is on screen is what prints.
 */

export interface Palette {
  /** role, org, bullet marks */
  accent: string
  /** section titles, sub-headings, links */
  deep: string
  /** the faintest tint of the accent */
  wash: string
  /** rules and dividers */
  line: string
  /** the sheet */
  paper: string
  /** body text */
  ink: string
  /** secondary text */
  muted: string
  /** dates and asides */
  faint: string
}

export interface Theme {
  id: string
  name: string
  colors: Palette
}

export const THEMES: Theme[] = [
  {
    id: 'teal',
    name: 'Teal',
    colors: { accent: '#157c75', deep: '#0d4f4a', wash: '#eaf4f2', line: '#dbe6e3', paper: '#ffffff', ink: '#15211f', muted: '#5f6f6c', faint: '#8a9794' },
  },
  {
    id: 'slate',
    name: 'Slate',
    colors: { accent: '#47617f', deep: '#2b3d52', wash: '#eef1f5', line: '#dde3ea', paper: '#ffffff', ink: '#1b2330', muted: '#5c6879', faint: '#8b95a4' },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    colors: { accent: '#4338ca', deep: '#312e81', wash: '#eef0fd', line: '#dfe1f2', paper: '#ffffff', ink: '#191a2e', muted: '#5b5f7d', faint: '#8b8fae' },
  },
  {
    id: 'plum',
    name: 'Plum',
    colors: { accent: '#8e2f6b', deep: '#5f1c46', wash: '#fbecf5', line: '#eeddea', paper: '#ffffff', ink: '#26161f', muted: '#6d5763', faint: '#9f8794' },
  },
  {
    id: 'ember',
    name: 'Ember',
    colors: { accent: '#b4531f', deep: '#7c3512', wash: '#fdf0e8', line: '#f0e0d5', paper: '#fffdfb', ink: '#26190f', muted: '#6f5b4b', faint: '#a08976' },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    colors: { accent: '#8a6a2f', deep: '#5b451c', wash: '#f7f0e0', line: '#e6dcc6', paper: '#fdf9f0', ink: '#241d10', muted: '#6b6047', faint: '#9a8f74' },
  },
  {
    id: 'mono',
    name: 'Mono',
    colors: { accent: '#3a3a3a', deep: '#111111', wash: '#f0f0f0', line: '#dcdcdc', paper: '#ffffff', ink: '#141414', muted: '#565656', faint: '#8a8a8a' },
  },
]

export const DEFAULT_THEME = 'teal'

/**
 * Falls back rather than trusting what came out of storage: an id can outlive
 * the palette it named.
 */
export function resolveTheme(id: string | undefined | null): string {
  return THEMES.some((t) => t.id === id) ? (id as string) : DEFAULT_THEME
}

/**
 * The colours a theme id comes to, defaulted.
 */
export function palette(id: string | undefined | null): Palette {
  return (THEMES.find((t) => t.id === resolveTheme(id)) ?? THEMES[0]).colors
}
