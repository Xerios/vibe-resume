/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit({
      // The app's own <style> blocks are SCSS (nesting only — see README). The
      // layouts and blocks under src/lib/cv are compiled in the browser, where
      // no preprocessor runs, so they stay plain CSS.
      preprocess: vitePreprocess(),

      // Templates are compiled in the browser (see src/lib/cv/template/compile-template.js),
      // where `@cv` is resolved by a registry rather than by a bundler. Declaring
      // it here as well is what lets the built-in layouts and block variants in
      // src/lib/cv/{layouts,blocks} be ordinary, type-checked components that
      // import the very same module.
      alias: { '@cv': 'src/lib/cv/template/template-api.js' },

      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
      },

      // The editor is a fully client-side, offline-capable app (see src/routes/+layout.js),
      // so it builds to a plain static bundle that can be opened from any web server.
      adapter: adapter({ fallback: 'index.html' }),

      // SvelteKit's own registration runs in `vite dev` too, which puts a caching
      // worker in front of the dev server: edits arrive only after the "Update
      // ready" dance, and sometimes not even then. src/lib/sw-update.svelte.js
      // registers it by hand instead, in production builds only.
      serviceWorker: { register: false },
    }),
  ],

  resolve: {
    // loro-codemirror imports bare `loro-crdt`, which resolves to a build that
    // loads its WASM through a synchronous XHR on the main thread — and, being a
    // second copy, would hand us a second WASM instance whose objects the first
    // cannot accept. Pin every importer to the same async `web` build.
    alias: [{ find: /^loro-crdt$/, replacement: 'loro-crdt/web' }],
  },

  test: {
    // The block variants that are plain CSS are imported `?raw` like every
    // other part. Vitest stubs CSS out by default, which would hand the
    // composer an empty string and quietly pass every test that depends on
    // one — so it has to process them here as the browser does.
    css: true,
  },

  optimizeDeps: {
    // These locate their .wasm with `new URL('...', import.meta.url)`. Pre-bundling
    // rewrites that URL and breaks the lookup, so let Vite handle the ESM directly.
    exclude: ['loro-crdt', 'loro-codemirror'],
  },
})
