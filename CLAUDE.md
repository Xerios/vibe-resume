# Claude Code Instructions

## Stack

Svelte 5 (runes) + TypeScript + Vite + Vitest, managed with pnpm.
Linting is Oxlint, formatting is Oxfmt.

Always use `pnpm`, never `npm` or `yarn`.

## Scope

- Keep changes narrowly scoped to the requested task.
- Do not refactor unrelated code.
- Do not perform opportunistic cleanup.
- Do not modify generated files unless explicitly requested.

## Formatting

Formatting is handled by Oxfmt, and it runs automatically.

- A `PostToolUse` hook formats every file after you edit it.
- `lint-staged` formats staged files again on commit.
- Do not manually format code.
- Do not run `pnpm fmt` or `pnpm check:fmt` just to check formatting.
- Do not spend time fixing whitespace, indentation, quotes, semicolons, or import formatting.
- The project's automated tooling handles formatting.

## Validation

Use the project's validation command:

```bash
pnpm check
```

This runs `svelte-check` (types), `oxlint --deny-warnings` (lint), and `vitest run` (tests).

For substantive code changes, run `pnpm check` after implementation.

Do not separately run type checking, linting, or the full test suite when `pnpm check` already covers them.

### Validation by change type

- Documentation-only changes: no validation required.
- Comments-only changes: no validation required.
- CSS/styling-only changes: use judgment; avoid the full test suite unless behavior could be affected.
- Trivial UI changes: use judgment; avoid unnecessary full-suite tests.
- Logic/behavior changes: run `pnpm check`.
- Changes to tests: run the relevant tests.
- Before completing a substantial task: run `pnpm check`.

If validation fails:

1. Read the failure.
2. Fix the underlying problem.
3. Re-run only the relevant failing check while debugging (`pnpm check:types`, `pnpm check:lint`, `pnpm check:security`, or a targeted Vitest run).
4. Once fixed, run `pnpm check` once more if appropriate.

Do not repeatedly run successful checks.

## Linting

- Fix the code rather than silencing the rule.
- Do not add `oxlint-disable` comments unless the rule is genuinely wrong for that line, and say why in the comment.
- Do not edit `.oxlintrc.json` to make an error go away.
- Oxlint only sees the `<script>` blocks of `.svelte` files. Template-level problems will not be caught by the linter, so read the markup yourself.

## Tests

- Prefer targeted Vitest tests while debugging: `pnpm exec vitest run src/lib/thing.test.ts`.
- Do not run the entire test suite after every edit.
- Only add tests relevant to the requested behavior.
- Do not rewrite existing tests unless necessary.
- Do not chase unrelated failing tests.

## Svelte

- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`. No `export let`, no legacy stores, no `on:click`.
- Shared reactive state belongs in `*.svelte.ts` modules.
- Follow the existing project's Svelte conventions.
- Reuse existing components/utilities before creating new abstractions.
- Do not introduce a new dependency unless necessary.
- Keep component changes focused on the requested behavior.

## Security

`pnpm check:security` fails on two things the linter cannot see:

- `{@html ...}` in Svelte markup. Sanitize the value first, then annotate the line with `<!-- allow-html: reason -->`. Do not add the annotation to silence the check.
- Secret-looking names on `VITE_` variables. Anything prefixed `VITE_` is inlined into the client bundle, so it is public. Never put a token, key, or password behind that prefix.

Other rules:

- Never commit a `.env` file. Add new public variables to `.env.example`.
- Adding a dependency means adding a supply-chain risk. Ask before introducing one, and never add an entry to `allowBuilds` in `pnpm-workspace.yaml` — that authorises a package to run code at install time.
- Do not edit `.github/`, `.husky/`, `.claude/`, or `scripts/` as a side effect of another task. Those files execute with full privileges.

## Sandbox

Bash commands run in Claude Code's sandbox. Writes are limited to this working directory and network access is limited to the npm registry.

- If a command fails on a blocked path or host, report it instead of working around it.
- Do not weaken `.claude/settings.json` to make a command pass.
- Adding a dependency needs a real justification; the install itself is allowed.

## Completion

When the requested change is implemented and relevant validation passes, stop.

Do not perform additional cleanup, formatting passes, refactoring, or self-review unless requested.

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
  singletons in `src/lib/cv/state/state.svelte.js`. Don't construct a `CvDoc` or
  `FileManager` in a page; import those and call `start()`.
- A CV is laid out once, as HTML: `render/model.js` builds a tree in reading
  order (block variants from `render/variants.js` become properties on it),
  `html/CvSheet.svelte` + `html/sheet.css` lay it out, and `html/paginate.js`
  breaks it into pages. The PDF is that layout read back by `pdf/measure.js` and
  drawn by `pdf/PdfRenderer.js`; there is no second layout engine. A new look is
  model properties + CSS, and the CSS must stay within what measure.js reads
  (text, solid/dashed/dotted borders, fills, radii, translations, `<path>`).
  Decoration must be a real `aria-hidden` element, never `::before`/`::after`.
- Export must stay PDF/UA-1: every drawn thing is either tagged content or an
  `Artifact`, content is written in DOM order, and only the bundled faces in
  `theme/typefaces.js` are used. `pdf/PdfRenderer.test.js` checks this against
  display lists in `pdf/fixtures/`, which are measured from a real browser and
  have to be measured again when the sheet's markup changes.
- Never write a literal `<style>` or `<script>` tag inside a comment in a Svelte
  `<script>` block — the parser reads it as the real thing and `pnpm check`
  fails, even though the app compiles.
- Style each piece of UI in its own component's `<style>` block. `src/lib/styles/*`,
  `cv/frame.css`, `cv/html/sheet.css` and `components/codemirror.scss` are global
  only because they style DOM outside the app's own components (CodeMirror's, and
  the sheet mounted into the preview frame).
