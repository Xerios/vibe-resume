import { load } from 'js-yaml';
import { marked } from 'marked';

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

/**
 * Inline Markdown → HTML. Links get target/rel, which marked won't add itself.
 * @param {unknown} text
 */
const md = (text) => {
	if (!text) return '';
	const html = marked.parseInline(String(text).trim());
	return String(html).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
};

/**
 * @param {unknown} v
 * @returns {any[]}
 */
const list = (v) => (Array.isArray(v) ? v : []);

/** @param {any} h */
function renderHeader(h = {}) {
	const contactHTML = list(h.contact).map(md).join('<br>');
	return `<header>
    <div>
      <h1 class="name">${md(h.name)}</h1>
      <p class="role">${md(h.role)}</p>
    </div>
    <div class="contact">${contactHTML}</div>
  </header>`;
}

/** @param {any} sec */
function renderSummary(sec) {
	const paras = list(sec.paragraphs)
		.map((/** @type {any} */ p) => `<p>${md(p)}</p>`)
		.join('');
	return `<section class="summary">
    <div class="sec-head"><h2>${md(sec.title)}</h2><div class="bar"></div></div>
    ${paras}
  </section>`;
}

/** @param {any} sec */
function renderSkills(sec) {
	const blocks = list(sec.blocks)
		.map(
			(/** @type {any} */ b) => `
    <div class="skill-block">
      <h3>${md(b.title)}</h3>
      ${list(b.rows)
				.map(
					(/** @type {any} */ r) =>
						`<div class="skill-row">${r.tier ? `<span class="tier">${md(r.tier)}</span> · ` : ''}${md(r.text)}</div>`
				)
				.join('')}
    </div>`
		)
		.join('');
	return `<section>
    <div class="sec-head"><h2>${md(sec.title)}</h2><div class="bar"></div></div>
    <div class="skill-grid">${blocks}</div>
  </section>`;
}

/** @param {any} item */
function renderJob(item) {
	const sideNote = item.sideNote ? ` <span class="side-note">${md(item.sideNote)}</span>` : '';
	const bullets = list(item.bullets)
		.map((/** @type {any} */ b) => `<li>${md(b)}</li>`)
		.join('');
	const stack = item.stack ? `<p class="stack"><b>STACK</b> · ${md(item.stack)}</p>` : '';
	return `<div class="job">
    <div class="job-head">
      <p class="job-title">${md(item.title)} <span class="co">| ${md(item.company)}</span>${sideNote}</p>
      <span class="job-dates">${md(item.dates)}</span>
    </div>
    <p class="job-sub">${md(item.sub)}</p>
    <ul class="bullets">${bullets}</ul>
    ${stack}
  </div>`;
}

/** @param {any} item */
function renderEarlier(item) {
	return `<div class="job earlier">
    <h3>${md(item.title)}</h3>
    <ul class="bullets">${list(item.items)
			.map((/** @type {any} */ i) => `<li>${md(i)}</li>`)
			.join('')}</ul>
  </div>`;
}

/** @param {any} sec */
function renderExperience(sec) {
	const items = list(sec.items)
		.map((/** @type {any} */ i) => (i.subtype === 'earlier' ? renderEarlier(i) : renderJob(i)))
		.join('');
	return `<section>
    <div class="sec-head"><h2>${md(sec.title)}</h2><div class="bar"></div></div>
    ${items}
  </section>`;
}

/** @param {any} sec */
function renderOSS(sec) {
	const thead = sec.hasHeader
		? `<thead><tr><th>Project</th><th>Stars / Users</th><th>Description</th></tr></thead>`
		: '';
	const rows = list(sec.projects)
		.map(
			(/** @type {any} */ p) => `<tr>
    <td class="proj">${md(p.name)}</td>
    <td class="stars">${md(p.stars)}</td>
    <td>${md(p.desc)}</td>
  </tr>`
		)
		.join('');
	return `<section>
    <div class="sec-head"><h2>${md(sec.title)}</h2><div class="bar"></div></div>
    <table class="oss">${thead}<tbody>${rows}</tbody></table>
  </section>`;
}

/** @param {any} sec */
function renderSection(sec) {
	if (!sec || typeof sec !== 'object') return '';
	switch (sec.type) {
		case 'summary':
			return renderSummary(sec);
		case 'skills':
			return renderSkills(sec);
		case 'experience':
			return renderExperience(sec);
		case 'oss':
			return renderOSS(sec);
		default:
			return `<p class="cv-unknown">Unknown section type: ${md(sec.type)}</p>`;
	}
}

/**
 * Build the full CV sheet markup.
 * @param {any} cv parsed YAML document
 * @returns {string} HTML
 */
export function buildCV(cv) {
	return `<div class="sheet">
    ${renderHeader(cv.header)}
    ${list(cv.sections).map(renderSection).join('')}
  </div>`;
}
