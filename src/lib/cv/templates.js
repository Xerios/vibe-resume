/**
 * The templates that ship with the editor.
 *
 * A template is how the CV is *arranged*: an ordinary Svelte component handed
 * the parsed YAML as `cv`, compiled in the browser and mounted inside the
 * preview frame (see compile-template.js). What used to be five CSS-only
 * "layouts" are components now — readable and editable in the app rather than
 * buried in presets.css, and four more of them since.
 *
 * All nine render the same section types out of the same class names, and
 * differ in their <style> block; Sidebar and Tech are the two that need markup
 * of their own to do their job. Every one of them has to print, which is what
 * rules out a look built on filled backgrounds — see the note in cv.css.
 *
 * The sources are imported as text, not as components: nothing here is ever
 * mounted directly. They are still real `.svelte` files so that `pnpm check`
 * type-checks them and a broken shipped template can't reach a release.
 *
 * User edits live beside these in localStorage — see TemplateManager in
 * templates.svelte.js, which is what the rest of the app talks to.
 */

import cardsSource from './templates/cards.svelte?raw'
import centeredSource from './templates/centered.svelte?raw'
import classicSource from './templates/classic.svelte?raw'
import compactSource from './templates/compact.svelte?raw'
import ledgerSource from './templates/ledger.svelte?raw'
import minimalSource from './templates/minimal.svelte?raw'
import sidebarSource from './templates/sidebar.svelte?raw'
import techSource from './templates/tech.svelte?raw'
import timelineSource from './templates/timeline.svelte?raw'

/**
 * @typedef {object} BuiltinTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} hint    one line, shown as the option's tooltip
 * @property {string} source  the shipped Svelte source
 */

/** @type {BuiltinTemplate[]} */
export const BUILTIN_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    hint: 'One column, a rule trailing every heading',
    source: classicSource,
  },
  {
    id: 'compact',
    name: 'Compact',
    hint: 'Tighter type and three skill columns — fits more on a page',
    source: compactSource,
  },
  {
    id: 'centered',
    name: 'Centered',
    hint: 'Header and section titles centred',
    source: centeredSource,
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    hint: 'Skills in a left rail beside everything else',
    source: sidebarSource,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    hint: 'Experience on a dated vertical rail',
    source: timelineSource,
  },
  {
    id: 'ledger',
    name: 'Ledger',
    hint: 'Titles and dates in a gutter down the left',
    source: ledgerSource,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    hint: 'No rules, no marks — spacing does the separating',
    source: minimalSource,
  },
  {
    id: 'cards',
    name: 'Cards',
    hint: 'Every role and skill group in a box of its own',
    source: cardsSource,
  },
  {
    id: 'tech',
    name: 'Tech',
    hint: 'Stacks and skills as chips, each with its logo',
    source: techSource,
  },
]

export const DEFAULT_TEMPLATE = 'timeline'

/** @param {string} id */
export function builtin(id) {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null
}
