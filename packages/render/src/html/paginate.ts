/**
 * Breaking the preview into pages — the pages the PDF will have.
 *
 * The sheet is laid out by CSS as one strip, in one column. This walks it in
 * order and, wherever a block would cross the foot of a page, pushes it down to the
 * top of the next one with a margin. The rules are the ones the print CSS used
 * to ask the browser for:
 * - an entry, a skill group, a list item, a row and a paragraph stay whole —
 *   but an entry marked `split` may break between its bullets
 * - a section title stays with the start of what follows it, as does an entry's
 *   heading, which takes its dates line along too
 * - an entry's closing line (its stack) stays with its last bullet
 * - a group taller than a page is broken between its parts rather than moved
 *
 * The strip is then exactly the pages, end to end. In page view they are drawn
 * `gap` apart as cards (see CvSheet), and that gap is part of the arithmetic
 * here; with it off the gap is 0. Either way pdf/measure.js reads the same
 * break points back, so the preview and the export always agree.
 *
 * Everything is in CSS pixels at the sheet's own size: a fitted preview is
 * zoomed, so measured lengths are divided by the zoom first.
 */

/** The page size and margins. */
export interface PageGeometry {
  width: number // the page, px
  height: number
  mt: number // the margins it is set inside, px
  mb: number
  gap: number // between pages in page view; 0 without it
}

/** The pagination result. */
export interface Pagination {
  pages: number
}

/** Pushed blocks are tagged, so the next run can put them back first. */
const PUSHED = 'data-push'

/** What may not be split across a page. */
const ATOMIC = 'p, h1, h2, h3, li, .cv-row, .keep:not(.split), .cv-chips, .meter, .chip, .cv-head, .sec-head'

/** What leads the block after it and must not be left at the foot of a page. */
const HEADING = 'h3, .cv-row'

/** An element's computed style, from its own document's window — the preview frame's. */
const style = (el: Element) => (el.ownerDocument.defaultView as Window).getComputedStyle(el)

/** Whether an element takes part in the flow: decoration and absolutely placed things don't. */
const flows = (el: Element) => !el.hasAttribute('aria-hidden') && !el.hasAttribute('data-skip') && style(el).position !== 'absolute'

/**
 * What a heading must not be parted from: the block after it, or past that
 * when it is a single line of text before a list — an entry's dates line,
 * which goes with its heading.
 */
const led = (kids: Element[], i: number): Element => {
  const [line, rest] = [kids[i + 1], kids[i + 2]]
  return line.matches('p') && rest && !rest.matches('p') ? rest : line
}

/**
 * Breaking the preview into pages — the pages the PDF will have.
 */
export function paginate(sheet: HTMLElement, geo: PageGeometry): Pagination {
  for (const el of sheet.querySelectorAll(`[${PUSHED}]`) as NodeListOf<HTMLElement>) {
    el.style.marginTop = ''
    el.style.removeProperty('--orig-mt')
    el.removeAttribute(PUSHED)
  }

  const origin = sheet.getBoundingClientRect()
  const zoom = origin.width / geo.width || 1
  const period = geo.height + geo.gap
  const room = geo.height - geo.mt - geo.mb

  /** Where an element is, in px from the top of the sheet. */
  const box = (el: Element) => {
    const r = el.getBoundingClientRect()
    const top = (r.top - sheet.getBoundingClientRect().top) / zoom
    return { top, bottom: top + r.height / zoom, height: r.height / zoom }
  }
  /** Get which page a y-coordinate falls on. */
  const pageOf = (y: number) => Math.max(0, Math.floor(y / period))
  /** Get the content top edge of a page. */
  const contentTop = (k: number) => k * period + geo.mt
  /** Get the content bottom edge of a page. */
  const contentBottom = (k: number) => k * period + geo.height - geo.mb

  /**
   * Move an element down by `by` px. Its margin may collapse with its parent's,
   * which would swallow part of the push, so the result is checked and topped up.
   */
  const push = (el: HTMLElement, to: number) => {
    if (!el.hasAttribute(PUSHED)) {
      el.style.setProperty('--orig-mt', style(el).marginTop)
      el.setAttribute(PUSHED, '')
    }
    for (let i = 0; i < 4; i++) {
      const by = to - box(el).top
      if (Math.abs(by) < 0.5) return
      el.style.marginTop = `${parseFloat(style(el).marginTop) + by}px`
    }
  }

  /** Whether a span crosses the foot of the page it starts on, or starts below it. */
  const crosses = (top: number, bottom: number) => {
    const k = pageOf(top)
    return top > contentBottom(k) + 0.5 || bottom > contentBottom(k) + 0.5
  }

  /** The next page's content top, for something starting at `top`. */
  const nextTop = (top: number) => contentTop(pageOf(top) + 1)

  /** Whether an element is already the first thing on its page. */
  const atTop = (top: number) => top <= contentTop(pageOf(top)) + 0.5

  /**
   * The bottom of the first unsplittable piece of a block: how much of it a
   * heading needs on the same page.
   */
  const firstPiece = (el: Element): number => {
    if (el.matches(ATOMIC) && box(el).height <= room) return box(el).bottom
    const kids = [...el.children].filter(flows)
    if (!kids.length) return box(el).bottom
    if (!kids[0].matches(HEADING) || kids.length < 2) return firstPiece(kids[0])
    // A heading's first piece runs on through the start of what it leads —
    // and when that is a lone bullet, through the closing line it keeps.
    const next = led(kids, 0)
    const after = kids[kids.indexOf(next) + 1]
    const lone = next.matches('ul') && [...next.children].filter(flows).length === 1 && after?.matches('p')
    return lone ? box(after).bottom : firstPiece(next)
  }

  const place = (el: Element): void => {
    if (!(el instanceof HTMLElement) || !flows(el)) return
    const b = box(el)
    if (b.height === 0 || !crosses(b.top, b.bottom)) return
    if (el.matches(ATOMIC) && b.height <= room) {
      if (!atTop(b.top)) push(el, nextTop(b.top))
      return
    }
    descend(el)
  }

  const descend = (el: Element): void => {
    const kids = [...el.children].filter(flows)
    if (el.classList.contains('grid')) return rows(kids)
    kids.forEach((kid, i) => {
      // A section title, or an entry's heading, takes the start of what
      // follows with it.
      const leads = kid.classList.contains('sec-head') || (kid.matches(HEADING) && i === 0 && kids.length > 1)
      if (leads && kids[i + 1]) {
        const top = box(kid).top
        // A heading leads only as the first thing in its group, so the group's
        // first piece is what it needs.
        const bottom = kid.matches(HEADING) ? firstPiece(el) : firstPiece(kids[i + 1])
        if (crosses(top, bottom) && !atTop(top) && bottom - top <= room) {
          // The section itself moves, so its top margin goes with it.
          const target = kid.classList.contains('sec-head') ? el : kid
          push(target as HTMLElement, nextTop(top))
          return
        }
      }
      // An entry's closing line, its stack, takes its last bullet with it.
      const last = kid.matches('p') && kids[i - 1]?.matches('ul') ? [...kids[i - 1].children].findLast(flows) : undefined
      if (last && el.matches('.cv-div')) {
        const top = box(last).top
        const bottom = box(kid).bottom
        if (crosses(top, bottom) && !atTop(top) && bottom - top <= room) {
          push(last as HTMLElement, nextTop(top))
          return
        }
      }
      place(kid)
    })
  }

  /**
   * A grid's children, a row at a time: a row moves whole, every item in it by
   * the same amount, so it stays a row.
   */
  const rows = (kids: Element[]): void => {
    const groups: Element[][] = []
    for (const kid of kids) {
      const last = groups[groups.length - 1]
      if (last && Math.abs(box(last[0]).top - box(kid).top) < 1) last.push(kid)
      else groups.push([kid])
    }
    for (const group of groups) {
      const top = Math.min(...group.map((k) => box(k).top))
      const bottom = Math.max(...group.map((k) => box(k).bottom))
      if (!crosses(top, bottom)) continue
      if (bottom - top <= room) {
        if (atTop(top)) continue
        const to = nextTop(top)
        for (const k of group) push(k as HTMLElement, to + (box(k).top - top))
      } else for (const k of group) place(k)
    }
  }

  const body = sheet.querySelector('.cv-body')
  if (body) descend(body)

  const end = Math.max(0, body ? box(body).bottom : 0, box(sheet.querySelector('.cv-head') ?? sheet).bottom)
  const pages = pageOf(Math.max(0, end - 0.5)) + 1

  return { pages }
}
