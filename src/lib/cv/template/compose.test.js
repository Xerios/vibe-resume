/**
 * The composer's gate. `svelte-check` reads each layout and each `.svelte`
 * variant on its own; what it can't see is whether they still make a component
 * once assembled — a snippet renamed on one side of the contract, a `@cv` name
 * a variant needs and the layout doesn't import, two chip variants declaring
 * `chip` twice. Compiling every combination is what catches those.
 */

import { compile } from 'svelte/compiler'
import { describe, expect, it } from 'vitest'
import { PRESETS, composition } from './compositions.js'
import { compose } from './compose.js'
import { SLOTS, resolveSlots } from './slots.js'

/** @param {Record<string, string>} choices */
const build = (choices) => compile(compose(choices).source, { name: 'T', generate: 'client', css: 'external', runes: true })

describe('compose', () => {
  it('hands back the layout verbatim when nothing is chosen', () => {
    const { source } = compose(resolveSlots({}))
    expect(source).toContain('{#snippet stackLine(')
    expect(source).toContain('<b>STACK</b>')
    expect(source).not.toContain('<style>')
  })

  for (const p of PRESETS) {
    it(`compiles the ${p.id} preset`, () => {
      expect(() => build(composition({ layout: p.id }))).not.toThrow()
    })
  }

  // Every variant against the defaults, which is the combination the block
  // picker makes reachable in one click from anywhere.
  for (const slot of SLOTS) {
    for (const v of slot.variants) {
      it(`compiles ${slot.id}:${v.id} on its own`, () => {
        expect(() => build(resolveSlots({ [slot.id]: v.id }))).not.toThrow()
      })
    }
  }

  // Vitest stubs CSS imports out unless told otherwise, and an empty variant
  // compiles perfectly well — so the shipped sources are checked for content
  // rather than only for compiling.
  it('ships a source for every variant that is not a default', () => {
    for (const slot of SLOTS) {
      for (const v of slot.variants.slice(1)) {
        expect((v.css ?? v.svelte ?? v.layout ?? '').trim(), `${slot.id}:${v.id}`).not.toBe('')
      }
    }
  })

  it('puts a style-only variant into the sheet it was chosen for', () => {
    const { source } = compose(resolveSlots({ page: 'gutter', entry: 'gutter' }))
    expect(source).toContain('--gutter: 104px')
    expect(source).toContain('padding-left: var(--gutter, 104px)')
  })

  it('declares chip once when every chip variant is chosen at once', () => {
    const { source } = compose(resolveSlots({ stack: 'chips', skills: 'chips', list: 'chips' }))
    expect(source.match(/\{#snippet chip\(/g)).toHaveLength(1)
    expect(source).toContain('techIcon')
  })

  it('keeps a variant out of the sheet when the slot is back on its default', () => {
    const { source } = compose(resolveSlots({ stack: 'line' }))
    expect(source).not.toContain('class="stack chips"')
  })

  it('maps a line of the composed source back to the part it came from', () => {
    const composed = compose(resolveSlots({ stack: 'chips' }))
    const line = composed.source.split('\n').findIndex((l) => l.includes('class="stack chips"')) + 1
    expect(locateIn(composed, line)).toBe('stack:chips')
    expect(locateIn(composed, 1)).toBe('page:single')
  })
})

/** @param {import('./compose.js').Composed} composed @param {number} line */
function locateIn(composed, line) {
  const span = composed.map.find((s) => line >= s.from && line < s.from + s.lines)
  return span?.id
}
