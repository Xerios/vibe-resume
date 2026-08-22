/**
 * How a CV is *shown*: `layout` picks the arrangement of the sheet, `theme` the
 * palette it is painted in. Both are ids that land on `#cv-root` as data
 * attributes — the rules they select live in presets.css, and the sidebar
 * layout additionally rearranges markup in CvSheet.svelte.
 *
 * These are presentation, not content, so they are stored per file in the
 * registry (see files.svelte.js) rather than in the YAML: switching layout is
 * not an edit and never shows up in version history.
 */

/**
 * @typedef {object} Layout
 * @property {string} id
 * @property {string} name
 * @property {string} hint  one line, shown as the option's tooltip
 */

/** @type {Layout[]} */
export const LAYOUTS = [
	{ id: 'classic', name: 'Classic', hint: 'One column, a rule trailing every heading' },
	{ id: 'compact', name: 'Compact', hint: 'Tighter type and three skill columns — fits more on a page' },
	{ id: 'centered', name: 'Centered', hint: 'Header and section titles centred' },
	{ id: 'sidebar', name: 'Sidebar', hint: 'Skills in a left rail beside everything else' },
	{ id: 'timeline', name: 'Timeline', hint: 'Experience on a dated vertical rail' }
];

/**
 * The palette itself lives in palettes.css; the picker's swatch is drawn by
 * putting `data-cv-theme` on the option, so there is no second copy of the
 * colours here to drift out of step.
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} name
 */

/** @type {Theme[]} */
export const THEMES = [
	{ id: 'teal', name: 'Teal' },
	{ id: 'slate', name: 'Slate' },
	{ id: 'indigo', name: 'Indigo' },
	{ id: 'plum', name: 'Plum' },
	{ id: 'ember', name: 'Ember' },
	{ id: 'sepia', name: 'Sepia' },
	{ id: 'mono', name: 'Mono' }
];

export const DEFAULT_LAYOUT = 'timeline';
export const DEFAULT_THEME = 'teal';

/**
 * Both resolvers fall back rather than trust what came out of storage — a file
 * saved before this feature has neither, and an id can outlive its preset.
 * @param {string | undefined | null} id
 */
export function resolveLayout(id) {
	return LAYOUTS.some((l) => l.id === id) ? /** @type {string} */ (id) : DEFAULT_LAYOUT;
}

/** @param {string | undefined | null} id */
export function resolveTheme(id) {
	return THEMES.some((t) => t.id === id) ? /** @type {string} */ (id) : DEFAULT_THEME;
}
