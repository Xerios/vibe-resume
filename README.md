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
| Template editor    | [src/routes/template/+page.svelte](src/routes/template/+page.svelte) — the second page, and its CodeMirror |
| Chrome             | `components/{Toolbar,TabBar,StatusBar}.svelte` — the buttons, the tabs, the status bar        |
| YAML to HTML       | [src/lib/cv/render.js](src/lib/cv/render.js)                                                 |
| Preview            | [src/lib/cv/PreviewFrame.svelte](src/lib/cv/PreviewFrame.svelte) — the iframe the sheet renders in |
| Starting text      | [src/lib/cv/default-cv.yaml](src/lib/cv/default-cv.yaml)                                     |
| Templates          | [src/lib/cv/templates/](src/lib/cv/templates/) — one Svelte component per arrangement        |
| Template registry  | [src/lib/cv/templates.svelte.js](src/lib/cv/templates.svelte.js) — edits, forks, reverts      |
| Compiling one      | [src/lib/cv/compile-template.js](src/lib/cv/compile-template.js) — Svelte, in the browser     |
| Shared state       | [src/lib/cv/state.svelte.js](src/lib/cv/state.svelte.js) — the document, files and templates both pages hold |
| Theme              | [src/lib/cv/presets.js](src/lib/cv/presets.js) — the palettes, and the CSS beside it          |
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
style serves both themes; it lives in
[cm-highlight.js](src/lib/components/cm-highlight.js) because both editors spend
it, the `--cm-*` tokens it names live in
[tokens.css](src/lib/styles/tokens.css), and the rules that spend the rest of
them in [codemirror.css](src/lib/components/codemirror.css).

There are two of these, one per page. The second is the template editor — the
same CodeMirror over `@replit/codemirror-lang-svelte`, and the plain `history()`
the first one can't have, since nothing but the user writes to a template. One
stylesheet themes both: [codemirror.css](src/lib/components/codemirror.css) goes
through `:is(#cm-wrap, #tpl-cm)`, which keeps the id specificity it needs to
outrank CodeMirror's own base theme while serving two hosts that can't share an
id.

### Two pages

`/` is the CV — YAML on the left, sheet on the right. `/template` is the
component that sheet is rendered by, with the same CV beside it as a live
preview. The template editor was a second tab in the editor pane first, and the
pane was the wrong place for it: it is a different job, wants the whole window,
keeps an undo stack of its own, and belongs to the template rather than to the
file that happens to be open.

Two pages means the state can no longer be built inside one of them. The
document, the file registry and the template registry are module-level
singletons in [state.svelte.js](src/lib/cv/state.svelte.js), and `start()` is
idempotent because both pages call it — whichever is entered first does the
work. That is what makes crossing between them carry the CRDT along rather than
re-reading it out of localStorage, and what keeps two writers off the same
keys. Client-side navigation is what keeps module scope alive; a hard load of
either URL simply starts over, which is also why `/template` works as a deep
link.

Nothing on the template page writes to the document, so there is no editor bound
to it and no history to keep — the CV over there is read-only, and what is being
edited is stored per template rather than per file.

### Templates

The Style button offers five arrangements of the sheet — classic, compact,
centered, sidebar, timeline — and seven palettes. Both are per file, stored in
the file registry next to the name rather than in the CRDT: restyling is not an
edit, so it leaves the YAML and the version history alone. The popover's *Edit
this template* is an ordinary link to `/template`, and picking a template there
means the same thing it means in the popover: the CV switches to it.

An arrangement is a *template*: an ordinary Svelte component, handed the parsed
YAML as `cv`, that renders the sheet. The five that ship are
[src/lib/cv/templates/](src/lib/cv/templates/) — real `.svelte` files, so
`pnpm check` compiles and type-checks them, imported as text rather than as
components because nothing mounts them directly. They used to be five blocks of
CSS in `presets.css` keyed off a `data-cv-layout` attribute; each one now carries
its own markup and its own style block, which is what makes it something you can
open and change.

The template page compiles what you type, on a debounce, and mounts the result;
so does the editor page, from the same source text through the same
[liveTemplate](src/lib/cv/live-template.svelte.js) — the debounce, the
out-of-order guard and the keep-the-last-good-one rule are written once.
A file's `layout` is only the id of the template it renders through, and
templates themselves are shared by every file rather than owned by one — so
deleting one can't break a CV: the id stops resolving and `resolve` hands back
the default. Editing a built-in stores an *override* under its own id, which is
what lets Revert be a delete rather than a copy, and Duplicate is how a template
of your own starts — from a copy, since a blank component would only mean
retyping the sheet's markup.

The theme is still pure data — a ramp of eight colours, declared in
[palettes.css](src/lib/cv/palettes.css) and spent by one block in
[presets.css](src/lib/cv/presets.css) that re-points the frame's tokens at it.
`data-cv-layout` is still set on `#cv-root` too, carrying the template's id, but
nothing shipped selects on it any more: it is there for a file's own CSS to hook.

#### Compiling one

[compile-template.js](src/lib/cv/compile-template.js) is the whole of it.
Svelte's compiler is an ordinary module that runs in a browser, so a template
goes through exactly the pass Vite would have given it at build time. What Vite
also does — resolve the imports that come back — is what has to be replaced:
compiled client code opens with `import * as $ from 'svelte/internal/client'`,
and a bare specifier means nothing to the browser.

So every specifier a template is allowed to name (`@cv`, `svelte`, `marked`, and
the two the compiler emits itself) gets a *shim module*: a blob that re-exports,
name by name, the module this app already has bundled. The compiled source's
import lines are rewritten to point at those blobs, the whole thing becomes a
blob of its own, and `import()` turns it into a component — one Svelte runtime,
one copy of `marked`, and no network. `@cv` is aliased in `vite.config.js` as
well, which is the trick that lets the shipped templates import the same module
through a bundler that has never heard of any of this.

The compiler is loaded on demand, being by far the largest thing this app could
ship; it is still bundled locally and precached with everything else, so the
first template compiles offline like everything else here.

Two things follow that are worth being plain about. A compile error keeps the
last template that worked on screen — the same bargain as a YAML parse error —
and reports itself in the strip under the template editor and in the banner over
either preview. On a fresh load there *is* no last good one, so a stored
template that doesn't compile leaves the editor page with nothing to render:
that banner carries a link to the page where the template can be fixed. And a template is the user's own code running in the
app's realm rather than the frame's, because `mount()` takes a component and a
component can only come from the realm that compiled it. That is a real
difference from the file's custom CSS, which the frame contains completely; the
alternative is a second Svelte runtime inside the frame, and two runtimes cannot
share one component.

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

What every template shares is [cv.css](src/lib/cv/cv.css): the class names the
sheet is built out of, and how it paginates. A template adds to that and
overrides parts of it from its own style block, which the compiler scopes — so
its rules outrank the base on specificity alone, whatever order they land in.
Only the sidebar needs markup rather than CSS to do its job: it renders a rail
and a main column, skills going to the rail, and any section can opt in or out
with `rail: true` / `rail: false`.

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
| [cv/presets.css](src/lib/cv/presets.css)                          | the theme ramp selected on `#cv-root`                         |
| the active template's compiled style block                        | scoped by the compiler, so it can't reach anything else       |
| the active file's own CSS                                         | whatever you typed into the Style popover, applied last       |

`codemirror.css` and the frame's own are global for the same underlying
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
and never reloaded. The active template is one of those props, so a recompile is
the same kind of event as a keystroke in the YAML. It is also the one thing that
does cross the boundary: the component was compiled out here and only renders in
there — see *Compiling one* above for why it can't be the other way round.

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

The heaviest single thing in that precache is Svelte's compiler, which the
template editor needs and nothing else does. It is a lazy chunk, so a session
that never opens the Template tab never loads it — but it is precached all the
same, because "compiles templates only when online" would be a strange kind of
offline editor.

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

All bundled locally — the only WASM/asset URL is same-origin, and the only other
URLs are the `blob:` ones a compiled template is imported through.

`svelte/compiler` is a runtime dependency here rather than a build-time one, and
`@replit/codemirror-lang-svelte` is what the template editor highlights with.

`loro-crdt` ships several builds. `loro-codemirror` imports the bare specifier, which
resolves to a build that loads its WASM with a synchronous main-thread XHR, and would
be a *second* WASM instance whose objects the first instance cannot accept. The alias
in [vite.config.js](vite.config.js) pins every importer to the async `web` build, so
exactly one `.wasm` is emitted. `optimizeDeps.exclude` is there because pre-bundling
rewrites the `new URL(..., import.meta.url)` the build uses to find that file.
