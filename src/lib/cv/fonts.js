/**
 * How a CV is *set*: a font id that lands on `#cv-root` as a data attribute,
 * exactly as a theme does, and that presets.css spends by re-pointing the
 * sheet's `--sans` and `--mono` at the stack fonts.css names.
 *
 * Nothing here is downloaded. A web font would mean either a CDN — which this
 * app doesn't have — or a few hundred kilobytes of precache per family, and a
 * CV that renders in whatever the reader's machine substituted is worse than
 * one set in a face that is certainly installed. So each of these is a stack
 * of faces that ship with an OS, ending in the generic the browser can always
 * satisfy: what you see is what prints.
 *
 * Like a theme, this is presentation rather than content, so it is stored per
 * file in the registry (files.svelte.js) and never reaches the YAML.
 */

/**
 * The stacks themselves live in fonts.css, so that StylePicker can set each
 * option in the face it offers by putting `data-cv-font` on the option — the
 * same trick the theme swatches use, and for the same reason: no second copy.
 * @typedef {object} Font
 * @property {string} id
 * @property {string} name
 * @property {string} hint  one line, shown as the option's tooltip
 */

/** @type {Font[]} */
export const FONTS = [
  { id: 'sans', name: 'Sans', hint: 'Inter and the system UI faces — the default' },
  { id: 'grotesk', name: 'Grotesk', hint: 'Helvetica and Arial — neutral, tight' },
  { id: 'humanist', name: 'Humanist', hint: 'Trebuchet and Tahoma — softer, wider' },
  { id: 'serif', name: 'Serif', hint: 'Georgia and Times — traditional print' },
  { id: 'book', name: 'Book', hint: 'Palatino and Garamond — old-style serif' },
  { id: 'mono', name: 'Mono', hint: 'Typewriter throughout, labels included' },
]

export const DEFAULT_FONT = 'sans'

/**
 * Falls back rather than trusting what came out of storage — a file saved
 * before this feature has no font, and an id can outlive its stack.
 * @param {string | undefined | null} id
 */
export function resolveFont(id) {
  return FONTS.some((f) => f.id === id) ? /** @type {string} */ (id) : DEFAULT_FONT
}
