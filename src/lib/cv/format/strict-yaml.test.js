import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import LEGACY_YAML from './fixtures/legacy-cv.yaml?raw'
import { parse } from './relaxed-yaml.js'
import { toStrictYaml } from './strict-yaml.js'

describe('toStrictYaml', () => {
  it('quotes what standard YAML would misread', () => {
    expect(
      toStrictYaml(`contact:
  - [site](https://x.dev)
  - **bold**
  - +1 555 010 1234
  - Some text: more
text: ORM: Prisma
note: a #hashtag
on: yes
when: 2023-01-15
phone: +33
md: 6
inline: true
said: 'it''s'
`),
    ).toBe(`contact:
  - '[site](https://x.dev)'
  - '**bold**'
  - +1 555 010 1234
  - 'Some text: more'
text: 'ORM: Prisma'
note: 'a #hashtag'
'on': 'yes'
when: '2023-01-15'
phone: '+33'
md: 6
inline: true
said: it's
`)
  })

  it('keeps comments and blank lines, and strips block chomping', () => {
    expect(toStrictYaml('# top\na: |\n  one: x\n\n  - two\nb: c\n')).toBe('# top\na: |-\n  one: x\n\n  - two\nb: c\n')
  })

  it('folds a multi-line paragraph onto one line', () => {
    expect(toStrictYaml('b:\n  some text\n  # note\n  Prisma #orm\n')).toBe("b:\n  'some text Prisma #orm'\n  # note\n")
  })

  it.each([
    ['default', DEFAULT_YAML],
    ['legacy', LEGACY_YAML],
  ])('reads back the same in the dialect (%s)', (_, src) => {
    expect(parse(toStrictYaml(src)).value).toEqual(parse(src).value)
  })
})
