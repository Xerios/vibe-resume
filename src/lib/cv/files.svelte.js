import { KEYS, read, remove, snapshotKey, write } from './storage.js';

/**
 * @typedef {object} FileMeta
 * @property {string} id
 * @property {string} name
 * @property {number | null} deletedAt   ms epoch when moved to trash; null while open
 * @property {string} [layout]           preset id from presets.js; absent means the default
 * @property {string} [theme]            preset id from presets.js; absent means the default
 */

/**
 * The set of documents open in the editor, as tabs. Each file's own CRDT
 * snapshot lives under its own storage key (see `snapshotKey`); this class
 * only owns the registry — id, name, trash state — not document content.
 *
 * Deleting a file is a soft delete: it drops off the tab bar but its snapshot
 * key is left untouched, so restoring it from the trash brings back the full
 * history exactly as it was.
 *
 * Layout and theme ride along here too. They describe how a CV is presented
 * rather than what it says, so they belong beside the file's name and not in
 * the CRDT — restyling is not an edit and leaves version history alone.
 */
export class FileManager {
	/** @type {FileMeta[]} */
	files = $state([]);
	activeId = $state(/** @type {string | null} */ (null));

	/** Left-to-right tab order, oldest first. */
	open = $derived(this.files.filter((f) => !f.deletedAt));
	/** Most recently deleted first. */
	trashed = $derived(
		this.files.filter((f) => f.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
	);
	active = $derived(this.files.find((f) => f.id === this.activeId) ?? null);

	init() {
		this.files = this.#loadList();
		if (this.files.length === 0) this.#migrateOrSeed();

		const openIds = this.open.map((f) => f.id);
		const stored = read(KEYS.activeFile);
		this.activeId = stored && openIds.includes(stored) ? stored : (openIds[0] ?? this.create());
	}

	/** @param {string} id */
	switchTo(id) {
		if (id === this.activeId) return;
		this.activeId = id;
		this.#saveActive();
	}

	/**
	 * Open a new tab by copying a file's stored snapshot verbatim — the copy
	 * carries the source's full history, not just its current text.
	 * @param {string} sourceId
	 */
	duplicate(sourceId) {
		const source = this.files.find((f) => f.id === sourceId);
		if (!source) return this.create();

		const raw = read(snapshotKey(sourceId));
		const id = newId();
		if (raw) write(snapshotKey(id), raw);

		this.files = [
			...this.files,
			{
				id,
				name: this.#uniqueName(`${source.name} copy`),
				deletedAt: null,
				layout: source.layout,
				theme: source.theme
			}
		];
		this.#saveList();
		this.activeId = id;
		this.#saveActive();
		return id;
	}

	/**
	 * A given name is de-duplicated like a generated one — importing the same
	 * `cv.yaml` twice should give two distinguishable tabs, not two called "cv".
	 * @param {string} [name]
	 */
	create(name) {
		const id = newId();
		this.files = [...this.files, { id, name: this.#uniqueName(name || 'CV'), deletedAt: null }];
		this.#saveList();
		this.activeId = id;
		this.#saveActive();
		return id;
	}

	/**
	 * Move a file to the trash. Its snapshot key is left in place. Returns the
	 * id that should now be active — unchanged unless the trashed file was it.
	 * @param {string} id
	 * @returns {string}
	 */
	trash(id) {
		this.files = this.files.map((f) => (f.id === id ? { ...f, deletedAt: Date.now() } : f));
		this.#saveList();
		if (this.activeId !== id) return /** @type {string} */ (this.activeId);

		const nextId = this.open[0]?.id ?? this.create();
		this.activeId = nextId;
		this.#saveActive();
		return nextId;
	}

	/** Bring a trashed file back as an open tab. @param {string} id */
	restore(id) {
		const file = this.files.find((f) => f.id === id);
		if (!file) return;
		const name = this.#uniqueName(file.name);
		this.files = this.files.map((f) => (f.id === id ? { ...f, name, deletedAt: null } : f));
		this.#saveList();
		this.activeId = id;
		this.#saveActive();
	}

	/** Permanently delete a trashed file — its snapshot is gone for good. @param {string} id */
	purge(id) {
		this.files = this.files.filter((f) => f.id !== id);
		this.#saveList();
		remove(snapshotKey(id));
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	rename(id, name) {
		const trimmed = name.trim();
		if (!trimmed) return;
		this.files = this.files.map((f) => (f.id === id ? { ...f, name: trimmed } : f));
		this.#saveList();
	}

	/**
	 * Restyle a file. Ids are stored as given and validated on the way out
	 * (`resolveLayout` / `resolveTheme`), so a preset that later disappears
	 * degrades to the default instead of rendering nothing.
	 * @param {string} id
	 * @param {{ layout?: string, theme?: string }} style
	 */
	setStyle(id, style) {
		this.files = this.files.map((f) => (f.id === id ? { ...f, ...style } : f));
		this.#saveList();
	}

	// ── Internals ──────────────────────────────────────────────────────────────

	#loadList() {
		const raw = read(KEYS.files);
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	#saveList() {
		write(KEYS.files, JSON.stringify(this.files));
	}

	#saveActive() {
		if (this.activeId) write(KEYS.activeFile, this.activeId);
	}

	/** First run after this feature shipped: fold the old single-document snapshot in as the first file. */
	#migrateOrSeed() {
		const legacy = read(KEYS.legacySnapshot);
		const id = newId();
		if (legacy) {
			write(snapshotKey(id), legacy);
			remove(KEYS.legacySnapshot);
		}
		this.files = [{ id, name: 'CV', deletedAt: null }];
		this.#saveList();
	}

	/** @param {string} base */
	#uniqueName(base) {
		const taken = new Set(this.files.filter((f) => !f.deletedAt).map((f) => f.name));
		if (!taken.has(base)) return base;
		let n = 2;
		while (taken.has(`${base} ${n}`)) n++;
		return `${base} ${n}`;
	}
}

const newId = () => Math.random().toString(36).slice(2, 10);
