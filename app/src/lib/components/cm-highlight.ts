import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * The syntax colours, shared by both editors.
 *
 * Every value is a CSS custom property rather than a colour, so one style
 * serves the light and dark ramps alike — the `--cm-*` tokens live in
 * tokens.css and the rules that spend the rest of them in codemirror.css.
 *
 * The first groups are what YAML and Markdown use; the last is markup, JavaScript and CSS,
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

  // The markdown inside a value. These sit on top of the token above — a bold
  // word in a block scalar keeps the block's colour — so only the two that are
  // chrome rather than content, the URL and a code span, set one of their own.
  { tag: t.link, textDecoration: 'underline', textUnderlineOffset: '3px' },
  { tag: t.url, color: 'var(--cm-comment)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, color: 'var(--cm-string)' },
  // A raw `<br>` or `<b>` in a value: markup the page will pass through, dimmed
  // so it reads as scaffolding beside the words it wraps.
  { tag: t.special(t.content), color: 'var(--cm-html)' },

  // A Markdown document's own structure: its headings, list markers and quotes.
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: 'var(--cm-key)', fontWeight: '700' },
  { tag: t.list, color: 'var(--cm-punct)' },
  { tag: t.quote, color: 'var(--cm-comment)' },

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
