/**
 * What the editor offers inside a directive comment, pinned: which place a
 * comment is in, and the keys and values on offer there.
 */

import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { SECTIONS } from '@vibe-resume/core/schema'
import { describe, expect, it } from 'vitest'
import { directiveComplete, spotAt } from './complete'

/** A document with the cursor written as `|`. */
const spot = (src: string) => spotAt(src.replace('|', ''), src.indexOf('|'))

/** Every label the editor would offer where the cursor is. */
const labels = (src: string, explicit = true) => {
  const state = EditorState.create({ doc: src.replace('|', '') })
  const result = directiveComplete(new CompletionContext(state, src.indexOf('|'), explicit))
  return result?.options.map((o) => o.label) ?? null
}

describe('where the comment is', () => {
  it('reads one under the name as the header’s', () => {
    expect(spot('# Jo\n<!-- l|')).toMatchObject({ where: 'header', what: 'key' })
  })

  it('reads one under a `##` as the section’s, and under a `###` as the entry’s', () => {
    expect(spot('# Jo\n## Work\n<!-- t|')).toMatchObject({ where: 'section' })
    expect(spot('# Jo\n## Work\n### Acme\n<!-- s|')).toMatchObject({ where: 'item' })
  })

  it('reads one at the end of a list item as the item’s', () => {
    expect(spot('# Jo\n## Languages\n- English <!-- r|')).toMatchObject({ where: 'item' })
  })

  it('has nothing to say outside a comment, or past its end', () => {
    expect(spot('# Jo\n## Work\nty|')).toBeNull()
    expect(spot('# Jo\n## Work\n<!-- type: list --> |')).toBeNull()
    expect(spot('<!-- t|')).toBeNull()
  })
})

describe('what is on offer', () => {
  it('offers the keys a comment takes in its place', () => {
    expect(labels('# Jo\n<!-- |')).toEqual(['lang'])
    expect(labels('# Jo\n## Work\n<!-- |')).toEqual(['type', 'inline'])
    expect(labels('# Jo\n## Work\n### Acme\n<!-- |')).toEqual(['subtype', 'sideNote', 'rating'])
  })

  it('waits for a key to be started unless asked', () => {
    expect(labels('# Jo\n## Work\n<!-- |', false)).toBeNull()
    expect(labels('# Jo\n## Work\n<!-- t|', false)).toEqual(['type', 'inline'])
  })

  it('offers every section type, and a closed set for the others', () => {
    expect(labels('# Jo\n## Work\n<!-- type: |', false)).toEqual(Object.keys(SECTIONS))
    expect(labels('# Jo\n## Work\n### Acme\n<!-- subtype: e|')).toEqual(['job', 'earlier'])
    expect(labels('# Jo\n## Work\n<!-- type: list, inline: |')).toEqual(['true', 'false'])
  })

  it('offers nothing for free text, or for a key that means nothing there', () => {
    expect(labels('# Jo\n<!-- lang: |')).toBeNull()
    expect(labels('# Jo\n## Work\n<!-- rating: |')).toBeNull()
  })
})
