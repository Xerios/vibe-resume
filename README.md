# CV Editor

A local-first CV editor: YAML on the left, a print-ready CV on the right. Everything
runs in the browser — no network calls, no CDN, no account.

Grown out of `template-artifact.html` (kept in the repo for reference), with three
changes: the compact/full version toggle is gone, every library is bundled from npm
instead of a CDN, and the document is now a [Loro](https://loro.dev) CRDT persisted
to `localStorage` with a version history.

## Running it

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # static site in build/
pnpm check      # svelte-check
```

## How it works

| Concern            | Where                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Document + history | [src/lib/cv/doc.svelte.js](src/lib/cv/doc.svelte.js) — Loro doc, persistence, cross-tab merge |
| Editor             | [src/lib/components/YamlEditor.svelte](src/lib/components/YamlEditor.svelte) — CodeMirror 6   |
| YAML to HTML       | [src/lib/cv/render.js](src/lib/cv/render.js)                                                 |
| Starting text      | [src/lib/cv/default-cv.yaml](src/lib/cv/default-cv.yaml)                                     |
| Layout & theme     | [src/lib/cv/presets.js](src/lib/cv/presets.js) — the presets, and the CSS beside it           |
| CSS                | [src/app.css](src/app.css) — the index; see *Where the CSS lives* below                      |
| Offline            | [src/service-worker.js](src/service-worker.js) — precache; manifest and icons in `static/`    |

### Editor and document

The editor is CodeMirror 6, bound to the document by
[loro-codemirror](https://github.com/loro-dev/loro-codemirror). That binding owns
both directions of text sync and the undo stack, so nothing in this codebase watches
keystrokes: `LoroExtensions(doc, undefined, undoManager, cvText)` is the whole wiring.
CodeMirror's own `history()` is deliberately left out — the binding installs Loro's
undo at high precedence, and two undo stacks would fight over Ctrl+Z.

Syntax colours are a `HighlightStyle` whose values are CSS custom properties, so one
style serves both themes; the `--cm-*` tokens live in
[tokens.css](src/lib/styles/tokens.css) and the rules that spend them in
[codemirror.css](src/lib/components/codemirror.css).

### Layout and theme

The Style button offers five arrangements of the sheet — classic, compact,
centered, sidebar, timeline — and seven palettes. Both are per file, stored in
the file registry next to the name rather than in the CRDT: restyling is not an
edit, so it leaves the YAML and the version history alone.

The ids land on `#cv-root` as `data-cv-layout` / `data-cv-theme`, and
[presets.css](src/lib/cv/presets.css) does the rest. A theme there is pure
data — a light ramp (`--t-*-l`) and a dark one (`--t-*-d`), choosing neither.
One block downstream re-points the app's tokens at whichever ramp applies, and
that indirection is what lets printing from dark mode fall back to the light
ramp of *the chosen theme* instead of a hardcoded teal.

Layouts are CSS alone, with one exception: the sidebar needs two real columns,
so `CvSheet` renders a rail and a main column for that layout only. Skills go
to the rail; any section can opt in or out with `rail: true` / `rail: false`.
Every other layout renders exactly the markup it did before.

### Where the CSS lives

Everything that belongs to one piece of UI is styled where that piece is
written, in the component's own `<style>` block — `#toolbar` in `Toolbar.svelte`,
`.hist-*` in `HistoryPanel.svelte`, and so on. A rule only becomes global when
it genuinely has no single owner:

| File                                                              | Holds                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| [app.css](src/app.css)                                            | the index — imports the three below, and nothing else         |
| [styles/tokens.css](src/lib/styles/tokens.css)                    | both colour ramps, the type stack, `--theme-fade`             |
| [styles/base.css](src/lib/styles/base.css)                        | reset, page background, scrollbars, the `#app` shell          |
| [styles/controls.css](src/lib/styles/controls.css)                | `.t-btn` and friends — used from six different places         |
| [styles/print.css](src/lib/styles/print.css)                      | the page box, and the chrome that has no business on paper    |
| [components/codemirror.css](src/lib/components/codemirror.css)    | the CodeMirror theme, imported by `YamlEditor.svelte`         |
| [cv/cv.css](src/lib/cv/cv.css)                                    | the sheet itself, plus how it paginates                       |
| [cv/presets.css](src/lib/cv/presets.css)                          | the layouts and themes selected on `#cv-root`                 |

The last three are global for the same underlying reason: they style DOM the
Svelte compiler never sees. CodeMirror builds its own; the sheet's markdown
fields are injected with `{@html}`. Scoped selectors would reach neither.

### Versions

The binding commits on every editor transaction, so history granularity comes from
Loro's change-merge window: unnamed commits inside 45 seconds fold into one change,
making history read as one entry per editing burst. Loro never merges anything into a
change that carries a message, so named versions always stand alone.

Naming a version writes into a `checkpoints` map container and commits that with a
message. The map operation is what gives the commit something real to carry — a bare
`commit()` with nothing pending creates no change at all, so "name this version"
would silently do nothing without it.

Reset and Restore can't mutate the text container directly: the binding ignores
`local` events, so a direct write would never reach the editor. Both instead push
text in as an ordinary editor transaction and label the resulting commit through
`subscribePreCommit`. Restore reads the old text with `forkAt`, which leaves the live
document untouched.

Clicking a version checks it out — the document detaches and the editor goes
read-only until you go back to the latest or restore. Restoring is additive; nothing
is discarded.

### Persistence

The whole document, history included, is exported as a Loro snapshot and base64'd
into `localStorage` on a 400 ms debounce, plus synchronously on tab close. Open the
editor in two tabs and they merge through the `storage` event — that is the CRDT
earning its keep rather than decorating. The stored value carries a lineage marker so
that "Clear history" in one tab replaces the document in the others instead of
merging two unrelated ones.

### Offline

Nothing here ever talked to the network, but until there was a service worker the
browser still could not *load* the app without a server. `src/service-worker.js`
precaches the Vite bundle, everything in `static/`, and the prerendered shell, so a
single visit is enough; after that it runs with the network off. SvelteKit registers it
automatically in a production build and leaves it out of `vite dev`, so development
never serves stale bytes.

The one asset that makes this sharper than a usual PWA is Loro's `.wasm`, fetched
lazily on first document load rather than inlined. Uncached, the app would paint its
shell and then hang forever on `await wasmReady`. It is precached with everything else,
and the fetch handler also keeps any same-origin response it sees, so the first online
visit would capture it even if it ever fell out of the build manifest.

Updates are deliberately quiet: no `skipWaiting`, so a new worker takes over only once
every tab of the old one has closed. That keeps an editing session from being swapped
out mid-edit, and it means the cache purge on activation cannot delete a lazily-loaded
chunk that a live page still wants.

Installed, it registers as a handler for `.yaml` / `.yml`. A file opened from the OS
arrives through `launchQueue` and becomes its own tab, seeded so its version history
starts with the imported text instead of the template plus an overwrite. The manifest
asks for `focus-existing` because the whole state of this app is `localStorage` — a
second window would be a second writer racing the first.

Startup also asks for `navigator.storage.persist()`. An installed PWA is usually granted
it silently, and an offline editor that loses the CV it was holding to storage pressure
is not much of one.

## Dependencies

All bundled locally — the only WASM/asset URL is same-origin.

`loro-crdt` ships several builds. `loro-codemirror` imports the bare specifier, which
resolves to a build that loads its WASM with a synchronous main-thread XHR, and would
be a *second* WASM instance whose objects the first instance cannot accept. The alias
in [vite.config.js](vite.config.js) pins every importer to the async `web` build, so
exactly one `.wasm` is emitted. `optimizeDeps.exclude` is there because pre-bundling
rewrites the `new URL(..., import.meta.url)` the build uses to find that file.
