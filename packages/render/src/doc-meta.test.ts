import { describe, expect, it } from 'vitest'
import { docMeta, plain } from './doc-meta'

describe('plain', () => {
  it('keeps a link label and drops the emphasis', () => {
    expect(plain('**10+ years** at [Acme](https://acme.test) & co')).toBe('10+ years at Acme & co')
  })
})

describe('docMeta', () => {
  const cv = {
    header: { name: 'Jane **Doe**', role: 'Senior Engineer', contact: ['x'] },
    sections: [
      { type: 'text', title: 'Summary', paragraphs: ['Builds *things*.', 'Second paragraph.'] },
      {
        type: 'groups',
        blocks: [{ title: 'Core', rows: [{ text: 'TypeScript/JavaScript (10+ yrs), Node.js' }, { text: 'ORM: Prisma, TypeORM · Queues: Kafka' }] }],
      },
      { type: 'entries', items: [{ stack: 'React, node.js, Postgres' }, { stack: ['Docker', '**Rust**'] }] },
    ],
  }

  it('reads the title, author and description off the header and summary', () => {
    const meta = docMeta(cv)
    expect(meta.title).toBe('Jane Doe — CV')
    expect(meta.author).toBe('Jane Doe')
    expect(meta.description).toBe('Senior Engineer. Builds things.')
  })

  it('collects skills and stacks once each, without labels or asides', () => {
    expect(docMeta(cv).keywords).toEqual(['TypeScript/JavaScript', 'Node.js', 'Prisma', 'TypeORM', 'Kafka', 'React', 'Postgres', 'Docker', 'Rust'])
  })

  it('survives a document that is still being typed', () => {
    expect(docMeta(null)).toEqual({ title: 'CV', author: '', description: '', keywords: [] })
    expect(docMeta({ header: 'oops', sections: [null, { type: 'groups', blocks: 'x' }] }).keywords).toEqual([])
  })

  it('cuts a long description short', () => {
    const long = docMeta({ header: { role: 'R' }, sections: [{ type: 'text', paragraphs: ['word '.repeat(200)] }] })
    expect(long.description.length).toBeLessThanOrEqual(300)
    expect(long.description.endsWith('…')).toBe(true)
  })
})
