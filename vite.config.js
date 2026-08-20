import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The editor is a fully client-side, offline-capable app (see src/routes/+layout.js),
			// so it builds to a plain static bundle that can be opened from any web server.
			adapter: adapter({ fallback: 'index.html' })
		})
	],

	resolve: {
		// loro-codemirror imports bare `loro-crdt`, which resolves to a build that
		// loads its WASM through a synchronous XHR on the main thread — and, being a
		// second copy, would hand us a second WASM instance whose objects the first
		// cannot accept. Pin every importer to the same async `web` build.
		alias: [{ find: /^loro-crdt$/, replacement: 'loro-crdt/web' }]
	},

	optimizeDeps: {
		// These locate their .wasm with `new URL('...', import.meta.url)`. Pre-bundling
		// rewrites that URL and breaks the lookup, so let Vite handle the ESM directly.
		exclude: ['loro-crdt', 'loro-codemirror']
	}
});
