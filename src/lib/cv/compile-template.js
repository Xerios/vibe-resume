/**
 * Compiling a template in the browser — the REPL, minus the REPL.
 *
 * Svelte's compiler is an ordinary module that runs anywhere, so a template's
 * source can go through exactly the same pass Vite would have given it at build
 * time. What Vite also does, and what has to be replaced here, is resolve the
 * imports the output comes back with: compiled client code opens with
 * `import * as $ from 'svelte/internal/client'`, and a bare specifier means
 * nothing to the browser.
 *
 * So each allowed specifier gets a *shim module* — a blob whose body re-exports,
 * name by name, the module this app already has bundled (`MODULES` below, filled
 * on first use). The compiled source's own import lines are rewritten to point
 * at those blobs, the result becomes a blob of its own, and `import()` turns it
 * into a component. One Svelte runtime, one copy of `marked`, no network.
 *
 * The compiler is loaded on demand: it is by far the largest thing this app
 * could ship, and an editor that never opens the template pane should never pay
 * for it. It is still bundled locally, so the first template still compiles
 * offline.
 *
 * A template is the user's own code and it runs in the app's realm, not the
 * preview frame's — `mount()` takes a component, and a component can only come
 * from the realm that compiled it. That is a real difference from the file's
 * custom CSS, which the frame contains completely. The trade is deliberate: the
 * alternative is a second Svelte runtime inside the frame, and two runtimes
 * cannot share one component.
 */

import * as cvApi from '@cv';
import * as marked from 'marked';
import * as svelte from 'svelte';

/** Where the shim modules read their exports back out of. */
const REGISTRY = '__cvTemplateModules';

/** What a template may import. Anything else is a compile error with a list. */
const ALLOWED = [
	'@cv',
	'svelte',
	'marked',
	'svelte/internal/client',
	// Emitted by the compiler itself; it only registers a version, so an empty
	// module satisfies it and saves pulling the real one into the bundle.
	'svelte/internal/disclose-version'
];

/** specifier → blob URL of its shim. Built once and kept: the URLs are stable. */
const shims = new Map();

/** @type {Promise<Record<string, any>> | null} */
let modulesPromise = null;
/** @type {Promise<typeof import('svelte/compiler')> | null} */
let compilerPromise = null;

/**
 * The real modules, behind the specifiers a template names. `svelte/internal/client`
 * is fetched rather than imported at the top because it is only ever needed by a
 * compiled template — and by then the compiler has been fetched too.
 */
function modules() {
	modulesPromise ??= (async () => ({
		'@cv': cvApi,
		svelte,
		marked,
		'svelte/internal/client': await import('svelte/internal/client'),
		'svelte/internal/disclose-version': null
	}))();
	return modulesPromise;
}

function compiler() {
	compilerPromise ??= import('svelte/compiler');
	return compilerPromise;
}

/**
 * Source → a mounted-able component and the CSS its `<style>` block compiled to.
 *
 * The CSS comes back separately (`css: 'external'`) rather than being injected
 * by the component itself: the sheet is mounted into the preview frame, and
 * Svelte would put the styles in the document the *compiler* ran in. The frame
 * gets a `<style>` element of its own for them — see PreviewFrame.
 *
 * @param {string} source
 * @returns {Promise<{ component: any, css: string }>}
 * @throws {Error & { line?: number }} on a compile error, with the line if it has one
 */
export async function compileTemplate(source) {
	const { compile } = await compiler();

	let result;
	try {
		result = compile(source, {
			name: 'Template',
			filename: 'Template.svelte',
			generate: 'client',
			css: 'external',
			runes: true,
			dev: false
		});
	} catch (e) {
		throw asTemplateError(e);
	}

	const url = URL.createObjectURL(
		new Blob([await link(result.js.code)], { type: 'text/javascript' })
	);
	try {
		const mod = await import(/* @vite-ignore */ url);
		if (typeof mod.default !== 'function')
			throw new Error('The template exports no component — is the file empty?');
		return { component: mod.default, css: result.css?.code ?? '' };
	} finally {
		// The module has been fetched and instantiated by now, so the URL has done
		// its job; leaving it live would leak one blob per keystroke.
		URL.revokeObjectURL(url);
	}
}

/**
 * Point the compiled source's imports at shim modules.
 *
 * Only the header is rewritten — every line from the top until the first that
 * isn't an import. The alternative, a pass over the whole file, would happily
 * rewrite an `import 'x'` that happened to appear inside the CV's own text,
 * since the compiler puts the markup in template literals. Anything import-like
 * further down is reported rather than silently left to fail on a bare
 * specifier the browser can't resolve.
 *
 * @param {string} code
 */
async function link(code) {
	const lines = code.split('\n');
	const head = [];
	let i = 0;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) {
			head.push(line);
			continue;
		}
		const m = /^import\s+(?:([\s\S]+?)\s+from\s+)?(['"])(.+?)\2;?\s*$/.exec(line);
		if (!m) break;
		head.push(`import ${m[1] ? `${m[1]} from ` : ''}'${await shimUrl(m[3])}';`);
	}

	const rest = lines.slice(i);
	if (rest.some((line) => /^import[\s{'"*]/.test(line)))
		throw new Error('Imports have to be single lines at the top of the <script> block');

	return [...head, ...rest].join('\n');
}

/**
 * The shim for one specifier: a module that hands back what this app already
 * has loaded under that name. The exports are aliased through generated
 * identifiers so that a name which happens to be a reserved word — `import`,
 * `delete` — still gets re-exported, which a destructuring `export const`
 * couldn't do.
 * @param {string} spec
 */
async function shimUrl(spec) {
	const cached = shims.get(spec);
	if (cached) return cached;

	if (!ALLOWED.includes(spec))
		throw new Error(`A template can't import "${spec}" — only ${ALLOWED.slice(0, 3).join(', ')}`);

	const mods = await modules();
	const mod = mods[spec];
	const names = mod
		? Object.keys(mod).filter((k) => k !== 'default' && /^[A-Za-z_$][\w$]*$/.test(k))
		: [];

	const body = [
		mod ? `const m = globalThis[${JSON.stringify(REGISTRY)}][${JSON.stringify(spec)}];` : '',
		...names.map((n, i) => `const _${i} = m[${JSON.stringify(n)}];`),
		names.length ? `export { ${names.map((n, i) => `_${i} as ${n}`).join(', ')} };` : '',
		mod && 'default' in mod ? 'export default m.default;' : ''
	].filter(Boolean);

	// The blob can't close over anything, so the modules travel by global.
	const registry = (/** @type {any} */ (globalThis)[REGISTRY] ??= {});
	registry[spec] = mod;

	const url = URL.createObjectURL(new Blob([body.join('\n')], { type: 'text/javascript' }));
	shims.set(spec, url);
	return url;
}

/**
 * A compiler error, flattened to something the editor can show: its message
 * without the frame the compiler draws around it, and the line to jump to.
 * @param {unknown} e
 * @returns {Error & { line?: number }}
 */
function asTemplateError(e) {
	const err = /** @type {{ message?: string, start?: { line?: number } }} */ (e);
	// The compiler signs its errors with a docs URL on a second line; the strip
	// that shows this has one line to work with.
	const out = /** @type {Error & { line?: number }} */ (
		new Error((err?.message ?? String(e)).split('\n')[0])
	);
	if (err?.start?.line) out.line = err.start.line;
	return out;
}
