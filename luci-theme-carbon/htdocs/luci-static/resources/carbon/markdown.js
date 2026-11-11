'use strict';
'require baseclass';

/*
 * Release notes → HTML, for the Carbon settings page.
 *
 * A small Markdown subset that covers what release notes use: headings
 * (ATX and setext), paragraphs, bullet and ordered lists (nested, tight or
 * loose), block quotes, fenced code, tables, rules, and inline code,
 * strong / em / strikethrough, links (inline, reference, <autolink>, bare
 * URLs), images and hard breaks.
 *
 * Release notes are untrusted text. Every character of output text goes
 * through esc(), raw HTML stays text, and only http(s) and mailto links
 * survive, resolved against the project rather than the router.
 */

const repository = 'https://github.com/mrjoechen/luci-theme-carbon/blob/main/';
const MAX_DEPTH = 16;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function safeURL(value, image) {
	try {
		/* control characters, encoded or not, and character references hide schemes */
		if (typeof value !== 'string' || /[\x00-\x1f\x7f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)|&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) return null;
		const url = new URL(value, repository);
		return /^(https?:|mailto:)$/.test(url.protocol) && (!image || url.protocol !== 'mailto:') ? url.href : null;
	}
	catch (e) { return null; }
}

/* ---- inline ----------------------------------------------------------- */

const DEST = /\(\s*<?([^\s<>()]*)>?(?:\s+"([^"]*)")?\s*\)/.source;
const LABEL = /\[((?:[^\[\]\\]|\\.|\[[^\]]*\])*)\]/.source;

function link(env, href, text, title, raw) {
	const url = safeURL(href, false);
	if (!url) return esc(raw);
	return '<a href="' + esc(url) + '"' + (title ? ' title="' + esc(title) + '"' : '') +
		' target="_blank" rel="noopener noreferrer">' + text + '</a>';
}

function image(src, alt, title) {
	const url = safeURL(src, true);
	if (!url) return esc(alt);
	return '<img src="' + esc(url) + '" alt="' + esc(alt) + '"' + (title ? ' title="' + esc(title) + '"' : '') +
		' loading="lazy" referrerpolicy="no-referrer">';
}

/* Tried in order at each position (sticky regexes). A handler may return
   null to decline, e.g. an unknown reference label. */
const INLINE = [
	[/\\([!-\/:-@\[-`{-~])/y, (m) => esc(m[1])],
	[/(`+)([\s\S]*?[^`])\1(?!`)/y, (m) => '<code>' + esc(m[2].replace(/^ ([\s\S]*[^ ][\s\S]*) $/, '$1')) + '</code>'],
	[new RegExp('!' + LABEL + DEST, 'y'), (m) => image(m[2], m[1], m[3])],
	[new RegExp(LABEL + DEST, 'y'), (m, env) => link(env, m[2], inline(m[1], env), m[3], m[0])],
	[new RegExp(LABEL + /\[([^\]]*)\]/.source, 'y'), (m, env) => {
		const ref = env.refs[label(m[2] || m[1])];
		return ref ? link(env, ref.href, inline(m[1], env), ref.title, m[0]) : null;
	}],
	[/<((?:https?:\/\/|mailto:)[^\s<>]+)>/y, (m, env) => link(env, m[1], esc(m[1]), '', m[0])],
	[/https?:\/\/[^\s<]*[^\s<.,:;"')\]!?*_~]/y, (m, env, prev) => /\w/.test(prev) ? null : link(env, m[0], esc(m[0]), '', m[0])],
	[/(\*\*|__)(?=\S)([\s\S]*?\S)\1/y, (m, env, prev) => m[1] === '__' && /\w/.test(prev) ? null : '<strong>' + inline(m[2], env) + '</strong>'],
	[/~~(?=\S)([\s\S]*?\S)~~/y, (m, env) => '<s>' + inline(m[1], env) + '</s>'],
	[/\*(?=[^\s*])([\s\S]*?[^\s*])\*/y, (m, env) => '<em>' + inline(m[1], env) + '</em>'],
	[/_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/y, (m, env, prev) => /\w/.test(prev) ? null : '<em>' + inline(m[1], env) + '</em>'],
	[/ {2,}\n|\\\n/y, () => '<br>\n']
];
const PLAIN = /[^\\`!\[<*_~h \n]+|[\s\S]/y;

function inline(text, env) {
	let out = '', pos = 0;
	scan: while (pos < text.length) {
		for (const [re, render] of INLINE) {
			re.lastIndex = pos;
			const m = re.exec(text);
			if (!m) continue;
			/* read the end first: rendering nested text reuses these regexes */
			const end = re.lastIndex;
			const html = render(m, env, text.charAt(pos - 1));
			if (html != null) { out += html; pos = end; continue scan; }
		}
		PLAIN.lastIndex = pos;
		const m = PLAIN.exec(text);
		out += esc(m[0]);
		pos = PLAIN.lastIndex;
	}
	return out;
}

/* ---- blocks ----------------------------------------------------------- */

const RE = {
	blank: /^\s*$/,
	fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([\w+-]*)[^`]*$/,
	heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
	setext: /^ {0,3}(=+|-+)[ \t]*$/,
	rule: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
	quote: /^ {0,3}> ?/,
	item: /^ {0,3}([-*+]|\d{1,9}[.)])(?:[ \t]+|$)/,
	ref: /^ {0,3}\[([^\]]+)\]:[ \t]*<?(\S+?)>?(?:[ \t]+["'(](.*)["')])?[ \t]*$/,
	tableRule: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
};
const label = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const startsBlock = (line) => RE.blank.test(line) || RE.fence.test(line) || RE.heading.test(line) ||
	RE.rule.test(line) || RE.quote.test(line) || RE.item.test(line);
/* table cells; an escaped \| stays inside its cell */
const cells = (line) => line.trim().replace(/\\\|/g, '\0').replace(/^\|/, '').replace(/\|$/, '')
	.split('|').map((c) => c.replace(/\0/g, '\\|').trim());

function fence(lines, i, out) {
	const open = RE.fence.exec(lines[i]), indent = open[1].length, mark = open[2];
	const close = new RegExp('^ {0,3}' + mark[0] + '{' + mark.length + ',}[ \\t]*$');
	const body = [];
	for (i++; i < lines.length && !close.test(lines[i]); i++)
		body.push(lines[i].replace(new RegExp('^ {0,' + indent + '}'), ''));
	out.push('<pre><code' + (open[3] ? ' class="language-' + esc(open[3]) + '"' : '') + '>' +
		esc(body.join('\n') + (body.length ? '\n' : '')) + '</code></pre>');
	return i + 1;
}

function table(lines, i, out, env) {
	const head = cells(lines[i]);
	const align = cells(lines[i + 1]).map((c) => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
	const row = (tag, values) => '<tr>\n' + head.map((_, k) =>
		'<' + tag + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + inline(values[k] || '', env) + '</' + tag + '>\n').join('') + '</tr>\n';
	let html = '<table>\n<thead>\n' + row('th', head) + '</thead>\n';
	const body = [];
	for (i += 2; i < lines.length && !RE.blank.test(lines[i]) && lines[i].includes('|') && !startsBlock(lines[i]); i++)
		body.push(row('td', cells(lines[i])));
	if (body.length) html += '<tbody>\n' + body.join('') + '</tbody>\n';
	out.push(html + '</table>');
	return i;
}

function quote(lines, i, out, env, depth) {
	const body = [];
	for (; i < lines.length; i++) {
		if (RE.quote.test(lines[i])) body.push(lines[i].replace(RE.quote, ''));
		else if (body.length && !RE.blank.test(body[body.length - 1]) && !startsBlock(lines[i])) body.push(lines[i]);
		else break;
	}
	out.push('<blockquote>\n' + blocks(body, env, depth + 1, false) + '\n</blockquote>');
	return i;
}

function list(lines, i, out, env, depth) {
	const first = RE.item.exec(lines[i]);
	const ordered = /\d/.test(first[1]), marker = first[1].slice(-1);
	const items = [];
	let loose = false;
	while (i < lines.length) {
		const m = RE.item.exec(lines[i]);
		if (!m || /\d/.test(m[1]) !== ordered || m[1].slice(-1) !== marker || RE.rule.test(lines[i])) break;
		const indent = m[0].length;
		const body = [lines[i].slice(indent)];
		let blank = false;
		for (i++; i < lines.length; i++) {
			const line = lines[i];
			if (RE.blank.test(line)) { blank = true; body.push(''); continue; }
			if (line.match(/^ */)[0].length >= indent) { body.push(line.slice(indent)); blank = false; continue; }
			if (blank || startsBlock(line)) break;
			body.push(line.replace(/^ +/, ''));         /* lazy continuation */
		}
		while (body.length && RE.blank.test(body[body.length - 1])) body.pop();
		/* a blank line inside an item or between items makes the list loose (<p> per item) */
		if (body.some((l) => RE.blank.test(l))) loose = true;
		items.push(body);
		if (blank && i < lines.length && RE.item.test(lines[i])) loose = true;
	}
	const tag = ordered ? 'ol' : 'ul', start = ordered ? parseInt(first[1], 10) : 1;
	out.push('<' + tag + (start !== 1 ? ' start="' + start + '"' : '') + '>\n' +
		items.map((body) => '<li>' + blocks(body, env, depth + 1, !loose) + '</li>\n').join('') + '</' + tag + '>');
	return i;
}

function blocks(lines, env, depth, tight) {
	const out = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (RE.blank.test(line)) { i++; continue; }
		if (depth < MAX_DEPTH) {
			if (RE.fence.test(line)) { i = fence(lines, i, out); continue; }
			if (RE.quote.test(line)) { i = quote(lines, i, out, env, depth); continue; }
			if (RE.rule.test(line)) { out.push('<hr>'); i++; continue; }
			if (RE.item.test(line)) { i = list(lines, i, out, env, depth); continue; }
			if (line.includes('|') && i + 1 < lines.length && RE.tableRule.test(lines[i + 1]) && cells(line).length === cells(lines[i + 1]).length) { i = table(lines, i, out, env); continue; }
		}
		const h = RE.heading.exec(line);
		if (h) { out.push('<h' + h[1].length + '>' + inline(h[2] || '', env) + '</h' + h[1].length + '>'); i++; continue; }
		/* paragraph, or a setext heading when underlined */
		/* lines keep trailing spaces: two of them mean a hard break */
		const para = [line.replace(/^ +/, '')];
		for (i++; i < lines.length && !startsBlock(lines[i]) && !RE.setext.test(lines[i]); i++) para.push(lines[i].replace(/^ +/, ''));
		const setext = i < lines.length && RE.setext.exec(lines[i]);
		if (setext && !RE.blank.test(lines[i])) {
			const level = setext[1][0] === '=' ? 1 : 2;
			out.push('<h' + level + '>' + inline(para.join('\n').trim(), env) + '</h' + level + '>');
			i++;
			continue;
		}
		const html = inline(para.join('\n').replace(/\s+$/, ''), env);
		out.push(tight ? html : '<p>' + html + '</p>');
	}
	return out.join('\n');
}

function render(text) {
	const env = { refs: {} };
	const lines = [];
	let fenced = null;
	String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').forEach((line) => {
		const f = RE.fence.exec(line);
		if (fenced) { if (f && f[2][0] === fenced[0] && f[2].length >= fenced.length) fenced = null; }
		else if (f) fenced = f[2];
		else {
			/* reference definitions anywhere outside code */
			const r = RE.ref.exec(line);
			if (r && !env.refs[label(r[1])]) { env.refs[label(r[1])] = { href: r[2], title: r[3] || '' }; return; }
		}
		lines.push(line);
	});
	const html = blocks(lines, env, 0, false);
	return html ? html + '\n' : '';
}

return baseclass.extend({ render: render });
