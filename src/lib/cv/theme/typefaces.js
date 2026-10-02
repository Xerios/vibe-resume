/**
 * The type a CV is set in: six choices, each a pairing of bundled faces (all
 * SIL OFL), one for text and one for labels, dates and contact lines.
 *
 * Bundled rather than OS font stacks. The PDF has to embed every face it uses,
 * and a browser can't hand a system font's bytes to pdfkit. Shipping the files
 * means the preview loads the same faces through `@font-face` that the PDF
 * embeds, so the two are set alike. Vite hashes the `?url` imports into the
 * build. The browser downloads only the faces a sheet actually uses, and the
 * export fetches only the families its font choice names.
 */

import inter400 from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url'
import inter400i from '@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url'
import inter600 from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url'
import inter700 from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url'
import inter700i from '@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf?url'
import inter800 from '@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf?url'
import archivo400 from '@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf?url'
import archivo400i from '@expo-google-fonts/archivo/400Regular_Italic/Archivo_400Regular_Italic.ttf?url'
import archivo600 from '@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf?url'
import archivo700 from '@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf?url'
import archivo700i from '@expo-google-fonts/archivo/700Bold_Italic/Archivo_700Bold_Italic.ttf?url'
import archivo800 from '@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf?url'
import sourceSans400 from '@expo-google-fonts/source-sans-3/400Regular/SourceSans3_400Regular.ttf?url'
import sourceSans400i from '@expo-google-fonts/source-sans-3/400Regular_Italic/SourceSans3_400Regular_Italic.ttf?url'
import sourceSans600 from '@expo-google-fonts/source-sans-3/600SemiBold/SourceSans3_600SemiBold.ttf?url'
import sourceSans700 from '@expo-google-fonts/source-sans-3/700Bold/SourceSans3_700Bold.ttf?url'
import sourceSans700i from '@expo-google-fonts/source-sans-3/700Bold_Italic/SourceSans3_700Bold_Italic.ttf?url'
import sourceSans800 from '@expo-google-fonts/source-sans-3/800ExtraBold/SourceSans3_800ExtraBold.ttf?url'
import sourceSerif400 from '@expo-google-fonts/source-serif-4/400Regular/SourceSerif4_400Regular.ttf?url'
import sourceSerif400i from '@expo-google-fonts/source-serif-4/400Regular_Italic/SourceSerif4_400Regular_Italic.ttf?url'
import sourceSerif600 from '@expo-google-fonts/source-serif-4/600SemiBold/SourceSerif4_600SemiBold.ttf?url'
import sourceSerif700 from '@expo-google-fonts/source-serif-4/700Bold/SourceSerif4_700Bold.ttf?url'
import sourceSerif700i from '@expo-google-fonts/source-serif-4/700Bold_Italic/SourceSerif4_700Bold_Italic.ttf?url'
import sourceSerif800 from '@expo-google-fonts/source-serif-4/800ExtraBold/SourceSerif4_800ExtraBold.ttf?url'
import garamond400 from '@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf?url'
import garamond400i from '@expo-google-fonts/eb-garamond/400Regular_Italic/EBGaramond_400Regular_Italic.ttf?url'
import garamond600 from '@expo-google-fonts/eb-garamond/600SemiBold/EBGaramond_600SemiBold.ttf?url'
import garamond700 from '@expo-google-fonts/eb-garamond/700Bold/EBGaramond_700Bold.ttf?url'
import garamond700i from '@expo-google-fonts/eb-garamond/700Bold_Italic/EBGaramond_700Bold_Italic.ttf?url'
import garamond800 from '@expo-google-fonts/eb-garamond/800ExtraBold/EBGaramond_800ExtraBold.ttf?url'
import jbmono400 from '@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf?url'
import jbmono400i from '@expo-google-fonts/jetbrains-mono/400Regular_Italic/JetBrainsMono_400Regular_Italic.ttf?url'
import jbmono600 from '@expo-google-fonts/jetbrains-mono/600SemiBold/JetBrainsMono_600SemiBold.ttf?url'
import jbmono700 from '@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf?url'
import jbmono700i from '@expo-google-fonts/jetbrains-mono/700Bold_Italic/JetBrainsMono_700Bold_Italic.ttf?url'
import jbmono800 from '@expo-google-fonts/jetbrains-mono/800ExtraBold/JetBrainsMono_800ExtraBold.ttf?url'

/**
 * @typedef {object} Family
 * @property {string} name  as shown to a person
 * @property {string} css   the CSS family name the preview declares its faces under
 */

/** @type {Record<string, Family>} */
export const FAMILIES = {
  inter: { name: 'Inter', css: 'CV Inter' },
  archivo: { name: 'Archivo', css: 'CV Archivo' },
  sourceSans: { name: 'Source Sans 3', css: 'CV Source Sans 3' },
  sourceSerif: { name: 'Source Serif 4', css: 'CV Source Serif 4' },
  garamond: { name: 'EB Garamond', css: 'CV EB Garamond' },
  jbmono: { name: 'JetBrains Mono', css: 'CV JetBrains Mono' },
}

/** Where a character none of a choice's faces has a glyph for is set: Inter has the widest coverage of the six. */
export const LAST_RESORT = 'inter'

/**
 * @typedef {object} Face
 * @property {string} id
 * @property {string} family  a FAMILIES key
 * @property {number} weight
 * @property {boolean} italic
 * @property {string} url
 */

/** @type {Face[]} */
export const FACES = [
  { id: 'inter-400', family: 'inter', weight: 400, italic: false, url: inter400 },
  { id: 'inter-400i', family: 'inter', weight: 400, italic: true, url: inter400i },
  { id: 'inter-600', family: 'inter', weight: 600, italic: false, url: inter600 },
  { id: 'inter-700', family: 'inter', weight: 700, italic: false, url: inter700 },
  { id: 'inter-700i', family: 'inter', weight: 700, italic: true, url: inter700i },
  { id: 'inter-800', family: 'inter', weight: 800, italic: false, url: inter800 },
  { id: 'archivo-400', family: 'archivo', weight: 400, italic: false, url: archivo400 },
  { id: 'archivo-400i', family: 'archivo', weight: 400, italic: true, url: archivo400i },
  { id: 'archivo-600', family: 'archivo', weight: 600, italic: false, url: archivo600 },
  { id: 'archivo-700', family: 'archivo', weight: 700, italic: false, url: archivo700 },
  { id: 'archivo-700i', family: 'archivo', weight: 700, italic: true, url: archivo700i },
  { id: 'archivo-800', family: 'archivo', weight: 800, italic: false, url: archivo800 },
  { id: 'sourceSans-400', family: 'sourceSans', weight: 400, italic: false, url: sourceSans400 },
  { id: 'sourceSans-400i', family: 'sourceSans', weight: 400, italic: true, url: sourceSans400i },
  { id: 'sourceSans-600', family: 'sourceSans', weight: 600, italic: false, url: sourceSans600 },
  { id: 'sourceSans-700', family: 'sourceSans', weight: 700, italic: false, url: sourceSans700 },
  { id: 'sourceSans-700i', family: 'sourceSans', weight: 700, italic: true, url: sourceSans700i },
  { id: 'sourceSans-800', family: 'sourceSans', weight: 800, italic: false, url: sourceSans800 },
  { id: 'sourceSerif-400', family: 'sourceSerif', weight: 400, italic: false, url: sourceSerif400 },
  { id: 'sourceSerif-400i', family: 'sourceSerif', weight: 400, italic: true, url: sourceSerif400i },
  { id: 'sourceSerif-600', family: 'sourceSerif', weight: 600, italic: false, url: sourceSerif600 },
  { id: 'sourceSerif-700', family: 'sourceSerif', weight: 700, italic: false, url: sourceSerif700 },
  { id: 'sourceSerif-700i', family: 'sourceSerif', weight: 700, italic: true, url: sourceSerif700i },
  { id: 'sourceSerif-800', family: 'sourceSerif', weight: 800, italic: false, url: sourceSerif800 },
  { id: 'garamond-400', family: 'garamond', weight: 400, italic: false, url: garamond400 },
  { id: 'garamond-400i', family: 'garamond', weight: 400, italic: true, url: garamond400i },
  { id: 'garamond-600', family: 'garamond', weight: 600, italic: false, url: garamond600 },
  { id: 'garamond-700', family: 'garamond', weight: 700, italic: false, url: garamond700 },
  { id: 'garamond-700i', family: 'garamond', weight: 700, italic: true, url: garamond700i },
  { id: 'garamond-800', family: 'garamond', weight: 800, italic: false, url: garamond800 },
  { id: 'jbmono-400', family: 'jbmono', weight: 400, italic: false, url: jbmono400 },
  { id: 'jbmono-400i', family: 'jbmono', weight: 400, italic: true, url: jbmono400i },
  { id: 'jbmono-600', family: 'jbmono', weight: 600, italic: false, url: jbmono600 },
  { id: 'jbmono-700', family: 'jbmono', weight: 700, italic: false, url: jbmono700 },
  { id: 'jbmono-700i', family: 'jbmono', weight: 700, italic: true, url: jbmono700i },
  { id: 'jbmono-800', family: 'jbmono', weight: 800, italic: false, url: jbmono800 },
]

/**
 * A font choice: the family text is set in, and the family the labels are.
 * The sans choices pair with a typewriter face for labels; the serifs stay in
 * their own family, so the sheet reads as one piece of typesetting.
 * @typedef {object} Font
 * @property {string} id
 * @property {string} name
 * @property {string} hint  one line, shown as the option's tooltip
 * @property {string} text   a FAMILIES key
 * @property {string} label  a FAMILIES key
 */

/** @type {Font[]} */
export const FONTS = [
  { id: 'sans', name: 'Sans', hint: 'Inter, with JetBrains Mono labels — the default', text: 'inter', label: 'jbmono' },
  { id: 'grotesk', name: 'Grotesk', hint: 'Archivo — neutral, tight', text: 'archivo', label: 'jbmono' },
  { id: 'humanist', name: 'Humanist', hint: 'Source Sans 3 — softer, open', text: 'sourceSans', label: 'jbmono' },
  { id: 'serif', name: 'Serif', hint: 'Source Serif 4 — traditional print', text: 'sourceSerif', label: 'sourceSerif' },
  { id: 'book', name: 'Book', hint: 'EB Garamond — old-style serif', text: 'garamond', label: 'garamond' },
  { id: 'mono', name: 'Mono', hint: 'JetBrains Mono throughout, labels included', text: 'jbmono', label: 'jbmono' },
]

export const DEFAULT_FONT = 'sans'

/**
 * Falls back rather than trusting what came out of storage — a file saved
 * before this feature has no font, and an id can outlive its pairing.
 * @param {string | undefined | null} id
 */
export function resolveFont(id) {
  return FONTS.some((f) => f.id === id) ? /** @type {string} */ (id) : DEFAULT_FONT
}

/** @param {string | undefined | null} id */
export const fontOf = (id) => FONTS.find((f) => f.id === resolveFont(id)) ?? FONTS[0]

/**
 * Every face a font choice can draw with: its two families, and the last
 * resort for a glyph neither has.
 * @param {string | undefined | null} id
 */
export function facesFor(id) {
  const font = fontOf(id)
  const families = new Set([font.text, font.label, LAST_RESORT])
  return FACES.filter((f) => families.has(f.family))
}

/**
 * The face a family, weight and slant come to, out of the ones bundled. This
 * matches the browser's own matching closely enough: the exact slant if there
 * is one, then the nearest weight at or above the one asked for, then the
 * nearest below it.
 * @param {string} family  a FAMILIES key
 * @param {number} weight
 * @param {boolean} [italic]
 * @returns {Face}
 */
export function faceFor(family, weight, italic = false) {
  const own = FACES.filter((f) => f.family === family)
  const slanted = own.filter((f) => f.italic === italic)
  const pool = slanted.length ? slanted : own
  const above = pool.filter((f) => f.weight >= weight).toSorted((a, b) => a.weight - b.weight)
  const below = pool.filter((f) => f.weight < weight).toSorted((a, b) => b.weight - a.weight)
  return above[0] ?? below[0] ?? FACES[0]
}

/**
 * The `@font-face` rules the preview declares every bundled face with. Only
 * these faces exist, so a weight in between is matched to one of them and never
 * synthesised, which is what the PDF does too. Declaring a face costs nothing
 * until a sheet uses it.
 */
export function fontFaceCss() {
  return FACES.map(
    (f) =>
      `@font-face { font-family: '${FAMILIES[f.family].css}'; font-weight: ${f.weight}; font-style: ${f.italic ? 'italic' : 'normal'}; font-display: block; src: url('${f.url}') format('truetype'); }`,
  ).join('\n')
}
