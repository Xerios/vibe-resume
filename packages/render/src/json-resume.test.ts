import { describe, expect, it } from 'vitest'
import { toJsonResume } from './json-resume'
import { parseWith } from '@vibe-resume/core/format'
import { yaml } from '@vibe-resume/format-yaml'

const resume = toJsonResume(parseWith(yaml, yaml.template).cv, { now: new Date('2026-01-01T00:00:00Z') }) as any

describe('toJsonResume', () => {
  it('sorts the contact lines into basics', () => {
    expect(resume.basics).toEqual({
      name: 'John Doe',
      label: 'Senior Full-Stack Engineer · 10+ years',
      summary: expect.stringMatching(/^Full-stack engineer with 10\+ years/),
      phone: '+1 555 010 1234',
      email: 'john.doe@example.com',
      url: 'https://example.dev',
      location: { address: 'Springfield, USA' },
      profiles: [
        { network: 'GitHub', username: 'example', url: 'https://github.com/example' },
        { network: 'LinkedIn', username: 'example', url: 'https://linkedin.com/in/example' },
      ],
    })
  })

  it('makes each role a work entry with ISO dates', () => {
    expect(resume.work[0]).toMatchObject({
      name: 'Acme Corp',
      position: 'Senior Full-Stack Engineer',
      startDate: '2020-03',
      keywords: expect.arrayContaining(['React']),
    })
    expect(resume.work[0].endDate).toBeUndefined()
    expect(resume.work[1]).toMatchObject({ startDate: '2016-06', endDate: '2020-02' })
    expect(resume.work.some((w: any) => w.name === 'Umbrella Startups')).toBe(true)
  })

  it('sends sections to the list their title says', () => {
    expect(resume.education[0]).toMatchObject({ institution: 'Springfield University', studyType: 'BSc Computer Science', startDate: '2010', endDate: '2014' })
    expect(resume.projects[0]).toMatchObject({ name: 'dashboard-kit', url: 'https://example.dev/dashboard-kit', startDate: '2023' })
    expect(resume.certificates[0]).toMatchObject({ name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', date: '2023' })
    expect(resume.languages[2]).toEqual({ language: 'German', fluency: 'A2, reading' })
    expect(resume.skills[0]).toMatchObject({ name: 'Full-Stack Core', level: 'Expert', keywords: expect.arrayContaining(['Node.js']) })
    expect(resume.interests.map((i: any) => i.name)).toEqual(['Open source', 'Mentoring', 'Trail running', 'Chess'])
  })

  it('survives a document that is still being typed', () => {
    expect(() => toJsonResume(null)).not.toThrow()
    expect(() => toJsonResume({ header: 'x', sections: [null, { type: 'entries', items: [null, { subtype: 'earlier' }] }] })).not.toThrow()
  })
})
