import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * The syntax colours, shared by both editors.
 *
 * Every value is a CSS custom property rather than a colour, so one style
 * serves the light and dark ramps alike — the `--cm-*` tokens live in
 * tokens.css and the rules that spend the rest of them in codemirror.css.
 *
 * The first group is what YAML uses; the second is markup, JavaScript and CSS,
 * which only the template editor ever shows. Tags nothing in a document matches
 * simply never come up, so the two halves can sit in one style.
 */
export const highlight = HighlightStyle.define([
  { tag: t.definition(t.propertyName), color: 'var(--cm-key)', fontWeight: '600' },
  { tag: t.string, color: 'var(--cm-string)' },
  { tag: t.special(t.string), color: 'var(--cm-block)' },
  { tag: t.content, color: 'var(--cm-text)' },
  { tag: t.lineComment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--cm-key)' },
  { tag: [t.separator, t.punctuation, t.squareBracket, t.brace], color: 'var(--cm-punct)' },
  { tag: [t.labelName, t.typeName], color: 'var(--cm-anchor)' },
  { tag: t.keyword, color: 'var(--cm-key)' },
  { tag: t.invalid, color: 'var(--cm-invalid)' },

  // Templates: HTML, the script block and the style block.
  { tag: [t.tagName, t.angleBracket], color: 'var(--cm-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--cm-attr)' },
  { tag: t.attributeValue, color: 'var(--cm-string)' },
  {
    tag: [t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword],
    color: 'var(--cm-keyword)',
    fontWeight: '600',
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-fn)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-num)' },
  { tag: t.variableName, color: 'var(--cm-text)' },
  { tag: t.definition(t.variableName), color: 'var(--cm-key)' },
  { tag: t.className, color: 'var(--cm-anchor)' },
  { tag: t.operator, color: 'var(--cm-punct)' },
  { tag: t.blockComment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
])
