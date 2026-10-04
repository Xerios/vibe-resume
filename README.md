# Resume Editor

A local-first Resume Editor: Markdown on the left, a print-ready CV on the right.
Everything runs in the browser — no network calls, no CDN, no account.

Grown out of `template-artifact.html` (kept in the repo for reference), with three
changes: the compact/full version toggle is gone, every library is bundled from npm
instead of a CDN, and the document is now a [Loro](https://loro.dev) CRDT persisted
to `localStorage` with a version history.

## Running it

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # static site in build/
pnpm check      # svelte-check / tsc in every package, oxlint, vitest
```

## The workspace

A pnpm workspace. The packages are consumed as TypeScript source — no build step
of their own — and depend on each other only in the direction listed:

| Package                                                   | Holds                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [packages/core](packages/core/src/)                       | what every format shares: the `SourceFormat` interface, the section table, dates, the line diff |
| [packages/format-markdown](packages/format-markdown/src/) | Markdown; its CodeMirror half under `editor/`                                                   |
| [packages/render](packages/render/src/)                   | the CV model, the sheet, the paginator and the PDF                                              |
| [app](app/src/)                                 | the SvelteKit app: chrome, editor, state, workers                                               |

A format's root module never imports CodeMirror, because the parse worker loads
it; the editor loads a format's `editor/` half on demand
([formats.ts](app/src/lib/formats.ts)). Shared dependencies are pinned once in
the `catalog:` of `pnpm-workspace.yaml`, since two copies of `@codemirror/state`
or `@lezer/highlight` break the editor.

## How it works

| Concern                | Where                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Document + history     | [app/src/lib/cv/state/doc.svelte.ts](app/src/lib/cv/state/doc.svelte.ts) — Loro doc, persistence, cross-tab merge                   |
| Editor                 | [app/src/lib/components/SourceEditor.svelte](app/src/lib/components/SourceEditor.svelte) — CodeMirror 6                             |
| Chrome                 | `components/{Toolbar,TabBar,StatusBar}.svelte` — the buttons, the tabs, the status bar                                                        |
| The chrome's palette   | [app/src/lib/styles/tokens.scss](app/src/lib/styles/tokens.scss) — ADS tokens; see _The chrome's palette_ below                     |
| What the editor says   | [packages/format-markdown/src/read.ts](packages/format-markdown/src/read.ts) — the document's shape, as diagnostics; [packages/core/src/writing.ts](packages/core/src/writing.ts) — the writing; see _The writing_ below |
| What the editor offers | [packages/format-markdown/src/editor/complete.ts](packages/format-markdown/src/editor/complete.ts) — the keys and values of a directive comment |
| Colours and folding    | [packages/format-markdown/src/editor/markdown-mode.ts](packages/format-markdown/src/editor/markdown-mode.ts) — the CodeMirror language, coloured out of [inline-markdown.ts](packages/format-markdown/src/editor/inline-markdown.ts) |
| Text to a CV object    | [packages/core/src/format.ts](packages/core/src/format.ts) — `SourceFormat` and `parseWith`; see _Formats_ below                              |
| Markdown               | [packages/format-markdown/src/read.ts](packages/format-markdown/src/read.ts) — see _Markdown_ below                                           |
| What a CV says         | [packages/render/src/model.ts](packages/render/src/model.ts) — the tree the sheet is drawn from, in reading order                             |
| Block variants         | [packages/render/src/variants.ts](packages/render/src/variants.ts) — every slot, and every way of drawing it                                  |
| Inline Markdown        | [packages/render/src/inline.ts](packages/render/src/inline.ts) — a value as runs of styled text                                               |
| Type and space         | [packages/render/src/tokens.ts](packages/render/src/tokens.ts) — the numbers a CV is set with                                                 |
| Preview                | [packages/render/src/PreviewFrame.svelte](packages/render/src/PreviewFrame.svelte) — the iframe the sheet renders in                          |
| The sheet              | [packages/render/src/html/](packages/render/src/html/) — `CvSheet.svelte`, its stylesheet, the tokens as CSS, and the paginator               |
| The sheet as PDF       | [packages/render/src/pdf/](packages/render/src/pdf/) — `measure.js` reads the sheet, `PdfRenderer.ts` draws it; see _Exporting_ below         |
| Starting text          | [template.md](packages/format-markdown/src/template.md) — what a new tab starts as |
| Picking a look         | `components/{StylePicker,VariantCycle}.svelte` — the Style panel, and the row each block slot is drawn as                                     |
| Shared state           | [app/src/lib/cv/state/state.svelte.ts](app/src/lib/cv/state/state.svelte.ts) — the document and the file registry                   |
| Commands               | [app/src/lib/cv/state/commands.ts](app/src/lib/cv/state/commands.ts) — everything the chrome can do, by name                        |
| Theme                  | [packages/render/src/theme/palettes.ts](packages/render/src/theme/palettes.ts) — the palettes, as data                                        |
| Type                   | [packages/render/src/theme/typefaces.ts](packages/render/src/theme/typefaces.ts) — the seven font choices, and the faces they bundle            |
| Tech logos             | [packages/render/src/theme/tech-icons.js](packages/render/src/theme/tech-icons.js) — generated; see _Logos_ below                             |
| Paper                  | [packages/render/src/theme/paper.ts](packages/render/src/theme/paper.ts) — the page box, and what stands in its margins                       |
| CSS                    | [app/src/app.scss](app/src/app.scss) — the index; see _Where the CSS lives_ below                                                   |
| Offline                | [app/src/service-worker.ts](app/src/service-worker.ts) — precache; manifest and icons in `static/`                                  |

### Editor and document

The editor is CodeMirror 6, bound to the document by
[loro-codemirror](https://github.com/loro-dev/loro-codemirror). That binding owns
both directions of text sync and the undo stack, so nothing in this codebase watches
keystrokes: `LoroExtensions(doc, undefined, undoManager, cvText)` is the whole wiring.
CodeMirror's own `history()` is deliberately left out — the binding installs Loro's
undo at high precedence, and two undo stacks would fight over Ctrl+Z.

Syntax colours are a `HighlightStyle` whose values are CSS custom properties, so
it can serve both themes; it lives in
[cm-highlight.ts](app/src/lib/components/cm-highlight.ts), the `--cm-*` tokens it
names live in [tokens.scss](app/src/lib/styles/tokens.scss), and the rules that spend
the rest of them are in [codemirror.scss](app/src/lib/components/codemirror.scss).

The Markdown mode ([markdown-mode.ts](packages/format-markdown/src/editor/markdown-mode.ts))
colours the markdown inside a line out of
[inline-markdown.ts](packages/format-markdown/src/editor/inline-markdown.ts), whose
delimiter and autolink rules are marked's, so nothing is coloured as a link, a
bold word or an address the page won't make one. Two kinds of line are read for
more than their markdown: a contact line under the name, where a phone number is
marked as the link the sheet makes of it, and the dates line under a `###`,
where each end of the range that reads as a date is picked out.

Completion ([complete.ts](packages/format-markdown/src/editor/complete.ts)) is for
the one place the text has a closed vocabulary: a directive comment. Inside
`<!-- … -->` it offers the keys a comment takes where it stands — under `#`,
under `##`, or under `###` and at the end of a list item, decided the way
read.ts decides it — and past `type:`, `subtype:`, `inline:` or `rating:` the
values they take, the section types straight out of `SECTIONS`. Picking a key
with values runs straight on into picking one, through CodeMirror's
`activateOnCompletion`. Keys wait for a letter or Ctrl-Space, so a comment that
is only a comment is left alone; prose gets nothing.

The document, the file registry and the part registry are module-level
singletons in [state.svelte.ts](app/src/lib/cv/state/state.svelte.ts), built once by
`start()` on mount rather than inline in the page component. Beside them sit
`ui` — the window's own preferences and transient chrome state (which panel is
up, whether the panes are coupled, the toast), see
[ui.svelte.ts](app/src/lib/cv/state/ui.svelte.ts) — and `look`, the active file's
presentation resolved to valid ids. The chrome reads all of these directly
rather than being handed each flag as a prop, and everything it can _do_ is a
named entry in [commands.ts](app/src/lib/cv/state/commands.ts): a toolbar button, a
menu item and a keyboard shortcut for the same action all call the same
command. The page keeps only what needs its own DOM — parsing, the
preview-to-source mapping, scroll sync and the divider drag.

### Rendering: one layout, measured for the PDF

A CV is drawn once, as HTML in the preview, and the PDF is made from what that
drew.

[model.ts](packages/render/src/model.ts) builds a tree out of the parsed source. It is
the one place that decides what a section _is_: an entry is a heading naming the
organisation and the title (`Acme Corp — Senior Engineer`), a line of its dates
and context (`03/2020–Present · Springfield`), a list of bullets and a
`Stack:` line; a skills section is its groups one under another; a language is a
list item with its level at the right. Its nodes are PDF's own structure types
(`Sect`, `H1`–`H3`, `P`, `L`, `LI`, `Div`), plus `Row` for "this, with that out
at the right edge" and `Meter` for a level drawn as dots or a bar. The tree is
already in **reading order**.

There is **one column**. Sidebars, two-up grids and gutters are gone, because a
PDF parser that reads by position — most ATS do — splices side-by-side text
together. Everything is set top to bottom in the order it is written, and only a
short pair (a language and its level, a certificate and its date) shares a line.

[CvSheet.svelte](packages/render/src/html/CvSheet.svelte) writes the tree into the DOM in that
order and [sheet.css](packages/render/src/html/sheet.css) lays it out. Sizes, colours and
spacing come from [tokens.ts](packages/render/src/tokens.ts),
[palettes.ts](packages/render/src/theme/palettes.ts) and
[typefaces.ts](packages/render/src/theme/typefaces.ts), as custom properties and a class per
text role ([sheet-css.ts](packages/render/src/html/sheet-css.ts)). That layout is the only
one there is. Two things follow it after every render:

- **The paginator** ([paginate.ts](packages/render/src/html/paginate.ts)) walks the sheet
  and pushes any block that would cross the foot of a page onto the next one. The
  rules are the ones the print CSS used to ask the browser for: an entry, a skill
  group, a list item and a paragraph stay whole, and a heading stays with the
  start of what follows it. In **page view** (Pages in the status bar) the pages
  are drawn as separate cards with the running head and foot in their margins.
  With it off, the sheet is one strip with the same page breaks, so either way
  what is on screen is what exports.
- **The measurer** ([measure.ts](packages/render/src/pdf/measure.ts)) runs on export. It
  reads the paginated sheet back as a display list:
  - every element's structure type
  - every run of text, a line at a time, at the position the browser set it in,
    with its font
  - every border, fill and SVG path, on the page it falls on

  [PdfRenderer.ts](packages/render/src/pdf/PdfRenderer.ts) draws that list. It reads a small
  subset of CSS — text, solid, dashed and dotted borders, solid fills, border
  radii, translations and `<path>` — and sheet.css keeps to it. Decoration is
  therefore a real `aria-hidden` element rather than a `::before`, because a
  pseudo-element can't be measured: bullet marks, separators, the timeline's rail
  and dot, a section's number, a chip's logo.

Inline Markdown reaches the sheet as runs of text with marks on them, from
marked's own inline lexer ([inline.ts](packages/render/src/inline.ts)), so there is no
`{@html}` in it. A bare address still prints without its scheme, and a phone
number on a contact line is still a `tel:` link.

The style panel offers a row of **block variants**, seven **themes**, seven **fonts**, two **densities** and
the **paper**. A variant ([variants.ts](packages/render/src/variants.ts)) is an id
the model reads while building the tree. It changes a property there — a
section's `head`, an entry's `frame`, a list's `display`, a language's meter —
and sheet.css draws each such property. Because the PDF is measured from the
sheet, a variant needs no PDF code of its own. Each slot is a
[VariantCycle](app/src/lib/components/VariantCycle.svelte) row in the panel, and the
first variant of each is its default.

#### Restyling is a change

Block variants, theme, font, density and paper are stored per file in the file registry, and
also as a `style` map in the file's Loro document. Changing how a CV looks is a
change to the CV, and the things a change gets here — a line in the version
history, a place on the undo stack, and coming back with the version that had it
— are exactly what a restyle wanted.
[restyle](app/src/lib/cv/state/state.svelte.ts) is the one way to move them: it writes the
registry first, so the sheet follows immediately, then records the result in the
document with a label — `Entry — Card`, `Theme — Plum`, `Paper — Landscape`.
Ctrl+Z takes one back, from the editor as ever and from anywhere else too, since
a keystroke that didn't land in CodeMirror is handled by the page.

Two stores for one fact, and deliberately so: the registry knows the style of
every file including the ones that aren't open, and the document knows the style
of _this_ one at every point in its history. Neither can do the other's job, so
while a file is open the document is authoritative and writes through — an undo,
a restore, a version being viewed or a merge from another tab all land in the
registry through the same callback.

The map holds only what has changed since the document was adopted; everything
else falls through to the registry's copy as it stood then, which is what makes
undoing the first change of a session land on what was there before it rather
than on nothing. The commit carries a `style` kind, so the history panel can
mark it.

#### Exporting

Export writes the PDF directly, with [pdfkit](https://pdfkit.org), in the browser,
from the preview as it is laid out and paginated. The renderer, pdfkit and the font
files are loaded on the first export rather than with the app
([export.ts](packages/render/src/pdf/export.ts)). The result is a tagged PDF 1.7 written to
PDF/UA-1, so that ATS parsers and screen readers read it as it is meant to be read:

- **Reading order.** The display list is in document order, which is the model's
  reading order. The renderer writes the structure tree and each page's content
  stream in that order, switching between buffered pages and drawing each line at
  the absolute position it was measured at.
- **Words where the browser put them.** The browser and pdfkit shape text from the
  same files but don't agree to the fraction of a point: Chromium rounds advances
  to pixels. So each word starts where the browser put it and is scaled
  horizontally, by at most 15%, to end where the browser ended it. Each space is
  drawn as a glyph of its own, at least as wide as the font's space, so that text
  extraction finds it.
- **Structure.** `Document` holds a `Sect` for the header and one per section,
  each titled (`/T`). Inside them are `H1` (the name), `H2` (section titles),
  `H3` (entry and group titles), `P` and `Div`. Lists are `L` > `LI` > `LBody`,
  with a `ListNumbering` attribute saying what marks their items. A level meter
  is a `Figure` with the level in words as `/Alt`, and each link is a `Link`
  element holding its text and its annotation, which has `/Contents`.
- **Dates.** Every `dates` value that reads as dates
  ([dates.ts](packages/core/src/dates.ts)) is a `Span` whose `ActualText` spells
  it out — `March 2020 to Present` — on the structure element and on its marked
  content. Screen readers and text extraction get that, however the sheet
  printed it, so the Dates block variant can print `Mar 2020`, `03/2020` or
  `2020-03` freely; in the preview each end is a `<time datetime>`. A value
  that doesn't read as dates (`Summer 2019`) is printed as typed and claims
  nothing.
- **Navigation.** A bookmark per section, in reading order; the file opens with
  them showing.
- **Artifacts.** Everything `aria-hidden` and every border and fill outside a
  figure is drawn as an `Artifact`: the page fill, rules, frames, the column
  divider, bullet marks, separators, chip outlines and logos, section numbers,
  and the running head and foot.
- **Type.** Only the bundled faces are used, embedded and subset with a
  ToUnicode map, and never a standard-14 font. A character the face has no glyph
  for (★ in the mono face) falls back through the font stack the preview names,
  in the same order.
- **Metadata.** The title is shown in the window (`DisplayDocTitle`), and the
  catalog sets `/Lang` from the header's `lang:` (English when it has none). The
  Info dictionary and the XMP both carry the title, author, description and
  keywords from [doc-meta.ts](packages/render/src/doc-meta.ts); the XMP also has
  `dc:language` and declares `pdfuaid:part` 1.
- **Attachment.** `cv.md` is the source exactly as written, marked as the
  `Source`.

The tests in [PdfRenderer.test.ts](packages/render/src/pdf/PdfRenderer.test.ts) render two
display lists measured from the browser ([fixtures/](packages/render/src/pdf/fixtures/)),
read the uncompressed output back, and check these properties. They include that
each page's marked content comes in the same order as the structure tree, and
that the sections and an entry's lines come out in the order they are written. The fixtures have to be measured
again when the sheet's markup or stylesheet changes what measure.ts reads. A full conformance check needs an external
validator: veraPDF with the PDF/UA-1 profile, or PAC.

**Print** in the toolbar (and Ctrl+P) is still there as a fallback. It prints the
preview frame with the browser's own print, which paginates for itself (the
paginator's pushes are undone in print CSS) and tags whatever the browser chooses
to tag.

#### The paper

The page a CV is set on is a value, per file like the theme: a size, an
orientation, and what — if anything — stands in the margin above and below the
sheet. [paper.ts](packages/render/src/theme/paper.ts) is the whole of it. `pageBox` is the
page and its margins in millimetres, which the paginator and the PDF use. `paperCss` is
the same thing as CSS for the preview: `--page-*` tokens on `#cv-root`, which
sheet.css sizes the sheet from, and `@page` for the print fallback. Turning the
sheet on its side turns the preview on its side.

A running header or footer is drawn in the PDF's margin as a pagination artifact,
once the layout knows how many pages there are. The print fallback writes the same
thing as `@page` **margin boxes**, which Chrome has supported since version 131 and
Firefox has never supported, so it prints nothing there rather than something wrong.
Page one gets no running _header_ in either: it already has the name on it.

Whichever edge carries one is given 5mm more margin to carry it in, so a running
head sits in the margin rather than on the first line.

Beside all that in the Style panel, and deliberately not part of it, is **fit
page to pane**: the preview scaled down until a whole page fits across the
preview column. It changes no CV, so it is a preference of this browser's rather
than a restyle — no history entry, no undo, nothing in the document — and it is
offered only where the split still has two columns, since on a narrow screen the
preview is already the width of the window. It is a `zoom` on `#cv-root` rather
than a transform, which is what keeps every rect the page measures — the scroll
ladder's — in the frame's own coordinates, and the print stylesheet drops it.

#### Formats

A file is Markdown, and its name ends in `.md`. A new name typed without an
extension keeps the old one. A file from before YAML was dropped keeps its
`.yaml` name and its text, and is read as Markdown.

The format is a `SourceFormat` ([format.ts](packages/core/src/format.ts)): an
id, its extensions, a template, `read` and `lint`. `read` returns the tree and a
map from each value's dotted path — `sections.2.items.0.bullets.1` — to the
line it came from. The tree is what everything after the parser takes, and the map is what lets the preview point
back at the line behind whatever the pointer is on. _Export Source_ downloads
the text as written.

#### Markdown

[read.ts](packages/format-markdown/src/read.ts) reads a resume written as
ordinary Markdown, a line at a time:

```markdown
# John Doe

Senior Full-Stack Engineer · 10+ years

- john.doe@example.com
- https://github.com/example

## Experience

### Acme Corp — Senior Full-Stack Engineer

**03/2020–Present** · Springfield (remote)

- Lead the development of a customer-facing dashboard

Stack: React, Node.js, TypeScript

## Languages

- English — Native
- German — A2 — reading

## Interests

<!-- inline: true -->

- Open source
- Chess
```

The `#` heading is the name; the first line under it is the role and a list is
the contact line. Each `##` is a section, and its type comes from, in order: an
`<!-- type: … -->` comment under it; its title, when the content fits
(_Skills_ with `###` groups, _Languages_, _Certifications_, _Interests_, _Open
Source_, _Summary_); and otherwise its shape — `###` children are `entries`, a
list alone is a `list`, prose is `text`. An entry is `### Org — Title` (a
heading with no `—` is a title alone), then `**dates** · place` on the next
line, then bullets and `Stack:` — the same order the sheet and the PDF print it
in. A plain line that reads as dates, with the line of context under it, is read
too. In a skills group, `**Expert:** …` gives a row
its tier.

Within a line, fields are split on a spaced em dash `—`: a language is
`name — level — note`, a record `name — issuer — dates — note`, an open-source
row `name — value — desc`. An en dash is left alone, since date ranges use it.

What plain Markdown can't say goes in an HTML comment of `key: value` pairs:
`lang` under `#`; `type` and `inline` under `##`; `subtype`, `sideNote`
and `rating` under `###` or at the end of a list item. Markdown viewers don't
show comments, so the file still reads as an ordinary resume anywhere else. The
editor underlines a comment key that means nothing where it is, an unknown type,
an empty section and text before the first heading.

#### The writing

read.ts's warnings check a CV's shape; [writing.ts](packages/core/src/writing.ts)
checks how it reads, after YAMLResume's guides to
[punctuation](https://yamlresume.dev/docs/guide/punctuations),
[grammar](https://yamlresume.dev/docs/guide/grammar) and
[typesetting](https://yamlresume.dev/docs/guide/typesetting). It walks the tree
any format reads into, finds each value's line through the line map and its
characters again in the source. What the guides
say a CV _must_ do is a warning; what they recommend is info:

- **Punctuation** — one space after `, ; : . ! ?` and none before; a space before
  `(` and after `)`; nothing hanging at the start of a line; a space between a
  number and its unit (`100 ms`); no spaces around a slash or a joining hyphen;
  `--`, `---`, ` - ` and `2016-2020` turned into the en or em dash they mean;
  curly quotation marks; and no full stop at the end of a list item.
- **Grammar** — a bullet starts with its verb, not `I` or `We`, in the past
  tense for a role whose dates have ended and the present for one that runs to
  `Present`. The name isn't `My Resume`, and the header leaves out a date of
  birth, nationality, marital status and a street address.
- **Dates** — the year in full (`05/06` reads differently in different
  countries) and an en dash between the ends, closed up when each end is one
  word: `2010–2014`, `03/2020–Present`, but `Mar 2020 – Present`. The sheet
  prints a range by the same rule. One way of writing a month throughout, too:
  a range written unlike most of the document's (`Mar 2014` among `03/2020`s)
  gets an info, since a résumé parser reading dates off the page is likeliest
  to get that one wrong.
- **Spelling** — the guide's table of names software CVs get wrong (`javascript`,
  `mysql`, `IOS`, `jquery`). A name that is also a word — `node`, `JS` — is only
  corrected where it stands alone in a list. Addresses, code and file names are
  left alone.

The typesetting guide is the sheet's business rather than the lint's: running
text is never set below 10pt at either density, the leading stays above 1.2, the
margins are 12–13mm and everything is set flush left. The font guide's pairing,
serif text with sans-serif titles, is the **Classic** font choice.

#### What a CV is made of

A document is a header and a list of sections, and a section's `type` is what
decides how it renders. There are seven, each named after the shape of what it
holds rather than what a CV usually puts in it:

| `type`    | Holds                                                                           | Usually        |
| --------- | ------------------------------------------------------------------------------- | -------------- |
| `text`    | `paragraphs`                                                                    | a summary      |
| `groups`  | `blocks`, each a `title` and `rows` of `{ tier?, text }`                        | skills         |
| `entries` | `items` of `{ title, org?, dates?, sub?, bullets?, stack?, methodologies? }`    | roles, degrees |
| `list`    | `items` of plain strings — `inline: true` runs them on in one line              | interests      |
| `levels`  | `items` of `{ name, level?, note?, rating? }`                                   | languages      |
| `records` | `items` of `{ name, issuer?, dates?, note? }`                                   | certifications |
| `table`   | `items` of `{ name, value, desc }`, each set as one line; `columns` is accepted | open source    |

A record is a name, an issuer and a date. A level is a name and a level, and
`level` is deliberately free text — `Native`, `C2` and `Professional working` are
all how somebody writes one — so it is printed as written. A `table` is read as a
list of name, figure and description rather than as a grid, which is what it holds
on a CV and what a PDF reader handles best.

`stack` takes a comma-separated string or a list, whichever reads better;
`techs` in [inline.ts](packages/render/src/inline.ts) reads either into a list of
tools. `methodologies` (a `Methodologies:` line) is read and drawn the same way,
under its own label, and follows the Stack variant.

Experience, education and projects are all `entries`, because a degree and a
role are the same shape: a title, something it belongs to (`org`), dates, a line
of context and some bullets. The section's title is what
tells them apart. An item can also say `subtype: earlier`, which renders a run
of older roles as one titled list with no dates of its own.

Documents written before the types were renamed — `summary`, `skills`,
`experience`, `education`, `projects`, `languages`, `certifications`, `oss`,
with `company`/`school`, `stars` and `hasHeader` — are read as the current ones
by [migrate-tree.ts](packages/core/src/migrate-tree.ts), whatever their format,
so they still render. The text itself is left as it was written.

An unknown `type` renders as a red line naming itself rather than as nothing, so
a typo in a type is visible in the preview instead of silently dropping a
section. The editor says the same thing on the comment that names it, out of the
copy of this table that [schema.ts](packages/core/src/schema.ts) holds as
`SECTIONS` — so a type added here has to be added there too.

#### Type

A font choice is a pairing of two bundled families: one for text, one for labels,
dates and contact lines. All are SIL OFL static TTFs from the
`@expo-google-fonts/*` packages, imported with `?url`
([typefaces.ts](packages/render/src/theme/typefaces.ts)).

| Choice   | Text           | Labels         |
| -------- | -------------- | -------------- |
| Sans     | Inter          | JetBrains Mono |
| Grotesk  | Archivo        | JetBrains Mono |
| Humanist | Source Sans 3  | JetBrains Mono |
| Serif    | Source Serif 4 | Source Serif 4 |
| Book     | EB Garamond    | EB Garamond    |
| Classic  | Source Serif 4 | Source Sans 3  |
| Mono     | JetBrains Mono | JetBrains Mono |

Bundled rather than OS font stacks, because the PDF has to embed every face it
uses and a browser can't hand a system font's bytes to pdfkit. The preview
declares every face with `@font-face`, and the browser downloads only the ones a
sheet uses. The service worker precaches Inter and JetBrains Mono, the default
pairing; another family is cached the first time it is used.

#### Logos

`stack` takes a comma-separated string or a list, whichever reads better;
`techs` in [inline.ts](packages/render/src/inline.ts) reads either into a list. The
chip variants draw each entry as a chip with its brand logo, from `iconPaths` in
[icons.ts](packages/render/src/icons.ts). Matching is forgiving, because a CV is prose
rather than a manifest: case and punctuation are normalised away and then a few
reductions are tried in turn, so `Node.ts`, `Postgres`, `TypeScript/JavaScript
(10+ yrs)`, `React 18` and `ORM: Prisma` all land on a logo while `English C2`
doesn't. A logo is SVG path data, drawn as `<path>` in the preview and as an
artifact in the PDF.

The logos are [Simple Icons](https://simpleicons.org) (CC0-1.0), _vendored_ rather
than depended on: [scripts/gen-tech-icons.mjs](scripts/gen-tech-icons.mjs) fetches a
curated list from the Iconify API and writes
[tech-icons.ts](packages/render/src/theme/tech-icons.js). Adding one means adding a line to
that script and running it again; nothing at runtime touches the network.

### Keyboard

Every control in the chrome carries an `accesskey` and underlines the letter it
answers to — `H` on History, `X` on Export, `N` on the button that opens a tab.
Which chord unlocks them is the browser's to decide rather than ours: Chromium
takes plain Alt, Firefox insists on Alt+Shift, and a Mac uses Ctrl+Alt
throughout. [access-keys.ts](app/src/lib/components/access-keys.ts) reads which one
applies, once, and every tooltip spells it out — so the same underlined `H`
reads as `(Alt+H)` or `(Alt+Shift+H)` depending on where it is being read.

The rest is what a file list trains you to try: `Ctrl+S` names a version, `F2`
renames the tab holding focus, `Escape` dismisses the style popover, the trash
panel and the new-tab menu — handing focus back to whatever opened them — and
the divider between the panes moves with the arrow keys.

### Where the CSS lives

Everything that belongs to one piece of UI is styled where that piece is
written, in the component's own `<style lang="scss">` block — `#toolbar` in
`Toolbar.svelte`, `.hist-*` in `HistoryPanel.svelte`, and so on. The app's
sheets are SCSS for one feature only: nesting, so that a control's states and
children sit inside its rule (`.tab { &:hover … &.active … }`) instead of being
restated beside it. Tokens stay CSS custom properties; there are no Sass
variables, mixins or functions to learn. The preview frame's sheets under
`src/lib/cv` are plain `.css`, imported as text and written into the frame. A rule
only becomes global when it genuinely has no single owner:

In the app's document:

| File                                                                      | Holds                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [app.scss](app/src/app.scss)                                         | the index — `@use`s the three below, and nothing else      |
| [styles/tokens.scss](app/src/lib/styles/tokens.scss)                 | the ADS tokens: colour per scheme, elevation, space, type  |
| [styles/base.scss](app/src/lib/styles/base.scss)                     | reset, page background, scrollbars, the `#app` shell       |
| [styles/controls.scss](app/src/lib/styles/controls.scss)             | the `.ds-*` components — button, menu, lozenge and friends |
| [styles/print.scss](app/src/lib/styles/print.scss)                   | the fallback for a print the app can't intercept           |
| [components/codemirror.scss](app/src/lib/components/codemirror.scss) | the CodeMirror theme, imported by `SourceEditor.svelte`    |

And in the preview frame's, written into it by `PreviewFrame`:

| File                                                              | Holds                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| [frame.css](packages/render/src/frame.css)                        | the frame's reset, its gutter and scrollbars, the default page box    |
| `@font-face` rules from typefaces.ts                              | the bundled faces                                                     |
| [html/sheet.css](packages/render/src/html/sheet.css)              | the arrangement of the sheet, page view, and the print fallback       |
| what [sheet-css.ts](packages/render/src/html/sheet-css.ts) writes | the palette, spacing and type roles for this file's theme and density |
| what `paperCss` writes                                            | the page box and its margin boxes                                     |

#### The chrome's palette

The chrome is the [Atlassian Design System](https://atlassian.design), spoken in
ADS's own token names and published values. `color.text.subtle` in the Atlassian
token set is `--ds-text-subtle` in `tokens.scss`, `elevation.surface.overlay` is
`--ds-surface-overlay`, `space.150` is `--ds-space-150`. The values are typed out
rather than imported — `@atlaskit/tokens` would bring a runtime and a theme
loader to set a few dozen custom properties — and because the names match, any
component page on atlassian.design is a spec the chrome can be checked against.

ADS tokens are _semantic_: a rule asks for "the subtle text" or "the background
of a selected thing", never for a hue or a step. `tokens.scss` restates every
colour token under `:root[data-theme='dark']`, so no rule in the app has a
dark-mode branch of its own.

| Family              | For                                                                     |
| ------------------- | ----------------------------------------------------------------------- |
| `--ds-text-*`       | words — `-subtle` for secondary, `-subtlest` for meta                   |
| `--ds-icon-*`       | glyphs                                                                  |
| `--ds-border-*`     | edges — `-input` for fields, `-focused` for the focus ring              |
| `--ds-background-*` | fills — `neutral`, `neutral-subtle`, `selected`, `brand-bold`, statuses |
| `--ds-surface-*`    | the elevation ladder, paired with `--ds-shadow-*`                       |
| `--ds-space-*`      | the 8px grid, named in hundredths of it                                 |
| `--ds-radius-*`     | corners — small for controls, medium for menus, large for dialogs       |
| `--ds-font-*`       | `font` shorthands for ADS's body and heading styles                     |

**Elevation** is ADS's four surfaces, each with the shadow that goes with it:

| Surface                | Shadow                | What                                              |
| ---------------------- | --------------------- | ------------------------------------------------- |
| `--ds-surface-sunken`  | —                     | the canvas the sheet lies on                      |
| `--ds-surface`         | —                     | top navigation, tabs, editor, side panels, footer |
| `--ds-surface-raised`  | `--ds-shadow-raised`  | the selectable cards in the Style panel           |
| `--ds-surface-overlay` | `--ds-shadow-overlay` | menus, popups, tooltips, flags, dialogs           |

**Components** live in `controls.scss` as `.ds-*` classes, each one following its
ADS counterpart: `.ds-btn` (default, `.subtle`, `.primary`, `.selected`,
`.danger`, `.compact`), `.ds-icon-btn`, `.ds-badge`, `.ds-lozenge`,
`.ds-textfield`/`.ds-select`, `.ds-menu`/`.ds-menu-item`, and
`.ds-section-message`. Export PDF is the one `.primary` button in the chrome; a
toggle that is on is `.selected` — the pale brand fill with brand text, not a
solid one. The tabs are ADS Tabs, an underline over a 2px track; the History and
Style panels are side panels with a header and a close button; Compare and the
welcome screen are ADS modals with header, body and footer; the toast is a flag.

The type is the one place the chrome departs from ADS: Atlassian Sans is not
openly licensed, so the `--ds-font-*` shorthands are set in GitLab Sans, with
ADS's sizes, line heights and weights.

None of it reaches the CV. The sheet is a separate document with its own inputs
in `cv/frame.css`, and custom properties do not cross that boundary. The one
rule that looks like an exception is the `<iframe>` element's own background in
`PreviewFrame.svelte` — that element lives in the app's document, so it takes
the app's tokens, and only the sheet inside is the frame's.

`codemirror.scss` and the frame's own are global for the same underlying
reason: they style DOM the Svelte compiler never sees. CodeMirror builds its
own; the sheet is mounted into another document, and its markdown fields are
injected with `{@html}` on top of that. Scoped selectors would reach neither.

### The preview frame

The sheet renders inside a same-origin `srcdoc` iframe rather than in the app's
own DOM. Nothing crosses the boundary in either direction, custom properties
included, so the app's styles can't reach the sheet by accident. It also means the frame has to
declare everything the sheet spends — `frame.css` is that list, and the overlap
with `tokens.scss` is the point rather than an oversight.

`CvSheet` is `mount()`ed into the frame's `#cv-root` with a `$state` props
object holding the model; mutating it re-renders the sheet in place, so the frame
is built once and never reloaded. After each render the frame paginates the
sheet, and its `measure()` reads it back for the export. The sheet is always
laid out at the paper's width — measured lengths would otherwise be wrong — and
a pane narrower than that zooms it instead.

Two things follow from the move. The print fallback goes to
`iframe.contentWindow.print()` — printing the app instead would put the frame on
the page as a box and crop the CV to it — which is also why `Ctrl+P` is
intercepted; `print.scss` is only the fallback for a print started from the
browser's own menu, which nothing can catch. And every listener the two panes need is bound to the frame's document,
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

#### Comparing

_Compare_ — in the tab bar, on a history row, and in the banner while a
version is checked out — opens two read-only editors side by side (one over the
other on a phone) holding any two of: the open file now, the open file at any
version, or another tab as it was last stored. Nothing is rendered; it is the
text that is being asked about.

The diff is a plain line diff, in [diff.ts](packages/core/src/diff.ts), so it
knows nothing about any format and compares two files as readily as two
versions of the same file. A run of removed lines followed by a
run of added ones is read as edits to the lines that line up, with the
characters that differ marked inside each; a click on an edited line brings its
other half into view. Each pane is coloured as its own file's format. The two
panes scroll together through the lines the diff paired, the same ladder the
editor and the preview share.

### Persistence

The whole document, history included, is exported as a Loro snapshot and base64'd
into `localStorage` on a 400 ms debounce, plus synchronously on tab close. Open the
editor in two tabs and they merge through the `storage` event — that is the CRDT
earning its keep rather than decorating. The stored value carries a lineage marker so
that "Clear history" in one tab replaces the document in the others instead of
merging two unrelated ones.

### Offline

Nothing here ever talked to the network, but until there was a service worker the
browser still could not _load_ the app without a server. `app/src/service-worker.ts`
precaches the Vite bundle, everything in `static/`, and the prerendered shell, so a
single visit is enough; after that it runs with the network off. SvelteKit registers it
automatically in a production build and leaves it out of `vite dev`, so development
never serves stale bytes.

The heaviest things in that precache are the PDF export's: the pdfkit chunk,
loaded on the first export, and the default pairing's font files. They are
precached all the same, because "exports only when online" would be a strange
kind of offline editor. The other font choices' faces — some ten megabytes
between them — are cached by the fetch handler the first time a sheet uses them.

The one asset that makes this sharper than a usual PWA is Loro's `.wasm`, fetched
lazily on first document load rather than inlined. Uncached, the app would paint its
shell and then hang forever on `await wasmReady`. It is precached with everything else,
and the fetch handler also keeps any same-origin response it sees, so the first online
visit would capture it even if it ever fell out of the build manifest.

Updates are deliberately quiet: no `skipWaiting`, so a new worker takes over only once
every tab of the old one has closed. That keeps an editing session from being swapped
out mid-edit, and it means the cache purge on activation cannot delete a lazily-loaded
chunk that a live page still wants.

Installed, it registers as a handler for `.md` / `.markdown`. A file
opened from the OS arrives through `launchQueue` and becomes its own tab under its own
name — which is what says its format — seeded so its version history
starts with the imported text instead of the template plus an overwrite. The manifest
asks for `focus-existing` because the whole state of this app is `localStorage` — a
second window would be a second writer racing the first.

Startup also asks for `navigator.storage.persist()`. An installed PWA is usually granted
it silently, and an offline editor that loses the CV it was holding to storage pressure
is not much of one.

## Dependencies

All bundled locally — the WASM, the fonts and every other asset URL are
same-origin.

`pdfkit` (and the `fontkit` it brings) is loaded only on the first export, as a
chunk of its own. The fonts are devDependencies because only their TTF files are
used, and those are copied into the build.

`loro-crdt` ships several builds. `loro-codemirror` imports the bare specifier, which
resolves to a build that loads its WASM with a synchronous main-thread XHR, and would
be a _second_ WASM instance whose objects the first instance cannot accept. The alias
in [vite.config.js](app/vite.config.js) pins every importer to the async `web` build, so
exactly one `.wasm` is emitted. `optimizeDeps.exclude` is there because pre-bundling
rewrites the `new URL(..., import.meta.url)` the build uses to find that file.
