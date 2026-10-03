import { LoroExtensions } from 'loro-codemirror'
import { LoroDoc, UndoManager } from 'loro-crdt/web'
import type { OpId, Change, Diff, ContainerID, TextDiff } from 'loro-crdt/web'
// `loro-crdt/web` re-exports everything but the default init function, so pull it
// straight from the wasm-bindgen module — it is the same instance either way.
import initWasm from 'loro-crdt/web/loro_wasm.js'
import type { SourceFormat } from '@vibe-resume/core/format'
import { yaml } from '@vibe-resume/format-yaml'
import { base64ToBytes, bytesToBase64, read, remove, snapshotKey, write } from './storage'

// Named for the only format there was when snapshots started being stored;
// it holds the text whatever its format, and renaming it would orphan them.
const TEXT_ID = 'yaml'
const TAGS_ID = 'checkpoints'
/**
 * The file's presentation — layout, theme, font, density, block variants, paper.
 * It used to live only in the file registry, on the grounds that restyling is
 * not an edit; it is here as well now, because "not an edit" was the wrong
 * reading. Changing how a CV looks is a change to the CV, and the things a
 * change gets — a line in the history, a place on the undo stack, and coming
 * back with the version that had it — are the things a restyle wanted.
 *
 * The map holds only what has been changed since this document was adopted;
 * everything else falls through to `#baseStyle`, the registry's copy as it
 * stood then. That is what makes undoing the first change of a session land on
 * what was there before it rather than on nothing.
 */
const STYLE_ID = 'style'

const STYLE_KEYS = ['layout', 'theme', 'density', 'font', 'variants', 'paper'] as const

/** Commits made by naming a version, kept out of the undo stack. */
const TAG_ORIGIN = 'cv-tag'

/**
 * What a change was: an ordinary edit, a named save, a PDF export, a restore, or
 * the template the file started from. A commit message is the only per-change
 * metadata Loro carries, so the kind rides along inside it, separated by a
 * control character no one can type into the "name this version" box.
 */
const KINDS = ['edit', 'checkpoint', 'export', 'restore', 'initial', 'style'] as const

export type ChangeKind = (typeof KINDS)[number]

const KIND_SEP = '\u0001'

/**
 * Diffing every change costs a pass over the oplog each, so counts are worked
 * out for the newest changes only. Older entries simply show no count.
 */
const STATS_LIMIT = 200

/**
 * Consecutive *unnamed* commits from the same peer inside this window (seconds)
 * are folded into a single change. loro-codemirror commits on every editor
 * transaction, so without this a burst of typing would be one history entry per
 * keystroke. Loro never merges anything into a change that carries a message, so
 * named versions always stand on their own.
 */
const MERGE_WINDOW_SECONDS = 45

/** Debounce for the work that follows an edit: history rebuild and persistence. */
const SETTLE_MS = 400

let wasmReady: Promise<unknown> | null = null

const cvText = (doc: LoroDoc) => doc.getText(TEXT_ID)

/**
 * Where the style map's other half lives — see `bindStyle`.
 */
interface StyleHost {
  /** the registry's copy for the file being adopted */
  base: () => Record<string, any>
  /** take a change made in the document */
  apply: (style: Record<string, any>) => void
}

/**
 * Stable id, `${peer}@${counter}`
 */
export interface HistoryEntry {
  key: string
  peer: string
  /** counter of the change's *last* op — its frontier */
  counter: number
  lamport: number
  /** unix seconds, 0 when not recorded */
  timestamp: number
  message: string
  /** what the change was — see `KINDS` */
  kind: ChangeKind
  /** for a restyle, which part of the presentation it moved; '' for anything else */
  axis: string
  /** number of ops in the change */
  length: number
  /** characters added and removed, null past `STATS_LIMIT` */
  stats: ChangeStats | null
  /** causal parents — the version just before this change */
  deps: OpId[]
}

/**
 * How much text a change touched, in characters.
 */
interface ChangeStats {
  added: number
  removed: number
}

/**
 * What a change added or removed, in terms of the text as displayed while
 * previewing it (see `CvDoc#diff`).
 */
export interface VersionDiff {
  /** ranges, in the viewed text, that this change inserted */
  added: Array<{ from: number; to: number }>
  /** text this change deleted, positioned where it used to sit */
  removed: Array<{ at: number; text: string }>
}

/**
 * The CV document: a Loro CRDT holding one text container, mirrored into
 * localStorage and merged across browser tabs.
 *
 * The editor is bound to it by loro-codemirror, which owns both directions of
 * text sync and the undo stack. Everything here is about the *document* —
 * versions, persistence, and time travel — never about keystrokes.
 */
export class CvDoc {
  /** The format of the file being edited — see `bindFormat`. */
  #formatOf = $state<() => SourceFormat>(() => yaml)
  ready = $state(false)
  /** Current text of the document (either the live head, or a checked-out version). */
  text = $state('')
  /**
   * How this version of the file is presented, as the style map has it over
   * the registry's copy. Read rather than written by the app: a restyle goes
   * through `recordStyle`, and what comes back out of here is what an undo, a
   * restore, a version being viewed or another tab has made of it.
   */
  style = $state<Record<string, any>>({})
  /** Oldest first. */
  history = $state<HistoryEntry[]>([])
  /**
   * True while the file is still exactly what "New CV" made: its format's
   * template and nothing in its history but the initial version. Such a file
   * has nothing worth keeping, so closing it skips the trash.
   */
  pristine = $derived(this.history.length <= 1 && this.text === this.#formatOf().template)
  /** Key of the entry being previewed, or null when we're on the latest version. */
  viewingKey = $state<string | null>(null)
  /** What the previewed entry changed, for highlighting in the editor. */
  diff = $state<VersionDiff | null>(null)
  savedAt = $state<Date | null>(null)
  saveError = $state<string | null>(null)
  snapshotBytes = $state(0)
  /** Bumped whenever the underlying document is swapped, to re-key the editor. */
  docId = $state(0)
  /** CodeMirror extensions for the current document. */
  extensions = $state<any>(null)

  /** Newest first — the order the history panel shows. */
  entries = $derived(this.history.slice().toReversed())
  isViewingHistory = $derived(this.viewingKey !== null)
  viewingEntry = $derived(this.history.find((e) => e.key === this.viewingKey))

  #doc: LoroDoc | null = null
  #undo: UndoManager | null = null
  #subscriptions: Array<() => void> = []
  #settleTimer: ReturnType<typeof setTimeout> | null = null
  /** Message to stamp on the next commit the editor binding makes. */
  #pendingMessage: string | null = null
  #applyText: (text: string) => void = () => {}
  /**
   * Identifies which document lineage the stored snapshot belongs to. Snapshots
   * from the same lineage are merged; a different one means another tab cleared
   * the history, and merging would splice two unrelated documents together.
   */
  #epoch = newEpoch()
  /** Which file's storage key this instance is currently reading and writing. */
  #fileId = ''
  /** Change counts, keyed by entry key. */
  #statsCache = new Map<string, ChangeStats>()
  /** Keys of changes that, all told, changed nothing — see `#statsFor`. */
  #noops = new Set<string>()
  /**
   * One copy of the document, moved from version to version while the history
   * is rebuilt, so reading the text at each entry is a checkout rather than a
   * fork each. Only while `#probing`: a copy outlives no edit, since it has none
   * of what came after it.
   */
  #probe: LoroDoc | null = null
  #probing = false
  /** The presentation the file had when this document was adopted; the map layers over it. */
  #baseStyle: Record<string, any> = {}
  /** Where that copy comes from, and where a change made in here is mirrored back to. */
  #styleHost: StyleHost | null = null

  async init(fileId: string): Promise<void> {
    wasmReady ??= initWasm()
    await wasmReady
    this.#fileId = fileId
    this.#adopt(this.#load())
    this.ready = true
  }

  /**
   * Save the current file and load a different one. The editor is re-keyed
   * (via `docId`) since this swaps in a whole new LoroDoc instance.
   *
   * `seedText` is for a file arriving with content of its own — an imported
   * file, say. It only applies to a file with no snapshot yet, and seeding
   * with it beats pushing the text in afterwards: the history then starts with
   * one "Initial version" holding the real text, not the template plus an
   * immediate overwrite.
   */
  switchTo(fileId: string, seedText?: string): void {
    if (!this.#doc || fileId === this.#fileId) return
    this.flush()
    this.#unsubscribeAll()
    this.#fileId = fileId
    this.#adopt(this.#load(seedText))
  }

  /**
   * Let the document push text into the editor. Restore goes through here so
   * that it lands as an ordinary editor transaction, which is what the Loro
   * binding knows how to record.
   */
  bindEditor(applyText: (text: string) => void): void {
    this.#applyText = applyText
  }

  /**
   * Tie the style map to the file registry. `base` is the presentation the
   * registry holds for the file about to be adopted — what the map's own keys
   * layer over — and `apply` is how a change that came *out* of the document
   * reaches the registry the app renders from: an undo, a restore, a version
   * being viewed, or another tab.
   *
   * Two stores for one fact, and deliberately so. The registry knows the style
   * of every file including the ones that aren't open; the document knows the
   * style of this one at every point in its history. Neither can do the other's
   * job, so the document is authoritative while a file is open and writes
   * through to the registry, which persists it and hands it back at load.
   */
  /**
   * Tell the document which format the active file is in, which it needs for
   * the template a new file starts from. Read when a file is loaded, so the
   * registry has to have made the file active first.
   */
  bindFormat(formatOf: () => SourceFormat): void {
    this.#formatOf = formatOf
  }

  bindStyle(host: StyleHost): void {
    this.#styleHost = host
  }

  destroy(): void {
    if (this.#settleTimer) clearTimeout(this.#settleTimer)
    this.#unsubscribeAll()
    window.removeEventListener('storage', this.#onStorage)
  }

  /** Persist right now, skipping the debounce. Used when the tab is going away. */
  flush(): void {
    if (this.#settleTimer) {
      clearTimeout(this.#settleTimer)
      this.#settleTimer = null
    }
    this.#save()
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  /** Mark the current state as a named version. */
  checkpoint(name: string): void {
    this.#tag('checkpoint', name.trim() || 'Checkpoint')
  }

  /**
   * Mark the current state as the one that went out as a PDF. Called when the
   * print dialog opens — the browser never reports whether the user went through
   * with it, so this records the attempt, which is the point in the history worth
   * finding again either way.
   *
   * Exporting the same text twice adds nothing to the history, so the mark is
   * skipped when the last export already carried this exact text — whether the
   * user pressed the button twice or edited and came back to where they were.
   */
  markExport(): void {
    if (!this.#doc || this.isViewingHistory) return
    // An export can land inside the settle debounce, before the last keystrokes
    // have been committed and picked up — so do both now, or the comparison
    // below would run against a stale head.
    this.#doc.commit()
    this.#refreshHistory()
    const previous = this.#lastExport()
    if (previous && previous === this.#text()) return
    this.#tag('export', 'Exported PDF')
  }

  /** The text as it stood at the most recent export, or null if there wasn't one. */
  #lastExport(): string | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i]
      if (entry.kind === 'export') return this.textAt(entry)
    }
    return null
  }

  /**
   * The text as it stood at a version. Read off a fork, so the live document
   * is left exactly as it is — attached or not.
   */
  textAt(entry: HistoryEntry): string {
    if (!this.#doc) return ''
    return this.#doc
      .forkAt([frontier(entry)])
      .getText(TEXT_ID)
      .toString()
  }

  /**
   * The newest text, whichever version is on screen. While a version is
   * checked out `text` says what is being looked at; this says what the file
   * is.
   */
  headText(): string {
    if (!this.#doc) return ''
    if (!this.#doc.isDetached()) return this.#text()
    return this.#doc.forkAt(this.#doc.oplogFrontiers()).getText(TEXT_ID).toString()
  }

  /**
   * Stamp the current state with a kind and a label. The label is stored in a map
   * container, which gives the commit a real operation to carry — so unlike a
   * bare commit this always produces a history entry, even with nothing edited.
   */
  #tag(kind: ChangeKind, label: string): void {
    if (!this.#doc || this.isViewingHistory) return
    this.#doc.getMap(TAGS_ID).set(new Date().toISOString(), label)
    this.#doc.setChangeMergeInterval(0)
    this.#doc.commit({ message: stampKind(kind, label), origin: TAG_ORIGIN })
    this.#doc.setChangeMergeInterval(MERGE_WINDOW_SECONDS)
    this.#refreshHistory()
    this.#scheduleSettle()
  }

  /**
   * Record how the file is presented now. The caller has already applied it —
   * this is the copy that goes into the document, which is what puts a restyle
   * in the history and on the undo stack.
   *
   * `axis` is which part of the presentation moved — the layout, the theme,
   * one block's variant, one key of the paper. A run of restyles reads as one line in the history rather
   * than as one per click, and the axes are what that line is named by; see
   * `mergeStyleRuns`.
   */
  recordStyle(style: Record<string, any>, label: string, axis: string): void {
    if (!this.#doc || this.isViewingHistory) return
    this.#commitStyle(style, label, axis)
  }

  /** Take back the last change. */
  undo(): boolean {
    if (!this.#undo || this.isViewingHistory) return false
    return this.#undo.undo()
  }

  /** Put back the last thing `undo` took. */
  redo(): boolean {
    if (!this.#undo || this.isViewingHistory) return false
    return this.#undo.redo()
  }

  /**
   * Check out a past version. The document goes detached: the editor is
   * read-only until `viewLatest` or `restore`.
   */
  view(entry: HistoryEntry): void {
    if (!this.#doc) return
    this.#doc.checkout([frontier(entry)])
    this.viewingKey = entry.key
    this.text = this.#text()
    this.diff = this.#diffFor(entry)
    // The sheet is shown as it was set, not as it is set now. Going back to
    // latest puts the current style back the same way.
    this.#syncStyle()
  }

  /** Return to the newest version and re-enable editing. */
  viewLatest(): void {
    if (!this.#doc) return
    if (this.#doc.isDetached()) this.#doc.checkoutToLatest()
    this.viewingKey = null
    this.diff = null
    this.text = this.#text()
    this.#syncStyle()
  }

  /**
   * Bring a past version back as the current one, by writing its text over the
   * top. Nothing is discarded — the restore is just another point in history.
   */
  restore(entry: HistoryEntry): void {
    if (!this.#doc) return
    const fork = this.#doc.forkAt([frontier(entry)])
    const text = fork.getText(TEXT_ID).toString()
    const style = fork.getMap(STYLE_ID).toJSON()
    this.viewLatest()

    const message = stampKind('restore', `Restored ${describe(entry)}`)
    // The version's presentation comes back with its text: both are what the
    // file was at that point, and restoring half of it would be a version
    // nobody ever had. Read the same way `#readStyle` reads the head — the
    // version's own keys over the registry's copy — so an axis that version
    // never touched goes back to what it was then rather than staying as it is
    // now. Written before the text goes in, so the commit the editor binding
    // makes carries the whole restore as one change.
    const wanted = { ...this.#baseStyle }
    for (const key of STYLE_KEYS) if (style[key] != null) wanted[key] = style[key]
    this.#writeStyle(wanted)
    this.#applyNamed(message, text)
    // Restoring a version whose text is the one already on screen produces no
    // editor transaction, so the map ops above would have nothing to ride on.
    this.#doc.commit({ message })
    this.#syncStyle()
    this.#refreshHistory()
  }

  /**
   * Drop the oplog and start over from the current text. The only way to shrink
   * a snapshot that has grown large — past versions are gone for good.
   */
  clearHistory(): void {
    if (!this.#doc) return
    this.viewLatest()
    const text = this.#text()
    this.#unsubscribeAll()
    remove(snapshotKey(this.#fileId))
    this.#epoch = newEpoch()
    this.#adopt(this.#seed(text))
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #text(): string {
    return this.#doc ? cvText(this.#doc).toString() : ''
  }

  /**
   * Put a style into the map, writing only what actually moved — a key set back
   * to what the map already says is not a change, and neither is one that was
   * never set and still isn't. `null` stands for "nothing of its own", which
   * `#readStyle` reads as a fall-through to the registry's copy.
   */
  #writeStyle(style: Record<string, any>): boolean {
    const map = (this.#doc as LoroDoc).getMap(STYLE_ID)
    const now = map.toJSON()
    const changed = STYLE_KEYS.filter((key) => !same(now[key], style[key]))
    for (const key of changed) map.set(key, style[key] ?? null)
    return changed.length > 0
  }

  /** Commit a style change now, if it is one. */
  #commitStyle(style: Record<string, any>, label: string, axis: string): void {
    if (!this.#doc || this.isViewingHistory) return
    if (!this.#writeStyle(style)) return

    this.#doc.setChangeMergeInterval(0)
    this.#doc.commit({ message: stampKind('style', label, axis) })
    this.#doc.setChangeMergeInterval(MERGE_WINDOW_SECONDS)
    this.#syncStyle()
    this.#refreshHistory()
    this.#scheduleSettle()
  }

  /**
   * Read the map back, and hand it on if it has moved. Called after anything
   * that can move it: a commit here, an undo, a checkout, a merge from another
   * tab. The guard is what keeps that from being a loop — the mirror lands in
   * the registry, the registry hands the same values back, and the second pass
   * finds nothing to do.
   */
  #syncStyle(): void {
    const next = this.#readStyle()
    if (same(next, this.style)) return
    this.style = next
    this.#styleHost?.apply(next)
  }

  /** The map's keys over the registry's copy — see `STYLE_ID`. */
  #readStyle(): Record<string, any> {
    const out: Record<string, any> = { ...this.#baseStyle }
    const map = this.#doc?.getMap(STYLE_ID).toJSON() ?? {}
    for (const key of STYLE_KEYS) if (map[key] != null) out[key] = map[key]
    return out
  }

  /**
   * The text as it stood at a version — through `#probe` while the history is
   * being rebuilt, off a fork of its own otherwise.
   */
  #versionText(frontiers: OpId[]): string {
    const doc = this.#doc as LoroDoc
    if (!this.#probing) return cvText(doc.forkAt(frontiers)).toString()
    // Forked at the oplog's head, not `fork()`: a detached document forks at
    // the version on screen, and the copy would know nothing newer.
    this.#probe ??= doc.forkAt(doc.oplogFrontiers())
    this.#probe.checkout(frontiers)
    return cvText(this.#probe).toString()
  }

  /**
   * Everything a change did, as a diff against the version just before it.
   */
  #changeDiff(entry: HistoryEntry): Array<[ContainerID, Diff]> {
    if (!this.#doc) return []
    return this.#doc.diff(entry.deps, [frontier(entry)], false) as Array<[ContainerID, Diff]>
  }

  /**
   * What a change did to the text, as a delta against the version just before it.
   * Empty when the change touched no text at all — a tag carries only its label.
   */
  #textOps(entry: HistoryEntry, diffs: Array<[ContainerID, Diff]> = this.#changeDiff(entry)): TextDiff['diff'] {
    const found = diffs.find(([, d]) => d.type === 'text')
    if (!found) return []
    return this.#net(entry, (found[1] as TextDiff).diff)
  }

  /**
   * Cancel what a change put back of what it took away. The CRDT diff knows
   * characters by identity, so text deleted and then brought back — by an undo
   * inside the merge window, say — is a deletion of the old characters and an
   * insertion of new ones that read the same. Trimming each replaced stretch to
   * where the two actually differ leaves only what changed in the reading.
   */
  #net(entry: HistoryEntry, ops: TextDiff['diff']): TextDiff['diff'] {
    if (!this.#doc || !ops.some((op) => op.insert) || !ops.some((op) => op.delete != null)) return ops
    const before = this.#versionText(entry.deps)
    const out: TextDiff['diff'] = []
    let pos = 0
    let i = 0
    while (i < ops.length) {
      const op = ops[i]
      if (op.retain != null) {
        out.push(op)
        pos += op.retain
        i++
        continue
      }
      let inserted = ''
      let deleted = 0
      for (; i < ops.length && ops[i].retain == null; i++) {
        const run = ops[i]
        if (run.insert) inserted += run.insert
        else if (run.delete != null) deleted += run.delete
      }
      const gone = before.slice(pos, pos + deleted)
      pos += deleted
      let head = 0
      while (head < inserted.length && head < gone.length && inserted[head] === gone[head]) head++
      let tail = 0
      while (tail < inserted.length - head && tail < gone.length - head && inserted[inserted.length - 1 - tail] === gone[gone.length - 1 - tail]) tail++
      if (head) out.push({ retain: head })
      if (gone.length - head - tail) out.push({ delete: gone.length - head - tail })
      if (inserted.length - head - tail) out.push({ insert: inserted.slice(head, inserted.length - tail) })
      if (tail) out.push({ retain: tail })
    }
    return out
  }

  /**
   * How many characters a change added and removed. Cached: a change's content is
   * fixed once its key exists, since a change that grows by merging a later edit
   * ends on a new counter and so takes a new key.
   *
   * A change that, read that way, did nothing at all — no text moved and nothing
   * else touched — is noted in `#noops`, so the history can leave it out.
   */
  #statsFor(entry: HistoryEntry): ChangeStats {
    const cached = this.#statsCache.get(entry.key)
    if (cached) return cached
    const diffs = this.#changeDiff(entry)
    const ops = this.#textOps(entry, diffs)
    const stats: ChangeStats = { added: 0, removed: 0 }
    for (const op of ops) {
      if (op.insert) stats.added += op.insert.length
      else if (op.delete != null) stats.removed += op.delete
    }
    if (!stats.added && !stats.removed && diffs.every(([, d]) => d.type === 'text')) this.#noops.add(entry.key)
    this.#statsCache.set(entry.key, stats)
    return stats
  }

  /**
   * What a change did to the text, expressed as positions in the text as it
   * reads *after* the change (which is what's on screen while previewing it).
   * Deleted text no longer has a position of its own, so it's anchored to the
   * point it once sat at and carries its own content along.
   */
  #diffFor(entry: HistoryEntry): VersionDiff {
    const result: VersionDiff = { added: [], removed: [] }
    const ops = this.#textOps(entry)
    if (!ops.length || !this.#doc) return result
    const before = this.#doc.forkAt(entry.deps).getText(TEXT_ID).toString()
    let fromPos = 0
    let toPos = 0
    for (const op of ops) {
      if (op.retain != null) {
        fromPos += op.retain
        toPos += op.retain
      } else if (op.insert) {
        result.added.push({ from: toPos, to: toPos + op.insert.length })
        toPos += op.insert.length
      } else if (op.delete != null) {
        result.removed.push({ at: toPos, text: before.slice(fromPos, fromPos + op.delete) })
        fromPos += op.delete
      }
    }
    return result
  }

  /**
   * Write text into the editor and label the commit it produces. Loro delivers
   * events synchronously, so by the time `#applyText` returns the binding has
   * already committed and the pre-commit hook has consumed the name; clearing it
   * afterwards keeps a no-op write from labelling the user's next edit instead.
   */
  #applyNamed(message: string, text: string): void {
    this.#pendingMessage = message
    this.#applyText(text)
    this.#pendingMessage = null
  }

  /** Install a document, wire up its subscriptions, and save it. */
  #adopt(doc: LoroDoc): void {
    this.#doc = doc
    this.#statsCache.clear()
    this.#noops.clear()
    // Whatever the registry has for this file is what the map layers over, so
    // it has to be read before anything is read back out of the map.
    this.#baseStyle = this.#styleHost?.base() ?? {}
    doc.setChangeMergeInterval(MERGE_WINDOW_SECONDS)

    // Built after the snapshot is imported, so it can only undo what happens
    // from here on — never the history restored from storage.
    this.#undo = new UndoManager(doc, {
      mergeInterval: 500,
      maxUndoSteps: 200,
      excludeOriginPrefixes: [TAG_ORIGIN],
    })

    this.#subscriptions = [
      // loro-codemirror commits every editor transaction with no message; this
      // is the only place a name can be attached to one of those commits.
      doc.subscribePreCommit((e) => {
        if (!this.#pendingMessage) return
        e.modifier.setMessage(this.#pendingMessage)
        this.#pendingMessage = null
      }),
      doc.subscribe(() => {
        this.text = this.#text()
        this.#syncStyle()
        this.#scheduleSettle()
      }),
    ]

    // this.user = { name: "User", colorClassName: "user1" }
    // const ephemeral = { user: this.user, ephemeral: new EphemeralStore() }
    this.extensions = LoroExtensions(doc, undefined, this.#undo, cvText)
    this.viewingKey = null
    this.diff = null
    this.text = this.#text()
    this.style = this.#readStyle()
    // The snapshot is the older of the two stores only in the sense that it is
    // read second: if it carries a style the registry doesn't, the document is
    // what the file was last left as, so it wins and the registry is told.
    if (!same(this.style, this.#baseStyle)) this.#styleHost?.apply(this.style)
    this.#refreshHistory()
    this.docId++

    window.addEventListener('storage', this.#onStorage)
    this.#save()
  }

  #unsubscribeAll(): void {
    for (const off of this.#subscriptions) off()
    this.#subscriptions = []
  }

  /**
   * Restore the stored snapshot, or start a fresh document from `seedText` —
   * falling back to the shipped template.
   */
  #load(seedText?: string): LoroDoc {
    const stored = read(snapshotKey(this.#fileId))
    if (stored) {
      const { epoch, snapshot } = split(stored)
      try {
        const doc = new LoroDoc()
        doc.setRecordTimestamp(true)
        doc.import(snapshot)
        if (cvText(doc).toString().length > 0) {
          this.#epoch = epoch
          return doc
        }
      } catch (e) {
        console.warn('[cv] stored snapshot could not be read, starting fresh', e)
      }
    }
    return this.#seed(seedText ?? this.#formatOf().template)
  }

  #seed(text: string): LoroDoc {
    const doc = new LoroDoc()
    doc.setRecordTimestamp(true) // history entries are worthless without a time
    cvText(doc).update(text)
    doc.setChangeMergeInterval(0)
    doc.commit({ message: stampKind('initial', 'Initial version') })
    return doc
  }

  #refreshHistory(): void {
    if (!this.#doc) return
    const list: HistoryEntry[] = []
    for (const [peer, changes] of this.#doc.getAllChanges()) {
      let last: { entry: HistoryEntry; change: Change } | null = null
      for (const c of changes) {
        // A change spans `length` ops; its frontier is the last of them.
        const counter = c.counter + c.length - 1
        // Loro caps how many ops one change holds, so a commit big enough — a
        // restore or a paste that rewrites the whole text — comes back as
        // several changes in a row, each carrying the commit's message and
        // time. Two like that are the same commit split, and read as one: a
        // named commit never merges with its neighbour, and two unnamed ones
        // that close together would have been merged had they fitted.
        if (last && c.message === last.change.message && c.timestamp === last.change.timestamp && follows(c, last.entry)) {
          Object.assign(last.entry, {
            key: `${peer}@${counter}`,
            counter,
            lamport: c.lamport + c.length - 1,
            length: last.entry.length + c.length,
          })
          last.change = c
          continue
        }
        const entry: HistoryEntry = {
          key: `${peer}@${counter}`,
          peer,
          counter,
          lamport: c.lamport + c.length - 1,
          timestamp: c.timestamp ?? 0,
          ...readKind(c.message ?? ''),
          length: c.length,
          stats: null,
          deps: c.deps,
        }
        list.push(entry)
        last = { entry, change: c }
      }
    }
    list.sort((a, b) => a.lamport - b.lamport || a.peer.localeCompare(b.peer))
    const merged = mergeStyleRuns(list)
    this.#probing = true
    try {
      for (const entry of merged.slice(-STATS_LIMIT)) {
        entry.stats = this.#statsFor(entry)
      }
    } finally {
      this.#probing = false
      this.#probe?.free()
      this.#probe = null
    }
    // An edit that came to nothing — a deletion undone before the merge window
    // closed folds into the same change as the deletion — is not a version.
    this.history = merged.filter((entry) => !(entry.kind === 'edit' && this.#noops.has(entry.key)))
  }

  #scheduleSettle(): void {
    if (this.#settleTimer) clearTimeout(this.#settleTimer)
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = null
      this.#refreshHistory()
      this.#save()
    }, SETTLE_MS)
  }

  #save(): void {
    // A detached document would serialise the version being previewed as head.
    if (!this.#doc || this.#doc.isDetached()) return
    const bytes = this.#doc.export({ mode: 'snapshot' })
    if (write(snapshotKey(this.#fileId), `${this.#epoch}:${bytesToBase64(bytes)}`)) {
      this.snapshotBytes = bytes.length
      this.savedAt = new Date()
      this.saveError = null
    } else {
      this.saveError = 'Browser storage is full or unavailable — changes are not being saved'
    }
  }

  /** Another tab wrote a snapshot. Merge it, or take it wholesale after a clear. */
  #onStorage = (e: StorageEvent): void => {
    if (e.key !== snapshotKey(this.#fileId) || !e.newValue || !this.#doc) return
    const { epoch, snapshot } = split(e.newValue)
    try {
      if (epoch === this.#epoch) {
        // Same lineage: Loro reconciles the oplogs, and loro-codemirror
        // translates the resulting diff into editor changes.
        this.#doc.import(snapshot)
        return
      }
      const doc = new LoroDoc()
      doc.setRecordTimestamp(true)
      doc.import(snapshot)
      this.#unsubscribeAll()
      this.#epoch = epoch
      this.#adopt(doc)
    } catch (err) {
      console.warn('[cv] could not take the update from another tab', err)
    }
  }
}

/**
 * The current text of a file that isn't the one being edited, read out of its
 * stored snapshot — the only place a closed tab's text is. Null when there is
 * nothing stored or it can't be read. The store trails a live edit in another
 * browser tab by the settle debounce, which is close enough for a comparison.
 *
 * Only safe once `init` has run somewhere, since that is what loads the WASM.
 */
export function storedText(fileId: string): string | null {
  const stored = read(snapshotKey(fileId))
  if (!stored) return null
  try {
    const doc = new LoroDoc()
    doc.import(split(stored).snapshot)
    return cvText(doc).toString()
  } catch (e) {
    console.warn('[cv] stored snapshot could not be read', e)
    return null
  }
}

const newEpoch = (): string => Math.random().toString(36).slice(2, 10)

/**
 * Whether two style values are the same thing. Absent and null are one value
 * here — a key the map never carried and one explicitly cleared both mean the
 * file has nothing of its own to say — and objects are compared by their
 * contents rather than by the order their keys happen to be written in, since
 * `paper` and `variants` are rebuilt by a spread every time they are touched.
 */
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b)

const stable = (value: unknown): string =>
  JSON.stringify(value ?? null, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).toSorted(([x], [y]) => x.localeCompare(y))) : v,
  )

const stampKind = (kind: ChangeKind, label: string, axis?: string): string => `${kind}${KIND_SEP}${label}${axis ? KIND_SEP + axis : ''}`

/**
 * Read a commit message back into its kind, the label to show, and — for a
 * restyle — the axis it moved. Messages written before kinds existed carry no
 * stamp: a labelled one was a named version, an empty one was the editor
 * committing a burst of typing. Ones written before axes did carry no third
 * field, which reads as an axis of its own that nothing merges with.
 */
function readKind(raw: string): { kind: ChangeKind; message: string; axis: string } {
  const at = raw.indexOf(KIND_SEP)
  if (at !== -1) {
    const kind = raw.slice(0, at) as ChangeKind
    if (KINDS.includes(kind)) {
      const rest = raw.slice(at + 1)
      // Only a restyle carries an axis, and it is the last field.
      const cut = kind === 'style' ? rest.lastIndexOf(KIND_SEP) : -1
      if (cut === -1) return { kind, message: rest, axis: '' }
      return { kind, message: rest.slice(0, cut), axis: rest.slice(cut + 1) }
    }
  }
  return raw ? { kind: 'checkpoint', message: raw, axis: '' } : { kind: 'edit', message: 'Edit', axis: '' }
}

/**
 * Fold each run of restyles into the last of them. Picking a preset is how a
 * preset is looked at, and a theme, a font and a block or two are usually one
 * sitting spent on how the sheet looks, so a run of them reads best as one
 * line — the one that says where the run ended up.
 *
 * Done here rather than at commit time because Loro merges only changes that
 * carry no message, and the kind and label ride in the message. So the oplog
 * keeps every step — each is still its own undo — and the panel shows the run.
 *
 * The entry that stands for the run is the newest: its time and its frontier,
 * so selecting it shows the CV as the run left it. Its `deps` are the first
 * one's, so the change it describes spans the whole run. Its label is the last
 * one given on each axis the run moved, in the order they were first moved —
 * `Theme — Plum, Font — Inter` — so going back and forth on one axis still
 * names only where it ended.
 */
function mergeStyleRuns(list: HistoryEntry[]): HistoryEntry[] {
  const out: HistoryEntry[] = []
  let labels = new Map<string, string>()
  for (const entry of list) {
    const prev = out[out.length - 1]
    const runs = prev && prev.kind === 'style' && entry.kind === 'style' && prev.peer === entry.peer
    if (!runs) labels = new Map()
    // An entry from before axes were recorded is an axis of its own.
    labels.set(entry.axis || entry.message, entry.message)
    if (runs) out[out.length - 1] = { ...entry, message: [...labels.values()].join(', '), deps: prev.deps, length: prev.length + entry.length }
    else out.push(entry)
  }
  return out
}

/**
 * Whether a change carries straight on from an entry: the next op on the same
 * peer, depending on nothing but the entry's last one.
 */
const follows = (change: Change, entry: HistoryEntry): boolean =>
  change.counter === entry.counter + 1 && change.deps.length === 1 && change.deps[0].peer === entry.peer && change.deps[0].counter === entry.counter

const frontier = (entry: HistoryEntry): OpId => ({ peer: entry.peer as any, counter: entry.counter })

/**
 * Split a stored value into its lineage marker and snapshot bytes.
 */
function split(stored: string): { epoch: string; snapshot: Uint8Array } {
  const at = stored.indexOf(':') // base64 never contains a colon
  if (at === -1) return { epoch: newEpoch(), snapshot: base64ToBytes(stored) }
  return { epoch: stored.slice(0, at), snapshot: base64ToBytes(stored.slice(at + 1)) }
}

function describe(entry: HistoryEntry): string {
  if (!entry.timestamp) return entry.message
  return new Date(entry.timestamp * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
