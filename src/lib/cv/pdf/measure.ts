/**
 * The laid-out preview, read back as a display list the PDF is drawn from.
 *
 * The preview is the one layout there is (html/CvSheet.svelte, html/sheet.css),
 * paginated by html/paginate.js. This walks it in document order — which is
 * the model's reading order — and records:
 * - **Structure:** every element that means something, as the PDF structure
 *   type it is. A section is `Sect`, a heading `H1`–`H3`, a paragraph `P`, a
 *   list `L` > `LI` > `LBody`, a group `Div`, a link `Link`, and a meter
 *   (`role="img"`) a `Figure` with its label as alternative text. An element
 *   that means nothing (a `span`, a flex row) lends its content to its parent.
 * - **Text:** each run of text, one fragment per line it lands on, at the
 *   position the browser set it, with its font, size and colour.
 * - **Paint:** borders, background fills and SVG paths. Anything inside an
 *   `aria-hidden` element is decoration and becomes an artifact, as is every
 *   border and fill outside a figure.
 *
 * It reads a deliberately small subset of CSS: solid, dashed and dotted
 * borders, solid fills, border radii, translations, and `<path>`. sheet.css
 * keeps to it.
 *
 * Lengths come out in points, relative to the page they fall on.
 */

/** CSS px to pt. */
const PT = 0.75

/**
 * @typedef {object} TextItem
 * @property {'text'} kind
 * @property {number} page
 * @property {number} x         left edge, pt
 * @property {number} y         baseline, pt
 * @property {number} w         advance the browser gave it, pt
 * @property {number} h         line height of the run, pt — for a link's clickable box
 * @property {string} text
 * @property {{ at: number, x: number, w: number }[]} words  where each word starts in `text`, and where the browser put it, pt
 * @property {string[]} families  CSS family names, in fallback order
 * @property {number} weight
 * @property {boolean} italic
 * @property {number} size      pt
 * @property {number} tracking  letter spacing, pt
 * @property {string} color     hex
 * @property {string} [href]
 */

/**
 * @typedef {(
 *   | { kind: 'rect', page: number, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lw?: number, dash?: [number, number] }
 *   | { kind: 'line', page: number, x1: number, y1: number, x2: number, y2: number, lw: number, color: string, dash?: [number, number] }
 *   | { kind: 'path', page: number, x: number, y: number, scale: number, d: string, fill: string }
 * )} Paint
 */

/**
 * @typedef {object} StructNode
 * @property {'node'} kind
 * @property {string} tag
 * @property {string} [alt]       a figure's alternative text
 * @property {string} [actual]    what a span says, where what it prints is a styling of that
 * @property {string} [title]     a section's title
 * @property {string} [numbering] a list's ListNumbering — what marks its items
 * @property {string} [href]
 * @property {(StructNode | TextItem | Paint)[]} children
 */

/**
 * @typedef {object} DisplayList
 * @property {number} width   page, pt
 * @property {number} height
 * @property {number} pages
 * @property {string} paper   the page colour
 * @property {string} muted   the palette's muted ink, for the running head and foot
 * @property {string} lang    the CV's language
 * @property {StructNode} root          the `Document`, in reading order
 * @property {(Paint | TextItem)[][]} artifacts  per page
 */

/**
 * @typedef {object} Pages
 * @property {number} width   page, px
 * @property {number} height
 * @property {number} gap     between pages as the preview lays them out, px
 * @property {number} pages
 */

/** @type {Record<string, string>} */
const TAGS = { SECTION: 'Sect', HEADER: 'Sect', H1: 'H1', H2: 'H2', H3: 'H3', P: 'P', UL: 'L', LI: 'LI' }

/**
 * @param {HTMLElement} sheet  the `.sheet` element
 * @param {Pages} geo
 * @returns {DisplayList}
 */
export function measure(sheet, geo) {
  const doc = /** @type {Document} */ (sheet.ownerDocument)
  const win = /** @type {Window} */ (doc.defaultView)
  const origin = sheet.getBoundingClientRect()
  const zoom = origin.width / geo.width || 1
  const period = geo.height + geo.gap
  const range = doc.createRange()

  /** @type {DisplayList['artifacts']} */
  const artifacts = Array.from({ length: geo.pages }, () => [])

  /** A viewport x in px, as pt from the sheet's left edge. @param {number} x */
  const px = (x) => ((x - origin.left) / zoom) * PT
  /** A viewport y as the page it is on, and pt from that page's top. @param {number} y */
  const py = (y) => {
    const s = (y - origin.top) / zoom
    const page = Math.min(geo.pages - 1, Math.max(0, Math.floor(s / period)))
    return { page, y: (s - page * period) * PT }
  }
  /** A measured length in px — zoomed with the sheet — as pt. @param {number} l */
  const len = (l) => (l / zoom) * PT
  /** A computed style's length in px, which the zoom doesn't touch, as pt. @param {number} l */
  const css = (l) => l * PT

  const baselines = baselineProbe(doc)

  /**
   * @param {Element} el
   * @param {StructNode} parent
   * @param {boolean} hidden  inside decoration
   * @param {boolean} figure  inside a figure, whose paint is its content
   */
  function walk(el, parent, hidden, figure) {
    if (el.hasAttribute('data-skip')) return
    const cs = win.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    hidden ||= el.getAttribute('aria-hidden') === 'true'

    /** @type {StructNode} */
    let node = parent
    if (!hidden) {
      const role = el.getAttribute('role')
      if (role === 'img') {
        node = child(parent, { kind: 'node', tag: 'Figure', alt: el.getAttribute('aria-label') ?? '', children: [] })
        figure = true
      } else if (el.hasAttribute('data-actual')) {
        node = child(parent, { kind: 'node', tag: 'Span', actual: /** @type {string} */ (el.getAttribute('data-actual')), children: [] })
      } else if (el.tagName === 'A' && el.getAttribute('href')) {
        node = child(parent, { kind: 'node', tag: 'Link', href: /** @type {string} */ (el.getAttribute('href')), children: [] })
      } else if (TAGS[el.tagName]) {
        node = child(parent, { kind: 'node', tag: TAGS[el.tagName], children: [] })
        const title = el.getAttribute('data-title')
        if (title) node.title = title
        if (el.tagName === 'UL') node.numbering = numbering(el)
        // A list item's content is its body; the mark beside it is decoration.
        if (el.tagName === 'LI') node = child(node, { kind: 'node', tag: 'LBody', children: [] })
      } else if (el.matches('div.cv-div')) {
        node = child(parent, { kind: 'node', tag: 'Div', children: [] })
      }
    }

    for (const p of paint(el, cs)) (figure && !hidden ? node.children : artifacts[p.page]).push(p)

    if (el.tagName.toLowerCase() === 'svg') {
      for (const p of svg(/** @type {SVGSVGElement} */ (/** @type {unknown} */ (el)))) artifacts[p.page].push(p)
      return
    }

    for (const n of el.childNodes) {
      if (n.nodeType === 1) walk(/** @type {Element} */ (n), node, hidden, figure)
      else if (n.nodeType === 3) {
        for (const t of text(/** @type {Text} */ (n), cs, node)) (hidden ? artifacts[t.page] : node.children).push(t)
      }
    }
  }

  /**
   * A text node, as one fragment per line it is set on. Each character's box
   * is read; a line ends where the next character jumps back to the left. A
   * collapsed space has no box and is left out.
   * @param {Text} node
   * @param {CSSStyleDeclaration} cs  its element's style
   * @param {StructNode} owner
   * @returns {TextItem[]}
   */
  function text(node, cs, owner) {
    const data = node.data
    if (!data.length) return []
    const size = parseFloat(cs.fontSize)
    const families = cs.fontFamily.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''))
    const weight = Number(cs.fontWeight) || 400
    const italic = cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique')
    const upper = cs.textTransform === 'uppercase'
    const tracking = css(parseFloat(cs.letterSpacing) || 0)
    const color = hex(cs.color)
    const ratio = baselines(cs)
    const href = owner.tag === 'Link' ? owner.href : undefined

    /** @type {TextItem[]} */
    const out = []
    /** @type {{ left: number, right: number, top: number, bottom: number, text: string, words: { at: number, left: number, right: number }[], gap: boolean } | null} */
    let line = null
    const flush = () => {
      if (!line || !line.text.trim()) return
      const at = py(line.top + ratio * size * zoom)
      out.push({
        kind: 'text',
        page: at.page,
        x: px(line.left),
        y: at.y,
        w: len(line.right - line.left),
        h: len(line.bottom - line.top),
        text: upper ? line.text.toUpperCase() : line.text,
        words: line.words.map((w) => ({ at: w.at, x: px(w.left), w: len(w.right - w.left) })),
        families,
        weight,
        italic,
        size: size * PT,
        tracking,
        color,
        ...(href ? { href } : {}),
      })
    }
    for (let i = 0; i < data.length; i++) {
      // A surrogate pair is one character, and one box.
      const step = data.codePointAt(i) !== undefined && /** @type {number} */ (data.codePointAt(i)) > 0xffff ? 2 : 1
      range.setStart(node, i)
      range.setEnd(node, i + step)
      const r = range.getBoundingClientRect()
      const ch = data.slice(i, i + step)
      i += step - 1
      if (r.width === 0 && r.height === 0) continue
      if (line && r.left < line.right - 1) {
        flush()
        line = null
      }
      const space = /\s/.test(ch)
      if (!line) {
        // A space the browser drew opens the run — the one after a bold word
        // that ends the text node before. Its box is where the gap is.
        line = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: space ? ' ' : ch, words: space ? [] : [{ at: 0, left: r.left, right: r.right }], gap: space }
      } else {
        // A word starts after a space; each is placed where the browser put
        // it, so the PDF's spacing between words is the browser's.
        if (!space && line.gap) line.words.push({ at: line.text.length, left: r.left, right: r.right })
        else if (!space) line.words[line.words.length - 1].right = r.right
        line.gap = space
        line.text += space ? ' ' : ch
        line.right = Math.max(line.right, r.right)
        line.top = Math.min(line.top, r.top)
        line.bottom = Math.max(line.bottom, r.bottom)
      }
    }
    flush()
    // Trailing spaces are kept: they are what separates a run from the next.
    return out
  }

  /**
   * An element's own paint: a fill, and its borders — as one outline when all
   * four match, or a line per side. An inline element is painted once per line
   * box it spans.
   * @param {Element} el
   * @param {CSSStyleDeclaration} cs
   * @returns {Paint[]}
   */
  function paint(el, cs) {
    const fill = cs.backgroundColor
    const sides = /** @type {const} */ (['top', 'right', 'bottom', 'left']).map((s) => ({
      side: s,
      width: parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0,
      style: cs.getPropertyValue(`border-${s}-style`),
      color: cs.getPropertyValue(`border-${s}-color`),
    }))
    const visible = (/** @type {typeof sides[number]} */ b) => b.width > 0 && b.style !== 'none' && b.style !== 'hidden' && alpha(b.color) > 0
    const borders = sides.filter(visible)
    if (alpha(fill) === 0 && !borders.length) return []

    /** @type {Paint[]} */
    const out = []
    for (const r of el.getClientRects()) {
      if (r.width === 0 && r.height === 0) continue
      const at = py(r.top)
      const x = px(r.left)
      const w = len(r.width)
      const h = len(r.height)
      const radius = Math.min(css(parseFloat(cs.borderTopLeftRadius) || 0), w / 2, h / 2)
      if (alpha(fill) > 0) out.push({ kind: 'rect', page: at.page, x, y: at.y, w, h, r: radius, fill: hex(fill) })
      if (!borders.length) continue
      const same = borders.length === 4 && borders.every((b) => b.width === borders[0].width && b.style === borders[0].style && b.color === borders[0].color)
      if (same) {
        const lw = css(borders[0].width)
        out.push({
          kind: 'rect',
          page: at.page,
          x: x + lw / 2,
          y: at.y + lw / 2,
          w: w - lw,
          h: h - lw,
          r: Math.max(0, radius - lw / 2),
          stroke: hex(borders[0].color),
          lw,
          ...dash(borders[0].style, lw),
        })
        continue
      }
      for (const b of borders) {
        const lw = css(b.width)
        const color = hex(b.color)
        const d = dash(b.style, lw)
        // Down the side of a block that runs onto another page, a page at a time.
        if (b.side === 'left' || b.side === 'right') {
          const lx = b.side === 'left' ? x + lw / 2 : x + w - lw / 2
          for (const seg of vertical(r.top, r.bottom)) out.push({ kind: 'line', page: seg.page, x1: lx, y1: seg.y1, x2: lx, y2: seg.y2, lw, color, ...d })
        } else {
          const ly = b.side === 'top' ? at.y + lw / 2 : at.y + h - lw / 2
          out.push({ kind: 'line', page: at.page, x1: x, y1: ly, x2: x + w, y2: ly, lw, color, ...d })
        }
      }
    }
    return out
  }

  /**
   * A vertical span, cut where pages end and clipped to each page.
   * @param {number} top
   * @param {number} bottom
   */
  function vertical(top, bottom) {
    const a = py(top)
    const b = py(bottom)
    const pageH = geo.height * PT
    const out = []
    for (let page = a.page; page <= b.page; page++) {
      const y1 = page === a.page ? a.y : 0
      const y2 = page === b.page ? b.y : pageH
      if (y2 > y1) out.push({ page, y1, y2: Math.min(y2, pageH) })
    }
    return out
  }

  /**
   * An SVG's paths, placed and scaled from its viewBox onto its box.
   * @param {SVGSVGElement} el
   * @returns {Paint[]}
   */
  function svg(el) {
    const r = el.getBoundingClientRect()
    const vb = el.viewBox.baseVal
    if (!vb || !vb.width || !r.width) return []
    const at = py(r.top)
    const scale = len(r.width) / vb.width
    /** @type {Paint[]} */
    const out = []
    for (const path of el.querySelectorAll('path')) {
      const d = path.getAttribute('d')
      const fill = win.getComputedStyle(path).fill
      if (!d || alpha(fill) === 0) continue
      out.push({ kind: 'path', page: at.page, x: px(r.left) - vb.x * scale, y: at.y - vb.y * scale, scale, d, fill: hex(fill) })
    }
    return out
  }

  /** @type {StructNode} */
  const root = { kind: 'node', tag: 'Document', children: [] }
  for (const el of sheet.children) walk(el, root, false, false)

  const page = sheet.querySelector('.page')
  const paper = hex(win.getComputedStyle(page ?? sheet).backgroundColor) || '#ffffff'
  const muted = win.getComputedStyle(sheet).getPropertyValue('--c-muted').trim() || '#5f6f6c'
  return { width: geo.width * PT, height: geo.height * PT, pages: geo.pages, paper, muted, lang: sheet.lang || 'en', root: prune(root), artifacts }
}

/**
 * Where the baseline sits in a character's box, as a share of the font size,
 * for each face — read once per face from a probe outside the sheet: a run of
 * text with an empty inline-block after it, whose foot is the baseline.
 * @param {Document} doc
 */
function baselineProbe(doc) {
  /** @type {Map<string, number>} */
  const cache = new Map()
  return (/** @type {CSSStyleDeclaration} */ cs) => {
    const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`
    const known = cache.get(key)
    if (known !== undefined) return known
    const host = doc.createElement('div')
    host.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;line-height:normal;font-size:100px;font-family:${cs.fontFamily};font-weight:${cs.fontWeight};font-style:${cs.fontStyle}`
    const t = doc.createTextNode('H')
    const mark = doc.createElement('span')
    mark.style.cssText = 'display:inline-block;width:0;height:0'
    host.append(t, mark)
    doc.body.append(host)
    const range = doc.createRange()
    range.selectNodeContents(t)
    const ratio = (mark.getBoundingClientRect().bottom - range.getBoundingClientRect().top) / 100
    host.remove()
    cache.set(key, ratio)
    return ratio
  }
}

/**
 * What marks a list's items, as PDF's ListNumbering names it: a disc for the
 * bullets, a circle for the dots, and none for dashes, chips and run-on lists.
 * @param {Element} ul
 */
const numbering = (ul) => (ul.classList.contains('m-bullet') ? 'Disc' : ul.classList.contains('m-dot') ? 'Circle' : 'None')

/**
 * Add a structure node to its parent, and hand it back.
 * @template {StructNode} T
 * @param {StructNode} parent
 * @param {T} node
 * @returns {T}
 */
function child(parent, node) {
  parent.children.push(node)
  return node
}

/** Structure with nothing in it says nothing; drop it. @param {StructNode} node @returns {StructNode} */
function prune(node) {
  node.children = node.children.map((c) => (c.kind === 'node' ? prune(c) : c)).filter((c) => c.kind !== 'node' || c.children.length > 0)
  return node
}

/** @param {string} style @param {number} lw @returns {{ dash?: [number, number] }} */
const dash = (style, lw) => (style === 'dashed' ? { dash: [3 * lw, 2 * lw] } : style === 'dotted' ? { dash: [lw, lw] } : {})

/** The alpha of a computed colour. @param {string} c */
const alpha = (c) => {
  if (!c || c === 'transparent') return 0
  const m = /rgba?\(([^)]+)\)/.exec(c)
  if (!m) return 1
  const parts = m[1].split(/[,/\s]+/).filter(Boolean)
  return parts.length > 3 ? parseFloat(parts[3]) : 1
}

/** A computed `rgb()` as `#rrggbb`. @param {string} c */
const hex = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c ?? '')
  if (!m) return c
  return `#${m[1]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((v) => Math.round(parseFloat(v)).toString(16).padStart(2, '0'))
    .join('')}`
}
