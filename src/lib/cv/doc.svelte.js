import { LoroExtensions } from 'loro-codemirror'
import { LoroDoc, UndoManager } from 'loro-crdt/web'
// `loro-crdt/web` re-exports everything but the default init function, so pull it
// straight from the wasm-bindgen module — it is the same instance either way.
import initWasm from 'loro-crdt/web/loro_wasm.js'
import DEFAULT_YAML from './default-cv.yaml?raw'
import { base64ToBytes, bytesToBase64, read, remove, snapshotKey, write } from './storage.js'

const TEXT_ID = 'yaml'
const TAGS_ID = 'checkpoints'

/** Commits made by naming a version, kept out of the undo stack. */
const TAG_ORIGIN = 'cv-tag'

/**
 * What a change was: an ordinary edit, a named save, a PDF export, a restore, or
 * the template the file started from. A commit message is the only per-change
 * metadata Loro carries, so the kind rides along inside it, separated by a
 * control character no one can type into the "name this version" box.
 */
const KINDS = /** @type {const} */ (['edit', 'checkpoint', 'export', 'restore', 'initial'])
const KIND_SEP = '\u0001'

/** @typedef {(typeof KINDS)[number]} ChangeKind */

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

let wasmReady = /** @type {Promise<unknown> | null} */ (null)

/** @param {LoroDoc} doc */
const cvText = (doc) => doc.getText(TEXT_ID)

/**
 * @typedef {object} HistoryEntry
 * @property {string} key            stable id, `${peer}@${counter}`
 * @property {string} peer
 * @property {number} counter        counter of the change's *last* op — its frontier
 * @property {number} lamport
 * @property {number} timestamp      unix seconds, 0 when not recorded
 * @property {string} message
 * @property {ChangeKind} kind      what the change was — see `KINDS`
 * @property {number} length         number of ops in the change
 * @property {ChangeStats | null} stats  characters added and removed, null past `STATS_LIMIT`
 * @property {import('loro-crdt/web').OpId[]} deps  causal parents — the version just before this change
 */

/**
 * How much text a change touched, in characters.
 * @typedef {object} ChangeStats
 * @property {number} added
 * @property {number} removed
 */

/**
 * What a change added or removed, in terms of the text as displayed while
 * previewing it (see `CvDoc#diff`).
 * @typedef {object} VersionDiff
 * @property {{from: number, to: number}[]} added      ranges, in the viewed text, that this change inserted
 * @property {{at: number, text: string}[]} removed     text this change deleted, positioned where it used to sit
 */

/**
 * The CV document: a Loro CRDT holding one text container, mirrored into
 * localStorage and merged across browser tabs.
 *
 * The editor is bound to it by loro-codemirror, which owns both directions of
 * text sync and the undo stack. Everything here is about the *document* —
 * versions, persistence, and time travel — never about keystrokes.
 */
export class CvDoc {
  ready = $state(false)
  /** Current text of the document (either the live head, or a checked-out version). */
  yaml = $state('')
  /** Oldest first. @type {HistoryEntry[]} */
  history = $state([])
  /** Key of the entry being previewed, or null when we're on the latest version. */
  viewingKey = $state(/** @type {string | null} */ (null))
  /** What the previewed entry changed, for highlighting in the editor. @type {VersionDiff | null} */
  diff = $state(null)
  /** @type {Date | null} */
  savedAt = $state(null)
  /** @type {string | null} */
  saveError = $state(null)
  snapshotBytes = $state(0)
  /** Bumped whenever the underlying document is swapped, to re-key the editor. */
  docId = $state(0)
  /** CodeMirror extensions for the current document. @type {any} */
  extensions = $state(null)

  /** Newest first — the order the history panel shows. */
  entries = $derived(this.history.slice().reverse())
  isViewingHistory = $derived(this.viewingKey !== null)
  /** @type {HistoryEntry | undefined} */
  viewingEntry = $derived(this.history.find((e) => e.key === this.viewingKey))

  /** @type {LoroDoc | null} */
  #doc = null
  /** @type {UndoManager | null} */
  #undo = null
  /** @type {(() => void)[]} */
  #subscriptions = []
  /** @type {ReturnType<typeof setTimeout> | null} */
  #settleTimer = null
  /** Message to stamp on the next commit the editor binding makes. */
  #pendingMessage = /** @type {string | null} */ (null)
  /** @type {(text: string) => void} */
  #applyText = () => {}
  /**
   * Identifies which document lineage the stored snapshot belongs to. Snapshots
   * from the same lineage are merged; a different one means another tab cleared
   * the history, and merging would splice two unrelated documents together.
   */
  #epoch = newEpoch()
  /** Which file's storage key this instance is currently reading and writing. */
  #fileId = ''
  /** Change counts, keyed by entry key. @type {Map<string, ChangeStats>} */
  #statsCache = new Map()

  /** @param {string} fileId */
  async init(fileId) {
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
   * `.yaml`, say. It only applies to a file with no snapshot yet, and seeding
   * with it beats pushing the text in afterwards: the history then starts with
   * one "Initial version" holding the real YAML, not the template plus an
   * immediate overwrite.
   *
   * @param {string} fileId
   * @param {string} [seedText]
   */
  switchTo(fileId, seedText) {
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
   * @param {(text: string) => void} applyText
   */
  bindEditor(applyText) {
    this.#applyText = applyText
  }

  destroy() {
    if (this.#settleTimer) clearTimeout(this.#settleTimer)
    this.#unsubscribeAll()
    window.removeEventListener('storage', this.#onStorage)
  }

  /** Persist right now, skipping the debounce. Used when the tab is going away. */
  flush() {
    if (this.#settleTimer) {
      clearTimeout(this.#settleTimer)
      this.#settleTimer = null
    }
    this.#save()
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  /**
   * Mark the current state as a named version.
   * @param {string} name
   */
  checkpoint(name) {
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
  markExport() {
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
  #lastExport() {
    if (!this.#doc) return null
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i]
      if (entry.kind !== 'export') continue
      return this.#doc
        .forkAt([frontier(entry)])
        .getText(TEXT_ID)
        .toString()
    }
    return null
  }

  /**
   * Stamp the current state with a kind and a label. The label is stored in a map
   * container, which gives the commit a real operation to carry — so unlike a
   * bare commit this always produces a history entry, even with nothing edited.
   * @param {ChangeKind} kind
   * @param {string} label
   */
  #tag(kind, label) {
    if (!this.#doc || this.isViewingHistory) return
    this.#doc.getMap(TAGS_ID).set(new Date().toISOString(), label)
    this.#doc.setChangeMergeInterval(0)
    this.#doc.commit({ message: stampKind(kind, label), origin: TAG_ORIGIN })
    this.#doc.setChangeMergeInterval(MERGE_WINDOW_SECONDS)
    this.#refreshHistory()
    this.#scheduleSettle()
  }

  /**
   * Check out a past version. The document goes detached: the editor is
   * read-only until `viewLatest` or `restore`.
   * @param {HistoryEntry} entry
   */
  view(entry) {
    if (!this.#doc) return
    this.#doc.checkout([frontier(entry)])
    this.viewingKey = entry.key
    this.yaml = this.#text()
    this.diff = this.#diffFor(entry)
  }

  /** Return to the newest version and re-enable editing. */
  viewLatest() {
    if (!this.#doc) return
    if (this.#doc.isDetached()) this.#doc.checkoutToLatest()
    this.viewingKey = null
    this.diff = null
    this.yaml = this.#text()
  }

  /**
   * Bring a past version back as the current one, by writing its text over the
   * top. Nothing is discarded — the restore is just another point in history.
   * @param {HistoryEntry} entry
   */
  restore(entry) {
    if (!this.#doc) return
    const text = this.#doc
      .forkAt([frontier(entry)])
      .getText(TEXT_ID)
      .toString()
    this.viewLatest()
    this.#applyNamed(stampKind('restore', `Restored ${describe(entry)}`), text)
  }

  /**
   * Drop the oplog and start over from the current text. The only way to shrink
   * a snapshot that has grown large — past versions are gone for good.
   */
  clearHistory() {
    if (!this.#doc) return
    this.viewLatest()
    const text = this.#text()
    this.#unsubscribeAll()
    remove(snapshotKey(this.#fileId))
    this.#epoch = newEpoch()
    this.#adopt(this.#seed(text))
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #text() {
    return this.#doc ? cvText(this.#doc).toString() : ''
  }

  /**
   * What a change did to the text, as a delta against the version just before it.
   * Empty when the change touched no text at all — a tag carries only its label.
   * @param {HistoryEntry} entry
   * @returns {import('loro-crdt/web').TextDiff['diff']}
   */
  #textOps(entry) {
    if (!this.#doc) return []
    const found = this.#doc.diff(entry.deps, [frontier(entry)], false).find(([, d]) => d.type === 'text')
    if (!found) return []
    return /** @type {import('loro-crdt/web').TextDiff} */ (found[1]).diff
  }

  /**
   * How many characters a change added and removed. Cached: a change's content is
   * fixed once its key exists, since a change that grows by merging a later edit
   * ends on a new counter and so takes a new key.
   * @param {HistoryEntry} entry
   * @returns {ChangeStats}
   */
  #statsFor(entry) {
    const cached = this.#statsCache.get(entry.key)
    if (cached) return cached
    const stats = { added: 0, removed: 0 }
    for (const op of this.#textOps(entry)) {
      if (op.insert) stats.added += op.insert.length
      else if (op.delete != null) stats.removed += op.delete
    }
    this.#statsCache.set(entry.key, stats)
    return stats
  }

  /**
   * What a change did to the text, expressed as positions in the text as it
   * reads *after* the change (which is what's on screen while previewing it).
   * Deleted text no longer has a position of its own, so it's anchored to the
   * point it once sat at and carries its own content along.
   * @param {HistoryEntry} entry
   * @returns {VersionDiff}
   */
  #diffFor(entry) {
    /** @type {VersionDiff} */
    const result = { added: [], removed: [] }
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
   * @param {string} message
   * @param {string} text
   */
  #applyNamed(message, text) {
    this.#pendingMessage = message
    this.#applyText(text)
    this.#pendingMessage = null
  }

  /** Install a document, wire up its subscriptions, and save it. */
  #adopt(/** @type {LoroDoc} */ doc) {
    this.#doc = doc
    this.#statsCache.clear()
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
        this.yaml = this.#text()
        this.#scheduleSettle()
      }),
    ]

    // this.user = { name: "User", colorClassName: "user1" }
    // const ephemeral = { user: this.user, ephemeral: new EphemeralStore() }
    this.extensions = LoroExtensions(doc, undefined, this.#undo, cvText)
    this.viewingKey = null
    this.diff = null
    this.yaml = this.#text()
    this.#refreshHistory()
    this.docId++

    window.addEventListener('storage', this.#onStorage)
    this.#save()
  }

  #unsubscribeAll() {
    for (const off of this.#subscriptions) off()
    this.#subscriptions = []
  }

  /**
   * Restore the stored snapshot, or start a fresh document from `seedText` —
   * falling back to the shipped template.
   * @param {string} [seedText]
   */
  #load(seedText) {
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
    return this.#seed(seedText ?? DEFAULT_YAML)
  }

  /** @param {string} text */
  #seed(text) {
    const doc = new LoroDoc()
    doc.setRecordTimestamp(true) // history entries are worthless without a time
    cvText(doc).update(text)
    doc.setChangeMergeInterval(0)
    doc.commit({ message: stampKind('initial', 'Initial version') })
    return doc
  }

  #refreshHistory() {
    if (!this.#doc) return
    /** @type {HistoryEntry[]} */
    const list = []
    for (const [peer, changes] of this.#doc.getAllChanges()) {
      for (const c of changes) {
        // A change spans `length` ops; its frontier is the last of them.
        const counter = c.counter + c.length - 1
        list.push({
          key: `${peer}@${counter}`,
          peer,
          counter,
          lamport: c.lamport + c.length - 1,
          timestamp: c.timestamp ?? 0,
          ...readKind(c.message ?? ''),
          length: c.length,
          stats: null,
          deps: c.deps,
        })
      }
    }
    list.sort((a, b) => a.lamport - b.lamport || a.peer.localeCompare(b.peer))
    for (const entry of list.slice(-STATS_LIMIT)) entry.stats = this.#statsFor(entry)
    this.history = list
  }

  #scheduleSettle() {
    if (this.#settleTimer) clearTimeout(this.#settleTimer)
    this.#settleTimer = setTimeout(() => {
      this.#settleTimer = null
      this.#refreshHistory()
      this.#save()
    }, SETTLE_MS)
  }

  #save() {
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
  #onStorage = (/** @type {StorageEvent} */ e) => {
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

const newEpoch = () => Math.random().toString(36).slice(2, 10)

/**
 * @param {ChangeKind} kind
 * @param {string} label
 */
const stampKind = (kind, label) => `${kind}${KIND_SEP}${label}`

/**
 * Read a commit message back into its kind and the label to show. Messages
 * written before kinds existed carry no stamp: a labelled one was a named
 * version, an empty one was the editor committing a burst of typing.
 * @param {string} raw
 * @returns {{kind: ChangeKind, message: string}}
 */
function readKind(raw) {
  const at = raw.indexOf(KIND_SEP)
  if (at !== -1) {
    const kind = /** @type {ChangeKind} */ (raw.slice(0, at))
    if (KINDS.includes(kind)) return { kind, message: raw.slice(at + 1) }
  }
  return raw ? { kind: 'checkpoint', message: raw } : { kind: 'edit', message: 'Edit' }
}

/** @param {HistoryEntry} entry */
const frontier = (entry) => ({ peer: /** @type {any} */ (entry.peer), counter: entry.counter })

/**
 * Split a stored value into its lineage marker and snapshot bytes.
 * @param {string} stored
 */
function split(stored) {
  const at = stored.indexOf(':') // base64 never contains a colon
  if (at === -1) return { epoch: newEpoch(), snapshot: base64ToBytes(stored) }
  return { epoch: stored.slice(0, at), snapshot: base64ToBytes(stored.slice(at + 1)) }
}

/** @param {HistoryEntry} entry */
function describe(entry) {
  if (!entry.timestamp) return entry.message
  return new Date(entry.timestamp * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
