/**
 * localStorage plumbing. The Loro snapshot is binary, so it is base64-encoded
 * before it goes in; everything else is a plain string.
 */

export const KEYS = {
  /** Pre-multi-file snapshot key; read once at startup to migrate into the file registry. */
  legacySnapshot: 'cv-editor:snapshot:v1',
  files: 'cv-editor:files:v1',
  /** Whole-template edits from before the layout/variant split; read-only now — see parts.svelte.js. */
  templates: 'cv-editor:templates:v1',
  /** Part edits: overrides of the shipped layouts and block variants, and variants of the user's own. */
  parts: 'cv-editor:parts:v1',
  activeFile: 'cv-editor:active-file',
  theme: 'cv-theme',
  editorWidth: 'cv-editor:width',
  /** Which panel has the split's third column: `style`, `history` or `none`. */
  sidePanel: 'cv-editor:side-panel',
  sourceHidden: 'cv-editor:source-hidden',
  /** Whether the preview scales a whole page into the pane — a view, not a file. */
  previewFit: 'cv-editor:preview-fit',
  /** Whether the pointer resting on the sheet pulls the editor to its line. */
  hoverSync: 'cv-editor:hover-sync',
  /** Whether scrolling either pane scrolls the other to the same place. */
  scrollSync: 'cv-editor:scroll-sync',
  /** Set once the welcome overlay has been dismissed; absent means first visit. */
  welcomeSeen: 'cv-editor:welcome-seen',
}

/** @param {string} fileId */
export function snapshotKey(fileId) {
  return `cv-editor:snapshot:v1:${fileId}`
}

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let binary = ''
  const CHUNK = 0x8000 // stay under the argument limit of String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** @param {string} b64 */
export function base64ToBytes(b64) {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * @param {string} key
 * @param {string | null} [fallback]
 */
export function read(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback // private mode / storage disabled
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} false when the write was rejected (quota, disabled storage)
 */
export function write(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** @param {string} key */
export function remove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * @param {number | null} epochMs
 * @param {number} [nowMs]
 */
export function relativeTime(epochMs, nowMs = Date.now()) {
  if (!epochMs) return 'unknown time'
  const secs = Math.max(0, Math.round((nowMs - epochMs) / 1000))
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`
  if (secs < 86_400 * 30) return `${Math.floor(secs / 86_400)} d ago`
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
