/**
 * Documents written before the section types were renamed after what they
 * hold rather than what a CV usually puts in them.
 *
 *   summary                          → text
 *   skills                           → groups
 *   experience, education, projects  → entries   (company, school → org)
 *   languages                        → levels
 *   certifications                   → records
 *   oss                              → table     (projects → items, stars → value,
 *                                                 hasHeader → columns)
 *
 * `migrateCv` rewrites the text, line by line, so that comments, blank lines
 * and the writer's own layout survive the conversion — the document is the
 * writer's, and a re-serialised one would read as somebody else's. It runs
 * when a file is opened, imported or restored from an older version.
 *
 * `migrateTree` does the same to a parsed tree, for the preview's sake: an
 * older version viewed from the history is shown as it was, and has to render
 * as something other than a page of unknown types.
 */

import { parse, splitLine } from './relaxed-yaml.js'

/** @type {Record<string, string>} */
export const TYPE_RENAMES = {
  summary: 'text',
  skills: 'groups',
  experience: 'entries',
  education: 'entries',
  projects: 'entries',
  languages: 'levels',
  certifications: 'records',
  oss: 'table',
}

/** What an `oss` table with `hasHeader: true` used to print over its columns. */
export const OSS_COLUMNS = ['Project', 'Stars / Users', 'Description']

/** The two names an entry's organisation went by. */
const ORG_KEYS = ['company', 'school']

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** @param {unknown} v */
const list = (v) => (Array.isArray(v) ? v : [])

/**
 * The document in the current section types, or null when it already is.
 * @param {string} text
 * @returns {string | null}
 */
export function migrateCv(text) {
  const { value, lines: at } = parse(text)
  if (!isMap(value) || !Array.isArray(value.sections)) return null

  const src = text.split('\n')
  /** 0-based line → what it becomes; an empty list drops it. @type {Map<number, string[]>} */
  const edits = new Map()

  /** @param {string} path */
  const lineOf = (path) => {
    const n = at.get(path)
    return n ? n - 1 : -1
  }

  /** @param {string} path @param {string} key */
  const renameKey = (path, key) => {
    const i = lineOf(path)
    if (i < 0) return
    const p = splitLine(src[i])
    if (p.key !== null) edits.set(i, [src[i].slice(0, p.content) + key + src[i].slice(p.colon)])
  }

  /** @param {string} path @param {string} v */
  const setValue = (path, v) => {
    const i = lineOf(path)
    if (i < 0) return
    const p = splitLine(src[i])
    if (p.value >= 0) edits.set(i, [src[i].slice(0, p.value) + v])
  }

  value.sections.forEach((/** @type {unknown} */ sec, /** @type {number} */ s) => {
    if (!isMap(sec) || typeof sec.type !== 'string') return
    const base = `sections.${s}`
    const type = TYPE_RENAMES[sec.type] ?? sec.type
    if (type !== sec.type) setValue(`${base}.type`, type)

    if (type === 'entries') {
      list(sec.items).forEach((item, j) => {
        if (!isMap(item) || 'org' in item) return
        const key = ORG_KEYS.find((k) => k in item)
        if (key) renameKey(`${base}.items.${j}.${key}`, 'org')
      })
    }

    if (type === 'table') {
      const holds = Array.isArray(sec.projects) && !('items' in sec) ? 'projects' : 'items'
      if (holds === 'projects') renameKey(`${base}.projects`, 'items')
      list(sec[holds]).forEach((item, j) => {
        if (isMap(item) && 'stars' in item && !('value' in item)) renameKey(`${base}.${holds}.${j}.stars`, 'value')
      })
      const i = 'hasHeader' in sec && !('columns' in sec) ? lineOf(`${base}.hasHeader`) : -1
      const p = i >= 0 ? splitLine(src[i]) : null
      // A `- hasHeader:` opening its item can't go without taking the item
      // with it; it is left for the linter to point at.
      if (p && !p.dashes.length) {
        const pad = ' '.repeat(p.content)
        edits.set(i, sec.hasHeader === true ? [`${pad}columns:`, ...OSS_COLUMNS.map((c) => `${pad}  - ${c}`)] : [])
      }
    }
  })

  if (!edits.size) return null
  return src.flatMap((line, i) => edits.get(i) ?? [line]).join('\n')
}

/**
 * A parsed document in the current section types — the tree-level twin of
 * `migrateCv`, for rendering text that is not going to be rewritten. Changes
 * the tree it is given, which is the parser's own fresh copy, and returns it.
 * @param {any} cv
 */
export function migrateTree(cv) {
  if (!isMap(cv) || !Array.isArray(cv.sections)) return cv
  for (const sec of cv.sections) {
    if (!isMap(sec) || !TYPE_RENAMES[sec.type]) continue
    sec.type = TYPE_RENAMES[sec.type]
    if (sec.type === 'entries') {
      for (const item of list(sec.items)) {
        const key = isMap(item) && !('org' in item) ? ORG_KEYS.find((k) => k in item) : undefined
        if (key) item.org = item[key]
      }
    }
    if (sec.type === 'table') {
      sec.items ??= sec.projects
      for (const item of list(sec.items)) if (isMap(item) && 'stars' in item && !('value' in item)) item.value = item.stars
      if (sec.hasHeader === true && !('columns' in sec)) sec.columns = OSS_COLUMNS
    }
  }
  return cv
}
