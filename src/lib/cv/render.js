import { load } from 'js-yaml';

/**
 * Parse the editor's YAML into a CV object.
 * @param {string} yaml
 * @returns {{ cv: any, error: null } | { cv: null, error: string }}
 */
export function parseCv(yaml) {
	try {
		const cv = load(yaml);
		if (!cv || typeof cv !== 'object') return { cv: null, error: 'Document is empty' };
		return { cv, error: null };
	} catch (e) {
		return { cv: null, error: e instanceof Error ? e.message : String(e) };
	}
}
