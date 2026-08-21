<script>
	import { onMount, tick } from "svelte";
	import HistoryPanel from "$lib/components/HistoryPanel.svelte";
	import TabBar from "$lib/components/TabBar.svelte";
	import Toolbar from "$lib/components/Toolbar.svelte";
	import TrashPanel from "$lib/components/TrashPanel.svelte";
	import YamlEditor from "$lib/components/YamlEditor.svelte";
	import CvSheet from "$lib/cv/CvSheet.svelte";
	import { CvDoc } from "$lib/cv/doc.svelte.js";
	import { FileManager } from "$lib/cv/files.svelte.js";
	import { resolveLayout, resolveTheme } from "$lib/cv/presets.js";
	import { parseCv } from "$lib/cv/render.js";
	import { KEYS, read, write } from "$lib/cv/storage.js";

	const PARSE_DEBOUNCE_MS = 250;
	/** How long a pane's own scroll events stay ours after we move it ourselves. */
	const SYNC_QUIET_MS = 250;
	/** A tab switch or version preview scrolls things about; sync sits out this long. */
	const SYNC_HOLD_MS = 400;
	/** Where the top of the preview viewport is read from — clear of the sticky banner. */
	const PREVIEW_TOP_MARGIN = 16;
	/** Breathing room above an edited element when the preview is pulled to it. */
	const EDIT_REVEAL_MARGIN = 72;
	/** How long after the preview last moved it goes back to answering the pointer. */
	const POINTER_SETTLE_MS = 250;

	const cv = new CvDoc();
	const files = new FileManager();
	/** Which document `parsed` reflects — used to bypass the debounce when a tab switch swaps it out from under us. */
	let lastParsedDocId = -1;

	/** Last successfully parsed CV. Kept on a parse error so the preview doesn't blank. */
	let parsed = $state(/** @type {any} */ (null));
	let parseError = $state(/** @type {string | null} */ (null));
	/**
	 * Where each value in `parsed` came from — `data-src` path → source line.
	 * Only read from event handlers, so it stays off the reactive graph.
	 * @type {Map<string, number> | null}
	 */
	let srcLines = null;

	let historyOpen = $state(read(KEYS.historyOpen) !== "false");
	let sourceHidden = $state(read(KEYS.sourceHidden) === "true");
	let editorWidth = $state(read(KEYS.editorWidth));
	let toastMsg = $state("");
	let toastOn = $state(false);

	let editor = $state(/** @type {YamlEditor | undefined} */ (undefined));
	/** @type {HTMLDivElement} */
	let split;
	/** @type {HTMLDivElement} */
	let cvRoot;
	/** @type {HTMLDivElement} */
	let previewPane;
	/** @type {HTMLDivElement} */
	let editorPane;
	/** The preview element the pointer is on, outlined while the editor shows its line. */
	let hoverEl = /** @type {Element | null} */ (null);
	let dragging = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let toastTimer;
	let trashOpen = $state(false);

	/** Presentation of the active file, defaulted here so the rest can assume a valid id. */
	const layout = $derived(resolveLayout(files.active?.layout));
	const theme = $derived(resolveTheme(files.active?.theme));

	const saveLabel = $derived.by(() => {
		if (cv.saveError) return "⚠ not saved";
		if (cv.isViewingHistory) return "viewing history";
		if (!cv.savedAt) return "";
		const at = cv.savedAt.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		return `saved ${at}`;
	});

	onMount(() => {
		files.init();
		cv.bindEditor((text) => editor?.replaceAll(text));
		cv.init(/** @type {string} */ (files.activeId));

		const flush = () => cv.flush();
		const onVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};

		window.addEventListener("beforeunload", flush);
		window.addEventListener("keydown", onKeydown);
		document.addEventListener("visibilitychange", onVisibility);
		// Listeners rather than markup handlers: the preview is a document, not a
		// control, and `onclick` on a plain <div> only buys an a11y warning.
		cvRoot.addEventListener("mouseover", onPreviewOver);
		cvRoot.addEventListener("mouseleave", onPreviewLeave);
		cvRoot.addEventListener("click", onPreviewClick);

		// Whichever pane the user reaches for drives the other. Hovering doesn't
		// count, so a preview resting under the pointer can't take the wheel away
		// mid-keystroke.
		const claimEditor = () => takeOver("editor");
		const claimPreview = () => takeOver("preview");
		editorPane.addEventListener("wheel", claimEditor, { passive: true });
		editorPane.addEventListener("pointerdown", claimEditor);
		editorPane.addEventListener("keydown", claimEditor);
		editorPane.addEventListener("focusin", claimEditor);
		previewPane.addEventListener("wheel", claimPreview, { passive: true });
		previewPane.addEventListener("pointerdown", claimPreview);
		previewPane.addEventListener("touchstart", claimPreview, { passive: true });
		previewPane.addEventListener("scroll", onPreviewScroll, { passive: true });

		// Anything that reflows the sheet moves the rungs of the ladder.
		const resize = new ResizeObserver(() => (anchorsStale = true));
		resize.observe(cvRoot);
		resize.observe(previewPane);

		return () => {
			window.removeEventListener("beforeunload", flush);
			window.removeEventListener("keydown", onKeydown);
			document.removeEventListener("visibilitychange", onVisibility);
			cvRoot.removeEventListener("mouseover", onPreviewOver);
			cvRoot.removeEventListener("mouseleave", onPreviewLeave);
			cvRoot.removeEventListener("click", onPreviewClick);
			editorPane.removeEventListener("wheel", claimEditor);
			editorPane.removeEventListener("pointerdown", claimEditor);
			editorPane.removeEventListener("keydown", claimEditor);
			editorPane.removeEventListener("focusin", claimEditor);
			previewPane.removeEventListener("wheel", claimPreview);
			previewPane.removeEventListener("pointerdown", claimPreview);
			previewPane.removeEventListener("touchstart", claimPreview);
			previewPane.removeEventListener("scroll", onPreviewScroll);
			resize.disconnect();
			clearTimeout(toastTimer);
			cv.destroy();
		};
	});

	// The document is the single source of the preview: loro-codemirror keeps it in
	// step with the editor in both directions, so nothing here watches keystrokes.
	$effect(() => {
		const text = cv.yaml;
		const docId = cv.docId;
		if (!text) return;
		if (!parsed || docId !== lastParsedDocId) {
			// First paint, and switching to a different document (tab switch, new file,
			// clear history) shouldn't wait on the debounce meant for keystrokes.
			lastParsedDocId = docId;
			reparse(text);
			return;
		}
		const id = setTimeout(() => reparse(text), PARSE_DEBOUNCE_MS);
		return () => clearTimeout(id);
	});

	// Presentation changes reflow the sheet without going through the parser.
	$effect(() => {
		void layout;
		void theme;
		void editorWidth;
		void sourceHidden;
		anchorsStale = true;
	});

	// A tab switch or a version preview swaps the document out and scrolls both
	// panes on its own. That motion is the app's, not the user's, so sync stays
	// out of it — browsing history never drags the preview to a change.
	$effect(() => {
		void cv.docId;
		void cv.viewingKey;
		anchorsStale = true;
		pendingEditLine = 0;
		holdSync();
	});

	/** @param {string} text */
	function reparse(text) {
		const { cv: doc, lines, error } = parseCv(text);
		parseError = error;
		// Both or neither: the map has to describe the CV that's on screen, so a
		// broken document leaves the last good pair in place.
		if (doc) {
			parsed = doc;
			srcLines = lines;
			anchorsStale = true;
			if (pendingEditLine) revealEdit(pendingEditLine);
		}
	}

	/* ── Preview → source ──────────────────────────────────────────────────────
	   Every element CvSheet renders carries the `data-src` path of the YAML value
	   behind it. Hovering lights that line up in the editor, clicking puts the
	   caret on it. */

	/**
	 * The `data-src` element under the pointer and the line it maps to. Paths the
	 * map doesn't know — a value added since the last good parse — fall back to
	 * the nearest ancestor that it does, so the jump lands close rather than
	 * nowhere.
	 * @param {Event} e
	 */
	function srcTarget(e) {
		const el = e.target instanceof Element ? e.target.closest("[data-src]") : null;
		if (!el || !hasOwnText(el)) return null;
		return { el, line: lineForPath(el.getAttribute("data-src")) };
	}

	/**
	 * Whether an element carries text of its own — text inside a nested
	 * `data-src` element belongs to that one, not to this. Only those are worth
	 * pointing at: a wrapper like a whole job block is what the pointer lands on
	 * every time it crosses the seam between two children, and outlining one of
	 * those — or pulling the editor to its opening line — over a 1px gap makes
	 * both panes jump for nothing.
	 * @param {Element} el
	 */
	function hasOwnText(el) {
		const walk = document.createTreeWalker(
			el,
			NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
			(node) =>
				node.nodeType === Node.TEXT_NODE
					? node.nodeValue?.trim()
						? NodeFilter.FILTER_ACCEPT
						: NodeFilter.FILTER_SKIP
					: /** @type {Element} */ (node).hasAttribute("data-src")
						? NodeFilter.FILTER_REJECT // that element's text, not this one's
						: NodeFilter.FILTER_SKIP,
		);
		return walk.nextNode() !== null;
	}

	/**
	 * The source line behind a `data-src` path, or 0 when nothing in the map
	 * covers it.
	 * @param {string | null} path
	 */
	function lineForPath(path) {
		while (path) {
			const line = srcLines?.get(path);
			if (line) return line;
			const cut = path.lastIndexOf(".");
			path = cut < 0 ? null : path.slice(0, cut);
		}
		return 0;
	}

	/** @param {Event} e */
	function onPreviewOver(e) {
		// Content sliding under a still pointer fires these as well as real
		// pointer moves do, and following one would haul the editor off wherever
		// the scroll just put it.
		if (previewMoving()) return;
		const hit = srcTarget(e);
		if (hit?.el === hoverEl) return;
		markHover(hit?.el ?? null);
		if (hit?.line && !sourceHidden) {
			// Its own scroll, not one to mirror back into the preview.
			editor?.revealLine(hit.line);
			hush("editor");
		}
	}

	function onPreviewLeave() {
		markHover(null);
		editor?.clearPeek();
	}

	/** @param {MouseEvent} e */
	function onPreviewClick(e) {
		if (sourceHidden) return;
		// A tap that lands while the page is still moving was aimed at whatever
		// was under the pointer a moment ago — let the scroll finish instead.
		if (previewMoving()) return;
		// Leave a link's own click alone, and don't yank focus out of a selection
		// the user is in the middle of making.
		if (e.target instanceof Element && e.target.closest("a")) return;
		if (window.getSelection()?.isCollapsed === false) return;
		const hit = srcTarget(e);
		if (!hit?.line) return;
		editor?.revealLine(hit.line, { focus: true });
		// `revealLine` takes focus, which would otherwise hand the editor the wheel.
		takeOver("preview");
		hush("editor");
	}

	/** @param {Element | null} el */
	function markHover(el) {
		hoverEl?.classList.remove("src-hover");
		hoverEl = el;
		hoverEl?.classList.add("src-hover");
	}

	/* ── Scroll sync ───────────────────────────────────────────────────────────
	   The two panes show one document at wildly different densities, so nothing
	   as simple as a shared percentage lines them up. The `data-src` map is the
	   converter: every element that carries one pairs a preview offset with a
	   source line, and a position in either pane is read off that ladder by
	   interpolating between the two rungs it falls between. */

	/** Rungs of the ladder — preview offset ↔ source line, ascending in both. */
	let anchors = /** @type {{ y: number, line: number }[]} */ ([]);
	/** Every `data-src` element by source line, for pulling one thing into view. */
	let byLine = /** @type {{ line: number, el: Element }[]} */ ([]);
	/** The ladder is measured from the DOM, so a reflow invalidates it. */
	let anchorsStale = true;
	/** The pane the user is driving. The other one follows and never drives back. */
	let scrollMaster = /** @type {"editor" | "preview" | null} */ (null);
	/** Per pane: until when its scroll events are our doing rather than the user's. */
	const quiet = { editor: 0, preview: 0 };
	/** When the preview last moved, whichever pane set it off. */
	let previewMovedAt = 0;
	/** A line the user just typed on, waiting for the preview to be re-rendered. */
	let pendingEditLine = 0;

	/** @param {"editor" | "preview"} pane */
	const hush = (pane) => (quiet[pane] = performance.now() + SYNC_QUIET_MS);

	/** @param {"editor" | "preview"} pane */
	const hushed = (pane) => performance.now() < quiet[pane];

	/** Whether the preview is still moving under the pointer, tail included. */
	const previewMoving = () => performance.now() < previewMovedAt + POINTER_SETTLE_MS;

	/** The user reached for a pane: it drives from here, and stops being hushed. */
	const takeOver = (/** @type {"editor" | "preview"} */ pane) => {
		scrollMaster = pane;
		quiet[pane] = 0;
	};

	/** Both panes are about to be rearranged by the app — sit the move out. */
	function holdSync() {
		quiet.editor = quiet.preview = performance.now() + SYNC_HOLD_MS;
	}

	/**
	 * Re-measure the ladder. Sorting by offset gives the order the reader sees;
	 * the sidebar layout then breaks the line order, since its rail column sits
	 * beside the main one rather than after it. Keeping the longest increasing
	 * run drops the shorter column, rather than letting one stray rail heading
	 * swallow everything below it.
	 */
	function buildAnchors() {
		anchorsStale = false;
		anchors = [];
		byLine = [];
		if (!previewPane || !cvRoot || !srcLines) return;
		const origin = previewPane.getBoundingClientRect().top - previewPane.scrollTop;
		/** @type {{ y: number, line: number, el: Element }[]} */
		const found = [];
		for (const el of cvRoot.querySelectorAll("[data-src]")) {
			const line = lineForPath(el.getAttribute("data-src"));
			if (!line) continue;
			const box = el.getBoundingClientRect();
			if (!box.height) continue; // not laid out — a print-only or empty node
			found.push({ y: box.top - origin, line, el });
		}
		found.sort((a, b) => a.y - b.y || a.line - b.line);
		// Sorted by offset first, so ties keep the outermost element and the
		// binary search below lands on the innermost — the one worth scrolling to.
		byLine = found
			.map(({ line, el }) => ({ line, el }))
			.sort((a, b) => a.line - b.line);

		// One rung per offset: interpolation needs both axes strictly increasing.
		const rungs = found.filter((a, i) => i === 0 || a.y > found[i - 1].y);
		for (const i of longestRun(rungs.map((a) => a.line)))
			anchors.push({ y: rungs[i].y, line: rungs[i].line });
	}

	/**
	 * Indices of the longest strictly increasing run in `values`, by patience
	 * sorting — so an out-of-order stretch costs its own length and no more.
	 * @param {number[]} values
	 * @returns {number[]}
	 */
	function longestRun(values) {
		/** Index of the smallest tail seen for a run of each length. */
		const tails = /** @type {number[]} */ ([]);
		const prev = /** @type {number[]} */ (new Array(values.length).fill(-1));
		for (let i = 0; i < values.length; i++) {
			let lo = 0;
			let hi = tails.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (values[tails[mid]] < values[i]) lo = mid + 1;
				else hi = mid;
			}
			if (lo > 0) prev[i] = tails[lo - 1];
			tails[lo] = i;
		}
		/** @type {number[]} */
		const out = [];
		for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i])
			out.push(i);
		return out.reverse();
	}

	/**
	 * Index of the last rung at or before `value` on the given axis.
	 * @param {"y" | "line"} axis
	 * @param {number} value
	 */
	function rungBefore(axis, value) {
		let lo = 0;
		let hi = anchors.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (anchors[mid][axis] <= value) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	/** Preview offset → source line. Past either end the nearest rung pair carries on. */
	function lineAtOffset(/** @type {number} */ y) {
		const i = Math.min(rungBefore("y", y), anchors.length - 2);
		const a = anchors[i];
		const b = anchors[i + 1];
		return a.line + ((y - a.y) / (b.y - a.y)) * (b.line - a.line);
	}

	/** Source line → preview offset — the same ladder read the other way. */
	function offsetAtLine(/** @type {number} */ line) {
		const i = Math.min(rungBefore("line", line), anchors.length - 2);
		const a = anchors[i];
		const b = anchors[i + 1];
		return a.y + ((line - a.line) / (b.line - a.line)) * (b.y - a.y);
	}

	/** Whether there is a usable ladder to read, measuring it first if it went stale. */
	function ladderReady() {
		if (sourceHidden || !previewPane) return false;
		if (anchorsStale) buildAnchors();
		return anchors.length > 1;
	}

	/**
	 * The preview moved — put the line behind its top edge at the top of the
	 * editor. The timestamp is taken whoever caused the move, sync included,
	 * since the pointer has to sit out our scrolls as much as the user's.
	 */
	function onPreviewScroll() {
		previewMovedAt = performance.now();
		if (scrollMaster !== "preview" || hushed("preview") || !ladderReady()) return;
		hush("editor");
		const max = previewPane.scrollHeight - previewPane.clientHeight;
		if (previewPane.scrollTop <= 1) editor?.scrollToEdge("start");
		else if (previewPane.scrollTop >= max - 1) editor?.scrollToEdge("end");
		else editor?.scrollToLine(lineAtOffset(previewPane.scrollTop + PREVIEW_TOP_MARGIN));
	}

	/** The editor moved — bring what its top line renders to the top of the preview. */
	function onEditorScroll() {
		if (scrollMaster !== "editor" || hushed("editor") || !ladderReady()) return;
		const line = editor?.topLine();
		if (line == null) return;
		const edge = editor?.scrollEdge();
		hush("preview");
		if (edge === "start") previewPane.scrollTop = 0;
		else if (edge === "end") previewPane.scrollTop = previewPane.scrollHeight;
		else previewPane.scrollTop = offsetAtLine(line) - PREVIEW_TOP_MARGIN;
	}

	/**
	 * The user typed. The preview is a debounced re-render behind, so the line is
	 * only remembered here; `revealEdit` acts on it once the new DOM is up.
	 * @param {number} line
	 */
	function noteEdit(line) {
		pendingEditLine = line;
		takeOver("editor");
	}

	/**
	 * Pull the part of the CV a fresh edit produced into view. Only when it isn't
	 * already comfortably on screen — typing in the middle of a visible paragraph
	 * shouldn't shunt the page about.
	 * @param {number} line
	 */
	async function revealEdit(line) {
		pendingEditLine = 0;
		await tick();
		if (sourceHidden || cv.isViewingHistory || !previewPane) return;
		buildAnchors();
		const el = elementForLine(line);
		if (!el) return;
		const box = el.getBoundingClientRect();
		const pane = previewPane.getBoundingClientRect();
		if (box.top >= pane.top + PREVIEW_TOP_MARGIN && box.bottom <= pane.bottom) return;
		hush("preview");
		previewPane.scrollTop += box.top - pane.top - EDIT_REVEAL_MARGIN;
	}

	/** The rendered element for a source line — the innermost one at or before it. */
	function elementForLine(/** @type {number} */ line) {
		if (!byLine.length) return null;
		let lo = 0;
		let hi = byLine.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (byLine[mid].line <= line) lo = mid;
			else hi = mid - 1;
		}
		return byLine[lo].el;
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			if (cv.isViewingHistory) {
				toast("Editing is paused while viewing history");
				return;
			}
			cv.checkpoint("");
			toast("Version saved");
		}
	}

	/** @param {string} id */
	function setLayout(id) {
		if (files.activeId) files.setStyle(files.activeId, { layout: id });
	}

	/** @param {string} id */
	function setTheme(id) {
		if (files.activeId) files.setStyle(files.activeId, { theme: id });
	}

	function toggleTheme() {
		const next =
			document.documentElement.getAttribute("data-theme") === "dark"
				? "light"
				: "dark";
		document.documentElement.setAttribute("data-theme", next);
		write(KEYS.theme, next);
	}

	async function toggleHistory() {
		historyOpen = !historyOpen;
		write(KEYS.historyOpen, String(historyOpen));
		await tick();
	}

	function toggleSource() {
		sourceHidden = !sourceHidden;
		write(KEYS.sourceHidden, String(sourceHidden));
	}

	/** Open a fresh tab holding the shipped template — no snapshot yet, so `CvDoc` seeds one. */
	function newFile() {
		const id = files.create();
		cv.switchTo(id);
		toast("New CV from template");
	}

	function copyYaml() {
		navigator.clipboard
			.writeText(cv.yaml)
			.then(() => toast("YAML copied to clipboard"))
			.catch(() => toast("Copy failed — try Ctrl+A, Ctrl+C"));
	}

	function exportPDF() {
		if (parseError) {
			toast("Fix YAML errors before exporting");
			return;
		}
		// Tagged before printing, so the mark in the history sits on exactly the
		// version that goes to the printer.
		cv.markExport();
		window.print();
	}

	/** @param {string} id */
	function selectTab(id) {
		if (id === files.activeId) return;
		files.switchTo(id);
		cv.switchTo(id);
	}

	function duplicateTab() {
		cv.flush(); // capture the latest edits before copying the stored snapshot
		const id = files.duplicate(/** @type {string} */ (files.activeId));
		cv.switchTo(id);
		toast("Tab duplicated");
	}

	/** @param {string} id */
	function closeTab(id) {
		const closingActive = id === files.activeId;
		const name = files.files.find((f) => f.id === id)?.name ?? "File";
		const nextId = files.trash(id);
		if (closingActive) cv.switchTo(nextId);
		toast(`Moved “${name}” to trash`);
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	function renameTab(id, name) {
		files.rename(id, name);
	}

	function toggleTrash() {
		trashOpen = !trashOpen;
	}

	/** @param {string} id */
	function restoreTab(id) {
		files.restore(id);
		cv.switchTo(id);
		toast("Restored from trash");
	}

	/** @param {string} id */
	function purgeTab(id) {
		if (!confirm("Delete this file forever? This cannot be undone.")) return;
		files.purge(id);
		toast("File deleted forever");
	}

	function emptyTrash() {
		if (!files.trashed.length) return;
		if (
			!confirm(
				`Permanently delete ${files.trashed.length} file(s) from trash? This cannot be undone.`,
			)
		)
			return;
		for (const f of files.trashed) files.purge(f.id);
		toast("Trash emptied");
	}

	/** @param {string} msg */
	function toast(msg) {
		toastMsg = msg;
		toastOn = true;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastOn = false), 2200);
	}

	/** @param {number} pct */
	function setWidth(pct) {
		editorWidth = `${Math.min(78, Math.max(18, pct))}%`;
	}

	/** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
	function startDrag(e) {
		dragging = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		document.body.classList.add("resizing");
	}

	/** @param {PointerEvent} e */
	function onDrag(e) {
		if (!dragging) return;
		const rect = split.getBoundingClientRect();
		setWidth(((e.clientX - rect.left) / rect.width) * 100);
	}

	/** @param {PointerEvent & { currentTarget: HTMLButtonElement }} e */
	function endDrag(e) {
		if (!dragging) return;
		dragging = false;
		e.currentTarget.releasePointerCapture(e.pointerId);
		document.body.classList.remove("resizing");
		if (editorWidth) write(KEYS.editorWidth, editorWidth);
	}

	/** @param {KeyboardEvent} e */
	function onDividerKey(e) {
		const step = e.key === "ArrowLeft" ? -2 : e.key === "ArrowRight" ? 2 : 0;
		if (!step) return;
		e.preventDefault();
		const current =
			(split.querySelector("#editor-pane")?.clientWidth ?? 0) /
			split.clientWidth;
		setWidth(current * 100 + step);
		if (editorWidth) write(KEYS.editorWidth, editorWidth);
	}
</script>

<svelte:head>
	<title>CV Editor</title>
</svelte:head>

<div id="app">
	<Toolbar
		valid={!parseError}
		{saveLabel}
		{historyOpen}
		historyCount={cv.history.length}
		{sourceHidden}
		{layout}
		{theme}
		onLayout={setLayout}
		onTheme={setTheme}
		onToggleTheme={toggleTheme}
		onToggleHistory={toggleHistory}
		onToggleSource={toggleSource}
	/>

	<TabBar
		{files}
		onSelect={selectTab}
		onDuplicate={duplicateTab}
		onClose={closeTab}
		onRename={renameTab}
		{trashOpen}
		onToggleTrash={toggleTrash}
		onNew={newFile}
		onCopy={copyYaml}
		onExport={exportPDF}
	/>

	{#if trashOpen}
		<TrashPanel
			{files}
			onRestore={restoreTab}
			onPurge={purgeTab}
			onEmpty={emptyTrash}
			onClose={toggleTrash}
		/>
	{/if}

	<!-- The drag width rides on a custom property rather than the pane's own
	     `width`, so the stacked (narrow-screen) layout can ignore it in CSS. -->
	<div id="split" bind:this={split} style:--editor-w={editorWidth}>
		<div id="editor-pane" bind:this={editorPane} class:hidden={sourceHidden}>
			{#if cv.ready}
				<!-- Re-keyed when the document is swapped (history cleared, or another
				     tab's document taken over): the binding is tied to one LoroDoc. -->
				{#key cv.docId}
					<YamlEditor
						bind:this={editor}
						loroExtensions={cv.extensions}
						readOnly={cv.isViewingHistory}
						diff={cv.diff}
						onScroll={onEditorScroll}
						onEdit={noteEdit}
					/>
				{/key}
			{:else}
				<div id="boot">Loading editor…</div>
			{/if}
		</div>

		<button
			type="button"
			id="divider"
			class:hidden={sourceHidden}
			aria-label="Resize editor pane — use the arrow keys"
			onpointerdown={startDrag}
			onpointermove={onDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			onkeydown={onDividerKey}
		></button>

		<div id="preview-pane" bind:this={previewPane}>
			{#if cv.isViewingHistory}
				{@const entry = cv.viewingEntry}
				<div id="detached-banner">
					<span>Viewing “{entry?.message}” — editing is paused</span>
					<div class="t-spacer"></div>
					{#if entry}
						<button class="t-btn" onclick={() => cv.restore(entry)}
							>Restore</button
						>
					{/if}
					<button class="t-btn" onclick={() => cv.viewLatest()}
						>Back to latest</button
					>
				</div>
			{:else if parseError}
				<div id="error-banner">⚠ {parseError}</div>
			{/if}
			<div
				id="cv-root"
				bind:this={cvRoot}
				data-cv-layout={layout}
				data-cv-theme={theme}
			>
				<svelte:boundary>
					{#if parsed}
						<CvSheet cv={parsed} {layout} />
					{/if}
					{#snippet failed(error)}
						<div class="sheet">
							<p class="cv-unknown">
								Could not render: {error instanceof Error
									? error.message
									: String(error)}
							</p>
						</div>
					{/snippet}
				</svelte:boundary>
			</div>
		</div>

		{#if historyOpen && cv.ready}
			<HistoryPanel doc={cv} {toast} />
		{/if}
	</div>
</div>

<div id="toast" class:show={toastOn}>{toastMsg}</div>
