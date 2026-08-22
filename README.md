# Resume Editor

A local-first Resume Editor: YAML on the left, a print-ready CV on the right. Everything
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
| Chrome             | `components/{Toolbar,TabBar,StatusBar}.svelte` — the buttons, the tabs, the status bar        |
| YAML to HTML       | [src/lib/cv/render.js](src/lib/cv/render.js)                                                 |
| Preview            | [src/lib/cv/PreviewFrame.svelte](src/lib/cv/PreviewFrame.svelte) — the iframe the sheet renders in |
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
[presets.css](src/lib/cv/presets.css) does the rest. A theme is pure data — a
ramp of eight colours, declared in [palettes.css](src/lib/cv/palettes.css) and
spent by one block downstream that re-points the frame's tokens at it.

The sheet does not follow the app into dark mode. It is paper: it renders light
on screen, prints exactly what it showed, and the app's dark toggle dresses only
the editor around it. That is why the frame is never told which ramp the app is
in, and why nothing in the print rules has to undo a dark one. Each palette
still carries the `--t-*-d` half it would need for a dark preview — unspent, but
kept beside the light ramp so the two can't drift apart.

Palettes sit in their own file because they are the one part of the preset
system the app still needs: the sheet's CSS all moves into the frame, but
StylePicker draws each swatch by putting `data-cv-theme` on the option itself,
so there is no second copy of the colours to drift out of step. The swatches
read from the light ramp too, for the same reason the sheet does — one that
darkened with the chrome would advertise a CV the preview can't produce.

Below both is a third layer, per file like the other two: arbitrary CSS, edited
in the Style popover and applied last inside the frame. It is stored and
validated exactly as much as it needs to be, which is not at all — the worst a
broken rule can do is make the sheet look wrong.

Layouts are CSS alone, with one exception: the sidebar needs two real columns,
so `CvSheet` renders a rail and a main column for that layout only. Skills go
to the rail; any section can opt in or out with `rail: true` / `rail: false`.
Every other layout renders exactly the markup it did before.

### Keyboard

Every control in the chrome carries an `accesskey` and underlines the letter it
answers to — `H` on History, `X` on Export, `N` on the button that opens a tab.
Which chord unlocks them is the browser's to decide rather than ours: Chromium
takes plain Alt, Firefox insists on Alt+Shift, and a Mac uses Ctrl+Alt
throughout. [access-keys.js](src/lib/components/access-keys.js) reads which one
applies, once, and every tooltip spells it out — so the same underlined `H`
reads as `(Alt+H)` or `(Alt+Shift+H)` depending on where it is being read.

The rest is what a file list trains you to try: `Ctrl+S` names a version, `F2`
renames the tab holding focus, `Escape` dismisses the style popover, the trash
panel and the new-tab menu — handing focus back to whatever opened them — and
the divider between the panes moves with the arrow keys.

### Where the CSS lives

Everything that belongs to one piece of UI is styled where that piece is
written, in the component's own `<style>` block — `#toolbar` in `Toolbar.svelte`,
`.hist-*` in `HistoryPanel.svelte`, and so on. A rule only becomes global when
it genuinely has no single owner:

In the app's document:

| File                                                              | Holds                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| [app.css](src/app.css)                                            | the index — imports the three below, and nothing else         |
| [styles/tokens.css](src/lib/styles/tokens.css)                    | both colour ramps, the type stack, `--theme-fade`             |
| [styles/base.css](src/lib/styles/base.css)                        | reset, page background, scrollbars, the `#app` shell          |
| [styles/controls.css](src/lib/styles/controls.css)                | `.t-btn` and friends — used from six different places         |
| [styles/print.css](src/lib/styles/print.css)                      | the fallback for a print the app can't intercept              |
| [components/codemirror.css](src/lib/components/codemirror.css)    | the CodeMirror theme, imported by `YamlEditor.svelte`         |
| [cv/palettes.css](src/lib/cv/palettes.css)                        | the seven ramps — here only so StylePicker can draw a swatch  |

And in the preview frame's, written into it by `PreviewFrame`:

| File                                                              | Holds                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| [cv/frame.css](src/lib/cv/frame.css)                              | the frame's reset, tokens and page box — its declared inputs  |
| [cv/cv.css](src/lib/cv/cv.css)                                    | the sheet itself, plus how it paginates                       |
| [cv/palettes.css](src/lib/cv/palettes.css)                        | the same seven ramps, this time for the sheet to spend        |
| [cv/presets.css](src/lib/cv/presets.css)                          | the layouts and themes selected on `#cv-root`                 |
| the active file's own CSS                                         | whatever you typed into the Style popover, applied last       |

`codemirror.css` and the frame's four are global for the same underlying
reason: they style DOM the Svelte compiler never sees. CodeMirror builds its
own; the sheet is mounted into another document, and its markdown fields are
injected with `{@html}` on top of that. Scoped selectors would reach neither.

### The preview frame

The sheet renders inside a same-origin `srcdoc` iframe rather than in the app's
own DOM. That is what makes a file's custom CSS safe to allow at all: nothing
crosses the boundary in either direction, custom properties included, so the
worst a rule can do is make the CV look wrong. It also means the frame has to
declare everything the sheet spends — `frame.css` is that list, and the overlap
with `tokens.css` is the point rather than an oversight.

`CvFrameBody` is `mount()`ed into the frame's `#cv-root` with a `$state` props
object; mutating it re-renders the sheet in place, so the frame is built once
and never reloaded.

Two things follow from the move. Printing goes to `iframe.contentWindow.print()`
— printing the app instead would put the frame on the page as a box and crop the
CV to it — which is also why `Ctrl+P` is intercepted; `print.css` is now only the
fallback for a print started from the browser's own menu, which nothing can
catch. And every listener the two panes need is bound to the frame's document,
since an iframe's events don't bubble out: `instanceof Element` is no use in
there either, because the constructor belongs to the app's realm and disowns
every node in the frame.

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
