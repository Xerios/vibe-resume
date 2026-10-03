/**
 * Everything the chrome can ask the app to do, by name.
 *
 * A button, a menu item and a shortcut that do the same thing call the same
 * entry here rather than each being handed a callback down through the tree.
 * The commands work over the singletons in state.svelte.ts; what only the page
 * can supply — the parsed CV, and the preview frame to measure for the PDF and
 * to print — is bound with `bindHost`.
 *
 * Nothing in here uses `this`, so an entry can be passed around bare:
 * `onclick={commands.newFile}`. The ones that take an argument want an arrow
 * around them, or the click event lands in it.
 */

import { pushState } from '$app/navigation'
import { page } from '$app/state'
import type { DisplayList } from '../pdf/measure'
import { toStrictYaml } from '../format/strict-yaml'
import { DENSITIES, LAYOUTS } from '../render/tokens'
import { SLOTS } from '../render/variants'
import { THEMES } from '../theme/palettes'
import { ORIENTATIONS, PAPER_SIZES, RUNNING } from '../theme/paper'
import { FONTS } from '../theme/typefaces'
import { storedText } from './doc.svelte'
import { doc, files, look, restyle, restylePaper, restyleVariant, ui } from './state.svelte'
import { KEYS, write } from './storage'

interface Host {
  /** print the preview frame; false if it isn't up yet */
  print: () => boolean
  /** the parsed CV the preview is showing, as a plain object */
  printed: () => any
  /** the preview, laid out and paginated, for the PDF */
  measure: () => Promise<DisplayList | null>
}

let host: Host = { print: () => false, printed: () => null, measure: async () => null }

/** Lend the page's parsed CV and frame to the export commands. */
export function bindHost(h: Host): void {
  host = h
}

/** Every paper axis, by the key it is stored under — for the history's label. */
const PAPER_AXES: Record<string, { id: string; name: string }[]> = {
  size: PAPER_SIZES,
  orientation: ORIENTATIONS,
  header: RUNNING,
  footer: RUNNING,
}

export const commands = {
  /* ── Files ─────────────────────────────────────────────────────────────── */

  /** Open a fresh tab holding the shipped template — no snapshot yet, so `CvDoc` seeds one. */
  newFile(): void {
    const id = files.create()
    doc.switchTo(id)
    ui.toast('New CV from template')
  },

  /**
   * Open YAML that came from outside the editor — an OS file association today — as
   * its own tab. Seeded through `switchTo` so the tab's history starts with the
   * imported text rather than the template plus an overwrite.
   */
  openImported(filename: string, text: string): void {
    const id = files.create(filename.replace(/\.(ya?ml)$/i, ''))
    doc.switchTo(id, text)
    ui.toast(`Opened ${files.active?.name ?? filename}`)
  },

  selectTab(id: string): void {
    if (id === files.activeId) return
    files.switchTo(id)
    doc.switchTo(id)
  },

  /** Defaults to the active file */
  duplicateTab(source: string = (files.activeId as string)): void {
    if (source === files.activeId) doc.flush() // capture the latest edits before copying the stored snapshot
    const from = files.files.find((f) => f.id === source)?.name
    const id = files.duplicate(source)
    doc.switchTo(id)
    if (from) doc.checkpoint(`Duplicated from "${from}"`)
    ui.toast('Tab duplicated')
  },

  closeTab(id: string): void {
    const closingActive = id === files.activeId
    const name = files.files.find((f) => f.id === id)?.name ?? 'File'
    // An untouched "New CV" has nothing to restore, so it doesn't earn a
    // place in the trash: drop it outright rather than clutter the bin.
    if (closingActive && doc.pristine) {
      doc.switchTo(files.trash(id)) // switching away flushes the old snapshot, so purge after
      files.purge(id)
      ui.toast(`Closed "${name}"`)
      return
    }
    const nextId = files.trash(id)
    if (closingActive) doc.switchTo(nextId)
    ui.toast(`Moved "${name}" to trash`)
  },

  renameTab(id: string, name: string): void {
    files.rename(id, name)
  },

  restoreTab(id: string): void {
    files.restore(id)
    doc.switchTo(id)
    ui.toast('Restored from trash')
  },

  purgeTab(id: string): void {
    if (!confirm('Delete this file forever? This cannot be undone.')) return
    files.purge(id)
    ui.toast('File deleted forever')
  },

  emptyTrash(): void {
    if (!files.trashed.length) return
    if (!confirm(`Permanently delete ${files.trashed.length} file(s) from trash? This cannot be undone.`)) return
    for (const f of files.trashed) files.purge(f.id)
    ui.toast('Trash emptied')
  },

  copyYaml(): void {
    navigator.clipboard
      .writeText(doc.yaml)
      .then(() => ui.toast('YAML copied to clipboard'))
      .catch(() => ui.toast('Copy failed — try Ctrl+A, Ctrl+C'))
  },

  /**
   * Downloads a file's YAML source as a `.yaml` file — the active one unless told otherwise.
   * The editor's relaxed dialect is rewritten as standard YAML on the way out.
   */
  saveYaml(id?: string): void {
    const fileId = id ?? files.activeId ?? undefined
    const isActive = fileId === files.activeId
    const text = isActive ? doc.yaml : fileId ? storedText(fileId) : null
    if (text == null) {
      ui.toast('Nothing to save')
      return
    }
    const blob = new Blob([toStrictYaml(text)], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(isActive ? files.active : files.files.find((f) => f.id === fileId))?.name ?? 'cv'}.yaml`
    a.click()
    URL.revokeObjectURL(url)
    ui.toast('YAML saved')
  },

  /**
   * Write the CV as a tagged PDF and save it: the preview as it is laid out
   * and paginated, measured and drawn with its structure, metadata and source
   * attached — see pdf/measure.ts and pdf/PdfRenderer.ts. The renderer, pdfkit
   * and the font files are loaded on the first export rather than with the app.
   */
  async exportPDF(): Promise<void> {
    if (ui.parseError) {
      ui.toast('Fix YAML errors before exporting')
      return
    }
    const cv = host.printed()
    const list = cv ? await host.measure() : null
    if (!cv || !list) {
      ui.toast("Preview isn't ready yet")
      return
    }
    // Tagged first, so the mark in the history sits on exactly the version
    // that is exported.
    doc.markExport()
    ui.toast('Generating PDF…')
    try {
      const { exportPdf } = await import('../pdf/export')
      const saved = await exportPdf({ list, cv, yaml: doc.yaml, look: { font: look.font, paper: look.paper }, fileName: files.active?.name ?? 'cv' })
      if (saved) ui.toast('PDF saved')
    } catch (e) {
      ui.toast(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  },

  /**
   * The browser's own print of the preview — the fallback beside the export,
   * for a printer or a print-to-PDF the generated file doesn't suit. The frame
   * prints itself: printing the app instead would put the iframe on the page as
   * a box and crop the CV to it.
   */
  printPDF(): void {
    if (ui.parseError) {
      ui.toast('Fix YAML errors before printing')
      return
    }
    if (!host.print()) ui.toast("Preview isn't ready yet")
  },

  /* ── History ───────────────────────────────────────────────────────────── */

  /**
   * Save a named version — or an unnamed one, which is what Ctrl+S does.
   */
  checkpoint(label: string = ''): void {
    if (doc.isViewingHistory) {
      ui.toast('Editing is paused while viewing history')
      return
    }
    const name = label.trim()
    doc.checkpoint(name)
    ui.toast(name ? `Saved "${name}"` : 'Version saved')
  },

  /**
   * Open the compare dialog. With nothing named, the newest text is put beside
   * the most likely thing to hold it against: the tab next to this one, or —
   * with only one tab — the version before this one.
   *
   * Opening pushes a history entry carrying the two sides, so Back is a way
   * out, and closing from inside the dialog is the same Back — see `closeCompare`.
   */
  openCompare(left?: any, right?: any): void {
    const id = files.activeId
    if (!id) return
    const current: any = { fileId: id, versionKey: null }
    if (!right) {
      const neighbour = files.open.find((f) => f.id !== id)
      const previous = doc.entries.slice(1).find((e) => e.kind !== 'style')
      right = neighbour ? { fileId: neighbour.id, versionKey: null } : { fileId: id, versionKey: previous?.key ?? null }
    }
    pushState('', { compare: { left: left ?? current, right } })
  },

  /**
   * Close the dialog by going back over the entry that opened it, so the
   * history reads the same whether it was the X or the browser that closed it.
   */
  closeCompare(): void {
    if (page.state.compare) history.back()
  },

  /**
   * A version against what is on screen: the version being previewed, if
   * there is one and it isn't this same entry, otherwise what the file says now.
   */
  compareVersion(entry: any): void {
    const id = (files.activeId as string)
    const viewed = doc.viewingKey !== null && doc.viewingKey !== entry.key ? doc.viewingKey : null
    commands.openCompare({ fileId: id, versionKey: entry.key }, { fileId: id, versionKey: viewed })
  },

  /* ── Style ─────────────────────────────────────────────────────────────── */

  setLayout(id: string): void {
    restyle({ layout: id }, `Layout — ${LAYOUTS.find((l) => l.id === id)?.name ?? id}`)
  },

  setTheme(id: string): void {
    restyle({ theme: id }, `Theme — ${THEMES.find((t) => t.id === id)?.name ?? id}`)
  },

  setVariant(slotId: string, variantId: string): void {
    const slot = SLOTS.find((s) => s.id === slotId)
    const name = slot?.variants.find((v) => v.id === variantId)?.name ?? variantId
    restyleVariant(slotId, variantId, `${slot?.name ?? slotId} — ${name}`)
  },

  /** Every block back to its default. */
  resetVariants(): void {
    restyle({ variants: {} }, 'Blocks — reset')
  },

  setFont(id: string): void {
    restyle({ font: id }, `Font — ${FONTS.find((f) => f.id === id)?.name ?? id}`)
  },

  setDensity(id: string): void {
    restyle({ density: id }, `Density — ${DENSITIES.find((d) => d.id === id)?.name ?? id}`)
  },

  /**
   * Change one thing about the page. Which thing is what the label says, since
   * `Paper — A4` and `Paper — Footer: Page` are the same axis to a reader and
   * different ones to the history.
   */
  setPaper(patch: any): void {
    const [key, id] = Object.entries(patch)[0] ?? []
    if (!key || !id) return
    const name = PAPER_AXES[key as string]?.find((o) => o.id === id)?.name ?? id
    const edge = key === 'header' || key === 'footer' ? `${(key as string)[0].toUpperCase()}${(key as string).slice(1)}: ` : ''
    restylePaper(patch, `Paper — ${edge}${name}`)
  },

  /* ── View ──────────────────────────────────────────────────────────────── */

  toggleSidePanel(which: 'style' | 'history'): void {
    ui.sidePanel = ui.sidePanel === which ? null : which
    write(KEYS.sidePanel, ui.sidePanel ?? 'none')
  },

  toggleTrash(): void {
    ui.trashOpen = !ui.trashOpen
  },

  closeTrash(): void {
    ui.trashOpen = false
  },

  setSourceHidden(hidden: boolean): void {
    ui.sourceHidden = hidden
    write(KEYS.sourceHidden, String(hidden))
  },

  toggleSource(): void {
    commands.setSourceHidden(!ui.sourceHidden)
  },

  /** Draw the preview as the PDF's pages, or as one strip. Not a restyle — see `ui.pagedPreview`. */
  togglePaged(): void {
    ui.pagedPreview = !ui.pagedPreview
    write(KEYS.pagedPreview, String(ui.pagedPreview))
  },

  /** Scale the preview to the pane, or stop. Not a restyle — see `ui.fitPreview`. */
  toggleFit(): void {
    ui.fitPreview = !ui.fitPreview
    write(KEYS.previewFit, String(ui.fitPreview))
  },

  /** Couple the editor to the pointer over the preview, or stop. See `ui.hoverSync`. */
  toggleHoverSync(): void {
    ui.hoverSync = !ui.hoverSync
    write(KEYS.hoverSync, String(ui.hoverSync))
  },

  /** Couple the two panes' scrolling, or let each keep its own place. See `ui.scrollSync`. */
  toggleScrollSync(): void {
    ui.scrollSync = !ui.scrollSync
    write(KEYS.scrollSync, String(ui.scrollSync))
  },

  toggleTheme(): void {
    // The sheet sits this out — paper is white — but the frame around it follows.
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    ui.dark = next === 'dark'
    syncThemeColor()
    write(KEYS.theme, next)
  },

  showWelcome(): void {
    ui.welcomeOpen = true
  },

  dismissWelcome(): void {
    ui.welcomeOpen = false
    write(KEYS.welcomeSeen, 'true')
  },

  async installApp(): Promise<void> {
    const prompt = ui.installPrompt
    if (!prompt) return
    ui.installPrompt = null // single use, accepted or dismissed
    await prompt.prompt()
  },
}

/**
 * Keep an installed window's titlebar on the colour of the toolbar beneath it.
 * Read from the token rather than repeated as a literal — app.html has to spell
 * the two values out only because it runs before the stylesheet lands.
 */
function syncThemeColor(): void {
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim()
  if (!bar) return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar)
}
