/**
 * The chord that fires the underlined letter on a control.
 *
 * `accesskey` itself is the browser's business, not ours — a control carries
 * the letter and the browser decides what unlocks it: Chromium takes plain
 * Alt, Firefox insists on Alt+Shift, and a Mac uses Ctrl+Alt throughout. Only
 * the tooltip has to say which, so it is read once from the user agent rather
 * than tracked as state.
 */
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const ACCESS_CHORD = /Mac|iP(hone|ad|od)/.test(ua) ? 'Ctrl+Alt+' : /Firefox/.test(ua) ? 'Alt+Shift+' : 'Alt+'

/**
 * A control's tooltip with its access key spelled out after it.
 * @param {string} title
 * @param {string} key the letter in the element's own `accesskey`
 */
export const withKey = (title, key) => `${title} (${ACCESS_CHORD}${key.toUpperCase()})`
