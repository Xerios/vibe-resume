/**
 * localStorage plumbing. The Loro snapshot is binary, so it is base64-encoded
 * before it goes in; everything else is a plain string.
 */

export const KEYS = {
  /** Pre-multi-file snapshot key; read once at startup to migrate into the file registry. */
  legacySnapshot: 'cv-editor:snapshot:v1',
  files: 'cv-editor:files:v1',
  activeFile: 'cv-editor:active-file',
  theme: 'cv-theme',
  editorWidth: 'cv-editor:width',
  /** Which panel has the split's third column: `style`, `history` or `none`. */
  sidePanel: 'cv-editor:side-panel',
  sourceHidden: 'cv-editor:source-hidden',
  /** Which groups of the style panel are folded open — group id → boolean. */
  styleGroups: 'cv-editor:style-groups',
  /** Whether the preview scales a whole page into the pane — a view, not a file. */
  previewFit: 'cv-editor:preview-fit',
  /** Whether the preview is drawn as separate pages, as the PDF will have them. */
  pagedPreview: 'cv-editor:paged-preview',
  /** Whether the pointer resting on the sheet pulls the editor to its line. */
  hoverSync: 'cv-editor:hover-sync',
  /** Whether scrolling either pane scrolls the other to the same place. */
  scrollSync: 'cv-editor:scroll-sync',
  /** How the Compare dialog was left set up — which ribbons, folding, line numbers. */
  compare: 'cv-editor:compare',
  /** Set once the welcome overlay has been dismissed; absent means first visit. */
  welcomeSeen: 'cv-editor:welcome-seen',
} as const

export function snapshotKey(fileId: string): string {
  return `cv-editor:snapshot:v1:${fileId}`
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000 // stay under the argument limit of String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function read(key: string, fallback: string | null = null): string | null {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback // private mode / storage disabled
  }
}

/**
 * Returns false when the write was rejected (quota, disabled storage).
 */
export function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function relativeTime(epochMs: number | null, nowMs: number = Date.now()): string {
  if (!epochMs) return 'unknown time'
  const secs = Math.max(0, Math.round((nowMs - epochMs) / 1000))
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < 86_400) return `${Math.floor(secs / 3600)} h ago`
  if (secs < 86_400 * 30) return `${Math.floor(secs / 86_400)} d ago`
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
