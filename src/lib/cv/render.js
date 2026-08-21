import { EVENT_ID, getScalarValue, load, parseEvents } from 'js-yaml';

/**
 * Parse the editor's YAML into a CV object, plus the map that ties every value
 * back to the line it came from (see `buildLineMap`).
 * @param {string} yaml
 * @returns {{ cv: any, lines: Map<string, number>, error: null } | { cv: null, lines: null, error: string }}
 */
export function parseCv(yaml) {
	try {
		const cv = load(yaml);
		if (!cv || typeof cv !== 'object') return { cv: null, lines: null, error: 'Document is empty' };
		return { cv, lines: buildLineMap(yaml), error: null };
	} catch (e) {
		return { cv: null, lines: null, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Map every node in the document to the source line it starts on, keyed by its
 * dotted path — `sections.2.items.0.bullets.1`. CvSheet stamps those same paths
 * onto the elements it renders as `data-src`, which is what lets the preview
 * point back at the YAML behind whatever the pointer is on.
 *
 * The parser's event stream is what carries source offsets; `load` alone hands
 * back plain objects with nothing left of where they came from. Walking the
 * events costs one extra parse of a few kilobytes, so it rides along with the
 * ordinary parse rather than being computed on demand.
 *
 * A mapping entry is placed on its *key*: `title: Summary` and a `bullets:`
 * block both want the line you'd click to edit them, not wherever the value
 * happens to begin.
 *
 * @param {string} text
 * @returns {Map<string, number>} path → 1-based line
 */
function buildLineMap(text) {
	/** @type {Map<string, number>} */
	const map = new Map();
	/** @type {import('js-yaml').Event[]} */
	let events;
	try {
		events = parseEvents(text, {});
	} catch {
		return map; // a document `load` accepted shouldn't land here, but a half-typed one might
	}

	const lineAt = lineIndex(text);
	/** Open collections, innermost last. `key: null` in a mapping means "the next node is a key". */
	const stack = /** @type {{ kind: number, path: string | null, index: number, key: string | null, keyStart: number }[]} */ ([]);

	for (const ev of events) {
		if (ev.type === EVENT_ID.DOCUMENT) {
			stack.push({ kind: EVENT_ID.DOCUMENT, path: '', index: 0, key: null, keyStart: 0 });
			continue;
		}
		if (ev.type === EVENT_ID.POP) {
			stack.pop();
			continue;
		}

		// Everything else opens a value: sequence, mapping, scalar or alias.
		const top = stack[stack.length - 1];
		let start =
			ev.type === EVENT_ID.SCALAR
				? ev.valueStart
				: ev.type === EVENT_ID.ALIAS
					? ev.anchorStart
					: ev.start;
		/** Where this value sits, or null when it isn't addressable (a key, or nested under one). */
		let path = null;

		if (!top || top.kind === EVENT_ID.DOCUMENT) {
			path = '';
		} else if (top.kind === EVENT_ID.SEQUENCE) {
			path = top.path === null ? null : join(top.path, top.index);
			top.index++;
		} else if (top.key === null) {
			// A key. Remember its text and line; the value that follows claims both.
			top.key = ev.type === EVENT_ID.SCALAR ? getScalarValue(text, ev) : '';
			top.keyStart = start;
		} else {
			path = top.path === null || top.key === '' ? null : join(top.path, top.key);
			start = top.keyStart;
			top.key = null;
		}

		if (path !== null && !map.has(path)) map.set(path, lineAt(start));
		if (ev.type === EVENT_ID.SEQUENCE || ev.type === EVENT_ID.MAPPING)
			stack.push({ kind: ev.type, path, index: 0, key: null, keyStart: 0 });
	}
	return map;
}

/**
 * @param {string} base
 * @param {string | number} segment
 */
const join = (base, segment) => (base ? `${base}.${segment}` : String(segment));

/**
 * Character offset → 1-based line number, by binary search over line starts.
 * @param {string} text
 */
function lineIndex(text) {
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
	return (/** @type {number} */ offset) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}
