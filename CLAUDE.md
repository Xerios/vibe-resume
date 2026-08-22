# Resume Editor

Read `README.md` first — it documents the architecture (Loro CRDT doc, CodeMirror
binding, version history, CSS layering) in depth. Don't duplicate it here.

## Environment

- `pnpm` only. `loro-codemirror` is patched via `patchedDependencies` in
  `pnpm-workspace.yaml`; `npm`/`yarn install` silently drops the patch and undo breaks.
- There is no `svelte.config.js` — SvelteKit config lives in the `sveltekit({...})`
  plugin options inside `vite.config.js`.
- `pnpm check` (svelte-check) is the only automated gate. No tests, no ESLint, no
  Prettier config — match surrounding style (tabs) rather than reformatting.

## Conventions

- JS with JSDoc types, not TypeScript. `checkJs` + `strict` are on, so type errors
  surface through `pnpm check`. `src/app.d.ts` is the only `.ts` file.
- Runes are forced on for all non-`node_modules` files (`vite.config.js`). Shared
  reactive state lives in `.svelte.js` classes using `$state` / `$derived`.
- The app has two routes and they share one set of state objects — the
  singletons in `src/lib/cv/state.svelte.js`. Don't construct a `CvDoc`,
  `FileManager` or `TemplateManager` in a page; import those and call `start()`.
- The five built-in templates in `src/lib/cv/templates/` are `.svelte` files that
  are only ever imported `?raw`. They are still compiled by `pnpm check`, so a
  broken one fails the gate; `@cv` is aliased in `vite.config.js` for their sake,
  and resolved again at runtime by `compile-template.js`.
- Never write a literal `<style>` or `<script>` tag inside a comment in a Svelte
  `<script>` block — the parser reads it as the real thing and `pnpm check`
  fails, even though the app compiles.
- Style each piece of UI in its own component's `<style>` block. `src/lib/styles/*`,
  `cv/*.css` and `components/codemirror.css` are global only because they style DOM
  Svelte never compiles (CodeMirror's own, and `{@html}` output).
