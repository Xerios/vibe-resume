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
import { list, techs } from './inline'

/** Document metadata: title, author, description, and keywords. */
export interface DocMeta {
  /** `Name — CV`, or just `CV` before there is a name */
  title: string
  /** the CV's name */
  author: string
  /** the role, then the opening of the summary */
  description: string
  /** the skills and stacks, once each */
  keywords: string[]
}

/** Long enough for a summary's first sentence or two; search snippets stop near here. */
const DESCRIPTION_MAX = 300
/** Past this a "keyword" is a sentence that happened to sit in a skills row. */
const KEYWORD_MAX = 40
/** Enough for every skill a CV lists; a cap only so a runaway document stays sane. */
const KEYWORDS_MAX = 60

/** marked escapes exactly these, and nothing else needs decoding. */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/**
 * Inline Markdown → the text a reader sees.
 */
export function plain(text: unknown): string {
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
 */
const keyword = (s: string): string =>
  s
    .replace(/^[^:]*:\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()

/**
 * Extract document metadata from the parsed CV.
 * The parsed document; anything half-typed is tolerated.
 */
export function docMeta(cv: any): DocMeta {
  const name = plain(cv?.header?.name)
  const role = plain(cv?.header?.role)
  const sections = list(cv?.sections).filter((s) => s && typeof s === 'object')

  const summary = sections.find((s) => s.type === 'text')
  const opening = plain(list(summary?.paragraphs)[0])
  let description = [role, opening].filter(Boolean).join('. ')
  if (description.length > DESCRIPTION_MAX) description = `${description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`

  const raw: string[] = []
  for (const sec of sections) {
    if (sec.type === 'groups') {
      for (const block of list(sec.blocks)) for (const row of list(block?.rows)) raw.push(...techs(plain(row?.text)))
    } else if (sec.type === 'entries') {
      for (const item of list(sec.items)) raw.push(...techs(Array.isArray(item?.stack) ? item.stack.map(plain) : plain(item?.stack)))
    }
  }
  const seen: Map<string, string> = new Map()
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
