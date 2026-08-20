/**
 * localStorage plumbing. The Loro snapshot is binary, so it is base64-encoded
 * before it goes in; everything else is a plain string.
 */

export const KEYS = {
	snapshot: 'cv-editor:snapshot:v1',
	theme: 'cv-theme',
	editorWidth: 'cv-editor:width',
	historyOpen: 'cv-editor:history-open',
	sourceHidden: 'cv-editor:source-hidden'
};

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
	let binary = '';
	const CHUNK = 0x8000; // stay under the argument limit of String.fromCharCode
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/** @param {string} b64 */
export function base64ToBytes(b64) {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

/**
 * @param {string} key
 * @param {string | null} [fallback]
 */
export function read(key, fallback = null) {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback; // private mode / storage disabled
	}
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} false when the write was rejected (quota, disabled storage)
 */
export function write(key, value) {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

/** @param {string} key */
export function remove(key) {
	try {
		localStorage.removeItem(key);
	} catch {
		/* nothing to do */
	}
}

/** @param {number} bytes */
export function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
