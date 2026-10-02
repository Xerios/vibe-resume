/**
 * What a CV is printed *on*: the page box the sheet flows into, and what the
 * browser puts in the margins around it.
 *
 * Everything else in this directory decides how the sheet is drawn; this
 * decides how big the paper is that it lands on. The two used to be one
 * number — `@page { size: A4 }` in frame.css and a `max-width: 820px` in
 * cv.css that happened to be about the same width — which is why a CV could
 * only ever be A4 portrait, and why the preview was only accidentally the
 * shape of what came out of the printer.
 *
 * So the page is a value now, per file like the theme and the font, and
 * `paperCss` is the one place it turns into CSS. That CSS says the same thing
 * twice, deliberately:
 *
 * - `@page`, which is what the print actually uses; and
 * - the `--page-*` tokens on `#cv-root`, which cv.css spends on the sheet, so
 *   the thing on screen is the size of the thing that prints.
 *
 * The running head and foot are `@page` margin boxes — real paged-media CSS,
 * which is the only way a browser will count pages for us: `counter(pages)`
 * is a number nothing in the DOM knows. Chrome has supported them since 131
 * and Firefox does not support them at all, so a header or a footer is a
 * Chrome-and-friends feature that degrades to nothing rather than to something
 * wrong. Everything else here — size, orientation, margins — is universal.
 */

/**
 * A sheet of paper, in millimetres and in the keyword `@page { size }` takes.
 * The keyword is what is actually emitted: naming a size lets Chrome's print
 * dialog select the matching paper rather than scaling to whatever was last
 * chosen there, which two explicit lengths do not.
 *
 * @typedef {object} PaperSize
 * @property {string} id
 * @property {string} name
 * @property {string} css   the CSS page-size keyword
 * @property {number} w     portrait width, mm
 * @property {number} h     portrait height, mm
 */

/** @type {PaperSize[]} */
export const PAPER_SIZES = [
  { id: 'a4', name: 'A4', css: 'A4', w: 210, h: 297 },
  { id: 'letter', name: 'Letter', css: 'letter', w: 215.9, h: 279.4 },
  { id: 'legal', name: 'Legal', css: 'legal', w: 215.9, h: 355.6 },
]

/** @type {{ id: string, name: string, hint: string }[]} */
export const ORIENTATIONS = [
  { id: 'portrait', name: 'Portrait', hint: 'Taller than it is wide — what a CV usually is' },
  { id: 'landscape', name: 'Landscape', hint: 'Wider than it is tall — room for a two-column sheet' },
]

/**
 * What can stand in the margin above or below the sheet. Both edges offer the
 * same four, since a page number reads as well at the top as at the bottom.
 * @type {{ id: string, name: string, hint: string }[]}
 */
export const RUNNING = [
  { id: 'none', name: 'None', hint: 'Nothing in the margin' },
  { id: 'name', name: 'Name', hint: 'The name from the CV, centred' },
  { id: 'page', name: 'Page', hint: 'Which page of how many — 2 / 3' },
  { id: 'both', name: 'Name + page', hint: 'The name on the left, the page number on the right' },
]

/**
 * @typedef {object} Paper
 * @property {string} size         a `PAPER_SIZES` id
 * @property {string} orientation  `portrait` or `landscape`
 * @property {string} header       a `RUNNING` id — what stands in the top margin
 * @property {string} footer       a `RUNNING` id — what stands in the bottom margin
 */

/** @type {Paper} */
export const DEFAULT_PAPER = { size: 'a4', orientation: 'portrait', header: 'name', footer: 'page' }

/** The margins the sheet has always printed with, now stated once. In mm. */
const MARGIN_X = 13
const MARGIN_Y = 12
/** What an edge carrying a running head gives it, on top of `MARGIN_Y`. In mm. */
const RUNNING_ROOM = 5

/** Millimetres to CSS pixels, at the 96dpi the CSS `mm` unit is defined against. */
const PX_PER_MM = 96 / 25.4

/**
 * Falls back rather than trusting what came out of storage — a file saved
 * before any of this existed has no paper at all, and an id can outlive the
 * list it came from. Always returns every key, so the rest of the app can
 * read `paper.orientation` without asking whether it is there.
 * @param {Partial<Paper> | undefined | null} paper
 * @returns {Paper}
 */
export function resolvePaper(paper) {
  return {
    size: pick(PAPER_SIZES, paper?.size, DEFAULT_PAPER.size),
    orientation: pick(ORIENTATIONS, paper?.orientation, DEFAULT_PAPER.orientation),
    header: pick(RUNNING, paper?.header, DEFAULT_PAPER.header),
    footer: pick(RUNNING, paper?.footer, DEFAULT_PAPER.footer),
  }
}

/**
 * One id, if it is still one of the choices, and the default if it isn't.
 * @param {{ id: string }[]} list
 * @param {unknown} id
 * @param {string} fallback
 */
const pick = (list, id, fallback) => (list.some((item) => item.id === id) ? /** @type {string} */ (id) : fallback)

/**
 * The page box the orientation actually comes to, in mm, plus the margins it
 * prints with — which grow on whichever edge carries a running head, so the
 * head sits in the margin rather than on top of the first line.
 * @param {Partial<Paper> | undefined | null} paper
 */
export function pageBox(paper) {
  const it = resolvePaper(paper)
  const size = PAPER_SIZES.find((s) => s.id === it.size) ?? PAPER_SIZES[0]
  const landscape = it.orientation === 'landscape'
  return {
    w: landscape ? size.h : size.w,
    h: landscape ? size.w : size.h,
    mx: MARGIN_X,
    mt: MARGIN_Y + (it.header === 'none' ? 0 : RUNNING_ROOM),
    mb: MARGIN_Y + (it.footer === 'none' ? 0 : RUNNING_ROOM),
  }
}

/**
 * The page's width in CSS pixels — what a preview has to fit into a pane.
 * @param {Partial<Paper> | undefined | null} paper
 */
export function pageWidthPx(paper) {
  return pageBox(paper).w * PX_PER_MM
}

/**
 * The paper, as the stylesheet the preview frame loads after cv.css and before
 * the template's own. Two blocks: the page box itself, and the tokens the
 * sheet on screen is sized from.
 *
 * The name is the CV's, and it is baked in as a string literal because that is
 * the only kind of text a margin box can hold — there is no element here to
 * put it in. A CV with no name simply gets no name in its margin rather than
 * an empty box.
 *
 * @param {Partial<Paper> | undefined | null} paper
 * @param {string} [name]  the name from the CV's header
 */
export function paperCss(paper, name = '') {
  const it = resolvePaper(paper)
  const size = PAPER_SIZES.find((s) => s.id === it.size) ?? PAPER_SIZES[0]
  const box = pageBox(it)

  const head = marginBoxes('top', it.header, name)
  const foot = marginBoxes('bottom', it.footer, name)

  return `@page {
	size: ${size.css} ${it.orientation};
	margin: ${box.mt}mm ${box.mx}mm ${box.mb}mm;
${head}${foot}}
${firstPageRule(head)}#cv-root {
	--page-w: ${box.w}mm;
	--page-h: ${box.h}mm;
	--page-mx: ${box.mx}mm;
	--page-mt: ${box.mt}mm;
	--page-mb: ${box.mb}mm;
}
`
}

/**
 * The margin boxes one edge comes to. `both` splits the edge in two rather
 * than crowding one box, which is what the corners are for; the other modes
 * take the centre.
 *
 * `var()` resolves in here — the page context inherits from the root element —
 * so the head is set in the frame's own declared tokens rather than in a
 * second copy of the mono stack. They come from frame.css's `:root` and not
 * from the palette on `#cv-root`, which is why this is muted grey whatever
 * theme the sheet is in: a running head is furniture, not part of the CV.
 *
 * @param {'top' | 'bottom'} edge
 * @param {string} mode  a `RUNNING` id
 * @param {string} name
 */
function marginBoxes(edge, mode, name) {
  const title = name.trim() ? cssString(name) : ''
  const page = `counter(page) " / " counter(pages)`
  const style = `font-family: var(--mono); font-size: 8pt; color: var(--muted);`

  /** @type {[string, string][]} */
  const boxes =
    mode === 'name' && title
      ? [[`${edge}-center`, title]]
      : mode === 'page'
        ? [[`${edge}-center`, page]]
        : mode === 'both'
          ? title
            ? [
                [`${edge}-left`, title],
                [`${edge}-right`, page],
              ]
            : [[`${edge}-right`, page]]
          : []

  return boxes.map(([at, content]) => `\t@${at} { content: ${content}; ${style} }\n`).join('')
}

/**
 * A running header repeats the name the sheet already sets in 31px at the top
 * of page one, so the first page doesn't get one. `content: none` is what
 * stops a margin box being generated at all, and `@page :first` outranks the
 * plain `@page` above it.
 *
 * The footer has no such problem — a page number belongs on page one as much
 * as on any other — so nothing here touches it.
 * @param {string} head  the top edge's margin boxes; empty when it has none
 */
function firstPageRule(head) {
  if (!head) return ''
  const boxes = ['top-left', 'top-center', 'top-right']
  return `@page :first {\n${boxes.map((at) => `\t@${at} { content: none }\n`).join('')}}\n`
}

/**
 * A string, as CSS `content` will take it. Only two characters can break out
 * of a double-quoted CSS string, and a newline is not allowed inside one at
 * all — a name is one line by the time it gets here anyway.
 * @param {string} text
 */
function cssString(text) {
  return `"${text.replace(/[\\"]/g, '\\$&').replace(/\s+/g, ' ').trim()}"`
}
