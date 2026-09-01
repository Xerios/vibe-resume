/**
 * The named looks: each one a set of choices across the axes in slots.js, and
 * nothing else.
 *
 * The first nine are the templates that used to be nine whole components, and
 * keeping their names is the point — a preset is a good starting place, and
 * "Tech" says more than a dozen dropdowns do — but a preset is now only where
 * you start. Change an axis and the file keeps the preset it came from, marked
 * as modified; it doesn't become nameless.
 *
 * The four after them were never components at all, which is what the axes
 * bought: a new look is now a handful of choices rather than a new file, so
 * Editorial, Brief, Profile and Dossier cost nothing but this list.
 *
 * They are deliberately pure: a preset holds no CSS of its own, so nothing
 * invisible rides along when an axis is changed. Two of the nine gave up a few
 * tenths for that — Cards had the sheet 4px tighter and Tech had it set at 13px
 * rather than 13.5 — which is what the density axis is for now.
 */

import { resolveSlots } from './slots.js'

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} hint   one line, shown as the option's tooltip
 * @property {Record<string, string>} slots  only what differs from the defaults
 */

/** @type {Preset[]} */
export const PRESETS = [
  { id: 'classic', name: 'Classic', hint: 'One column, a rule trailing every heading', slots: {} },
  {
    id: 'compact',
    name: 'Compact',
    hint: 'Tighter type and three skill columns — fits more on a page',
    slots: { skills: 'three-col', density: 'compact' },
  },
  {
    id: 'centered',
    name: 'Centered',
    hint: 'Header and section titles centred',
    slots: { header: 'centered', sectionHead: 'ruled-both', summary: 'centered' },
  },
  { id: 'sidebar', name: 'Sidebar', hint: 'Skills in a left rail beside everything else', slots: { page: 'sidebar' } },
  { id: 'timeline', name: 'Timeline', hint: 'Experience on a dated vertical rail', slots: { entry: 'timeline' } },
  {
    id: 'ledger',
    name: 'Ledger',
    hint: 'Titles and dates in a gutter down the left',
    slots: { page: 'gutter', sectionHead: 'gutter', entry: 'gutter', skills: 'rows' },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    hint: 'No rules, no marks — spacing does the separating',
    slots: { header: 'quiet', sectionHead: 'plain', entry: 'minimal', skills: 'bare', density: 'airy' },
  },
  {
    id: 'cards',
    name: 'Cards',
    hint: 'Every role and skill group in a box of its own',
    slots: { entry: 'card', skills: 'cards', certifications: 'cards' },
  },
  {
    id: 'tech',
    name: 'Tech',
    hint: 'Stacks and skills as chips, each with its logo',
    slots: { stack: 'chips', skills: 'chips', list: 'chips', languages: 'inline' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    hint: 'A masthead, numbered sections and a lede — a CV set like a feature',
    slots: { header: 'banner', sectionHead: 'numbered', summary: 'lede', entry: 'stripe', density: 'airy' },
  },
  {
    id: 'brief',
    name: 'Brief',
    hint: 'Everything on one page — inline skills, two-column lists, tight type',
    slots: { skills: 'inline', list: 'columns', certifications: 'compact', languages: 'inline', stack: 'plain', density: 'compact' },
  },
  {
    id: 'profile',
    name: 'Profile',
    hint: 'The rail on the right, with languages as meters in it',
    slots: { page: 'rail-right', header: 'stacked', summary: 'lede', languages: 'dots', certifications: 'compact' },
  },
  {
    id: 'dossier',
    name: 'Dossier',
    hint: 'Boxed titles, dated badges and carded skills — a filed look',
    slots: { sectionHead: 'boxed', entry: 'badge', skills: 'cards', certifications: 'cards', list: 'columns' },
  },
]

export const DEFAULT_PRESET = 'timeline'

/**
 * Falls back rather than trusting the id: a file saved before any of this
 * names a template that is no longer one, and one saved after may name a preset
 * that has since been renamed away.
 * @param {string | undefined | null} id
 */
export function resolvePreset(id) {
  return PRESETS.some((p) => p.id === id) ? /** @type {string} */ (id) : DEFAULT_PRESET
}

/** @param {string | undefined | null} id */
export const preset = (id) => PRESETS.find((p) => p.id === resolvePreset(id))

/**
 * What a file actually renders through: its preset's choices, with whatever it
 * has changed on top. A file that has changed nothing composes to exactly its
 * preset, which is what makes the nine survive this untouched.
 * @param {{ layout?: string, variants?: Record<string, string> } | null} [file]
 * @param {import('./slots.js').Registry} [slots]
 * @returns {Record<string, string>}
 */
export function composition(file, slots) {
  return resolveSlots({ ...preset(file?.layout)?.slots, ...file?.variants }, slots)
}

/**
 * Whether a file has moved off its preset. Only the axes are compared — a
 * variant set back to what the preset already said is not a change.
 * @param {{ layout?: string, variants?: Record<string, string> } | null} [file]
 * @param {import('./slots.js').Registry} [slots]
 */
export function isModified(file, slots) {
  const base = resolveSlots(preset(file?.layout)?.slots, slots)
  const now = composition(file, slots)
  return Object.keys(now).some((id) => now[id] !== base[id])
}
