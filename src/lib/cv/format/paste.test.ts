import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { appendSections, basicConversion, classifyPaste, conversionPrompt, readMarkdown, stripFence } from './paste'
import { parse } from './relaxed-yaml'

const MARKDOWN = `# Jane Roe
jane@example.com · +1 555 010 1234

## Experience

### Engineer, Acme
- Built **things**
- Analytics: Mixpanel

## Education
BSc, Springfield`

const issue = (over: Partial<any>) => ({ kind: 'markdown' as const, text: MARKDOWN, html: '', from: 0, to: 0, whole: true, ...over })

describe('classifyPaste', () => {
  it('lets the format through, whole or in part', () => {
    expect(classifyPaste(DEFAULT_YAML, '', true)).toBeNull()
    expect(classifyPaste('- one\n- two\n- three', '', false)).toBeNull()
    expect(classifyPaste('title: A\ncompany: B\ndates: 2020', '', false)).toBeNull()
  })

  it('lets short pastes through', () => {
    expect(classifyPaste('# Heading\nline', '', true)).toBeNull()
  })

  it('catches Markdown', () => {
    expect(classifyPaste(MARKDOWN, '', false)).toBe('markdown')
    expect(classifyPaste(MARKDOWN, '', true)).toBe('markdown')
  })

  it('catches formatted text, but not a code editor copying the format', () => {
    expect(classifyPaste('Jane Roe\nExperience\nAcme', '<h1>Jane Roe</h1><h2>Experience</h2><p>Acme</p>', false)).toBe('html')
    expect(classifyPaste('<div>\n<p>One</p>\n<p>Two</p>\n</div>', '', false)).toBe('html')
    expect(classifyPaste('- one\n- two\n- three', '<div><span>- one</span><br></div>', false)).toBeNull()
  })

  it('catches a whole document that is not a CV in the format', () => {
    expect(classifyPaste('basics:\n  name: Jane\nwork:\n  - name: Acme', '', true)).toBe('invalid')
    expect(classifyPaste('Jane Roe\nEngineer\nAcme, 2020', '', true)).toBe('invalid')
    expect(classifyPaste('Jane Roe\nEngineer\nAcme, 2020', '', false)).toBeNull()
  })
})

describe('readMarkdown', () => {
  it('makes the shallowest headings sections and everything else lines', () => {
    const { name, sections } = readMarkdown(MARKDOWN, true)
    expect(name).toBe('Jane Roe')
    expect(sections.map((s: any) => s.title)).toEqual(['', 'Experience', 'Education'])
    expect(sections[1].paras).toEqual(['**Engineer, Acme**', '• Built **things**', '• Analytics: Mixpanel'])
  })

  it('reads setext headings', () => {
    expect(readMarkdown('Jane\n====\n\nSkills\n------\nGo', true)).toEqual({ name: 'Jane', sections: [{ title: 'Skills', paras: ['Go'] }] })
  })
})

describe('basicConversion', () => {
  it('replaces the whole document with one that parses', () => {
    const edit = basicConversion(issue({}), DEFAULT_YAML)
    expect([edit.from, edit.to]).toEqual([0, DEFAULT_YAML.length])
    const { value, diagnostics } = parse(edit.insert)
    expect(diagnostics.filter((d: any) => d.severity === 'error')).toEqual([])
    expect(value.header.name).toBe('Jane Roe')
    expect(value.sections[1].paragraphs).toContain('Analytics: Mixpanel'.replace(/^/, '• '))
  })

  it('quotes a line that would otherwise read as a key', () => {
    const edit = basicConversion(issue({ text: '## A\nAnalytics: Mixpanel\nplain' }), '')
    expect(parse(edit.insert).value.sections[0].paragraphs).toEqual(['Analytics: Mixpanel', 'plain'])
  })

  it('adds sections to the end of the list in part of a document', () => {
    const edit = basicConversion(issue({ whole: false, text: MARKDOWN.replace('# Jane Roe\n', '') }), DEFAULT_YAML)
    const next = DEFAULT_YAML.slice(0, edit.from) + edit.insert + DEFAULT_YAML.slice(edit.to)
    const before = parse(DEFAULT_YAML).value.sections.length
    const after = parse(next).value.sections
    expect(after).toHaveLength(before + 3)
    expect(after.at(-3).title).toBeUndefined()
    expect(after.at(-1).title).toBe('Education')
  })

  it('puts new sections before a later top-level key', () => {
    const doc = 'sections:\n  - type: list\n    items:\n      - a\n\nheader:\n  name: X\n'
    const edit = appendSections(doc, '  - type: text\n    paragraphs:\n      - b')
    const next = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
    expect(parse(next).value).toEqual({
      sections: [
        { type: 'list', items: ['a'] },
        { type: 'text', paragraphs: ['b'] },
      ],
      header: { name: 'X' },
    })
  })

  it('starts a list when there is none', () => {
    const edit = appendSections('header:\n  name: X\n', '  - type: text')
    expect(parse('header:\n  name: X\n'.slice(0, edit.from) + edit.insert).value.sections).toEqual([{ type: 'text' }])
  })
})

describe('the prompt', () => {
  it('carries the CV', () => {
    expect(conversionPrompt(MARKDOWN)).toContain('## Experience')
  })

  it('takes the reply out of its fence', () => {
    expect(stripFence('```yaml\nheader:\n  name: X\n```\n')).toBe('header:\n  name: X')
    expect(stripFence('header:\n  name: X')).toBe('header:\n  name: X')
  })
})
