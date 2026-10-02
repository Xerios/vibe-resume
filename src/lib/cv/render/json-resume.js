/**
 * The CV as JSON Resume (https://jsonresume.org/schema), attached to every
 * exported PDF.
 *
 * A PDF's text is what a person reads; a parser reading it has to guess which
 * line is a job title and which is a company. JSON Resume is the one open
 * standard for saying that outright, and resume tools and some ATS import it.
 * So the export carries it beside the PDF, as an associated file marked as an
 * alternative representation of the document.
 *
 * The YAML's section types say what shape a section is but not what it is
 * about. Experience, education and projects are all `entries`, so the
 * section's title decides which JSON Resume list an `entries` section goes to,
 * and anything it doesn't recognise is work. Every value is plain text: inline
 * Markdown is read for its words and its links.
 */

import { isoWhen, parseDates } from '../format/dates.js'
import { phoneNumber } from '../format/autolink.js'
import { contactRuns, list, runs, techs, textOf } from './inline.js'

/** @param {unknown} v */
const plain = (v) => textOf(runs(v)).trim()

/** The first link in a value, if it has one. @param {unknown} v */
const linkOf = (v) => runs(v).find((r) => r.href)?.href

/**
 * A `dates` value as JSON Resume's start and end: ISO 8601 dates, with no end
 * for one still going.
 * @param {unknown} v
 * @returns {{ startDate?: string, endDate?: string }}
 */
function dates(v) {
  const span = parseDates(plain(v))
  if (!span) return {}
  return { startDate: isoWhen(span.start), ...(span.end && span.end !== 'present' ? { endDate: isoWhen(span.end) } : {}) }
}

/** Drop the keys with nothing in them, so the JSON says only what the CV does. @template {Record<string, any>} T @param {T} o @returns {Partial<T>} */
const compact = (o) =>
  /** @type {Partial<T>} */ (Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))))

/** Profiles a CV links to, by the host that gives them away. */
const NETWORKS = /** @type {[RegExp, string][]} */ ([
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
  [/(^|\.)github\.com$/i, 'GitHub'],
  [/(^|\.)gitlab\.com$/i, 'GitLab'],
  [/(^|\.)(twitter|x)\.com$/i, 'X'],
  [/(^|\.)stackoverflow\.com$/i, 'Stack Overflow'],
  [/(^|\.)bsky\.app$/i, 'Bluesky'],
  [/(^|\.)dribbble\.com$/i, 'Dribbble'],
  [/(^|\.)behance\.net$/i, 'Behance'],
])

/**
 * The header as JSON Resume's `basics`: each contact line is a phone number, a
 * mail address, a profile, a site, or — if it is none of those — where the
 * person is.
 * @param {any} h
 * @param {string} summary
 */
function basics(h, summary) {
  /** @type {Record<string, any>} */
  const out = { name: plain(h?.name), label: plain(h?.role), summary }
  /** @type {{ network: string, username: string, url: string }[]} */
  const profiles = []
  for (const line of list(h?.contact)) {
    const text = String(line ?? '')
    const tel = phoneNumber(text)
    if (tel) {
      out.phone ??= tel.number
      continue
    }
    const href = contactRuns(text).find((r) => r.href)?.href
    if (href?.startsWith('mailto:')) {
      out.email ??= href.slice(7)
      continue
    }
    if (href) {
      let url
      try {
        url = new URL(href)
      } catch {
        continue
      }
      const network = NETWORKS.find(([re]) => re.test(url.hostname))?.[1]
      if (network) profiles.push({ network, username: url.pathname.split('/').findLast(Boolean) ?? '', url: href })
      else out.url ??= href
      continue
    }
    if (!out.location && plain(text)) out.location = { address: plain(text) }
  }
  out.profiles = profiles
  return compact(out)
}

/** Which JSON Resume list an `entries` section belongs in, read off its title. @param {string} title */
function kindOf(title) {
  if (/educat|school|universit|degree|academ|stud(y|ies)|qualif/i.test(title)) return 'education'
  if (/project|portfolio|open.?source/i.test(title)) return 'projects'
  if (/volunt/i.test(title)) return 'volunteer'
  return 'work'
}

/**
 * @param {any} cv  the parsed document; anything half-typed is tolerated
 * @param {{ now?: Date }} [opts]
 */
export function toJsonResume(cv, { now = new Date() } = {}) {
  const sections = list(cv?.sections).filter((s) => s && typeof s === 'object')
  const summary = sections.find((s) => s.type === 'text')
  /** @type {Record<string, any[]>} */
  const lists = {
    work: [],
    volunteer: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    certificates: [],
    awards: [],
    publications: [],
    interests: [],
  }

  for (const sec of sections) {
    const title = plain(sec.title)
    if (sec.type === 'entries') {
      const kind = kindOf(title)
      for (const item of list(sec.items)) {
        if (!item || typeof item !== 'object') continue
        if (item.subtype === 'earlier') {
          // A run of older roles, a line each: the bold name in front is the organisation.
          for (const line of list(item.items)) {
            const name = runs(line).find((r) => r.strong)?.text
            lists.work.push(compact({ name, summary: plain(line) }))
          }
          continue
        }
        const highlights = list(item.bullets).map(plain).filter(Boolean)
        const keywords = techs(item.stack).map(plain)
        const when = dates(item.dates)
        if (kind === 'education') {
          lists.education.push(compact({ institution: plain(item.org), studyType: plain(item.title), ...when, courses: highlights, summary: plain(item.sub) }))
        } else if (kind === 'projects') {
          lists.projects.push(
            compact({ name: plain(item.title), url: linkOf(item.title), entity: plain(item.org), description: plain(item.sub), ...when, highlights, keywords }),
          )
        } else if (kind === 'volunteer') {
          lists.volunteer.push(compact({ organization: plain(item.org), position: plain(item.title), ...when, summary: plain(item.sub), highlights }))
        } else {
          lists.work.push(compact({ name: plain(item.org), position: plain(item.title), ...when, summary: plain(item.sub), highlights, keywords }))
        }
      }
    } else if (sec.type === 'groups') {
      for (const b of list(sec.blocks)) {
        const rows = list(b?.rows)
        lists.skills.push(
          compact({ name: plain(b?.title), level: plain(rows.find((r) => r?.tier)?.tier), keywords: rows.flatMap((r) => techs(plain(r?.text))) }),
        )
      }
    } else if (sec.type === 'levels') {
      for (const item of list(sec.items)) {
        lists.languages.push(compact({ language: plain(item?.name), fluency: [plain(item?.level), plain(item?.note)].filter(Boolean).join(', ') }))
      }
    } else if (sec.type === 'records') {
      for (const item of list(sec.items)) {
        const when = dates(item?.dates)
        lists.certificates.push(compact({ name: plain(item?.name ?? item?.title), issuer: plain(item?.issuer), date: when.startDate, url: linkOf(item?.name) }))
      }
    } else if (sec.type === 'list') {
      const items = list(sec.items).map(plain).filter(Boolean)
      if (/award|honou?r|achiev|prize/i.test(title)) lists.awards.push(...items.map((t) => ({ title: t })))
      else if (/publication|paper|talk/i.test(title)) lists.publications.push(...items.map((t) => ({ name: t })))
      else lists.interests.push(...items.map((t) => ({ name: t })))
    } else if (sec.type === 'table') {
      for (const row of list(sec.items)) {
        lists.projects.push(
          compact({ name: plain(row?.name), url: linkOf(row?.name), description: plain(row?.desc), keywords: plain(row?.value) ? [plain(row?.value)] : [] }),
        )
      }
    }
  }

  return compact({
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: basics(cv?.header, list(summary?.paragraphs).map(plain).filter(Boolean).join('\n\n')),
    ...lists,
    meta: { canonical: 'https://jsonresume.org/schema', version: 'v1.0.0', lastModified: now.toISOString().slice(0, 19) },
  })
}
