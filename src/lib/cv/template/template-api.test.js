import { describe, expect, it } from 'vitest'
import { contact, md } from './template-api.js'

describe('contact', () => {
  it('links a phone number, dialable', () => {
    expect(contact('+1 555 010 1234')).toBe('<a href="tel:+15550101234">+1 555 010 1234</a>')
    expect(contact('Phone: (555) 010-1234')).toBe('Phone: <a href="tel:5550101234">(555) 010-1234</a>')
  })

  it('links a mail address, without sending it to a new tab', () => {
    expect(contact('jane@example.com')).toBe('<a href="mailto:jane@example.com">jane@example.com</a>')
  })

  it('leaves anything that only contains digits alone', () => {
    expect(contact('Springfield, USA')).toBe(md('Springfield, USA'))
    expect(contact('10115 Berlin')).toBe('10115 Berlin')
    expect(contact('2016-2020')).toBe('2016-2020')
    expect(contact('[github.com/x](https://github.com/x)')).toContain('target="_blank"')
  })
})
