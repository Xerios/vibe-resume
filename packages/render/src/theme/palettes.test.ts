import { describe, expect, it } from 'vitest'
import { THEMES } from './palettes'

const channel = (hex: string, at: number): number => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('palettes', () => {
  // Every colour that sets text is read at WCAG AAA (7:1), on the sheet and on its wash.
  for (const t of THEMES) {
    for (const role of ['ink', 'deep', 'accent', 'muted', 'faint'] as const) {
      it(`${t.id}: ${role} reads at AAA`, () => {
        expect(contrast(t.colors[role], t.colors.paper)).toBeGreaterThanOrEqual(7)
        expect(contrast(t.colors[role], t.colors.wash)).toBeGreaterThanOrEqual(7)
      })
    }
  }
})
