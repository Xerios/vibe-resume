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
 * `migrateTree` brings a parsed tree up to date, so a document written in
 * the old types — or an older version viewed from the history — renders as
 * something other than a page of unknown types. The text itself is left as
 * it was written.
 */

export const TYPE_RENAMES: Record<string, string> = {
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

const isMap = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/**
 * A parsed document in the current section types. Changes the tree it is
 * given, which is the parser's own fresh copy, and returns it.
 */
export function migrateTree(cv: any): any {
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
