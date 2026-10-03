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
 * A control's mnemonic and its tooltip, from one letter: sets `accesskey` and
 * writes the chord into `title` so the two can never disagree.
 */
export function shortcut(node: HTMLElement, params: [string, string]): { update: (params: [string, string]) => void } {
  const apply = ([key, title]: [string, string]) => {
    node.accessKey = key
    node.title = `${title} (${ACCESS_CHORD}${key.toUpperCase()})`
  }
  apply(params)
  return { update: apply }
}
