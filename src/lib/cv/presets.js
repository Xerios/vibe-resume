/**
 * How a CV is *painted*: a theme is a palette id that lands on `#cv-root` as a
 * data attribute, and presets.css re-points the sheet's tokens at the ramp it
 * names. How a CV is *arranged* used to live here too — those layouts are now
 * templates, in templates.js, because a component can be edited and a block of
 * CSS in this repo cannot.
 *
 * A theme is presentation, not content, so it is stored per file in the
 * registry (see files.svelte.js) rather than in the YAML: recolouring is not an
 * edit and never shows up in version history.
 */

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

export const DEFAULT_THEME = 'teal';

/**
 * Falls back rather than trusting what came out of storage — a file saved
 * before this feature has no theme, and an id can outlive its preset.
 * @param {string | undefined | null} id
 */
export function resolveTheme(id) {
	return THEMES.some((t) => t.id === id) ? /** @type {string} */ (id) : DEFAULT_THEME;
}
