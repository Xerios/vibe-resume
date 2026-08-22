/**
 * What a template is handed to work with — the `@cv` module every template
 * imports (`import { md, list, sections } from '@cv'`).
 *
 * It is a real module, aliased in vite.config.js so the built-in templates in
 * `templates/` type-check like any other source file. At runtime the compiler
 * in compile-template.js resolves the same specifier to this same module, so a
 * template the user has edited spends exactly what the shipped ones do.
 *
 * Everything here is deliberately small: a template's job is markup, and the
 * three things it can't reasonably write itself are inline Markdown, a
 * defensive list, and the section/path pairing the preview's line mapping
 * depends on.
 */

import { marked } from 'marked';

/**
 * Inline Markdown → HTML. Links get target/rel, which marked won't add itself.
 * Used through `{@html md(...)}`, which is why it is a template's business
 * rather than the app's: nothing else in the frame renders user prose.
 * @param {unknown} text
 */
export function md(text) {
	if (!text) return '';
	const html = marked.parseInline(String(text).trim());
	return String(html).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
}

/**
 * A list, whatever the YAML actually said. A half-typed document is the normal
 * case here — the preview re-renders on a keystroke — so every `{#each}` in a
 * template goes through this rather than trusting the shape.
 * @param {unknown} v
 * @returns {any[]}
 */
export const list = (v) => (Array.isArray(v) ? v : []);

/**
 * The document's sections, each paired with its path into the YAML.
 *
 * That path is what a template stamps on the elements it renders as
 * `data-src`, and what lets the page scroll the editor to the line behind
 * whatever the pointer is on (see `buildLineMap` in render.js). The index has
 * to be taken before the filter, or every path past a dropped section would
 * point one entry too far — which is the whole reason this is a helper and not
 * a `map` in each template.
 *
 * @param {any} cv
 * @returns {{ sec: any, path: string }[]}
 */
export function sections(cv) {
	return list(cv?.sections)
		.map((sec, i) => ({ sec, path: `sections.${i}` }))
		.filter((e) => e.sec && typeof e.sec === 'object');
}
