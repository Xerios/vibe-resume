/**
 * The shared tokens, as the CSS the preview frame needs: the faces, the
 * palette, the spacing, the variants' measurements and a class per text role.
 *
 * sheet.css holds only the arrangement (flex, grid, where the rules go) and
 * spends the custom properties written here. Every size, weight and colour
 * comes from render/tokens.js, theme/palettes.js and theme/typefaces.js, the
 * same numbers the PDF is drawn with.
 */

import { DANGER, DECOR, LINK_COLOR, metrics, RAIL_SHARE, ROLES } from '../render/tokens.js'
import { palette } from '../theme/palettes.js'
import { FAMILIES, fontFaceCss, fontOf, LAST_RESORT } from '../theme/typefaces.js'

/** The faces, declared once when the frame is built. */
export const facesCss = fontFaceCss()

/** A palette key as the custom property holding it. @param {string} key */
const color = (key) => (key === 'danger' ? DANGER : `var(--c-${key})`)

/** Families as a CSS font stack. @param {string[]} keys @param {string} generic */
const stack = (keys, generic) => [...new Set(keys)].map((k) => `'${FAMILIES[k].css}'`).join(', ') + `, ${generic}`

/**
 * @param {{ theme?: string, density?: string, font?: string }} look
 */
export function sheetCss(look) {
  const colors = palette(look.theme)
  const { size, space, leading } = metrics(look.density)
  const font = fontOf(look.font)

  const vars = [
    // The text face, then the label face for a glyph it lacks, then the last
    // resort, which is the fallback order the PDF uses as well.
    `--f-text: ${stack([font.text, font.label, LAST_RESORT], 'sans-serif')};`,
    `--f-label: ${stack([font.label, font.text, LAST_RESORT], 'monospace')};`,
    ...Object.entries(colors).map(([k, v]) => `--c-${k}: ${v};`),
    ...Object.entries(space).map(([k, v]) => `--sp-${k}: ${v}pt;`),
    ...Object.entries(DECOR).map(([k, v]) => `--d-${k}: ${k === 'gutter' ? `${v * 100}%` : `${v}pt`};`),
    `--leading: ${leading};`,
    `--rail: ${RAIL_SHARE * 100}%;`,
    `--fs-body: ${size.lg}pt;`,
  ]

  const roles = Object.entries(ROLES).map(([id, r]) => {
    const rules = [
      `font-family: var(--f-${r.family});`,
      `font-weight: ${r.weight};`,
      `font-style: ${r.italic ? 'italic' : 'normal'};`,
      `font-size: ${size[r.size]}pt;`,
      `color: ${color(r.color)};`,
      r.upper ? 'text-transform: uppercase;' : '',
      r.tracking ? `letter-spacing: ${r.tracking}pt;` : '',
      r.leading ? `line-height: ${r.leading};` : '',
    ]
    return `.r-${id} { ${rules.filter(Boolean).join(' ')} }`
  })

  return `#cv-root {\n\t${vars.join('\n\t')}\n}\n${roles.join('\n')}\n#cv-root a { color: ${color(LINK_COLOR)}; }\n`
}
