/**
 * The axes a sheet is composed out of.
 *
 * A sheet used to be one whole Svelte component per look, which welded
 * unrelated decisions together: taking Tech's logo chips meant taking Tech's
 * everything. It is two things now — a *layout*, which owns the arrangement and
 * the markup for all nine section types, and a *variant* per slot, which
 * replaces one of the layout's snippets or restyles it.
 *
 * The first variant of every slot is its default: it has no source, because it
 * *is* what the layout already renders. That is what makes composing with
 * nothing chosen hand back the layout verbatim (see compose.js).
 *
 * A variant is one of two things:
 *
 *   a `.svelte` fragment  — markup, so it defines the slot's snippet. A real
 *                           component, so `svelte-check` reads it and a broken
 *                           one can't reach a release.
 *   a `.css` file         — no markup, so it restyles the snippet the layout
 *                           renders. Most of them: seven of the nine templates
 *                           this replaces differed by a style block and nothing
 *                           else.
 *
 * `page` is the odd slot out — its variants are whole layouts rather than
 * snippets, except for the style-only ones, which layer onto the default.
 */

import singleLayout from '../layouts/single.svelte?raw'
import sidebarLayout from '../layouts/sidebar.svelte?raw'
import railRightLayout from '../layouts/rail-right.svelte?raw'

import pageGutter from '../blocks/page/gutter.css?raw'
import headerCentered from '../blocks/header/centered.css?raw'
import headerQuiet from '../blocks/header/quiet.css?raw'
import headerStacked from '../blocks/header/stacked.css?raw'
import headerBanner from '../blocks/header/banner.css?raw'
import secHeadRuledBoth from '../blocks/section-head/ruled-both.css?raw'
import secHeadPlain from '../blocks/section-head/plain.css?raw'
import secHeadGutter from '../blocks/section-head/gutter.css?raw'
import secHeadBoxed from '../blocks/section-head/boxed.css?raw'
import secHeadNumbered from '../blocks/section-head/numbered.css?raw'
import secHeadDotted from '../blocks/section-head/dotted.css?raw'
import secHeadDashed from '../blocks/section-head/dashed.css?raw'
import secHeadDouble from '../blocks/section-head/double.css?raw'
import summaryCentered from '../blocks/summary/centered.css?raw'
import summaryLede from '../blocks/summary/lede.css?raw'
import entryTimeline from '../blocks/entry/timeline.css?raw'
import entryCard from '../blocks/entry/card.css?raw'
import entryGutter from '../blocks/entry/gutter.css?raw'
import entryMinimal from '../blocks/entry/minimal.css?raw'
import entryBadge from '../blocks/entry/badge.css?raw'
import entryStripe from '../blocks/entry/stripe.css?raw'
import skillsThreeCol from '../blocks/skills/three-col.css?raw'
import skillsRows from '../blocks/skills/rows.css?raw'
import skillsCards from '../blocks/skills/cards.css?raw'
import skillsBare from '../blocks/skills/bare.css?raw'
import skillsInline from '../blocks/skills/inline.css?raw'
import skillsChips from '../blocks/skills/chips.svelte?raw'
import stackChips from '../blocks/stack/chips.svelte?raw'
import stackPlain from '../blocks/stack/plain.svelte?raw'
import stackNone from '../blocks/stack/none.svelte?raw'
import listLines from '../blocks/list/lines.css?raw'
import listColumns from '../blocks/list/columns.css?raw'
import listChips from '../blocks/list/chips.svelte?raw'
import langInline from '../blocks/languages/inline.css?raw'
import langDots from '../blocks/languages/dots.svelte?raw'
import langBars from '../blocks/languages/bars.svelte?raw'
import certGrid from '../blocks/certifications/grid.css?raw'
import certCards from '../blocks/certifications/cards.css?raw'
import certCompact from '../blocks/certifications/compact.css?raw'
import densityCompact from '../blocks/density/compact.css?raw'
import densityAiry from '../blocks/density/airy.css?raw'

/**
 * @typedef {object} Variant
 * @property {string} id
 * @property {string} name
 * @property {string} hint    one line, shown as the option's tooltip
 * @property {string} [css]     a style-only variant's stylesheet
 * @property {string} [svelte]  a fragment whose snippets replace the layout's
 * @property {string} [layout]  a whole layout — the `page` slot only
 */

/**
 * @typedef {object} Slot
 * @property {string} id
 * @property {string} name      what the picker calls it
 * @property {string} snippet   the layout snippet a variant of this slot replaces; '' when style-only
 * @property {Variant[]} variants  the first is the default and has no source
 */

/**
 * Ordered, and the order matters twice: it is the order the picker draws, and
 * the order the composed stylesheet is concatenated in — so `density` sits last
 * and can quiet anything above it without reaching for `!important`.
 * @type {Slot[]}
 */
export const SLOTS = [
  {
    id: 'page',
    name: 'Page',
    snippet: 'body',
    variants: [
      { id: 'single', name: 'Single column', hint: 'One column, everything in source order', layout: singleLayout },
      { id: 'sidebar', name: 'Sidebar', hint: 'Skills and lists in a left rail beside everything else', layout: sidebarLayout },
      { id: 'rail-right', name: 'Rail right', hint: 'The same rail, on the right — the main column reads first', layout: railRightLayout },
      { id: 'gutter', name: 'Gutter', hint: 'A measure down the left that titles and dates hang in', css: pageGutter },
    ],
  },
  {
    id: 'header',
    name: 'Header',
    snippet: 'head',
    variants: [
      { id: 'split', name: 'Split', hint: 'Name at the left, contact at the right' },
      { id: 'centered', name: 'Centred', hint: 'Name, role and contact down the middle', css: headerCentered },
      { id: 'quiet', name: 'Quiet', hint: 'The same split, set lighter, under a hairline', css: headerQuiet },
      { id: 'stacked', name: 'Stacked', hint: 'Name over the contact line, both hard left', css: headerStacked },
      { id: 'banner', name: 'Banner', hint: 'A masthead — the name in caps between two rules', css: headerBanner },
    ],
  },
  {
    id: 'sectionHead',
    name: 'Section title',
    snippet: 'secHead',
    variants: [
      { id: 'ruled', name: 'Ruled', hint: 'A rule trailing every heading' },
      { id: 'ruled-both', name: 'Ruled both', hint: 'A rule either side, so the title centres', css: secHeadRuledBoth },
      { id: 'dotted', name: 'Dotted', hint: 'The trailing rule drawn as dots', css: secHeadDotted },
      { id: 'dashed', name: 'Dashed', hint: 'The trailing rule broken into dashes', css: secHeadDashed },
      { id: 'double', name: 'Double', hint: 'Two hairlines trailing every heading', css: secHeadDouble },
      { id: 'plain', name: 'Plain', hint: 'No rule — a small tracked-out label', css: secHeadPlain },
      { id: 'gutter', name: 'Gutter', hint: 'The title in the gutter, the rule beside it', css: secHeadGutter },
      { id: 'boxed', name: 'Boxed', hint: 'The title in an outlined box, no rule', css: secHeadBoxed },
      { id: 'numbered', name: 'Numbered', hint: '01 / SUMMARY — sections counted as they come', css: secHeadNumbered },
    ],
  },
  {
    id: 'summary',
    name: 'Summary',
    snippet: 'summaryBody',
    variants: [
      { id: 'plain', name: 'Plain', hint: 'Paragraphs across the full measure' },
      { id: 'centered', name: 'Centred', hint: 'Pulled in from both margins and centred', css: summaryCentered },
      { id: 'lede', name: 'Lede', hint: 'The opening paragraph set larger, on a shorter measure', css: summaryLede },
    ],
  },
  {
    id: 'entry',
    name: 'Entry',
    snippet: 'entry',
    variants: [
      { id: 'plain', name: 'Plain', hint: 'Title and dates on one line, bullets under' },
      { id: 'timeline', name: 'Timeline', hint: 'Hung off a dated vertical rail', css: entryTimeline },
      { id: 'card', name: 'Card', hint: 'Each role in a box of its own', css: entryCard },
      { id: 'gutter', name: 'Gutter', hint: 'Dates in a gutter down the left', css: entryGutter },
      { id: 'minimal', name: 'Minimal', hint: 'No marks — rules for bullets, weight for titles', css: entryMinimal },
      { id: 'badge', name: 'Badge', hint: 'The dates as an outlined badge on the title line', css: entryBadge },
      { id: 'stripe', name: 'Stripe', hint: 'Each entry against a thick accent rule', css: entryStripe },
    ],
  },
  {
    id: 'skills',
    name: 'Skills',
    snippet: 'skillsBody',
    variants: [
      { id: 'two-col', name: 'Two columns', hint: 'Two groups across, divided by rules' },
      { id: 'three-col', name: 'Three columns', hint: 'Three across — more rows to a page', css: skillsThreeCol },
      { id: 'rows', name: 'Rows', hint: 'One group per row, its name in the gutter', css: skillsRows },
      { id: 'cards', name: 'Cards', hint: 'Every group in a box of its own', css: skillsCards },
      { id: 'bare', name: 'Bare', hint: 'Two columns with the dividers taken out', css: skillsBare },
      { id: 'inline', name: 'Inline', hint: 'One line per group, its rows running on after the name', css: skillsInline },
      { id: 'chips', name: 'Chips', hint: 'Every skill a chip with its logo', svelte: skillsChips },
    ],
  },
  {
    id: 'stack',
    name: 'Stack',
    snippet: 'stackLine',
    variants: [
      { id: 'line', name: 'Line', hint: 'STACK · one tool after another' },
      { id: 'chips', name: 'Chips', hint: 'A chip per tool, each with its logo', svelte: stackChips },
      { id: 'plain', name: 'Plain', hint: 'The same line without the label', svelte: stackPlain },
      { id: 'none', name: 'None', hint: 'Hidden — the YAML keeps its tools', svelte: stackNone },
    ],
  },
  {
    id: 'list',
    name: 'List',
    snippet: 'listBody',
    variants: [
      { id: 'pills', name: 'Pills', hint: 'An inline list as outlined pills' },
      { id: 'lines', name: 'Lines', hint: 'One item per line instead of a pill', css: listLines },
      { id: 'columns', name: 'Columns', hint: 'Two columns of lines — half the height', css: listColumns },
      { id: 'chips', name: 'Chips', hint: 'A chip per item, each with its logo', svelte: listChips },
    ],
  },
  {
    id: 'languages',
    name: 'Languages',
    snippet: 'langBody',
    variants: [
      { id: 'rows', name: 'Rows', hint: 'Name and level, two to a row' },
      { id: 'inline', name: 'Pills', hint: 'A pill per language, its level inside it', css: langInline },
      { id: 'dots', name: 'Dots', hint: 'A five-dot meter read from the level', svelte: langDots },
      { id: 'bars', name: 'Bars', hint: 'A bar the level fills its share of', svelte: langBars },
    ],
  },
  {
    id: 'certifications',
    name: 'Certificates',
    snippet: 'certBody',
    variants: [
      { id: 'rows', name: 'Rows', hint: 'One a line, the date out at the right' },
      { id: 'grid', name: 'Grid', hint: 'Two to a row, each hung off a short rule', css: certGrid },
      { id: 'cards', name: 'Cards', hint: 'Every certificate in a box of its own', css: certCards },
      { id: 'compact', name: 'Compact', hint: 'One ruled line each, the issuer following the name', css: certCompact },
    ],
  },
  {
    id: 'density',
    name: 'Density',
    snippet: '',
    variants: [
      { id: 'normal', name: 'Normal', hint: 'The measure and spacing cv.css declares' },
      { id: 'compact', name: 'Compact', hint: 'Tighter type and less air — more on a page', css: densityCompact },
      { id: 'airy', name: 'Airy', hint: 'A narrower measure and room between sections', css: densityAiry },
    ],
  },
]

/**
 * The lookups all take the registry as an argument, defaulted to the one above.
 * PartManager hands them a copy with the user's own variants folded in, which
 * is what lets one of those be chosen, composed and picked exactly as a shipped
 * one is — see parts.svelte.js.
 *
 * The extra fields are PartManager's: a picker draws a `*` beside a shipped
 * part that has been edited, and links to a part by its id.
 *
 * @typedef {(Omit<Slot, 'variants'> & {
 *   variants: (Variant & { partId?: string, builtin?: boolean, edited?: boolean })[],
 * })[]} Registry
 */

/** @param {string} id @param {Registry} [slots] */
export const slot = (id, slots = SLOTS) => slots.find((s) => s.id === id) ?? null

/**
 * @param {string} slotId
 * @param {string | undefined | null} variantId
 * @param {Registry} [slots]
 */
export function variant(slotId, variantId, slots = SLOTS) {
  return slot(slotId, slots)?.variants.find((v) => v.id === variantId) ?? null
}

/**
 * Falls back rather than trusting the ids it is given: a file may name a
 * variant that has since been deleted, and one saved before any of this existed
 * names none of them.
 * @param {Record<string, string> | undefined | null} choices
 * @param {Registry} [slots]
 * @returns {Record<string, string>}
 */
export function resolveSlots(choices, slots = SLOTS) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const s of slots) {
    const wanted = choices?.[s.id]
    out[s.id] = s.variants.some((v) => v.id === wanted) ? /** @type {string} */ (wanted) : s.variants[0].id
  }
  return out
}

/** The id a part is stored and edited under — `stack:chips`. @param {string} slotId @param {string} variantId */
export const partId = (slotId, variantId) => `${slotId}:${variantId}`
