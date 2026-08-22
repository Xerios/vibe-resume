/**
 * The templates that ship with the editor.
 *
 * A template is how the CV is *arranged*: an ordinary Svelte component handed
 * the parsed YAML as `cv`, compiled in the browser and mounted inside the
 * preview frame (see compile-template.js). What used to be five CSS-only
 * "layouts" are these five components — same markup and rules as before, but
 * now readable and editable in the app rather than buried in presets.css.
 *
 * The sources are imported as text, not as components: nothing here is ever
 * mounted directly. They are still real `.svelte` files so that `pnpm check`
 * type-checks them and a broken shipped template can't reach a release.
 *
 * User edits live beside these in localStorage — see TemplateManager in
 * templates.svelte.js, which is what the rest of the app talks to.
 */

import centeredSource from './templates/centered.svelte?raw';
import classicSource from './templates/classic.svelte?raw';
import compactSource from './templates/compact.svelte?raw';
import sidebarSource from './templates/sidebar.svelte?raw';
import timelineSource from './templates/timeline.svelte?raw';

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
		source: classicSource
	},
	{
		id: 'compact',
		name: 'Compact',
		hint: 'Tighter type and three skill columns — fits more on a page',
		source: compactSource
	},
	{
		id: 'centered',
		name: 'Centered',
		hint: 'Header and section titles centred',
		source: centeredSource
	},
	{
		id: 'sidebar',
		name: 'Sidebar',
		hint: 'Skills in a left rail beside everything else',
		source: sidebarSource
	},
	{
		id: 'timeline',
		name: 'Timeline',
		hint: 'Experience on a dated vertical rail',
		source: timelineSource
	}
];

export const DEFAULT_TEMPLATE = 'timeline';

/** @param {string} id */
export function builtin(id) {
	return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;
}
