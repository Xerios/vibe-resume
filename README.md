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

| Concern              | Where                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Document + history   | [src/lib/cv/doc.svelte.js](src/lib/cv/doc.svelte.js) — Loro doc, persistence, cross-tab merge            |
| Editor               | [src/lib/components/YamlEditor.svelte](src/lib/components/YamlEditor.svelte) — CodeMirror 6              |
| Chrome               | `components/{Toolbar,TabBar,StatusBar}.svelte` — the buttons, the tabs, the status bar                   |
| The format           | [src/lib/cv/relaxed-yaml.js](src/lib/cv/relaxed-yaml.js) — the parser; see _The format_ below            |
| What the editor says | [src/lib/cv/lint.js](src/lib/cv/lint.js) — the section table, as diagnostics                             |
| What the editor offers | [src/lib/cv/complete.js](src/lib/cv/complete.js) — the same table, as completions                     |
| Colours and folding  | [src/lib/cv/relaxed-yaml-mode.js](src/lib/cv/relaxed-yaml-mode.js) — the CodeMirror language             |
| YAML to HTML         | [src/lib/cv/render.js](src/lib/cv/render.js)                                                             |
| Preview              | [src/lib/cv/PreviewFrame.svelte](src/lib/cv/PreviewFrame.svelte) — the iframe the sheet renders in       |
| Starting text        | [src/lib/cv/default-cv.yaml](src/lib/cv/default-cv.yaml)                                                 |
| Layouts              | [src/lib/cv/layouts/](src/lib/cv/layouts/) — the whole sheet, one file per arrangement                   |
| Block variants       | [src/lib/cv/blocks/](src/lib/cv/blocks/) — one file per variation of one block                           |
| The axes             | [src/lib/cv/slots.js](src/lib/cv/slots.js) — every slot, and every variant of each                       |
| The named looks      | [src/lib/cv/compositions.js](src/lib/cv/compositions.js) — presets, as sets of axis choices              |
| Composing            | [src/lib/cv/compose.js](src/lib/cv/compose.js) — layout + variants → one component                       |
| Part registry        | [src/lib/cv/parts.svelte.js](src/lib/cv/parts.svelte.js) — overrides and the user's own variants         |
| Compiling it         | [src/lib/cv/compile-template.js](src/lib/cv/compile-template.js) — Svelte, in the browser                |
| Picking a variant    | `components/{StylePicker,VariantCycle,BlockPicker}.svelte` — the popover, the row, the card by the sheet |
| Shared state         | [src/lib/cv/state.svelte.js](src/lib/cv/state.svelte.js) — the document, file registry and part registry |
| Theme                | [src/lib/cv/presets.js](src/lib/cv/presets.js) — the palettes, and the CSS beside it                     |
| Type                 | [src/lib/cv/fonts.js](src/lib/cv/fonts.js) — the font stacks, and the CSS beside it                      |
| Paper                | [src/lib/cv/paper.js](src/lib/cv/paper.js) — the page box, and what stands in its margins                |
| Tech logos           | [src/lib/cv/tech-icons.js](src/lib/cv/tech-icons.js) — generated; see _Logos_ below                      |
| CSS                  | [src/app.css](src/app.css) — the index; see _Where the CSS lives_ below                                  |
| Offline              | [src/service-worker.js](src/service-worker.js) — precache; manifest and icons in `static/`               |

### Editor and document

The editor is CodeMirror 6, bound to the document by
[loro-codemirror](https://github.com/loro-dev/loro-codemirror). That binding owns
both directions of text sync and the undo stack, so nothing in this codebase watches
keystrokes: `LoroExtensions(doc, undefined, undoManager, cvText)` is the whole wiring.
CodeMirror's own `history()` is deliberately left out — the binding installs Loro's
undo at high precedence, and two undo stacks would fight over Ctrl+Z.

Syntax colours are a `HighlightStyle` whose values are CSS custom properties, so
it can serve both themes; it lives in
[cm-highlight.js](src/lib/components/cm-highlight.js), the `--cm-*` tokens it
names live in [tokens.css](src/lib/styles/tokens.css), and the rules that spend
the rest of them are in [codemirror.css](src/lib/components/codemirror.css).

Completion reads the same section table as the linter, forwards:
[complete.js](src/lib/cv/complete.js) imports `SECTIONS` rather than copying it,
so a type added there is offered without anything else being touched. What it
offers depends only on where the cursor is — the keys the enclosing mapping
accepts, the closed set of answers for the handful of keys that have one, and,
wherever a new section can start, the whole shape of one as a snippet. Working
out which mapping the cursor is in is the only hard part, and `spotAt` does it by
walking the lines above through the same `splitLine` as the parser. Prose gets
nothing: a bullet, a paragraph and the inside of a `|` body are exactly what the
format exists to leave alone.

It opens without waiting to be asked, but only where there is a question. A
closed set of values shows the moment its `: ` is there — `type: ` on its own is
a question, and only six keys have one to answer it with — and picking `type`
from the key list runs straight on into picking which type, through CodeMirror's
`activateOnCompletion`. Keys show while the mapping is still missing some and go
quiet once it says everything it can, so landing in a finished entry doesn't put
a list of what it already says on the screen. Ctrl-Space still answers anywhere.

The document, the file registry and the part registry are module-level
singletons in [state.svelte.js](src/lib/cv/state.svelte.js), built once by
`start()` on mount rather than inline in the page component.

### Layouts, blocks and presets

The Style button offers thirteen named looks — classic, compact, centered,
sidebar, timeline, ledger, minimal, cards, tech, editorial, brief, profile,
dossier — seven palettes, six fonts and the paper it all prints on. All four are
per file, stored in the file registry next to the name; they are also in the
file's own document, which is what puts a restyle in the version history and on
the undo stack. See _Restyling is a change_ below.

The first nine used to be nine whole Svelte components, one per look, and that
was the wrong seam. Seven of them had markup identical to `classic` and differed
only in their `<style>` block; taking Tech's logo chips meant taking Tech's
everything. So a sheet is two things now:

- a **layout** — [layouts/](src/lib/cv/layouts/), the arrangement of the page
  and the markup for all nine section types. There are three: single column,
  sidebar, and the same rail on the right.
- a **variant** per **slot** — [blocks/](src/lib/cv/blocks/), one decision each
  about how one part of the sheet is drawn.

The slots are in [slots.js](src/lib/cv/slots.js): page, header, section title,
summary, entry, skills, stack, list, languages, certificates and density. The first variant of each is
its _default_, and it has no file at all, because it is the snippet the layout
already renders. That is what makes the whole thing subtractive rather than
constructive — choose nothing and you get the layout verbatim.

A variant is one of two kinds of file, and which one it is says what it is
allowed to change:

- a **`.svelte` fragment** defines the slot's snippet, so it can change markup.
  Only a handful need to: the chip variants, which need `techIcon`, and Sidebar,
  which needs a rail.
- a **`.css` file** has no markup and restyles the snippet the layout renders.
  Most of them, which is the same observation as the seven identical templates,
  now expressed as a fact about the file rather than as duplication.

Every one of them has to print. That is the constraint the whole set is drawn
under and the reason none of them leans on a filled background: Chrome drops
background painting when _Background graphics_ is off in the print dialog, so a
card that only existed as a fill would vanish from the PDF. Borders, outlines and
type always print, and that is what the gutter, the airy density, the card
outlines and the chips are built out of.

The nine names survive as **presets** — [compositions.js](src/lib/cv/compositions.js)
— and four more have been added that were never components at all, which is what
the axes bought: a new look is a handful of choices rather than a new file. A
preset holds nothing but a set of axis values. That is deliberate: pick
Tech and then set the stack back to a plain line, and what you keep is Tech's
skills and lists as chips, with nothing invisible riding along. A file's `layout`
is the preset it started from and its `variants` are what it has changed since,
so the popover can go on saying _Tech · modified_ rather than going nameless.

Each is still a real `.svelte` or `.css` file that `pnpm check` compiles, so a
broken one can't reach a release. What the type checker can't see is whether a
layout and a variant still agree — a snippet renamed on one side, a `@cv` import
one needs and the other doesn't, two chip variants declaring `chip` twice — so
[compose.test.js](src/lib/cv/compose.test.js) compiles every preset and every
variant against the defaults, which is the gate that catches those.

#### Composing

[compose.js](src/lib/cv/compose.js) takes the layout, swaps out the snippets
whose slot has a non-default variant chosen, concatenates the stylesheets, and
hands back one component source for compile-template.js to compile exactly as it
used to compile a whole template.

One component, not several. Compiling each fragment separately and importing
them would be tidier, and it is the wrong shape: Svelte scopes a component's CSS
to the markup in that same component, so a style-only variant would have to write
`:global(.job)` — which then loses on specificity to any scoped `.job` rule in
whichever component owns the markup. Assembled into one, every rule gets the same
scoping class and plain cascade order decides, which is how the templates it
replaces worked against cv.css in the first place. Slot order is that order, and `density`
is last so it can quiet anything above it.

A variant contributes its snippets and its style block; its script is there so
`svelte-check` will read the file as a component, and is dropped. The `@cv`
import line is rewritten to the union of what every chosen part needs, since
`techIcon` only turns up once a chip variant is in play. A snippet the layout
doesn't define — `chip` — is appended rather than swapped in, and de-duplicated,
because the three chip variants each carry their own copy so that any one of them
can be chosen alone.

Compose also returns a **line map**, which is what lets a compile error in a
source nobody wrote point at a line in the part being edited.

Both pages compile what a composition comes to, on a debounce, and mount the
result — through the same [liveTemplate](src/lib/cv/live-template.svelte.js), so
the debounce, the out-of-order guard and the keep-the-last-good-one rule are
written once. What it keys on is the whole composition rather than one part,
because changing a variant is a choice and shouldn't sit out the debounce meant
for someone typing.

#### Picking one

Two places, one control. [StylePicker](src/lib/components/StylePicker.svelte)
lists the presets and then every axis, and hovering the sheet floats
[BlockPicker](src/lib/components/BlockPicker.svelte) beside it with a row per
slot the thing under the pointer belongs to — hover an entry's stack line and
you get Stack, Entry, Page and Density, innermost first, walked up the
`data-slot` chain the layouts stamp. Both rows are the same
[VariantCycle](src/lib/components/VariantCycle.svelte), because choosing a
variant is the same act wherever it is done.

The card lives in the app's DOM rather than in the preview frame. That is what
keeps it out of a print — which goes to the frame's own window — and it is why
positioning has to cross a boundary: a rect measured in there reaches us through
the iframe's own box. It pins to whichever gutter beside the sheet is wider
rather than to the block's edge, so it stays on screen without anyone having to
know how wide it is, and flips to grow upward near the foot of the pane.

The part that isn't obvious is holding still. Reaching the card means crossing
every block between the pointer and the gutter, and a card that followed each of
those in turn would rewrite its rows and move out from under the pointer on the
way — which made it unreachable. So only the first appearance is immediate:
after that a new block has to hold the pointer for a moment before the card
moves to it, and even then it waits while the pointer is still travelling toward
the side the card is on. A pointer that has stopped is not on its way anywhere,
so settling on a block — including the sheet's own margin, which is one big
block — still hands the card over. It follows what you meant, not the journey.

Following the pointer is the wrong behaviour once you have found the block you
meant, though: walking a slot's variants means going back and forth between the
card and the sheet, and everything above is about a card that moves. So a
**click pins it**. A pinned card stops answering the pointer entirely — hovering
elsewhere doesn't move it, leaving the sheet doesn't take it away, and a
recompile leaves it where it is — and it says so, with an accent edge and a
close button. Clicking the same block again, the ×, Escape, a click anywhere in
the app's own chrome, or a click on the sheet that isn't a block at all, each let
it go. The click still does what it always did as well: the editor scrolls to the
line behind whatever was clicked.

There used to be a `/template` deep link here for editing a part's source
directly — a CodeMirror over the part, the CV beside it as a live preview, and
Duplicate/Rename/Revert/Delete to manage overrides. It has been removed; the
rows beside the sheet and in the Style popover only ever chose a variant, so
nothing else in the app changes. What remains in
[parts.svelte.js](src/lib/cv/parts.svelte.js) is the read side: an override of
a shipped part, or a variant of the user's own, left over from before removal
still folds into `slots` and renders normally — a part id that stops resolving
just falls back to its slot's default, the way it always has. There is no
longer a way to create, rename or revert one from the app.

Whole templates written before the layout/variant split existed are folded in
on first load as layouts of the user's own, since a whole template _is_ a
layout, and the files that named one are pointed at it.

The theme is still pure data — a ramp of eight colours, declared in
[palettes.css](src/lib/cv/palettes.css) and spent by one block in
[presets.css](src/lib/cv/presets.css) that re-points the frame's tokens at it.
`data-cv-layout` is still set on `#cv-root` too, carrying the preset's id, but
nothing shipped selects on it any more: it is there for a file's own CSS to hook.

#### Restyling is a change

Preset, block variants, theme, font and a file's own CSS used to live only in
the file registry, on the grounds that restyling is not an edit. That was the
wrong reading: changing how a CV looks is a change to the CV, and the things a
change gets here — a line in the version history, a place on the undo stack, and
coming back with the version that had it — are exactly what a restyle wanted.

So those values — and the paper, which arrived later and is one of them — are
also a `style` map in the file's Loro document, and
[restyle](src/lib/cv/state.svelte.js) is the one way to move them: it writes the
registry first, so the sheet follows immediately, then records the result in the
document with a label — `Entry — Card`, `Theme — Plum`, `Paper — Landscape`.
Ctrl+Z takes one back,
from the editor as ever and now from anywhere else too, since a keystroke that
didn't land in CodeMirror is handled by the page.

Two stores for one fact, and deliberately so: the registry knows the style of
every file including the ones that aren't open, and the document knows the style
of _this_ one at every point in its history. Neither can do the other's job, so
while a file is open the document is authoritative and writes through — an undo,
a restore, a version being viewed or a merge from another tab all land in the
registry through the same callback.

The map holds only what has changed since the document was adopted; everything
else falls through to the registry's copy as it stood then, which is what makes
undoing the first change of a session land on what was there before it rather
than on nothing. Two details follow from what a change _is_: the commit carries a
`style` kind, so the history panel can mark it, and the one style that is typed
rather than chosen — custom CSS — waits out a debounce before it is recorded,
because Loro never merges a commit that carries a message and the alternative is
one history entry per keystroke.

#### Compiling one

[compile-template.js](src/lib/cv/compile-template.js) is the whole of it.
Svelte's compiler is an ordinary module that runs in a browser, so the composed
sheet goes through exactly the pass Vite would have given it at build time. What Vite
also does — resolve the imports that come back — is what has to be replaced:
compiled client code opens with `import * as $ from 'svelte/internal/client'`,
and a bare specifier means nothing to the browser.

So every specifier the sheet is allowed to name (`@cv`, `svelte`, `marked`, and
the two the compiler emits itself) gets a _shim module_: a blob that re-exports,
name by name, the module this app already has bundled. The compiled source's
import lines are rewritten to point at those blobs, the whole thing becomes a
blob of its own, and `import()` turns it into a component — one Svelte runtime,
one copy of `marked`, and no network. `@cv` is aliased in `vite.config.js` as
well, which is the trick that lets the shipped parts import the same module
through a bundler that has never heard of any of this.

The compiler is loaded on demand, being by far the largest thing this app could
ship; it is still bundled locally and precached with everything else, so the
first sheet compiles offline like everything else here.

Two things follow that are worth being plain about. A compile error keeps the
last sheet that worked on screen — the same bargain as a YAML parse error — and
reports itself in the banner over the preview, traced back through compose.js's
line map to the part it came from. On a fresh load there _is_ no last good one,
so a broken part — a leftover override or a migrated template — leaves the
editor page with nothing to render, and there is no longer a page in the app to
fix it from; clearing the `cv-editor:parts:v1` entry in `localStorage` is what
recovers it. And a part is the user's own code running in the app's realm
rather than the frame's, because `mount()` takes a component and a component
can only come from the realm that compiled it. That is a real difference from
the file's custom CSS, which the frame contains completely; the alternative is
a second Svelte runtime inside the frame, and two runtimes cannot share one
component.

The sheet does not follow the app into dark mode. It is paper: it renders light
on screen, prints exactly what it showed, and the app's dark toggle dresses only
the editor around it. That is why the frame is never told which ramp the app is
in, and why nothing in the print rules has to undo a dark one. Each palette
still carries the `--t-*-d` half it would need for a dark preview — unspent, but
kept beside the light ramp so the two can't drift apart.

Palettes and font stacks sit in files of their own because they are the parts of
the preset system the app still needs: the sheet's CSS all moves into the frame,
but StylePicker draws each option by putting `data-cv-theme` or `data-cv-font`
on the option itself, so there is no second copy of either to drift out of step. The swatches
read from the light ramp too, for the same reason the sheet does — one that
darkened with the chrome would advertise a CV the preview can't produce.

Below both is a third layer, per file like the other two: arbitrary CSS, edited
in the Style popover and applied last inside the frame. It is stored and
validated exactly as much as it needs to be, which is not at all — the worst a
broken rule can do is make the sheet look wrong.

#### The paper

The page a CV prints on is a value now rather than one line of frame.css, and it
is per file like the theme: a size, an orientation, and what — if anything —
stands in the margin above and below the sheet.
[paper.js](src/lib/cv/paper.js) is the whole of it, and `paperCss` is the one
place it becomes CSS. That stylesheet says the same thing twice on purpose:
`@page`, which is what the print uses, and a handful of `--page-*` tokens on
`#cv-root`, which cv.css sizes the sheet from. The sheet on screen is therefore
the page that comes out of the printer — turning it on its side turns the
preview on its side — where before it was a `max-width: 820px` that happened to
be about the width of an A4.

A running header or footer is an `@page` **margin box**, which is real
paged-media CSS rather than anything in the document. It has to be: the only
thing that knows how many pages there are is the thing that made them, so
`counter(pages)` is the only way to print _2 / 3_ at all. Chrome has had margin
boxes since 131 and Firefox has never had them, so a header or a footer is the
one thing here that some browsers will simply not print — which is why it prints
nothing rather than something wrong, and why nothing else on the sheet depends
on it. The name is baked in as a string literal because a margin box holds text
and not elements. Page one gets no running _header_: it already has the name on
it in 31px, and `@page :first` is what takes it back off.

Whichever edge carries one is given 5mm more margin to carry it in, so a running
head sits in the margin rather than on the first line.

Beside all that in the Style panel, and deliberately not part of it, is **fit
page to pane**: the preview scaled down until a whole page fits across the
preview column. It changes no CV, so it is a preference of this browser's rather
than a restyle — no history entry, no undo, nothing in the document — and it is
offered only where the split still has two columns, since on a narrow screen the
preview is already the width of the window. It is a `zoom` on `#cv-root` rather
than a transform, which is what keeps every rect the page measures — the block
picker's, the scroll ladder's — in the frame's own coordinates, and the print
stylesheet drops it.

What every sheet shares is [cv.css](src/lib/cv/cv.css): the class names it is
built out of, and how it paginates. A layout and its variants add to that and
override parts of it from the composed style block, which the compiler scopes —
so their rules outrank the base on specificity alone, whatever order they land
in. The two rail layouts render a rail and a main column — Sidebar puts the rail
on the left, Rail right mirrors it — with skills, lists and languages going to
the rail, and any section can opt in or out with `rail: true` / `rail: false`. A
rail is a third of a measure, so those layouts also carry the rules that make
what lands in one survive it: the two-up grids fold to a single `minmax(0, 1fr)`
column, headings and chips are allowed to wrap, and the gutter a skills-rows
title hangs in goes away. The chip
variants render a chip per tool instead of a line — see _Logos_ below.

#### The format

It looks like YAML and it is read like YAML, but it isn't quite YAML, and the
difference is deliberate. A CV is prose, and prose is full of the characters
YAML reserves. Real YAML makes you quote a link because it starts with `[`, a
phone number because it starts with `+`, and `ORM: Prisma` because of the colon
— none of which is anything a person writing a resume should have to know. So
[relaxed-yaml.js](src/lib/cv/relaxed-yaml.js) reads a smaller, line-oriented
dialect instead, in which a value runs verbatim to the end of its line and
nothing inside it means anything:

```yaml
- title: Some text: more text
  subtitle: **bold text**
  items:
    - +1 555 010 1234
    - [github.com/example](https://github.com/example)
```

The load-bearing rule is what counts as a key: one unspaced identifier, followed
by a colon and a space, and only the _first_ one on a line. That is what makes
`title: Some text: more text` read the obvious way — the second colon is inside
the value and never looked at. A word with a space in it can't be a key at all,
so `- Some text: more` stays a string.

Everything else follows from taking values verbatim. A `#` only opens a comment
at the head of a line, so `ranked # 1` and `#fff` are ordinary text. Indentation
nests, and a tab in it is an error. Every scalar is a string except a bare `true`
or `false`, which have to stay boolean because `inline`, `hasHeader` and `rail`
are tested for truthiness and the string `'false'` is true. `|` and `>` still
open a block. Flow collections, anchors, aliases, tags and `---` are gone — `[`
is just a bracket now.

Quotes aren't required anywhere any more, but they're still honoured, because
every resume written before this is full of them: a value wrapped _entirely_ in
matching quotes is unwrapped, while `'Bob' the builder` isn't wrapped, so it
stays as typed. Where a pair has stopped doing any work the editor says so as a
hint rather than removing it behind you.

One ambiguity survives, and it's the one YAML has too. A bullet reading
`- Analytics: Mixpanel` is a mapping, because `Analytics` is a perfectly good
key and there's no way to tell it apart from a real entry. Quotes are still the
escape hatch — `- 'Analytics: Mixpanel'` — and any list that should hold plain
text is checked for it, so the editor offers the fix rather than leaving you to
find it in the preview.

That check is one of three things [lint.js](src/lib/cv/lint.js) reports, and it
exists because relaxing the format moved where mistakes land. Almost nothing a
person types fails to parse now, so a typo shows up as a section that quietly
renders wrong instead of as an error. The table below is therefore held as data
as well as prose, and the editor underlines an unknown `type`, a key nothing
renders, and a section missing its content — as warnings, which don't stop the
preview or block an export.

The editor's colours, folding and indentation come from the same `splitLine` the
parser uses ([relaxed-yaml-mode.js](src/lib/cv/relaxed-yaml-mode.js)), so what a
line looks like and what it means can't drift apart. It's a `StreamLanguage`
rather than a Lezer grammar because a line is an indent, some dashes, maybe a
key and then text — none of which needs a parse tree.

#### What a CV is made of

A document is a header and a list of sections, and a section's `type` is what
decides how it renders. There are nine, all of them understood by every
layout, so switching preset can never lose one:

| `type`           | Holds                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| `summary`        | `paragraphs`                                                                    |
| `skills`         | `blocks`, each a `title` and `rows` of `{ tier?, text }`                        |
| `experience`     | `items` of `{ title, company, dates, sub, bullets, stack }`                     |
| `education`      | `items` of `{ title, school, dates, sub?, bullets? }`                           |
| `projects`       | `items` of `{ title, dates?, sub?, bullets?, stack? }`                          |
| `list`           | `items` of plain strings — `inline: true` sets them as pills on one line        |
| `languages`      | `items` of `{ name, level?, note?, rating? }`                                   |
| `certifications` | `items` of `{ name, issuer?, dates?, note? }` — certificates, licences, permits |
| `oss`            | `projects` of `{ name, stars, desc }`, with an optional table header            |

The two newest are the two a `list` section used to have to stand in for, and
both are there because the shape was doing work the strings couldn't. A
certificate is a name, an issuer and a date, which is what lets Grid, Cards and
Compact set the three of them differently. A language is a name and a level, and
`level` is deliberately free text — `Native`, `C2` and `Professional working` are
all how somebody writes one — so `levelRating` in
[template-api.js](src/lib/cv/template-api.js) is what reads any of them as a
number out of five, which is what the Dots and Bars variants draw. A level it
can't read comes back as 0, and that is the signal for those variants to print
the words after all rather than an empty meter. `rating: 1–5` says it outright
for anything the table doesn't cover.

Experience, education and projects are the same block underneath — `.job` in
cv.css — because a degree and a role are the same shape: a title, something it
belongs to, dates, a line of context and some bullets. Only the section around
them differs, which is what a layout selects on when it wants to tell the
three apart. An `experience` item can also say `subtype: earlier`, which renders
a run of older roles as one titled list with no dates of its own.

An unknown `type` renders as a red line naming itself rather than as nothing, so
a typo in the YAML is visible in the preview instead of silently dropping a
section. The editor says the same thing on the line itself, out of the copy of
this table that [lint.js](src/lib/cv/lint.js) holds as `SECTIONS` — so a type
added here has to be added there too, and lint.test.js fails if the two lists
stop agreeing.

#### Logos

`stack` takes a comma-separated string or a YAML list, whichever reads better;
`techs` in [template-api.js](src/lib/cv/template-api.js) is what reads either
into a list, so no template has to care which was written.

The chip variants draw each entry as a chip with its brand logo, from `techIcon`
beside it. Matching is deliberately forgiving, because a CV is prose
rather than a manifest: case and punctuation are normalised away and then a few
reductions are tried in turn, so `Node.js`, `Postgres`, `TypeScript/JavaScript
(10+ yrs)`, `React 18` and `ORM: Prisma` all land on a logo while `English C2`
quietly doesn't. Anything unmatched is still a chip, just a lettered one.

The logos are [Simple Icons](https://simpleicons.org) (CC0-1.0), and they are
_vendored_ rather than depended on: the full set is a few thousand icons and
several megabytes, so [scripts/gen-tech-icons.mjs](scripts/gen-tech-icons.mjs)
fetches a curated list from the Iconify API and writes
[tech-icons.js](src/lib/cv/tech-icons.js), an ordinary module that ships with
the bundle. Adding one means adding a line to that script and running it again.
Nothing at runtime touches the network, which is the same rule as everything
else here — and monochrome paths inheriting the ink around them print with the
text rather than as images an exporter might drop.

That module is the price of the feature: some 190 kB of path data, in the chunk
the editor page loads rather than a lazy one, because `techIcon` is called
during a render and can't wait for a fetch. It sits beside a Svelte compiler
several times its size, which is the reason it was judged affordable — trimming
the list in the generator is how to make it smaller.

#### Type

The six fonts work exactly as the palettes do: an id on `#cv-root` as
`data-cv-font`, a table of stacks in [fonts.css](src/lib/cv/fonts.css), and one
block in presets.css that re-points `--sans` and `--mono` at whichever is
named. StylePicker sets each option in the face it is offering by putting the
same attribute on the option itself, so there is no second copy of the stacks.

None of them is downloaded. A web font would mean either a CDN this app doesn't
have or a few hundred kilobytes of precache per family, and a CV that renders in
whatever the reader's machine substituted is worse than one set in a face that
is certainly installed — so each is a stack of faces that ship with an operating
system, ending in the generic the browser can always satisfy. A file's own CSS
still overrides `--sans` by hand: it is applied after presets.css and lands on
the same element.

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

| File                                                           | Holds                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| [app.css](src/app.css)                                         | the index — imports the three below, and nothing else        |
| [styles/tokens.css](src/lib/styles/tokens.css)                 | both colour ramps, the type stack, `--theme-fade`            |
| [styles/base.css](src/lib/styles/base.css)                     | reset, page background, scrollbars, the `#app` shell         |
| [styles/controls.css](src/lib/styles/controls.css)             | `.t-btn` and friends — used from six different places        |
| [styles/print.css](src/lib/styles/print.css)                   | the fallback for a print the app can't intercept             |
| [components/codemirror.css](src/lib/components/codemirror.css) | the CodeMirror theme, imported by `YamlEditor.svelte`        |
| [cv/palettes.css](src/lib/cv/palettes.css)                     | the seven ramps — here only so StylePicker can draw a swatch |
| [cv/fonts.css](src/lib/cv/fonts.css)                           | the six stacks — here for the same reason, one option each   |

And in the preview frame's, written into it by `PreviewFrame`:

| File                                       | Holds                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| [cv/frame.css](src/lib/cv/frame.css)       | the frame's reset, tokens and page box — its declared inputs |
| [cv/cv.css](src/lib/cv/cv.css)             | the sheet itself, plus how it paginates                      |
| [cv/palettes.css](src/lib/cv/palettes.css) | the same seven ramps, this time for the sheet to spend       |
| [cv/fonts.css](src/lib/cv/fonts.css)       | the same six stacks, likewise                                |
| [cv/presets.css](src/lib/cv/presets.css)   | the ramp and the stack selected on `#cv-root`                |
| the active template's compiled style block | scoped by the compiler, so it can't reach anything else      |
| the active file's own CSS                  | whatever you typed into the Style popover, applied last      |

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
there — see _Compiling one_ above for why it can't be the other way round.

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

A version carries the file's presentation as well as its text (see _Restyling is
a change_), so checking one out shows the sheet as it was set, and restoring one
brings that look back with the words. What a restyle commits is a `style` kind,
which is what the panel marks it with; it moves no characters, so it shows no
counts.

### Persistence

The whole document, history included, is exported as a Loro snapshot and base64'd
into `localStorage` on a 400 ms debounce, plus synchronously on tab close. Open the
editor in two tabs and they merge through the `storage` event — that is the CRDT
earning its keep rather than decorating. The stored value carries a lineage marker so
that "Clear history" in one tab replaces the document in the others instead of
merging two unrelated ones.

### Offline

Nothing here ever talked to the network, but until there was a service worker the
browser still could not _load_ the app without a server. `src/service-worker.js`
precaches the Vite bundle, everything in `static/`, and the prerendered shell, so a
single visit is enough; after that it runs with the network off. SvelteKit registers it
automatically in a production build and leaves it out of `vite dev`, so development
never serves stale bytes.

The heaviest single thing in that precache is Svelte's compiler, which the
editor page needs to compile the sheet at all. It is a lazy chunk, loaded the
first time a composition needs compiling — but it is precached all the same,
because "compiles the sheet only when online" would be a strange kind of
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

`svelte/compiler` is a runtime dependency here rather than a build-time one.

`loro-crdt` ships several builds. `loro-codemirror` imports the bare specifier, which
resolves to a build that loads its WASM with a synchronous main-thread XHR, and would
be a _second_ WASM instance whose objects the first instance cannot accept. The alias
in [vite.config.js](vite.config.js) pins every importer to the async `web` build, so
exactly one `.wasm` is emitted. `optimizeDeps.exclude` is there because pre-bundling
rewrites the `new URL(..., import.meta.url)` the build uses to find that file.
