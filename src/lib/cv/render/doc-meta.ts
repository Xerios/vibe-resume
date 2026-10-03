/**
 * What the sheet says about itself, as plain text: the frame's `<title>` and
 * the `author`, `description` and `keywords` meta beside it.
 *
 * The title is the one that reaches the PDF — Chromium's print-to-PDF writes
 * the printed document's title as the PDF's Title and nothing else from the
 * head. The rest are there for anything that reads the HTML, and for the day
 * the browsers map them onto Author, Subject and Keywords too.
 *
 * Every value in a CV is inline Markdown, so each one is rendered and taken
 * back down to its text: a `[label](url)` contributes its label, a `**claim**`
 * its words.
 */

import { marked } from 'marked'
import { list, techs } from './inline.js'

/**
 * @typedef {object} DocMeta
 * @property {string} title        `Name — CV`, or just `CV` before there is a name
 * @property {string} author       the CV's name
 * @property {string} description  the role, then the opening of the summary
 * @property {string[]} keywords   the skills and stacks, once each
 */

/** Long enough for a summary's first sentence or two; search snippets stop near here. */
const DESCRIPTION_MAX = 300
/** Past this a "keyword" is a sentence that happened to sit in a skills row. */
const KEYWORD_MAX = 40
/** Enough for every skill a CV lists; a cap only so a runaway document stays sane. */
const KEYWORDS_MAX = 60

/** marked escapes exactly these, and nothing else needs decoding. */
/** @type {Record<string, string>} */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/**
 * Inline Markdown → the text a reader sees.
 * @param {unknown} text
 */
export function plain(text) {
  if (text == null || text === '') return ''
  const html = String(marked.parseInline(String(text).trim()))
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One entry of a skills row or a stack, as a keyword: the label in front of a
 * colon (`ORM: Prisma`) and an aside in brackets (`TypeScript (10+ yrs)`) are
 * the writer talking, not the skill.
 * @param {string} s
 */
const keyword = (s) =>
  s
    .replace(/^[^:]*:\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()

/**
 * @param {any} cv  the parsed document; anything half-typed is tolerated
 * @returns {DocMeta}
 */
export function docMeta(cv) {
  const name = plain(cv?.header?.name)
  const role = plain(cv?.header?.role)
  const sections = list(cv?.sections).filter((s) => s && typeof s === 'object')

  const summary = sections.find((s) => s.type === 'text')
  const opening = plain(list(summary?.paragraphs)[0])
  let description = [role, opening].filter(Boolean).join('. ')
  if (description.length > DESCRIPTION_MAX) description = `${description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`

  /** @type {string[]} */
  const raw = []
  for (const sec of sections) {
    if (sec.type === 'groups') {
      for (const block of list(sec.blocks)) for (const row of list(block?.rows)) raw.push(...techs(plain(row?.text)))
    } else if (sec.type === 'entries') {
      for (const item of list(sec.items)) raw.push(...techs(Array.isArray(item?.stack) ? item.stack.map(plain) : plain(item?.stack)))
    }
  }
  /** @type {Map<string, string>} */
  const seen = new Map()
  for (const k of raw.map(keyword)) {
    if (k && k.length <= KEYWORD_MAX && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k)
  }

  return {
    title: name ? `${name} — CV` : 'CV',
    author: name,
    description,
    keywords: [...seen.values()].slice(0, KEYWORDS_MAX),
  }
}
