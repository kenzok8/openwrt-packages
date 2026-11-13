'use strict';
'require baseclass';
'require ui';
'require rpc';
'require vantage-theme.host as host';

/*
 * Vantage theme - shell behaviour.
 *
 * Renders the icon rail + flyouts (bottom bar + sheet on phones), the
 * breadcrumb, level-3 page tabs, the Ctrl+K / "/" command palette, the host
 * chip, the theme switch and decorates LuCI's #indicators. Everything here is
 * built from ui.menu (ACL filtered server side) and rpc; the templates stay
 * data-free.
 *
 * DOM rule: LuCI's E()/dom.append() assign a plain string argument to
 * innerHTML, so every piece of text (menu titles, breadcrumbs, palette
 * entries, indicator labels, host chip) is passed inside an array, which
 * dom.append() inserts as text nodes; links are built with L.url() at the
 * point of use. security-tests/check_dom_sinks.js enforces this.
 */

const callBoard = rpc.declare({ object: 'system', method: 'board' });
const callWirelessDevices = rpc.declare({ object: 'luci-rpc', method: 'getWirelessDevices' });

const THEME_KEY = 'vantage.theme';
const RAIL_KEY = 'vantage.rail';
const LOGIN_KEY = 'vantage.login';      /* read by the login page's login.js */
/* the dashboard's network path backdrop (luci-app-vantage view/vantage/overview.js),
   picked here when the dashboard is installed; the dashboard listens for BACKDROP_EVENT */
const BACKDROP_KEY = 'vantage.backdrop.v1';
const BACKDROP_EVENT = 'vantage:backdrop';
/* Low-power router (#101), with the dashboard: it asks for the slow parts
   less often and nothing moves (no backdrop, no flow dots, none on the
   login page either); the dashboard reads data-vt-power and listens for
   POWER_EVENT */
const POWER_EVENT = 'vantage:power';
/* The refresh dot's pulse is a CSS animation; running on the compositor it
   makes the browser draw a frame on every display refresh, sixty a second,
   on every page that polls, for a pulse five seconds long. Paused through
   the Web Animations API and stepped MOTION_MS apart instead, the page
   draws 15 frames a second. The dashboard moves more (its ring, flow dots
   and backdrop) on a clock of its own and sends each tick as MOTION_EVENT:
   while those arrive the dot follows them, so the page still draws one set
   of frames */
const MOTION_MS = 66;
const MOTION_EVENT = 'vantage:tick';
/* Appearance for every browser: saved on the router, in
   /etc/config/vantage_theme (section appearance), by whoever may (rpcd
   group luci-theme-vantage); header.ut and sysauth.ut hand its values over
   as data-vt-look-<name>, and data-vt-look-save says whether this login
   may save: 'yes', 'relogin' (it would at a new login: one from before
   the group existed) or 'no'. A pick made without that right stays in
   this browser (the own key) and wins here, but not for a login that may
   save (those keys are dropped then); this browser's last pick (the old
   key, also what the dashboard reads under another theme) counts until
   the router has one. */
/* this package's version, as its Makefile has it (tests/version.test.js) */
const VERSION = '1.0.20';
/* Check for updates (Appearance): when asked, never on its own, the browser
   reads the project's 24.10 package list on GitHub Pages (the same release
   as 25.12's), without cookies or a referrer. Only a version number passes;
   the link is a constant, to the latest release. */
const UPDATE_INDEX = 'https://anothadev.github.io/luci-theme-vantage/24.10/Packages';
/* the theme's entry in that list; up here, as jsmin reads a "/" right
   after => as a division and drops the space inside it (every packaged
   check before 1.0.18 failed that way) */
const UPDATE_ENTRY = /^Package: luci-theme-vantage$/m;

const LOOK = {
	theme: { own: 'vantage.theme.own', before: THEME_KEY, ok: [ 'auto', 'light', 'dark' ] },
	login: { own: 'vantage.login.own', before: LOGIN_KEY, ok: [ 'grid', 'stars', 'none' ] },
	backdrop: { own: 'vantage.backdrop.own', before: BACKDROP_KEY, ok: [ 'grid', 'stars', 'none' ] },
	power: { own: 'vantage.power.own', before: 'vantage.power', ok: [ 'normal', 'low' ] },
	/* what shows next to the logo; the hostname and model come from system board */
	brand: { own: 'vantage.brand.own', before: 'vantage.brand', ok: [ 'none', 'hostname', 'model' ] }
};
const LOOK_SYNC = 'vantage.look';         /* another tab saved one: { name, value } */
const LOOK_SET_EVENT = 'vantage:backdrop-set';   /* the dashboard's own picker hands its pick over */
/* The dashboard's Customize saves its chart style and layouts with the
   Appearance, in one write when it is done: { values, done(ok) }. The
   template reads them back with these same rules. */
const VIEW_SAVE_EVENT = 'vantage:view-save';
const VIEW_CHARTS = [ 'overlay', 'log', 'mirror', 'mirror-split', 'lanes' ];
const VIEW_LAYOUT = /^(default|[a-z]{1,8}:[0-3]:[1-4](:h)?( [a-z]{1,8}:[0-3]:[1-4](:h)?){0,7})$/;
const callLookSet = rpc.declare({ object: 'uci', method: 'set', params: [ 'config', 'section', 'values' ], reject: true });
const callLookCommit = rpc.declare({ object: 'uci', method: 'commit', params: [ 'config' ], reject: true });
/* While an apply awaits its rollback, rpcd refuses commit and revert alike, but not set: a pick set
   then could not be taken back, and would go out unseen with the next Save & Apply. So a save starts
   with this revert, which has nothing to undo and is refused in just that case. */
const callLookRevert = rpc.declare({ object: 'uci', method: 'revert', params: [ 'config' ], reject: true });

/* 24px stroke icons, drawn for this theme: constant [tag, attributes] lists,
   built with createElementNS (no markup parsing, no user data) */
const ICONS = {
	dashboard: [ [ 'rect', { x: '3.5', y: '3.5', width: '7', height: '9', rx: '1.5' } ], [ 'rect', { x: '13.5', y: '3.5', width: '7', height: '5', rx: '1.5' } ], [ 'rect', { x: '13.5', y: '11.5', width: '7', height: '9', rx: '1.5' } ], [ 'rect', { x: '3.5', y: '15.5', width: '7', height: '5', rx: '1.5' } ] ],
	status: [ [ 'path', { d: 'M3 12h3.5l2.5-6.5 5 13 2.5-6.5H21' } ] ],
	system: [ [ 'rect', { x: '5.5', y: '5.5', width: '13', height: '13', rx: '2' } ], [ 'rect', { x: '9.5', y: '9.5', width: '5', height: '5', rx: '.8' } ], [ 'path', { d: 'M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3' } ] ],
	network: [ [ 'rect', { x: '9', y: '3', width: '6', height: '5', rx: '1' } ], [ 'rect', { x: '3', y: '16', width: '6', height: '5', rx: '1' } ], [ 'rect', { x: '15', y: '16', width: '6', height: '5', rx: '1' } ], [ 'path', { d: 'M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2' } ] ],
	services: [ [ 'rect', { x: '4', y: '4', width: '7', height: '7', rx: '1.5' } ], [ 'rect', { x: '13', y: '4', width: '7', height: '7', rx: '1.5' } ], [ 'rect', { x: '4', y: '13', width: '7', height: '7', rx: '1.5' } ], [ 'path', { d: 'M16.5 13v7M13 16.5h7' } ] ],
	vpn: [ [ 'path', { d: 'M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z' } ], [ 'path', { d: 'm9 12 2 2 4-4' } ] ],
	statistics: [ [ 'path', { d: 'M5 20v-8M10 20V5M15 20v-5M20 20V9M3 20.5h18' } ] ],
	storage: [ [ 'ellipse', { cx: '12', cy: '6', rx: '7', ry: '2.5' } ], [ 'path', { d: 'M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' } ] ],
	generic: [ [ 'circle', { cx: '12', cy: '12', r: '8' } ], [ 'circle', { cx: '12', cy: '12', r: '2.2' } ] ],
	page: [ [ 'path', { d: 'M7 3.5h6.5l4.5 4.5v12.5H7z' } ], [ 'path', { d: 'M13.5 3.5V8H18' } ] ],
	caret: [ [ 'path', { d: 'm9 6 6 6-6 6' } ] ],
	down: [ [ 'path', { d: 'm6 9 6 6 6-6' } ] ],
	search: [ [ 'circle', { cx: '11', cy: '11', r: '6.5' } ], [ 'path', { d: 'm16 16 4.5 4.5' } ] ],
	sun: [ [ 'circle', { cx: '12', cy: '12', r: '4' } ], [ 'path', { d: 'M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4' } ] ],
	moon: [ [ 'path', { d: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z' } ] ],
	auto: [ [ 'circle', { cx: '12', cy: '12', r: '8' } ], [ 'path', { d: 'M12 4a8 8 0 0 1 0 16z', 'class': 'vt-fill' } ] ],
	logout: [ [ 'path', { d: 'M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14' } ], [ 'path', { d: 'M10 8l-4 4 4 4M6 12h10' } ] ],
	info: [ [ 'circle', { cx: '12', cy: '12', r: '8.5' } ], [ 'path', { d: 'M12 11v5.5' } ], [ 'circle', { cx: '12', cy: '7.75', r: '.6' } ] ],
	more: [ [ 'circle', { cx: '5.5', cy: '12', r: '.9' } ], [ 'circle', { cx: '12', cy: '12', r: '.9' } ], [ 'circle', { cx: '18.5', cy: '12', r: '.9' } ] ]
};

function iconFor(name) {
	if (/overview|dashboard|home/.test(name)) return 'dashboard';
	if (/^(status|system|network|services|vpn|statistics)$/.test(name)) return name;
	if (/nas|storage|disk/.test(name)) return 'storage';
	return 'generic';
}

const SVGNS = 'http://www.w3.org/2000/svg';

/* SVG elements from constant descriptions (ICONS, chart defs, chart
   shapes). Tags and attribute names are closed sets written as literals:
   anything else throws, so no caller can create script, a, foreignObject
   or animation elements or set href, style or on* through this helper. */
function svgNode(tag) {
	switch (tag) {
	case 'svg': return document.createElementNS(SVGNS, 'svg');
	case 'path': return document.createElementNS(SVGNS, 'path');
	case 'rect': return document.createElementNS(SVGNS, 'rect');
	case 'circle': return document.createElementNS(SVGNS, 'circle');
	case 'ellipse': return document.createElementNS(SVGNS, 'ellipse');
	case 'defs': return document.createElementNS(SVGNS, 'defs');
	case 'linearGradient': return document.createElementNS(SVGNS, 'linearGradient');
	case 'stop': return document.createElementNS(SVGNS, 'stop');
	}
	throw new Error('svgEl: tag not allowed: ' + tag);
}

function svgAttr(el, k, v) {
	v = String(v);
	switch (k) {
	case 'viewBox': el.setAttribute('viewBox', v); break;
	case 'width': el.setAttribute('width', v); break;
	case 'height': el.setAttribute('height', v); break;
	case 'aria-hidden': el.setAttribute('aria-hidden', v); break;
	case 'focusable': el.setAttribute('focusable', v); break;
	case 'class': el.setAttribute('class', v); break;
	case 'id': el.setAttribute('id', v); break;
	case 'd': el.setAttribute('d', v); break;
	case 'x': el.setAttribute('x', v); break;
	case 'y': el.setAttribute('y', v); break;
	case 'rx': el.setAttribute('rx', v); break;
	case 'ry': el.setAttribute('ry', v); break;
	case 'cx': el.setAttribute('cx', v); break;
	case 'cy': el.setAttribute('cy', v); break;
	case 'r': el.setAttribute('r', v); break;
	case 'x1': el.setAttribute('x1', v); break;
	case 'y1': el.setAttribute('y1', v); break;
	case 'x2': el.setAttribute('x2', v); break;
	case 'y2': el.setAttribute('y2', v); break;
	case 'offset': el.setAttribute('offset', v); break;
	default: throw new Error('svgEl: attribute not allowed: ' + k);
	}
}

function svgEl(tag, attrs) {
	const el = svgNode(tag);
	for (const k of Object.keys(attrs || {})) svgAttr(el, k, attrs[k]);
	return el;
}

function svg(name, size) {
	const s = svgEl('svg', {
		'viewBox': '0 0 24 24', 'width': size || 20, 'height': size || 20, 'aria-hidden': 'true', 'focusable': 'false'
	});
	(ICONS[name] || ICONS.generic).forEach(part => s.appendChild(svgEl(part[0], part[1])));
	return s;
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

/* '1.0.16' or '1.0.16-r1' -> [ 1, 0, 16 ]; null for anything else */
function versionParts(v) {
	const m = /^(\d{1,4}(?:\.\d{1,4}){1,3})(?:-r\d{1,4})?$/.exec(String(v == null ? '' : v));
	return m ? m[1].split('.').map(Number) : null;
}
function newerVersion(a, b) {
	for (let i = 0; i < Math.max(a.length, b.length); i++)
		if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
	return false;
}
/* the theme's version in an opkg package list, without its release */
function listedVersion(text) {
	const block = String(text || '').split(/\n\s*\n/).find(b => UPDATE_ENTRY.test(b));
	const m = block && /^Version: (\S+)$/m.exec(block);
	return m && versionParts(m[1]) ? m[1].replace(/-r\d+$/, '') : null;
}

/* the value in force, from [ pending, own, router, before ]: the first
   the theme knows, else the first choice (the default); the templates'
   inline scripts and login.js do the same without the pending one */
function lookValue(ok, list) {
	for (const v of list) if (ok.indexOf(v) >= 0) return v;
	return ok[0];
}
function lookWrite(values) {
	return callLookRevert('vantage_theme')
		.then(() => callLookSet('vantage_theme', 'appearance', values))
		.then(() => callLookCommit('vantage_theme').catch(e => callLookRevert('vantage_theme').then(() => { throw e; }, () => { throw e; })));
}
function viewValue(name, value) {
	if (name === 'chart') return VIEW_CHARTS.indexOf(value) >= 0;
	return /^layout_(wide|mid|narrow)(_wired)?$/.test(name) && typeof value === 'string' && VIEW_LAYOUT.test(value);
}

/* the router's value of one, as the templates set it (literal names) */
function setLookAttr(root, name, value) {
	if (name === 'theme') root.setAttribute('data-vt-look-theme', value);
	else if (name === 'login') root.setAttribute('data-vt-look-login', value);
	else if (name === 'backdrop') root.setAttribute('data-vt-look-backdrop', value);
	else if (name === 'power') root.setAttribute('data-vt-look-power', value);
	else if (name === 'brand') root.setAttribute('data-vt-look-brand', value);
}
function storageSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

function isTyping(el) {
	if (!el) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable ||
		!!(el.closest && el.closest('.cbi-dropdown[open]'));
}

/* subsequence match with bonuses for word starts and runs; null = no match */
function fuzzy(query, text) {
	const q = query.toLowerCase().replace(/\s+/g, '');
	const t = text.toLowerCase();
	if (!q) return { score: 0, idx: [] };
	let score = 0, from = 0, prev = -2;
	const idx = [];
	for (const ch of q) {
		const at = t.indexOf(ch, from);
		if (at < 0) return null;
		let s = 1;
		if (at === prev + 1) s += 5;
		if (at === 0 || /[\s\/›\-_(.]/.test(t[at - 1])) s += 7;
		s -= Math.min(at - from, 6) * .25;
		score += s;
		idx.push(at);
		prev = at;
		from = at + 1;
	}
	const plain = query.toLowerCase().trim();
	if (t.startsWith(plain)) score += 14;
	else if (t.indexOf(plain) >= 0) score += 8;
	return { score: score - t.length * .02, idx };
}

function highlight(text, idx) {
	const out = E('span', { 'class': 'vt-pal-title' });
	const set = new Set(idx);
	let run = '';
	let marked = false;
	const flush = () => {
		if (!run) return;
		out.appendChild(marked ? E('mark', {}, [ run ]) : document.createTextNode(run));
		run = '';
	};
	for (let i = 0; i < text.length; i++) {
		const m = set.has(i);
		if (m !== marked) { flush(); marked = m; }
		run += text[i];
	}
	flush();
	return out;
}

/* A path ("Network › Firewall") matches only on what it says: the query
   as a substring, or each of its words starting a word of the path. Not
   as letters scattered across it ("wire" in "Network › Firewall").
   null = no match. */
function pathScore(query, path) {
	const q = query.toLowerCase().trim().replace(/\s+/g, ' ');
	const t = String(path || '').toLowerCase();
	if (!q || !t) return null;
	const at = t.indexOf(q);
	if (at >= 0) return (at === 0 || /[\s\/›\-_(.]/.test(t[at - 1])) ? 10 : 6;
	const words = t.split(/[\s\/›\-_(.]+/).filter(Boolean);
	return q.split(' ').every(w => words.some(x => x.startsWith(w))) ? 4 : null;
}

/* Palette results for a query, best first: entries whose title matches,
   or only when no title does, those whose path does. Equal scores go to
   the shallower entry (Network › Wireless before a Wireless tab). */
function rankPalette(query, pool) {
	const onTitle = [], onPath = [];
	for (const e of pool) {
		const t = fuzzy(query, e.title);
		if (t) { onTitle.push({ e, score: t.score, idx: t.idx }); continue; }
		const p = pathScore(query, e.path);
		if (p != null) onPath.push({ e, score: p, idx: [] });
	}
	const depth = r => (r.e.segs || []).length;
	return (onTitle.length ? onTitle : onPath).sort((a, b) => (b.score - a.score) || (depth(a) - depth(b)));
}

/* The palette without a query: rows under their category's header, which
   a category of one row goes without. Under a header a row's path leaves
   the category out (a tab shows its page only); a row without one keeps
   its whole path. results: [ { e } ] in index order -> [ { r, head, path } ] */
function paletteLayout(results) {
	const size = new Map();
	for (const r of results) size.set(r.e.group, (size.get(r.e.group) || 0) + 1);
	let prev = null;
	return results.map(r => {
		const g = r.e.group, headed = size.get(g) > 1;
		const head = (headed && g !== prev) ? g : null;
		prev = g;
		let path = r.e.path || '';
		if (headed && path === g) path = '';
		else if (headed && path.startsWith(g + ' › ')) path = path.slice(g.length + 3);
		return { r, head, path };
	});
}

/* cells holding only addresses, counters, rates or durations get the mono stack */
const UNITS = /(?<![A-Za-z])(?:[kKMGTP]?i?B(?:\/s)?|[kMG]?bit\/s|[kMG]?bps|dBm|dB|[kMG]?Hz|ms|us|MCS|NSS|EHT|HE|VHT|HT|pkts?|packets|bytes|min|d|h|m|s)(?![A-Za-z])/g;
function technical(text) {
	const t = text.trim();
	if (!t || t.length > 120 || !/\d/.test(t)) return false;
	const rest = t.replace(UNITS, '');
	return /\d/.test(rest) && /^[\s0-9a-fA-F.:,\/%()+\-x[\]~=]*$/.test(rest);
}

/* heading text as compared for repeats: case, spacing and a trailing colon don't count */
function headingKey(text) {
	return String(text || '').replace(/\s+/g, ' ').replace(/[\s:]+$/, '').trim().toLowerCase();
}

/* Does a heading only repeat the breadcrumb? A page title (h2) may repeat
   any crumb; a card heading (h3) only the page's or the tab's, never the
   category's: on Services > Dynamic DNS the "Services" table is content. */
function repeatsTrail(key, tag, trail) {
	if (!key) return false;
	return (tag === 'H2' ? trail.all : trail.page).has(key);
}

/* The crumbs as shown: one that only repeats the crumb before it
   ("System › System", a page and its tab of the same name) takes that
   crumb's place, with its own (deeper) link and level. */
function mergeCrumbs(parts) {
	const out = [];
	for (const p of parts) {
		if (out.length && headingKey(out[out.length - 1].title) === headingKey(p.title)) out[out.length - 1] = p;
		else out.push(p);
	}
	return out;
}

/* LuCI renders its 404 with the deepest node it resolved (L.env.nodespec):
   a category (firstchild) or a node without an action */
function notFound(spec) {
	if (!spec || typeof spec !== 'object') return false;
	const type = spec.action && typeof spec.action === 'object' ? spec.action.type : null;
	return !type || type === 'firstchild';
}

/* Does help text carry a warning? LuCI writes them as a paragraph that
   opens with a short label and a colon ("Note:", "Warning:", "注意：",
   "Uwaga:"), whatever the language, and sometimes in bold. Line breaks
   end a paragraph. */
function helpWarns(desc) {
	if (desc.querySelector('strong, b, .warning, .alert-message')) return true;
	let text = '';
	(function walk(node) {
		node.childNodes.forEach(n => {
			if (n.nodeType === 3) text += n.data;
			else if (n.nodeName === 'BR') text += '\n';
			else if (n.nodeType === 1 && !n.classList.contains('vt-help')) walk(n);
		});
	})(desc);
	return text.split('\n').some(p => /^\s*[^\s\d:：]{1,16}(?:\s[^\s\d:：]{1,16})?\s*[:：]/u.test(p));
}

/* Where a folded help line ends cleanly: after its first sentence, or at
   LuCI's first line break, when that falls on the first line. Returns the
   offset in px from the text's left edge, or null when the line has to
   fade out instead. A full stop ends a sentence only after two characters
   that are not dots, so "e.g." does not; the stop is the match's last
   character (no lookbehind: Safari before 16.4 rejects the whole file). */
const SENTENCE_END = /[。！？]|[^\s.]{2}[.!?](?=\s|$)/u;

function helpCut(desc, cs, line) {
	const walker = document.createTreeWalker(desc, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
		acceptNode: n => n.nodeType === 1 && n.classList.contains('vt-help') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
	});
	let end = null, last = null;
	for (let n = walker.nextNode(); n && !end; n = walker.nextNode()) {
		if (n.nodeName === 'BR') { end = last; break; }
		if (n.nodeType !== 3) continue;
		const m = SENTENCE_END.exec(n.data);
		if (m) end = [ n, m.index + m[0].length - 1 ];
		else if (/\S/.test(n.data)) last = [ n, n.data.search(/\s*$/) - 1 ];
	}
	if (!end) return null;
	const range = document.createRange();
	range.setStart(end[0], end[1]);
	range.setEnd(end[0], end[1] + 1);
	const rects = range.getClientRects(), r = rects[rects.length - 1];
	const box = desc.getBoundingClientRect();
	if (!r || r.bottom > box.top + (parseFloat(cs.paddingTop) || 0) + line + 1) return null;
	return Math.ceil(r.right - box.left) + 1;
}

/* Where the text of a folded help line ends: a line that wraps early (a
   long word next, a narrow phone) ends well short of the box, so the fade
   is placed there. Offset in px from the text's left edge, or null. */
function helpLineEnd(desc, cs, line) {
	const range = document.createRange();
	range.selectNodeContents(desc);
	const box = desc.getBoundingClientRect(), limit = box.top + (parseFloat(cs.paddingTop) || 0) + line + 1;
	let right = 0;
	for (const r of range.getClientRects()) if (r.width && r.bottom <= limit) right = Math.max(right, r.right);
	return right ? Math.ceil(right - box.left) : null;
}

/* ---------------------------------------------------------------------------
 * Stock-page enhancers, only where CSS cannot restructure LuCI's markup
 * (Status -> Overview: fused memory bar, per-mount storage bars, radio band
 * chips). Rules:
 *  - DOM is built with E() and array content (text nodes), never HTML;
 *  - LuCI's own nodes stay in the DOM (hidden by class) so its code keeps
 *    working; nothing of LuCI's is moved or removed;
 *  - idempotent: the status includes re-render their container on every
 *    poll (dom.content), the observer rebuilds from the fresh nodes before
 *    the next paint, and a pass that finds nothing to do mutates nothing.
 * ------------------------------------------------------------------------ */

const BYTE_UNITS = { '': 1, K: 1024, M: 1048576, G: 1073741824, T: 1099511627776, P: 1125899906842624 };

function parseBytes(s) {
	const m = /(-?\d+(?:\.\d+)?)\s*([KMGTP]?)i?B\b/.exec(s || '');
	return m ? parseFloat(m[1]) * BYTE_UNITS[m[2]] : null;
}

/* progressbar title "534.50 MiB / 856.19 MiB (62%)" -> { value, total } */
function parseBarTitle(title) {
	const parts = String(title || '').split(' / ');
	if (parts.length < 2) return null;
	const value = parseBytes(parts[0]), total = parseBytes(parts[1]);
	return (value != null && total != null && total > 0) ? { value, total } : null;
}

function fmtBytes(n) { return String.format('%1024.1mB', Math.max(0, n)); }
function pctOf(n, total) { return total > 0 ? Math.round(100 * n / total) : 0; }

/* the Overview .cbi-section whose title (text before the Hide/Show label) is `title`; LuCI 24.10: a bare first h3 */
function statusSections(title) {
	return Array.prototype.filter.call(document.querySelectorAll('#view .cbi-section > .cbi-title > h3, #view .cbi-section > h3:first-child'), hd => {
		const t = hd.firstChild;
		return t && t.nodeType === 3 && t.data.trim() === title;
	}).map(hd => hd.closest('.cbi-section'));
}

/* the include's freshly rendered table, if it has not been enhanced yet */
function pendingTable(section) {
	const box = section.children[1];
	const table = box && box.querySelector(':scope > table.table');
	return (table && !table.hasAttribute('data-v-done')) ? table : null;
}

function barRows(table) {
	return Array.prototype.map.call(table.querySelectorAll(':scope > tr, :scope > tbody > tr'), tr => {
		const bar = tr.querySelector('.cbi-progressbar');
		return { label: (tr.firstElementChild ? tr.firstElementChild.textContent : '').trim(),
		         pair: bar ? parseBarTitle(bar.getAttribute('title')) : null };
	});
}

function segment(cls, value, total, title) {
	const s = E('span', { 'class': 'v-seg ' + cls, 'title': title });
	s.style.width = (total > 0 ? Math.min(100, 100 * value / total) : 0).toFixed(2) + '%';
	return s;
}

function legendKey(cls, label, value, note) {
	return E('li', {}, [ E('span', { 'class': 'v-key ' + cls }), E('span', {}, [ label ]), E('b', {}, [ fmtBytes(value) ]), note ? E('em', {}, [ note ]) : '' ]);
}

function replaceTable(table, block) {
	table.setAttribute('data-v-done', '1');
	table.classList.add('v-src-hidden');
	const prev = table.previousElementSibling;
	if (prev && prev.classList.contains('v-enhanced')) prev.remove();
	block.classList.add('v-enhanced');
	table.parentNode.insertBefore(block, table);
}

/* Memory: one bar. in use = total - available; cache (reclaimable) =
   available - free; free = total - LuCI's "Used" (which is total - free).
   A table without "Total Available" (Kwrt's luci-mod-status, #103) is read
   its own way, below. */
function enhanceMemory() {
	statusSections(_('Memory')).forEach(section => {
		const table = pendingTable(section);
		if (!table) return;
		const rows = barRows(table), get = l => (rows.find(r => r.label === l) || {}).pair;
		const avail = get(_('Total Available')), used = get(_('Used')),
		      buffered = get(_('Buffered')), cached = get(_('Cached')),
		      swapFree = get(_('Swap free')), swapUsed = get(_('Swap used'));
		const total = (used || avail || {}).total;
		if (!total || !used) return;

		let free, available;
		/* the row decides, not its value: LuCI shows "?" when it has none */
		if (rows.some(r => r.label === _('Total Available'))) {
			free = Math.max(0, total - used.value);
			available = avail ? avail.value : free + (buffered ? buffered.value : 0) + (cached ? cached.value : 0);
			available = Math.min(total, Math.max(available, free));
		}
		else {
			/* Kwrt: "Used" is total - MemAvailable. MemFree isn't shown, so the
			   cache stands for what is reclaimable and Free is an estimate. */
			available = Math.min(total, Math.max(0, total - used.value));
			free = Math.max(0, available - (cached ? cached.value : 0));
		}
		const inuse = total - available, reclaim = available - free;
		const usedPct = pctOf(inuse, total);

		const summary = '%s: %s %s, %s %s (%s), %s %s, %s %s'.format(_('Memory'),
			_('In use', 'vantage-theme'), fmtBytes(inuse), _('Cache'), fmtBytes(reclaim), _('reclaimable'),
			_('Free', 'vantage-theme'), fmtBytes(free), _('Total', 'vantage-theme'), fmtBytes(total));

		const children = [
			E('div', { 'class': 'v-meter-head' }, [
				E('span', { 'class': 'v-meter-big' }, [ pctOf(available, total) + '%', E('small', {}, [ _('available', 'vantage-theme') ]) ]),
				E('span', { 'class': 'v-meter-sub' }, [ '%s / %s'.format(fmtBytes(available), fmtBytes(total)) ])
			]),
			E('div', { 'class': 'v-meter-bar', 'role': 'img', 'aria-label': summary }, [
				segment('v-seg-used' + (usedPct >= 90 ? ' is-crit' : usedPct >= 75 ? ' is-warn' : ''), inuse, total, _('In use', 'vantage-theme')),
				segment('v-seg-cache', reclaim, total, _('Cache') + ' (' + _('reclaimable') + ')')
			]),
			E('ul', { 'class': 'v-meter-legend', 'aria-hidden': 'true' }, [
				legendKey('v-seg-used', _('In use', 'vantage-theme'), inuse),
				legendKey('v-seg-cache', _('Cache'), reclaim, _('reclaimable')),
				legendKey('v-seg-free', _('Free', 'vantage-theme'), free)
			])
		];

		/* "Swap free" in LuCI's table, "Swap used" in Kwrt's */
		const swap = swapFree ? { used: Math.max(0, swapFree.total - swapFree.value), total: swapFree.total }
			: swapUsed ? { used: swapUsed.value, total: swapUsed.total } : null;
		if (swap) {
			children.push(E('div', { 'class': 'v-meter-rows v-meter-swap' }, E('div', { 'class': 'v-meter-row' }, [
				E('span', { 'class': 'v-meter-label' }, [ _('Swap', 'vantage-theme') ]),
				E('div', { 'class': 'v-meter-bar is-thin', 'role': 'img',
				           'aria-label': '%s: %s / %s'.format(_('Swap', 'vantage-theme'), fmtBytes(swap.used), fmtBytes(swap.total)) },
					segment('v-seg-used', swap.used, swap.total)),
				E('span', { 'class': 'v-meter-val' }, [ E('b', {}, [ fmtBytes(swap.used) ]), ' / ' + fmtBytes(swap.total) ])
			])));
		}

		replaceTable(table, E('div', { 'class': 'v-meter v-meter-mem' }, children));
	});
}

/* Storage: one thin bar per mount, "used · free · total" beside it */
function enhanceStorage() {
	statusSections(_('Storage')).forEach(section => {
		const table = pendingTable(section);
		if (!table) return;
		const rows = barRows(table);
		if (!rows.length) return;

		replaceTable(table, E('div', { 'class': 'v-meter-rows v-meter-disk' }, rows.map(r => {
			const m = /^(.*) \((\/.*)\)$/.exec(r.label);
			const label = E('span', { 'class': 'v-meter-label' }, m ? [ m[2], E('small', {}, [ m[1] ]) ] : [ r.label ]);
			if (!r.pair)
				return E('div', { 'class': 'v-meter-row' }, [ label, E('div', { 'class': 'v-meter-bar is-thin' }), E('span', { 'class': 'v-meter-val' }, [ '?' ]) ]);
			const used = r.pair.value, size = r.pair.total, p = pctOf(used, size);
			return E('div', { 'class': 'v-meter-row' }, [
				label,
				E('div', { 'class': 'v-meter-bar is-thin', 'role': 'img',
				           'aria-label': '%s: %s %s, %s %s, %s %s'.format(r.label, fmtBytes(used), _('used'), fmtBytes(size - used), _('free'), fmtBytes(size), _('total')) },
					segment('v-seg-used' + (p >= 95 ? ' is-crit' : p >= 80 ? ' is-warn' : ''), used, size)),
				E('span', { 'class': 'v-meter-val' }, [
					/* a figure and its word stay on one line */
					E('b', {}, [ fmtBytes(used) ]), '\u00a0' + _('used') + ' · ' + fmtBytes(size - used) + '\u00a0' + _('free') + ' · ' + fmtBytes(size) + '\u00a0' + _('total')
				])
			]);
		})));
	});
}

/* Wireless radio boxes: band chip from the "Channel: 6 (2.437 GHz)" line */
function decorateRadios() {
	statusSections(_('Wireless')).forEach(section => {
		section.querySelectorAll('.network-status-table > .ifacebox').forEach(box => {
			const head = box.querySelector(':scope > .ifacebox-head');
			if (!head || head.hasAttribute('data-v-band')) return;
			let band = '';
			box.querySelectorAll('.ifacebox-body > span > .nowrap').forEach(n => {
				const label = n.querySelector('strong');
				const m = label && label.textContent.indexOf(_('Channel')) === 0 && /(\d+(?:\.\d+)?)\s*GHz/.exec(n.textContent);
				if (m) {
					const f = parseFloat(m[1]);
					band = f < 3 ? '2.4 GHz' : f < 5.925 ? '5 GHz' : f < 7.2 ? '6 GHz' : '60 GHz';
				}
			});
			if (band) head.setAttribute('data-v-band', band);
		});
	});
}

/* Port status: the ▲ / ▼ before each counter in a span of its own, for the
   dashboard's upload and download colours */
function decoratePorts() {
	document.querySelectorAll('#view .ifacebox > .ifacebox-head.cbi-tooltip-container + .ifacebox-body > .cbi-tooltip-container').forEach(stats => {
		Array.prototype.slice.call(stats.childNodes).forEach(n => {
			const dir = n.nodeType === 3 && { '▲': 'tx', '▼': 'rx' }[n.data.charAt(0)];
			if (!dir) return;
			stats.insertBefore(E('span', { 'class': 'vt-port-dir', 'data-dir': dir }, [ n.data.charAt(0) ]), n);
			n.data = n.data.slice(1);
		});
	});
}

function setupStockEnhancers() {
	const view = document.getElementById('view');
	if (!view || !window.MutationObserver) return;
	if (!/^admin(-status(-overview)?)?$/.test(document.body.getAttribute('data-page') || '')) return;
	let busy = false;
	const run = () => {
		if (busy) return;
		busy = true;
		try { enhanceMemory(); enhanceStorage(); decorateRadios(); decoratePorts(); }
		catch (e) { if (window.console) console.warn('vantage: status enhancer', e); }
		busy = false;
	};
	new MutationObserver(run).observe(view, { childList: true, subtree: true });
	run();
}

/* ---------------------------------------------------------------------------
 * Stock charts: Status -> Realtime Graphs (load, bandwidth, wireless,
 * connections) and Status -> Channel Analysis. Every one of these views
 * fetches its svg/*.svg template and inserts it inline (E(markup)), so
 * vantage.css reaches the chart directly and follows the theme toggle
 * through CSS variables. This code only adds what CSS cannot:
 *  - one hidden <svg><defs> holding the series area gradients the CSS
 *    references (fill: url(#v-grad-N));
 *  - Channel Analysis: a smooth hump (path.v-ca-shape) drawn from each
 *    network's trapezoid polyline (which CSS hides), palette slots per
 *    network, the AP's own BSSIDs marked, crowded channel labels thinned.
 * LuCI's polling, polylines, labels and tables are left as the view draws
 * them; nodes are created with createElementNS and attributes only.
 * ------------------------------------------------------------------------ */

function ensureChartDefs() {
	if (document.getElementById('v-chart-defs')) return;
	const box = svgEl('svg', { 'id': 'v-chart-defs', 'width': '0', 'height': '0', 'aria-hidden': 'true', 'focusable': 'false' });
	const defs = svgEl('defs');
	for (let n = 1; n <= 6; n++) {
		const g = svgEl('linearGradient', { 'id': 'v-grad-' + n, 'class': 'v-grad v-grad-' + n, 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '1' });
		g.appendChild(svgEl('stop', { 'offset': '0', 'class': 'v-stop-top' }));
		g.appendChild(svgEl('stop', { 'offset': '1', 'class': 'v-stop-bottom' }));
		defs.appendChild(g);
	}
	box.appendChild(defs);
	document.body.appendChild(box);
}

/* "x0,h,x1,y,x2,y,x3,h" (the view sets an array, so commas throughout) ->
   a symmetric hump through the same feet and peak height */
function humpPath(points) {
	const n = String(points || '').split(/[\s,]+/).filter(Boolean).map(Number);
	if (n.length < 8 || n.some(v => !isFinite(v))) return null;
	const x0 = n[0], base = n[1], peak = n[3], x3 = n[n.length - 2];
	if (!(x3 > x0)) return null;
	const k = (x3 - x0) * .16;
	const cy = (4 * peak - base) / 3;           /* cubic midpoint lands on the peak */
	const r = v => Math.round(v * 10) / 10;
	return 'M' + r(x0) + ',' + r(base) + 'C' + r(x0 + k) + ',' + r(cy) + ' ' + r(x3 - k) + ',' + r(cy) + ' ' + r(x3) + ',' + r(base) + 'Z';
}

/* "#89cdb4" -> "rgb(137, 205, 180)", the form element.style reads back */
function hexRgb(hex) {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
	return m ? 'rgb(' + [ m[1], m[2], m[3] ].map(h => parseInt(h, 16)).join(', ') + ')' : null;
}

function setupChannelAnalysis() {
	const view = document.getElementById('view');
	const own = new Set();
	const slots = new Map();
	let next = 0;
	let colourOf = null;
	/* slot 1 (the accent) is the AP itself; neighbours take 2..6 in the order
	   they first appear (the view sorts by channel, so neighbours differ) */
	const slotFor = (colour, mine) => {
		if (mine) return 1;
		if (!slots.has(colour)) slots.set(colour, 2 + (next++ % 5));
		return slots.get(colour);
	};

	/* write an attribute only when its value changes (null removes it);
	   the names are a closed set, each written with a literal name */
	const setAttr = (el, k, v) => {
		if (v == null) { if (el.hasAttribute(k)) el.removeAttribute(k); return; }
		v = String(v);
		if (el.getAttribute(k) === v) return;
		switch (k) {
		case 'd': el.setAttribute('d', v); break;
		case 'data-v-band': el.setAttribute('data-v-band', v); break;
		case 'data-v-series': el.setAttribute('data-v-series', v); break;
		case 'data-v-own': el.setAttribute('data-v-own', v); break;
		}
	};

	const run = () => {
		view.querySelectorAll('div[id="channel_graph"]').forEach(hostEl => {
			const svg = hostEl.querySelector(':scope > svg');
			const tab = hostEl.closest('[data-tab]') || hostEl.parentNode;
			if (!svg || !tab) return;
			/* data-tab is ifname + band ("radio02", "radio16") */
			const band = /[256]$/.exec(tab.getAttribute('data-tab') || '');
			setAttr(hostEl, 'data-v-band', band ? band[0] : null);

			/* table rows: colour dot -> BSSID. A row is ours only when its
			   BSSID is one of this device's: the SSID cell is whatever a
			   neighbour broadcasts, "Local Interface" included. Until the
			   BSSIDs are known nothing is marked (the stock look). */
			const mineByColour = new Map();
			tab.querySelectorAll('tr').forEach(tr => {
				const dot = tr.querySelector('span[style*="color"]');
				const cells = tr.querySelectorAll(':scope > td, :scope > .td');
				if (!cells.length) return;
				const printed = cells[cells.length - 1].textContent.trim();
				const bssid = printed.toUpperCase();
				const mine = own.has(bssid);
				if (tr.classList.contains('v-ca-own') !== mine) tr.classList.toggle('v-ca-own', mine);
				/* the view prints its own interface's row without the colour
				   dot, so rebuild that colour the way the view made it: from
				   the BSSID as printed (the derivation is case-sensitive) */
				if (mine && colourOf) {
					const derived = hexRgb(colourOf(printed));
					if (derived) mineByColour.set(derived, true);
				}
				if (!dot) return;
				const colour = dot.style.color;
				if (mine) mineByColour.set(colour, true);
				setAttr(dot, 'data-v-series', slotFor(colour, mine));
			});

			svg.querySelectorAll(':scope > g').forEach(g => {
				const poly = g.querySelector(':scope > polyline');
				const label = g.querySelector(':scope > text');
				if (!poly) return;
				const colour = poly.style.stroke;
				/* LuCI derives each network's colour from its BSSID */
				const mine = mineByColour.has(colour);
				const slot = slotFor(colour, mine);
				let shape = g.querySelector(':scope > path.v-ca-shape');
				if (!shape) {
					shape = svgEl('path', { 'class': 'v-ca-shape' });
					g.insertBefore(shape, g.firstChild);
				}
				const d = humpPath(poly.getAttribute('points'));
				if (d) setAttr(shape, 'd', d);
				setAttr(shape, 'data-v-series', slot);
				setAttr(shape, 'data-v-own', mine ? '1' : null);
				if (label) {
					if (!label.classList.contains('v-ca-label')) label.classList.add('v-ca-label');
					setAttr(label, 'data-v-own', mine ? '1' : null);
				}
			});

			if (hostEl.offsetParent) {
				/* SSID labels: stronger (higher) first; a colliding weaker one
				   moves down below it (transform only; the view owns x/y) */
				const placed = [];
				const right = hostEl.clientWidth - 4;
				Array.prototype.map.call(svg.querySelectorAll(':scope > g > text.v-ca-label'), t => {
					if (t.hasAttribute('transform')) t.removeAttribute('transform');
					const b = t.getBBox();
					const dx = Math.min(0, right - (b.x + b.width));   /* keep it inside the plot */
					return { t, x: b.x + dx, dx, y: b.y, w: b.width, h: b.height };
				}).filter(l => l.w > 0).sort((a, b) => a.y - b.y || a.x - b.x).forEach(l => {
					let dy = 0;
					for (let guard = 0; guard < 8; guard++) {
						const hit = placed.find(p => l.x < p.x + p.w + 4 && p.x < l.x + l.w + 4 && l.y + dy < p.y + p.h + 1 && p.y < l.y + dy + l.h + 1);
						if (!hit) break;
						dy = hit.y + hit.h + 1 - l.y;
					}
					if (dy || l.dx) l.t.setAttribute('transform', 'translate(' + Math.round(l.dx) + ' ' + Math.round(dy) + ')');
					placed.push({ x: l.x, y: l.y + dy, w: l.w, h: l.h });
				});

				/* channel numbers: drop labels that would collide (6 GHz has ~60) */
				const ticks = Array.prototype.filter.call(svg.children, el => el.tagName === 'text' && !el.id)
					.map(t => ({ t, x: parseFloat(t.getAttribute('x')) || 0 })).sort((a, b) => a.x - b.x);
				let end = -Infinity;
				ticks.forEach(({ t, x }) => {
					const w = t.getComputedTextLength ? t.getComputedTextLength() : 0;
					const hide = x < end + 8;
					if (t.classList.contains('v-ca-hide') !== hide) t.classList.toggle('v-ca-hide', hide);
					if (!hide) end = x + w;
				});
			}
		});
	};

	let busy = false;
	const safeRun = () => {
		if (busy) return;
		busy = true;
		try { run(); }
		catch (e) { if (window.console) console.warn('vantage: channel analysis', e); }
		busy = false;
	};

	/* tools.prng is what the view colours networks with (it is loaded
	   already); derive_color reseeds on every call, so calling it here
	   leaves the view's colours as they are */
	Promise.all([
		L.resolveDefault(callWirelessDevices(), {}),
		L.resolveDefault(L.require('tools.prng'), null)
	]).then(([ devs, prng ]) => {
		if (prng && typeof prng.derive_color === 'function')
			colourOf = b => prng.derive_color(b);
		for (const r of Object.values(devs || {}))
			for (const i of (r && Array.isArray(r.interfaces)) ? r.interfaces : [])
				[ i.iwinfo && i.iwinfo.bssid, i.config && i.config.macaddr ].forEach(b => {
					if (typeof b === 'string' && b) own.add(b.toUpperCase());
				});
		safeRun();
	});
	new MutationObserver(safeRun).observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: [ 'points', 'data-tab-active' ] });
	safeRun();
}

function setupCharts() {
	const page = document.body.getAttribute('data-page') || '';
	if (!/^admin-status-(realtime|channel_analysis)/.test(page) || !document.getElementById('view')) return;
	ensureChartDefs();
	if (/^admin-status-channel_analysis/.test(page) && window.MutationObserver) setupChannelAnalysis();
}

/* Status -> Firewall: the ruleset as a flow chart (vantage-theme.nftflow,
   loaded on that page only) */
function setupNftFlow() {
	const view = document.getElementById('view');
	if (!view || !window.MutationObserver || document.body.getAttribute('data-page') !== 'admin-status-nftables') return;
	L.require('vantage-theme.nftflow').then((m) => m.attach(view)).catch((e) => { if (window.console) console.warn('vantage: firewall flow', e); });
}

return baseclass.extend({
	__init__() {
		this.root = document.documentElement;
		this.mqMobile = window.matchMedia('(max-width: 720px)');
		this.mqNarrow = window.matchMedia('(max-width: 900px)');
		this.closeTimer = null;
		this.openTimer = null;
		this.entries = [];
		this.trail = { all: new Set(), page: new Set() };

		this.setupTheme();
		this.setupIndicators();
		this.setupNumerals();
		this.setupForms();
		this.setupTooltips();
		setupStockEnhancers();
		setupCharts();
		setupNftFlow();
		this.setupKeys();
		this.loadHost();

		ui.menu.load().then(L.bind(this.render, this));
	},

	/* ---------------------------------------------------------- menu */

	render(tree) {
		const admin = tree && tree.children && tree.children.admin;
		if (!admin) return;

		this.admin = admin;
		/* Appearance opened before the menu came in lacks the network
		   path's group (hasDashboard): add it now */
		if (this.appear && this.hasDashboard() && !this.appear.querySelector('input[name="vt-backdrop"]')) {
			this.dashboardGroups().forEach(g => this.appear.insertBefore(g, this.appearNote));
			this.syncAppearance();
		}
		this.dp = (L.env.dispatchpath || []).slice();
		this.missing = notFound(L.env.nodespec);

		this.cats = ui.menu.getChildren(admin)
			.filter(c => c.name !== 'logout')
			.map(c => {
				const raw = admin.children[c.name];
				const pages = ui.menu.getChildren(c).map(p => {
					const rawPage = raw && raw.children && raw.children[p.name];
					return {
						name: p.name,
						title: _(p.title),
						subs: rawPage ? ui.menu.getChildren(rawPage).map(s => ({ name: s.name, title: _(s.title) })) : []
					};
				});
				return {
					name: c.name,
					title: _(c.title),
					icon: iconFor(c.name),
					leaf: !(c.action && c.action.type === 'firstchild'),
					pages
				};
			})
			.filter(c => c.leaf || c.pages.length);

		this.renderRail();
		this.renderCrumbs();
		this.renderTabs();
		this.buildIndex();
		this.queueForms();
	},

	isPinned() {
		return this.root.getAttribute('data-rail') === 'pinned' && !this.mqNarrow.matches;
	},

	renderRail() {
		const list = document.getElementById('vt-rail-list');
		const fly = document.getElementById('vt-flyout');
		if (!list || !fly) return;

		this.fly = fly;
		this.scrim = document.getElementById('vt-scrim');
		list.textContent = '';

		for (const cat of this.cats) {
			const active = this.dp[1] === cat.name;
			const li = E('li', { 'class': 'vt-rail-item' + (active ? ' is-active is-expanded' : ''), 'data-cat': cat.name });
			let link;

			if (cat.leaf) {
				link = E('a', { 'class': 'vt-rail-link', 'href': L.url('admin', cat.name), 'aria-current': active ? 'page' : null, 'title': cat.title }, [
					svg(cat.icon), E('span', { 'class': 'vt-rail-label' }, [ cat.title ])
				]);
			}
			else {
				link = E('button', {
					'type': 'button', 'class': 'vt-rail-link', 'aria-expanded': 'false', 'aria-controls': 'vt-flyout',
					'aria-current': active ? 'true' : null, 'title': cat.title
				}, [ svg(cat.icon), E('span', { 'class': 'vt-rail-label' }, [ cat.title ]), svg('caret', 14) ]);
				link.lastChild.setAttribute('class', 'vt-rail-caret');

				link.addEventListener('click', ev => this.handleRailClick(ev, cat, li, link));
				/* hover opens a category; an open page switcher was opened on
				   purpose, so passing over the rail leaves it be (a click on a
				   category still swaps it) */
				li.addEventListener('pointerenter', ev => {
					if (ev.pointerType !== 'mouse' || this.isPinned() || this.mqMobile.matches || this.switchOpen()) return;
					this.cancelClose();
					window.clearTimeout(this.openTimer);
					this.openTimer = window.setTimeout(() => this.openFlyout(cat, li, link, false), this.fly.hidden ? 90 : 0);
				});
				li.addEventListener('pointerleave', ev => {
					if (ev.pointerType !== 'mouse') return;
					window.clearTimeout(this.openTimer);
					if (this.isPinned() || this.switchOpen()) return;
					this.scheduleClose();
				});

				/* pinned rail: inline pages */
				const sub = E('ul', { 'class': 'vt-rail-sub' });
				for (const p of cat.pages) {
					const cur = this.dp[1] === cat.name && this.dp[2] === p.name;
					sub.appendChild(E('li', {}, E('a', { 'href': L.url('admin', cat.name, p.name), 'aria-current': cur ? 'page' : null }, [ p.title ])));
				}
				li.appendChild(link);
				li.appendChild(sub);
				list.appendChild(li);
				continue;
			}

			li.appendChild(link);
			list.appendChild(li);
		}

		list.addEventListener('keydown', ev => this.handleRailKeys(ev, list));

		fly.addEventListener('pointerenter', () => this.cancelClose());
		fly.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse' && !fly.classList.contains('is-switch')) this.scheduleClose(); });
		fly.addEventListener('keydown', ev => this.handleFlyKeys(ev));
		/* the switcher closes once focus moves on past it (a null target is
		   a click on nothing focusable, which the document click handles) */
		fly.addEventListener('focusout', ev => this.leaveSwitch(ev.relatedTarget));
		if (this.scrim) this.scrim.addEventListener('click', () => this.closeFlyout(false));

		document.addEventListener('click', ev => {
			if (fly.hidden) return;
			if (ev.target.closest('#vt-flyout') || ev.target.closest('#vt-rail') || ev.target.closest('.vt-crumb-switch')) return;
			this.closeFlyout(false);
		});

		const pin = document.getElementById('vt-rail-pin');
		if (pin) {
			const sync = () => {
				const pinned = this.root.getAttribute('data-rail') === 'pinned';
				pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
				const label = pinned ? _('Collapse navigation') : _('Expand navigation');
				pin.setAttribute('aria-label', label);
				pin.setAttribute('title', label);
			};
			pin.addEventListener('click', () => {
				const pinned = this.root.getAttribute('data-rail') === 'pinned';
				if (pinned) this.root.removeAttribute('data-rail');
				else this.root.setAttribute('data-rail', 'pinned');
				storageSet(RAIL_KEY, pinned ? null : 'pinned');
				this.closeFlyout(false);
				sync();
			});
			sync();
		}

		/* phones: the bar scrolls sideways, and each page load (or switch to
		   the bottom bar) starts it at its first entry */
		this.fitRailActive();
		if (this.mqMobile.addEventListener) this.mqMobile.addEventListener('change', () => this.fitRailActive());
	},

	/* a clipped active entry is brought to the middle of the bar, at once,
	   and only the bar moves: scrollIntoView() would scroll the page too */
	fitRailActive() {
		const list = document.getElementById('vt-rail-list');
		const li = list && list.querySelector('.vt-rail-item.is-active');
		if (!li || !this.mqMobile.matches || list.scrollWidth <= list.clientWidth) return;

		const l = list.getBoundingClientRect(), r = li.getBoundingClientRect();
		if (r.left >= l.left - 1 && r.right <= l.right + 1) return;

		list.scrollLeft += (r.left + r.right - l.left - l.right) / 2;
	},

	handleRailClick(ev, cat, li, link) {
		if (this.isPinned()) {
			li.classList.toggle('is-expanded');
			link.setAttribute('aria-expanded', li.classList.contains('is-expanded') ? 'true' : 'false');
			return;
		}
		if (!this.fly.hidden && this.fly.getAttribute('data-cat') === cat.name && ev.detail !== 0 && !this.mqMobile.matches && ev.pointerType !== 'touch') {
			/* mouse click on an already hovered category: keep it open */
			return;
		}
		if (!this.fly.hidden && this.fly.getAttribute('data-cat') === cat.name) {
			this.closeFlyout(true);
			return;
		}
		this.openFlyout(cat, li, link, ev.detail === 0);
	},

	handleRailKeys(ev, list) {
		const links = Array.prototype.slice.call(list.querySelectorAll('.vt-rail-link'));
		const i = links.indexOf(document.activeElement);
		if (i < 0) return;
		const vertical = !this.mqMobile.matches;
		const next = vertical ? 'ArrowDown' : 'ArrowRight';
		const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
		if (ev.key === next || ev.key === prev) {
			ev.preventDefault();
			links[(i + (ev.key === next ? 1 : links.length - 1)) % links.length].focus();
		}
		else if (ev.key === 'Home' || ev.key === 'End') {
			ev.preventDefault();
			links[ev.key === 'Home' ? 0 : links.length - 1].focus();
		}
		else if (vertical && ev.key === 'ArrowRight' && links[i].tagName === 'BUTTON' && !this.isPinned()) {
			ev.preventDefault();
			links[i].click();
		}
		else if (ev.key === 'Escape' && !this.fly.hidden) {
			ev.preventDefault();
			this.closeFlyout(true);
		}
	},

	handleFlyKeys(ev) {
		const links = Array.prototype.slice.call(this.fly.querySelectorAll('a'));
		const i = links.indexOf(document.activeElement);
		const isSwitch = this.switchOpen();
		if (ev.key === 'Escape' || (ev.key === 'ArrowLeft' && !isSwitch && !this.mqMobile.matches)) {
			ev.preventDefault();
			this.closeFlyout(true);
		}
		else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && links.length) {
			ev.preventDefault();
			const d = ev.key === 'ArrowDown' ? 1 : -1;
			links[(i + d + links.length) % links.length].focus();
		}
		else if (ev.key === 'Tab' && links.length) {
			const edge = ev.shiftKey ? 0 : links.length - 1;
			if (i !== edge) return;
			ev.preventDefault();
			/* the switcher reads as part of the top bar, after its crumb:
			   Tab goes on to the next control there, Shift+Tab back to the
			   crumb. The rail's flyout returns to its rail button. */
			if (isSwitch && !ev.shiftKey) {
				const btn = this.switchBtn;
				this.closeFlyout(false);
				this.focusAfter(btn);
			}
			else this.closeFlyout(true);
		}
	},

	/* keys on the crumb switch: arrows open it (or enter it) at the current
	   page; Tab from the open switch goes into its list */
	handleSwitchKeys(ev, cat, page, btn) {
		const down = ev.key === 'ArrowDown', up = ev.key === 'ArrowUp';
		if (!down && !up && !(ev.key === 'Tab' && !ev.shiftKey && this.switchOpen())) return;
		ev.preventDefault();
		if (!this.switchOpen()) { this.openSwitch(cat, page, btn, true); return; }
		const links = this.fly.querySelectorAll('a');
		const target = (ev.key === 'Tab' ? null : this.fly.querySelector('a[aria-current]')) ||
			(up ? links[links.length - 1] : links[0]);
		if (target) target.focus();
	},

	switchOpen() {
		return !!(this.fly && !this.fly.hidden && this.fly.classList.contains('is-switch'));
	},

	/* focus moved from the switch or its list to `to` */
	leaveSwitch(to) {
		if (!to || !this.switchOpen()) return;
		if (this.fly.contains(to) || to === this.switchBtn) return;
		this.closeFlyout(false);
	},

	/* the control after `el` in tab order, outside the flyout */
	focusAfter(el) {
		const all = Array.prototype.filter.call(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'), n =>
			n.tabIndex >= 0 && !n.disabled && n.type !== 'hidden' && !this.fly.contains(n) && n.getClientRects().length > 0);
		const next = all[all.indexOf(el) + 1];
		(next || el).focus();
	},

	openFlyout(cat, li, link, focusFirst) {
		const fly = this.fly;
		this.cancelClose();
		this.endSwitch();
		if (fly.getAttribute('data-cat') !== cat.name || fly.hidden) {
			fly.textContent = '';
			fly.appendChild(E('div', { 'class': 'vt-fly-head' }, [
				E('span', { 'class': 'vt-fly-title', 'id': 'vt-fly-title' }, [ cat.title ])
			]));
			const ul = E('ul', { 'class': 'vt-fly-list', 'role': 'list' });
			for (const p of cat.pages) {
				const cur = this.dp[1] === cat.name && this.dp[2] === p.name;
				const item = E('li', {}, E('a', { 'class': 'vt-fly-link', 'href': L.url('admin', cat.name, p.name), 'aria-current': cur ? 'page' : null }, [
					E('span', {}, [ p.title ])
				]));
				if (p.subs.length > 1) {
					const sub = E('ul', { 'class': 'vt-fly-sub' });
					for (const s of p.subs) {
						const scur = cur && this.dp[3] === s.name;
						sub.appendChild(E('li', {}, E('a', { 'href': L.url('admin', cat.name, p.name, s.name), 'aria-current': scur ? 'page' : null }, [ s.title ])));
					}
					item.appendChild(sub);
				}
				ul.appendChild(item);
			}
			fly.appendChild(ul);
			fly.setAttribute('data-cat', cat.name);
			fly.setAttribute('role', 'region');
			fly.setAttribute('aria-labelledby', 'vt-fly-title');
		}

		document.querySelectorAll('.vt-rail-item.is-open').forEach(n => {
			if (n === li) return;
			n.classList.remove('is-open');
			const b = n.querySelector('.vt-rail-link[aria-expanded]');
			if (b) b.setAttribute('aria-expanded', 'false');
		});
		li.classList.add('is-open');
		link.setAttribute('aria-expanded', 'true');
		this.openLink = link;
		fly.hidden = false;
		if (this.scrim) this.scrim.hidden = !this.mqMobile.matches;

		if (focusFirst) {
			const first = fly.querySelector('a[aria-current]') || fly.querySelector('a');
			if (first) first.focus();
		}
	},

	closeFlyout(refocus) {
		if (!this.fly || this.fly.hidden) return;
		this.cancelClose();
		this.fly.hidden = true;
		if (this.scrim) this.scrim.hidden = true;
		this.endSwitch();
		document.querySelectorAll('.vt-rail-item.is-open').forEach(n => {
			n.classList.remove('is-open');
			const b = n.querySelector('.vt-rail-link[aria-expanded]');
			if (b) b.setAttribute('aria-expanded', 'false');
		});
		if (refocus && this.openLink) this.openLink.focus();
	},

	/* the flyout, filled with a page's tabs: a dropdown under the crumb, the
	   same bottom sheet as the rail's on phones */
	openSwitch(cat, page, btn, focusFirst) {
		const fly = this.fly;
		if (!fly) return;
		/* a rail hover may have left a timer behind; closeFlyout() skips
		   cancelling it when the panel is hidden, so cancel both here */
		this.cancelClose();
		window.clearTimeout(this.openTimer);
		this.openTimer = null;
		this.closeFlyout(false);
		fly.textContent = '';
		fly.appendChild(E('div', { 'class': 'vt-fly-head' }, [
			E('span', { 'class': 'vt-fly-title', 'id': 'vt-fly-title' }, [ page.title ])
		]));
		const ul = E('ul', { 'class': 'vt-fly-list', 'role': 'list' });
		for (const s of page.subs)
			ul.appendChild(E('li', {}, E('a', {
				'class': 'vt-fly-link', 'href': L.url('admin', cat.name, page.name, s.name), 'aria-current': this.dp[3] === s.name ? 'page' : null
			}, [ E('span', {}, [ s.title ]) ])));
		fly.appendChild(ul);
		fly.setAttribute('data-cat', '');
		fly.setAttribute('role', 'region');
		fly.setAttribute('aria-labelledby', 'vt-fly-title');

		const x = Math.max(8, Math.min(btn.getBoundingClientRect().left - 8, window.innerWidth - 328));
		fly.style.setProperty('--x', x.toFixed(0) + 'px');
		fly.classList.add('is-switch');
		btn.setAttribute('aria-expanded', 'true');
		this.switchBtn = btn;
		this.openLink = btn;
		fly.hidden = false;
		if (this.scrim) this.scrim.hidden = !this.mqMobile.matches;

		if (focusFirst) {
			const first = fly.querySelector('a[aria-current]') || fly.querySelector('a');
			if (first) first.focus();
		}
	},

	endSwitch() {
		if (this.fly) this.fly.classList.remove('is-switch');
		if (this.switchBtn) this.switchBtn.setAttribute('aria-expanded', 'false');
	},

	scheduleClose() {
		this.cancelClose();
		this.closeTimer = window.setTimeout(() => this.closeFlyout(false), 220);
	},

	cancelClose() {
		if (this.closeTimer) window.clearTimeout(this.closeTimer);
		this.closeTimer = null;
	},

	/* ------------------------------------------------- crumbs + tabs */

	renderCrumbs() {
		const nav = document.getElementById('vt-crumbs');
		if (!nav) return;
		const parts = [];
		let node = this.admin;
		for (let i = 1; i < this.dp.length && i <= 3; i++) {
			node = node && node.children ? node.children[this.dp[i]] : null;
			if (!node || !node.title) break;
			parts.push({ title: _(node.title), segs: [ 'admin' ].concat(this.dp.slice(1, i + 1)), level: i });
		}
		/* a 404: the crumbs lead to the category LuCI resolved, then say so */
		if (this.missing) parts.push({ title: _('Not found'), segs: null, level: 0 });
		if (!parts.length) return;

		/* a page with page tabs: its current crumb switches between them,
		   from the top bar, which stays in view while the tabs scroll away */
		const cat = this.cats.find(c => c.name === this.dp[1]);
		const page = cat && !this.missing && this.dp.length > 3 ? cat.pages.find(p => p.name === this.dp[2]) : null;
		const siblings = page && page.subs.length > 1 ? page : null;

		const crumbs = mergeCrumbs(parts);
		nav.textContent = '';
		crumbs.forEach((p, i) => {
			const last = i === crumbs.length - 1;
			if (i) nav.appendChild(E('span', { 'class': 'vt-crumb-sep', 'aria-hidden': 'true' }, [ '›' ]));
			if (last && siblings && p.level === 3) {
				/* a disclosure (aria-expanded + aria-controls): the panel is a
				   region of links, not a menu, so no aria-haspopup */
				const btn = E('button', {
					'type': 'button', 'class': 'vt-crumb vt-crumb-current vt-crumb-switch', 'aria-current': 'page',
					'aria-expanded': 'false', 'aria-controls': 'vt-flyout',
					'title': _('Other pages in %s').format(siblings.title)
				}, [ E('span', {}, [ p.title ]), svg('down', 14) ]);
				btn.addEventListener('click', ev => {
					if (this.switchOpen()) this.closeFlyout(true);
					else this.openSwitch(cat, siblings, btn, ev.detail === 0);
				});
				btn.addEventListener('keydown', ev => this.handleSwitchKeys(ev, cat, siblings, btn));
				btn.addEventListener('focusout', ev => this.leaveSwitch(ev.relatedTarget));
				nav.appendChild(btn);
			}
			else nav.appendChild(last
				? E('span', { 'class': 'vt-crumb vt-crumb-current', 'aria-current': 'page' }, [ p.title ])
				: E('a', { 'class': 'vt-crumb', 'href': L.url.apply(L, p.segs) }, [ p.title ]));
		});

		this.pageTitle = parts[parts.length - 1].title;
		parts.forEach((p, i) => {
			this.trail.all.add(headingKey(p.title));
			/* the category, unless it is the page itself */
			if (i || parts.length === 1) this.trail.page.add(headingKey(p.title));
		});
		this.updateTitle();
	},

	renderTabs() {
		const bar = document.getElementById('vt-tabs');
		if (!bar || this.missing || this.dp.length < 3) return;
		const cat = this.admin.children[this.dp[1]];
		const page = cat && cat.children ? cat.children[this.dp[2]] : null;
		if (!page) return;
		const tabs = ui.menu.getChildren(page);
		if (tabs.length < 2) return;

		const seg = E('div', { 'class': 'vt-pagetabs' });
		for (const t of tabs) {
			const cur = this.dp[3] === t.name;
			seg.appendChild(E('a', {
				'class': 'vt-tab', 'href': L.url('admin', this.dp[1], this.dp[2], t.name), 'aria-current': cur ? 'page' : null
			}, [ _(t.title) ]));
		}
		bar.textContent = '';
		bar.appendChild(seg);
		bar.hidden = false;
	},

	/* ------------------------------------------------------ palette */

	buildIndex() {
		const seen = new Set();
		const add = e => {
			const key = e.segs.join('/') + '|' + e.title;
			if (seen.has(key)) return;
			seen.add(key);
			this.entries.push(e);
		};
		/* pages carry no icon: their category heads them, and only actions
		   have one. A tab named like its page (System Log's "System Log")
		   is that page's entry already. */
		for (const c of this.cats) {
			if (c.leaf) add({ title: c.title, path: '', group: c.title, segs: [ 'admin', c.name ] });
			for (const p of c.pages) {
				add({ title: p.title, path: c.title, group: c.title, segs: [ 'admin', c.name, p.name ] });
				if (p.subs.length > 1)
					for (const s of p.subs)
						if (headingKey(s.title) !== headingKey(p.title))
							add({ title: s.title, path: c.title + ' › ' + p.title, group: c.title, segs: [ 'admin', c.name, p.name, s.name ] });
			}
		}
	},

	actions() {
		const pref = this.themePref();
		const list = [];
		if (pref !== 'dark') list.push({ title: _('Use dark theme'), path: _('Appearance', 'vantage-theme'), icon: 'moon', run: () => this.setTheme('dark') });
		if (pref !== 'light') list.push({ title: _('Use light theme'), path: _('Appearance', 'vantage-theme'), icon: 'sun', run: () => this.setTheme('light') });
		if (pref !== 'auto') list.push({ title: _('Follow system theme'), path: _('Appearance', 'vantage-theme'), icon: 'auto', run: () => this.setTheme('auto') });
		const login = this.loginPref(), names = this.loginNames();
		for (const k of [ 'grid', 'stars', 'none' ])
			if (k !== login) list.push({ title: '%s: %s'.format(_('Login background'), names[k]), path: _('Appearance', 'vantage-theme'), icon: 'page', run: () => this.setLoginPref(k) });
		if (this.hasDashboard()) {
			const bd = this.backdropPref();
			for (const k of [ 'grid', 'stars', 'none' ])
				if (k !== bd) list.push({ title: '%s: %s'.format(_('Network path background'), names[k]), path: _('Appearance', 'vantage-theme'), icon: 'page', run: () => this.setBackdropPref(k) });
		}
		list.push({ title: _('Log out'), path: _('Session'), icon: 'logout', segs: [ 'admin', 'logout' ] });
		list.forEach(a => { a.group = _('Actions'); });
		return list;
	},

	openPalette() {
		if (this.pal) return;
		/* a row menu, Appearance or a pinned help box left open would take
		   the palette's Escape */
		this.closeActMenu(false);
		this.closeAppearance(false);
		this.closeHelp(false);
		/* focus inside the flyout goes back to what opened the flyout, since
		   closing it hides the element that had focus */
		const from = document.activeElement;
		this.palReturn = (this.fly && this.fly.contains(from)) ? this.openLink : from;
		this.closeFlyout(false);

		const input = E('input', {
			'class': 'vt-pal-input', 'type': 'text', 'role': 'combobox', 'aria-expanded': 'true',
			'aria-controls': 'vt-pal-list', 'aria-autocomplete': 'list', 'autocomplete': 'off', 'spellcheck': 'false',
			'placeholder': _('Jump to a page or action…'), 'aria-label': _('Search pages')
		});
		const list = E('ul', { 'class': 'vt-pal-list', 'id': 'vt-pal-list', 'role': 'listbox', 'aria-label': _('Results', 'vantage-theme') });
		const count = E('span', { 'class': 'vt-pal-count' });
		const box = E('div', { 'class': 'vt-pal', 'role': 'dialog', 'aria-modal': 'true', 'aria-label': _('Command palette') }, [
			E('div', { 'class': 'vt-pal-field' }, [ svg('search', 18), input ]),
			list,
			E('div', { 'class': 'vt-pal-foot' }, [
				E('span', {}, [ E('kbd', {}, [ '↑' ]), E('kbd', {}, [ '↓' ]), _('navigate') ]),
				E('span', {}, [ E('kbd', {}, [ '↵' ]), _('open', 'vantage-theme') ]),
				E('span', {}, [ E('kbd', {}, [ 'Esc' ]), _('close') ]),
				count
			])
		]);
		const overlay = E('div', { 'class': 'vt-pal-overlay' }, box);
		overlay.addEventListener('mousedown', ev => { if (ev.target === overlay) this.closePalette(); });

		this.pal = { overlay, input, list, count, items: [], active: 0 };
		input.addEventListener('input', () => this.filterPalette());
		input.addEventListener('keydown', ev => this.handlePaletteKeys(ev));

		document.body.appendChild(overlay);
		this.filterPalette();
		input.focus();
	},

	closePalette() {
		if (!this.pal) return;
		this.pal.overlay.remove();
		this.pal = null;
		if (this.palReturn && this.palReturn.focus) this.palReturn.focus();
	},

	filterPalette() {
		const pal = this.pal;
		const q = pal.input.value.trim();
		const pool = this.entries.concat(this.actions());
		const found = q ? rankPalette(q, pool) : null;
		const results = q ? found.slice(0, 40) : pool.map(e => ({ e, idx: [] }));
		const rows = q ? results.map(r => ({ r, head: null, path: r.e.path })) : paletteLayout(results);

		pal.list.textContent = '';
		pal.items = [];
		rows.forEach(({ r, head, path }, n) => {
			if (head) pal.list.appendChild(E('li', { 'class': 'vt-pal-group', 'role': 'presentation' }, [ head ]));
			const li = E('li', { 'class': 'vt-pal-item', 'role': 'option', 'id': 'vt-pal-opt-' + n, 'aria-selected': 'false' }, [
				r.e.icon ? svg(r.e.icon, 18) : '',
				highlight(r.e.title, r.idx),
				path ? E('span', { 'class': 'vt-pal-path' }, [ path ]) : '',
				E('kbd', { 'class': 'vt-pal-enter' }, [ '↵' ])
			]);
			li.addEventListener('mousemove', () => this.setPaletteActive(n, false));
			li.addEventListener('click', () => this.runEntry(r.e));
			pal.list.appendChild(li);
			pal.items.push({ li, e: r.e });
		});

		if (!results.length)
			pal.list.appendChild(E('li', { 'class': 'vt-pal-empty', 'role': 'presentation' }, [ _('No matching pages') ]));

		pal.count.textContent = q ? N_(found.length, '%d result', '%d results', 'vantage-theme').format(found.length) : '';
		this.setPaletteActive(0, true);
	},

	setPaletteActive(n, scroll) {
		const pal = this.pal;
		if (!pal || !pal.items.length) { if (pal) pal.input.removeAttribute('aria-activedescendant'); return; }
		n = (n + pal.items.length) % pal.items.length;
		if (pal.items[pal.active]) pal.items[pal.active].li.setAttribute('aria-selected', 'false');
		pal.active = n;
		const li = pal.items[n].li;
		li.setAttribute('aria-selected', 'true');
		pal.input.setAttribute('aria-activedescendant', li.id);
		if (scroll) {
			if (n === 0) pal.list.scrollTop = 0;
			else li.scrollIntoView({ block: 'nearest' });
		}
	},

	handlePaletteKeys(ev) {
		const pal = this.pal;
		switch (ev.key) {
		case 'ArrowDown': ev.preventDefault(); this.setPaletteActive(pal.active + 1, true); break;
		case 'ArrowUp': ev.preventDefault(); this.setPaletteActive(pal.active - 1, true); break;
		case 'PageDown': ev.preventDefault(); this.setPaletteActive(Math.min(pal.active + 8, pal.items.length - 1), true); break;
		case 'PageUp': ev.preventDefault(); this.setPaletteActive(Math.max(pal.active - 8, 0), true); break;
		case 'Enter':
			ev.preventDefault();
			if (pal.items[pal.active]) this.runEntry(pal.items[pal.active].e);
			break;
		case 'Escape': ev.preventDefault(); ev.stopPropagation(); this.closePalette(); break;
		case 'Tab': ev.preventDefault(); break;
		}
	},

	runEntry(e) {
		if (e.run) { this.closePalette(); e.run(); return; }
		if (e.segs) window.location.href = L.url.apply(L, e.segs);
	},

	setupKeys() {
		const btn = document.getElementById('vt-search-btn');
		if (btn) btn.addEventListener('click', () => this.openPalette());

		/* a select whose list the page draws (customizable select) closes it
		   on Escape; the modal under it (ui.cancelModal on #modal_overlay)
		   must not take the same Escape and dismiss the dialog. Capture, as
		   for the row menu. */
		const openList = CSS.supports('selector(:open)') ? 'select:open' : null;
		document.addEventListener('keydown', ev => {
			if (openList && ev.key === 'Escape' && ev.target.closest && ev.target.closest(openList))
				ev.stopPropagation();
		}, true);

		document.addEventListener('keydown', ev => {
			if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
				ev.preventDefault();
				if (this.pal) this.closePalette(); else this.openPalette();
				return;
			}
			if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !this.pal &&
			    !isTyping(ev.target) && !document.body.classList.contains('modal-overlay-active')) {
				ev.preventDefault();
				this.openPalette();
				return;
			}
			if (ev.key === 'Escape' && this.fly && !this.fly.hidden && !this.pal)
				this.closeFlyout(true);
		});

		const reset = () => { if (this.fly && this.scrim) this.scrim.hidden = this.fly.hidden || !this.mqMobile.matches; };
		if (this.mqMobile.addEventListener) this.mqMobile.addEventListener('change', reset);
	},

	/* -------------------------------------------------------- theme */

	/* may this login save Appearance for every browser (header.ut): yes, relogin or no */
	lookState() {
		const v = this.root.getAttribute('data-vt-look-save');
		return v === 'yes' || v === 'relogin' ? v : 'no';
	},

	/* one Appearance setting (LOOK), the value in force */
	lookPref(name) {
		const k = LOOK[name], mine = this.lookState() === 'yes' ? null : storageGet(k.own);
		return lookValue(k.ok, [ (this.lookPending || {})[name], mine, this.root.getAttribute('data-vt-look-' + name), storageGet(k.before) ]);
	},

	/* Save one for every browser where this login may, else for this
	   browser. Saves queue in order and only the latest pick of each is
	   written; `apply` shows it at once and again when done. A save that
	   fails leaves the pick shown on this page, with a note. */
	setLook(name, value, apply) {
		const k = LOOK[name];
		const pending = this.lookPending || (this.lookPending = {});
		const failed = this.lookFailed || (this.lookFailed = {});
		if (k.ok.indexOf(value) < 0 || (pending[name] === value && !failed[name])) return;
		if (this.lookState() !== 'yes') {
			storageSet(k.own, value);
			storageSet(k.before, value);
			apply();
			return;
		}
		const seqs = this.lookSeqs || (this.lookSeqs = {}), seq = seqs[name] = (seqs[name] || 0) + 1;
		pending[name] = value;
		delete failed[name];
		apply();
		const latest = () => seqs[name] === seq;
		this.lookChain = (this.lookChain || Promise.resolve()).then(() => {
			if (!latest()) return;
			return lookWrite({ [name]: value })
				.then(() => {
					/* the router's value first, so other tabs never see a gap */
					setLookAttr(this.root, name, value);
					storageSet(LOOK_SYNC, JSON.stringify({ name: name, value: value, at: Date.now() }));
					storageSet(k.before, value);
					if (latest()) delete pending[name];
				}, () => { if (latest()) failed[name] = true; });
		}).then(apply);
	},

	/* a save that failed and wasn't done again: its pick stays shown, with a note */
	lookFailing() {
		return Object.keys(this.lookFailed || {}).length > 0;
	},

	themePref() {
		return this.lookPref('theme');
	},

	setTheme(pref) {
		this.setLook('theme', pref, () => this.applyTheme());
	},

	applyTheme() {
		const pref = this.themePref();
		const sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
		const dark = pref === 'dark' || (pref === 'auto' && sysDark);
		this.root.setAttribute('data-darkmode', dark ? 'true' : 'false');
		this.root.setAttribute('data-theme', pref);

		/* the switch shows the pick (auto, sun, moon) and cycles: auto, the
		   look the system doesn't have, the one it has, auto again, so the
		   first click always changes the page; it saves as Appearance does */
		const sys = sysDark ? 'dark' : 'light', other = sysDark ? 'light' : 'dark';
		this.themeNext = pref === 'auto' ? other : pref === other ? sys : 'auto';
		const btn = document.getElementById('vt-theme');
		if (btn) {
			const label = { auto: _('Follow system theme'), light: _('Use light theme'), dark: _('Use dark theme') }[this.themeNext];
			btn.textContent = '';
			btn.appendChild(svg(pref === 'auto' ? 'auto' : (dark ? 'moon' : 'sun'), 18));
			btn.setAttribute('aria-label', label);
			btn.setAttribute('title', label);
		}
		this.syncAppearance();
	},

	/* next to the logo: nothing unless set. In the rail when it is pinned
	   open, else first in the top bar (vantage.css); text only */
	brandPref() {
		return this.lookPref('brand');
	},

	setBrandPref(pref) {
		this.setLook('brand', pref, () => this.applyBrand());
	},

	applyBrand() {
		const v = this.brandPref(), b = this.board;
		const name = !b ? '' : v === 'hostname' ? (host.chipNames(b.hostname, '')[0] || '') : v === 'model' ? host.productName(b) : '';
		[ 'vt-brand-name', 'vt-top-name' ].forEach(id => {
			const el = document.getElementById(id);
			if (!el) return;
			if (el.textContent !== name) el.textContent = name;
			el.title = name;
			el.hidden = !name;
		});
		this.syncAppearance();
	},

	/* the login page's backdrop (login.js): grid packets unless set */
	loginPref() {
		return this.lookPref('login');
	},

	loginNames() {
		return { grid: _('Grid'), stars: _('Starfield'), none: _('None', 'vantage-theme') };
	},

	setLoginPref(pref) {
		this.setLook('login', pref, () => this.syncAppearance());
	},

	/* Vantage's dashboard, where this user may open it: its network path
	   takes the same backdrops as the login page */
	hasDashboard() {
		return !!(this.admin && ui.menu.getChildren(this.admin).some(c => c.name === 'dashboard' && c.action && c.action.path === 'vantage/overview'));
	},

	backdropPref() {
		return this.lookPref('backdrop');
	},

	setBackdropPref(pref) {
		this.setLook('backdrop', pref, () => this.applyBackdrop());
	},

	/* the dashboard reads the one in force from data-vt-backdrop */
	applyBackdrop() {
		const v = this.backdropPref();
		if (this.root.getAttribute('data-vt-backdrop') !== v) {
			this.root.setAttribute('data-vt-backdrop', v);
			window.dispatchEvent(new CustomEvent(BACKDROP_EVENT));
		}
		this.syncAppearance();
	},

	powerPref() {
		return this.lookPref('power');
	},

	setPowerPref(pref) {
		this.setLook('power', pref, () => this.applyPower());
	},

	/* the dashboard reads the one in force from data-vt-power; the
	   refresh dot stops with it (vantage.css) */
	applyPower() {
		const v = this.powerPref();
		if (this.root.getAttribute('data-vt-power') !== v) {
			this.root.setAttribute('data-vt-power', v);
			window.dispatchEvent(new CustomEvent(POWER_EVENT));
		}
		this.syncAppearance();
	},

	setupTheme() {
		const toggle = document.getElementById('vt-theme');
		if (toggle) toggle.addEventListener('click', () => { if (this.themeNext) this.setTheme(this.themeNext); });
		const btn = document.getElementById('vt-look');
		if (btn) {
			btn.addEventListener('click', () => {
				if (this.appearBtn) this.closeAppearance(false);
				else this.openAppearance(btn);
			});
			btn.addEventListener('keydown', ev => {
				if (ev.key !== 'ArrowDown' || this.appearBtn) return;
				ev.preventDefault();
				this.openAppearance(btn);
			});
		}
		const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
		if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (this.themePref() === 'auto') this.applyTheme(); });
		/* a login that may save: this browser's private picks no longer count */
		if (this.lookState() === 'yes') Object.keys(LOOK).forEach(n => storageSet(LOOK[n].own, null));
		/* another tab of this browser changed one, or saved one on the router */
		const keys = [ LOOK_SYNC ];
		Object.keys(LOOK).forEach(n => keys.push(LOOK[n].own, LOOK[n].before));
		window.addEventListener('storage', ev => {
			if (keys.indexOf(ev.key) < 0) return;
			if (ev.key === LOOK_SYNC) {
				let m = null;
				try { m = JSON.parse(ev.newValue); } catch (e) {}
				if (m && Object.prototype.hasOwnProperty.call(LOOK, m.name) && LOOK[m.name].ok.indexOf(m.value) >= 0) {
					setLookAttr(this.root, m.name, m.value);
					/* saved there: a pick that failed here is over */
					if (this.lookPending) delete this.lookPending[m.name];
					if (this.lookFailed) delete this.lookFailed[m.name];
				}
			}
			this.applyTheme();
			this.applyBackdrop();
			this.applyPower();
			this.applyBrand();
		});
		/* the dashboard's own picker (Customize), saved as Appearance's */
		window.addEventListener(LOOK_SET_EVENT, ev => {
			if (ev.detail && LOOK.backdrop.ok.indexOf(ev.detail) >= 0) {
				ev.preventDefault();
				this.setBackdropPref(ev.detail);
			}
		});
		/* Customize's Done, for a login that may save; for any other it
		   stays in that browser, which the dashboard says */
		window.addEventListener(VIEW_SAVE_EVENT, ev => {
			const d = ev.detail, values = {};
			if (this.lookState() !== 'yes' || !d || !d.values || typeof d.done !== 'function') return;
			Object.keys(d.values).forEach(n => { if (viewValue(n, d.values[n])) values[n] = d.values[n]; });
			if (!Object.keys(values).length) return;
			ev.preventDefault();
			this.lookChain = (this.lookChain || Promise.resolve()).then(() => lookWrite(values))
				.then(() => d.done(true), () => d.done(false)).catch(() => {});
		});
		this.applyTheme();
		this.applyBackdrop();
		this.applyPower();
		this.applyBrand();
	},

	/* Appearance, under the gear button: the colour theme, the
	   login background and, with the dashboard, the network path's
	   background, each a native radio group (the arrow keys move
	   within it) drawn as segments. Choices apply at once and stay open;
	   Escape, Tab out of either end, a click outside, resizing or
	   scrolling the page close it. */
	/* one of Appearance's radio groups */
	appearGroup(name, legend, opts, set) {
		const look = { 'vt-colour': 'theme', 'vt-logo-name': 'brand', 'vt-login': 'login', 'vt-backdrop': 'backdrop', 'vt-power': 'power' }[name];
		return E('fieldset', { 'class': 'vt-appear-set' }, [
			E('legend', {}, [ legend ]),
			E('div', { 'class': 'vt-appear-track' }, opts.map(o => {
				const input = E('input', { 'type': 'radio', 'name': name, 'value': o[0] });
				input.addEventListener('change', () => { if (input.checked) set(o[0]); });
				/* the checked option fires no change: after a failed save, this is the retry */
				input.addEventListener('click', () => { if (input.checked && (this.lookFailed || {})[look]) set(o[0]); });
				/* data-text: the label's bold width kept (vantage.css), so
				   a pick changes no column */
				return E('label', { 'class': 'vt-appear-opt' }, [ input ].concat(o[2] ? [ svg(o[2], 16) ] : [], [ E('span', { 'data-text': o[1] }, [ o[1] ]) ]));
			}))
		]);
	},

	/* the network path's group, once the menu says the dashboard is here */
	backdropGroup() {
		const n = this.loginNames();
		return this.appearGroup('vt-backdrop', _('Network path background'), [ [ 'grid', n.grid ], [ 'stars', n.stars ], [ 'none', n.none ] ], v => this.setBackdropPref(v));
	},

	/* the dashboard's groups: its network path's background, and the
	   low-power mode */
	dashboardGroups() {
		return [ this.backdropGroup(),
			this.appearGroup('vt-power', _('Low-power router'), [ [ 'normal', _('Off') ], [ 'low', _('On') ] ], v => this.setPowerPref(v)) ];
	},

	appearanceEl() {
		if (this.appear) return this.appear;
		const group = (name, legend, opts, set) => this.appearGroup(name, legend, opts, set);
		const login = this.loginNames();
		const box = E('div', { 'id': 'vt-appearance', 'class': 'vt-appearance', 'role': 'dialog', 'aria-label': _('Appearance', 'vantage-theme'), 'hidden': 'hidden' }, [
			group('vt-colour', _('Colour theme'), [
				[ 'auto', _('Auto', 'vantage-theme'), 'auto' ], [ 'light', _('Light', 'vantage-theme'), 'sun' ], [ 'dark', _('Dark', 'vantage-theme'), 'moon' ]
			], v => this.setTheme(v)),
			group('vt-logo-name', _('Next to the logo'), [
				[ 'none', _('Logo only') ], [ 'hostname', _('Hostname') ], [ 'model', _('Model') ]
			], v => this.setBrandPref(v)),
			group('vt-login', _('Login background'), [ [ 'grid', login.grid ], [ 'stars', login.stars ], [ 'none', login.none ] ], v => this.setLoginPref(v))
		].concat(this.hasDashboard() ? this.dashboardGroups() : [], [
			/* where the picks are kept, when not for every browser (syncAppearance) */
			(this.appearNote = E('p', { 'class': 'vt-appear-note', 'role': 'status', 'hidden': 'hidden' })),
			this.versionEl()
		]));
		box.addEventListener('keydown', ev => {
			if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.closeAppearance(true); }
			else if (ev.key === 'Tab') {
				const sets = box.querySelectorAll('fieldset');
				/* forward, the panel ends at the update check's link when it has one */
				const last = Array.prototype.slice.call(box.querySelectorAll('.vt-appear-ver button, .vt-appear-ver a[href]')).pop();
				const edge = ev.shiftKey ? sets[0] : (last || sets[sets.length - 1]);
				if (edge.contains(ev.target)) { ev.preventDefault(); this.closeAppearance(true); }
			}
		});
		document.addEventListener('keydown', ev => {
			if (!this.appearBtn || box.contains(ev.target)) return;
			if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.closeAppearance(true); }
		}, true);
		document.addEventListener('pointerdown', ev => {
			if (this.appearBtn && !box.contains(ev.target) && !this.appearBtn.contains(ev.target)) this.closeAppearance(false);
		}, true);
		window.addEventListener('resize', () => this.closeAppearance(false));
		window.addEventListener('scroll', ev => { if (!box.contains(ev.target)) this.closeAppearance(false); }, true);
		document.body.appendChild(box);
		return (this.appear = box);
	},

	/* "Vantage 1.0.16 · Check for updates", and what the check found */
	versionEl() {
		const btn = E('button', { 'type': 'button', 'class': 'vt-appear-check' }, [ _('Check for updates') ]);
		const out = E('span', { 'class': 'vt-appear-update', 'role': 'status', 'hidden': 'hidden' });
		btn.addEventListener('click', () => this.checkUpdates(btn, out));
		return E('p', { 'class': 'vt-appear-ver' }, [ E('span', { 'class': 'vt-appear-num' }, [ 'Vantage ' + VERSION ]), ' · ', btn, out ]);
	},

	releaseLink(label) {
		return E('a', { 'href': 'https://github.com/anothaDev/luci-theme-vantage/releases/latest', 'target': '_blank', 'rel': 'noopener noreferrer' }, [ label ]);
	},

	checkUpdates(btn, out) {
		/* aria-disabled, not disabled: a disabled button drops the focus,
		   and with it the panel's keys */
		if (btn.getAttribute('aria-disabled') === 'true') return;
		btn.setAttribute('aria-disabled', 'true');
		out.textContent = _('Checking…');
		out.hidden = false;
		const ctl = window.AbortController ? new AbortController() : null;
		const timer = ctl ? setTimeout(() => ctl.abort(), 10000) : 0;
		fetch(UPDATE_INDEX, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
			.then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
			.then(text => {
				const latest = listedVersion(text);
				if (!latest) throw new Error('no version');
				out.textContent = '';
				if (newerVersion(versionParts(latest), versionParts(VERSION))) {
					out.appendChild(document.createTextNode(_('Version %s is available.').format(latest) + ' '));
					out.appendChild(this.releaseLink(_('What\'s new')));
				}
				else out.textContent = _('Up to date');
			})
			/* offline, or a router whose pages forbid the request (a
			   Content-Security-Policy): the release page still opens */
			.catch(e => {
				if (window.console) console.warn('vantage: update check', e);
				out.textContent = _('Could not check for updates.') + ' ';
				out.appendChild(this.releaseLink(_('See the latest release')));
			})
			.then(() => { clearTimeout(timer); btn.removeAttribute('aria-disabled'); });
	},

	syncAppearance() {
		if (!this.appear) return;
		const now = { 'vt-colour': this.themePref(), 'vt-logo-name': this.brandPref(), 'vt-login': this.loginPref(), 'vt-backdrop': this.backdropPref(), 'vt-power': this.powerPref() };
		Array.prototype.forEach.call(this.appear.querySelectorAll('input[type="radio"]'), r => { r.checked = (now[r.name] === r.value); });
		const state = this.lookState();
		const note = state === 'relogin' ? _('Log in again to save Appearance for every browser.')
			: state !== 'yes' ? _('Saved in this browser only.')
			: this.lookFailing() ? _('Could not save this for every browser. Try again.') : '';
		if (this.appearNote) {
			if (this.appearNote.textContent !== note) this.appearNote.textContent = note;
			this.appearNote.hidden = !note;
		}
	},

	openAppearance(btn) {
		this.closeActMenu(false);
		this.closeHelp(false);
		const box = this.appearanceEl();
		this.syncAppearance();
		box.style.maxHeight = '';
		box.hidden = false;
		/* below the button, right edges aligned, above the phone's bottom bar */
		const r = btn.getBoundingClientRect(), w = box.offsetWidth;
		const rail = this.mqMobile && this.mqMobile.matches ? document.querySelector('.vt-rail') : null;
		const floor = rail ? rail.getBoundingClientRect().top : window.innerHeight;
		const top = r.bottom + 6;
		if (box.offsetHeight > floor - 8 - top) box.style.maxHeight = Math.max(0, floor - 8 - top).toFixed(0) + 'px';
		box.style.top = top.toFixed(0) + 'px';
		box.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)).toFixed(0) + 'px';
		btn.setAttribute('aria-controls', 'vt-appearance');
		btn.setAttribute('aria-expanded', 'true');
		this.appearBtn = btn;
		const on = box.querySelector('input:checked');
		if (on) on.focus();
	},

	closeAppearance(refocus) {
		const btn = this.appearBtn;
		if (!btn) return;
		this.appearBtn = null;
		this.appear.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
		if (refocus && btn.isConnected) btn.focus();
	},

	/* --------------------------------------------------- host chip */

	loadHost() {
		const chip = document.getElementById('vt-host');
		L.resolveDefault(callBoard(), {}).then(board => {
			if (!board || !board.hostname) return;
			const product = host.productName(board);
			this.hostname = board.hostname;
			this.board = board;
			this.updateTitle();
			this.applyBrand();
			if (!chip) return;
			chip.textContent = '';
			/* device strings go in as text nodes (E() would parse a string as HTML) */
			const text = v => [ document.createTextNode(String(v)) ];
			host.chipNames(board.hostname, product).forEach((name, i) => {
				if (i) chip.appendChild(E('span', { 'class': 'vt-host-sep', 'aria-hidden': 'true' }, text('·')));
				chip.appendChild(i ? E('span', {}, text(name)) : E('b', {}, text(name)));
			});
			const rel = board.release && board.release.description;
			chip.setAttribute('title', [ board.hostname, product, rel ].filter(Boolean).join('\n'));
			chip.hidden = false;
		});
	},

	updateTitle() {
		const parts = [ this.pageTitle, this.hostname ].filter(Boolean);
		if (parts.length) document.title = parts.join(' · ');
	},

	/* -------------------------------------------------- indicators */

	setupIndicators() {
		const box = document.getElementById('indicators');
		if (!box) return;
		const decorate = () => {
			box.querySelectorAll('span[data-indicator]').forEach(el => {
				const node = el.firstChild;
				const text = (node && node.nodeType === 3) ? node.data : el.textContent;
				const m = /^(.*?):\s*(\d+)\s*$/.exec(text || '');
				if (m) {
					if (el.getAttribute('data-count') !== m[2]) el.setAttribute('data-count', m[2]);
					if (el.getAttribute('data-label') !== m[1]) el.setAttribute('data-label', m[1]);
				}
				else if (el.hasAttribute('data-count')) {
					el.removeAttribute('data-count');
					el.removeAttribute('data-label');
				}
				if (el.getAttribute('title') !== text) el.setAttribute('title', text);
				if (el.hasAttribute('data-clickable') && !el.hasAttribute('tabindex')) {
					el.setAttribute('tabindex', '0');
					el.setAttribute('role', 'button');
					el.addEventListener('keydown', ev => {
						if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
					});
				}
			});
		};
		new MutationObserver(decorate).observe(box, { childList: true, subtree: true, characterData: true });
		decorate();
		/* another window has the focus: the refresh dot's pulse stops
		   (vantage.css), as a moving part keeps the browser drawing */
		const root = document.documentElement;
		const focus = () => root.toggleAttribute('data-vt-blur', !document.hasFocus());
		window.addEventListener('blur', focus);
		window.addEventListener('focus', focus);
		focus();
		this.setupMotionClock(box);
	},

	/* ------------------------------------------------- motion clock */

	/* the dot's pulse (vt-live, vt-live-soft; vantage.css) paused as it
	   starts and stepped from here; one CSS takes away (blur, Low-power
	   router, the poll stopped) goes idle and is dropped */
	setupMotionClock(box) {
		const c = this.clock = { anims: [], raf: 0, timer: 0, last: 0, appAt: 0, watchdog: 0 };
		box.addEventListener('animationstart', ev => {
			if (!/^vt-live/.test(ev.animationName || '') || typeof ev.target.getAnimations !== 'function') return;
			ev.target.getAnimations({ subtree: true }).forEach(a => {
				if (!a.effect || !/^vt-live/.test(a.animationName || '') || a.playState !== 'running' || c.anims.some(x => x.a === a)) return;
				a.pause();
				const tm = a.effect.getTiming();
				c.anims.push({ a, dur: typeof tm.duration === 'number' && tm.duration > 0 ? tm.duration : 0, at: 0 });
			});
			this.kickMotion();
		});
		/* one CSS took away (blur, Low-power router, the poll stopped, the
		   dot's state changed) or ended (reduced motion switched on: it
		   turns finite, and a paused one stays "paused") is dropped on its
		   event, the animation the event is for and any other cancelled
		   one; at the next step (stepPulses) when that comes first */
		const isFor = (a, ev) => !!a.effect && a.effect.target === ev.target && (a.effect.pseudoElement || '') === (ev.pseudoElement || '') && a.animationName === ev.animationName;
		const drop = ev => { if (/^vt-live/.test(ev.animationName || '')) c.anims = c.anims.filter(x => !isFor(x.a, ev) && x.a.playState !== 'idle'); };
		box.addEventListener('animationcancel', drop);
		box.addEventListener('animationend', drop);
		/* the dashboard's clock: its frames are this page's */
		window.addEventListener(MOTION_EVENT, ev => {
			c.appAt = performance.now();
			if (c.timer) { window.clearTimeout(c.timer); c.timer = 0; }
			if (c.raf) { window.cancelAnimationFrame(c.raf); c.raf = 0; }
			this.stepPulses(ev.detail && +ev.detail.dt || 0);
			/* and when they stop, this page's own again */
			if (c.watchdog) window.clearTimeout(c.watchdog);
			c.watchdog = window.setTimeout(() => { c.watchdog = 0; c.appAt = 0; c.last = 0; this.kickMotion(); }, 4 * MOTION_MS);
		});
	},

	stepPulses(dt) {
		const c = this.clock;
		/* one CSS cancelled since the last step is dropped, not stepped: a
		   time written to a cancelled animation brings it back, paused,
		   with nothing left to stop it (its animationcancel comes after).
		   Asking brings the style up to date once a step, the first time */
		c.anims = c.anims.filter(x => x.a.playState !== 'idle');
		/* the time is kept here, never read back: reading a CSS animation's
		   currentTime makes the browser bring the style up to date first */
		c.anims.forEach(x => {
			let t = x.at + dt;
			if (x.dur > 0 && t >= x.dur) t -= Math.floor(t / x.dur) * x.dur;
			x.at = t;
			x.a.currentTime = t;
		});
	},

	kickMotion() {
		const c = this.clock;
		if (!c || c.raf || c.timer || c.appAt || !c.anims.length) return;
		c.last = 0;
		c.raf = window.requestAnimationFrame(t => this.tickMotion(t));
	},

	tickMotion(t) {
		const c = this.clock;
		c.raf = 0;
		if (!c.anims.length || c.appAt) { c.last = 0; return; }
		this.stepPulses(c.last ? Math.min(t - c.last, 4 * MOTION_MS) : 0);
		c.last = t;
		c.timer = window.setTimeout(() => { c.timer = 0; if (!c.raf) c.raf = window.requestAnimationFrame(t => this.tickMotion(t)); }, MOTION_MS - 12);
	},

	/* ------------------------------------------ technical numerals */

	setupNumerals() {
		const main = document.getElementById('maincontent');
		if (!main || !window.MutationObserver) return;
		/* the dashboard app sets its own numerals */
		if (document.body.getAttribute('data-page') === 'admin-dashboard') return;
		let queued = false;
		const skip = 'input,select,textarea,button,.btn,.cbi-button,.cbi-dropdown,img,.ifacebadge,.zonebadge,.cbi-progressbar,table,.table';
		const scan = () => {
			queued = false;
			main.querySelectorAll('td, .td, .ifacebox-body > span > span').forEach(cell => {
				if (cell.closest('.vt-app')) return;
				const text = cell.textContent;
				if (cell._vtText === text) return;
				cell._vtText = text;
				cell.classList.toggle('vt-num', !cell.querySelector(skip) && technical(text));
			});
		};
		new MutationObserver(() => {
			if (queued) return;
			queued = true;
			window.requestAnimationFrame(scan);
		}).observe(main, { childList: true, subtree: true, characterData: true });
		scan();
	},

	/* --------------------------------------------------------- tooltips */

	/* LuCI places hover tooltips with CSS only, beside their container: one
	   that would leave the screen (a port box at the edge of Status ->
	   Port status) is moved back in, once per container entered */
	setupTooltips() {
		const fit = ev => {
			const box = ev.target && ev.target.closest ? ev.target.closest('.cbi-tooltip-container') : null;
			if (box === this.tipBox) return;
			this.tipBox = box;
			const tip = box && box.querySelector(':scope > .cbi-tooltip');
			if (!tip) return;
			tip.style.removeProperty('--vt-tip-dx');
			const r = tip.getBoundingClientRect(), pad = 8, w = document.documentElement.clientWidth;
			/* still parked off-screen (not shown yet): nothing to measure */
			if (r.right < -1000) { this.tipBox = null; return; }
			const dx = r.left < pad ? pad - r.left : r.right > w - pad ? w - pad - r.right : 0;
			if (dx) tip.style.setProperty('--vt-tip-dx', dx.toFixed(0) + 'px');
		};
		document.addEventListener('mouseover', fit, true);
	},

	/* ---------------------------------------------------- form chrome */

	/* LuCI renders forms into #view and the modal, and renders them again
	   after a save: watch the body and decorate what is new. This adds (i)
	   buttons and sets classes and attributes; LuCI's text and the order of
	   LuCI's nodes stay as they are. */
	setupForms() {
		this.formsQueued = false;
		this.helpSeq = 0;
		this.helpSizes = window.ResizeObserver ? new ResizeObserver(entries => this.fitHelps(entries.map(e => e.target))) : null;
		/* not for the dashboard's own redraws (each poll): it holds no
		   LuCI form; a modal opened over it sits outside it */
		const inApp = r => r.target.nodeType === 1 && !!r.target.closest('.vt-app');
		if (window.MutationObserver)
			new MutationObserver(records => { if (!records.every(inApp)) this.queueForms(); }).observe(document.body, { childList: true, subtree: true });
		this.decorateForms();
	},

	queueForms() {
		if (this.formsQueued) return;
		this.formsQueued = true;
		window.requestAnimationFrame(() => {
			this.formsQueued = false;
			this.decorateForms();
		});
	},

	decorateForms() {
		document.querySelectorAll('.cbi-value > .cbi-value-title + .cbi-value-field > .cbi-value-description:not(.vt-help-text)')
			.forEach(desc => this.addFieldHelp(desc));
		document.querySelectorAll(':is(.cbi-map-descr, .cbi-section-descr):not(:has(> .vt-help))')
			.forEach(desc => this.addIntroHelp(desc));
		this.markRepeats();
		this.decorateRowActions();
	},

	/* ---------------------------------------------- row action menus */

	/* A table row folds when it has a main action (Edit, else LuCI's
	   "important" button) and at least two others to put in a ⋯ menu.
	   Add, "important" and plain action buttons stay out of the menu: they
	   are what the row is for (Wireless's Add, Wake on LAN's Wake). Rows
	   of peer actions (Startup, Processes) have no main one and stay as
	   LuCI drew them. LuCI's buttons stay where LuCI put them, only
	   hidden: a menu item clicks the original, so the handler, any
	   confirmation and the current label (Enable or Disable) are LuCI's
	   own. The drag handle stays. */
	decorateRowActions() {
		document.querySelectorAll('.cbi-section-actions > div').forEach(box => {
			if (!box.closest('.vt-app')) this.foldRow(box);
		});
	},

	/* runs again whenever LuCI touches the row's buttons, so it only
	   writes what changed (a write would wake its own observer) */
	foldRow(box) {
		const btns = Array.prototype.filter.call(box.children, n =>
			n.matches('button, .btn, .cbi-button, input[type="button"], input[type="submit"]') &&
			!n.matches('.drag-handle, .vt-acts-more') && !n.hidden && n.style.display !== 'none');
		const main = btns.find(b => b.matches('.cbi-button-edit')) || btns.find(b => b.matches('.important'));
		const fold = main ? btns.filter(b => b !== main && !b.matches('.important, .cbi-button-add, .cbi-button-action')) : [];
		if (!box._vtWatch && window.MutationObserver) {
			/* LuCI's class, disabled, hidden and relabel changes are not
			   childList ones: the body observer misses them */
			box._vtWatch = new window.MutationObserver(recs => {
				const m = box.querySelector(':scope > .vt-acts-more');
				if (recs.some(r => !(m && m.contains(r.target)))) this.foldRow(box);
			});
			box._vtWatch.observe(box, { subtree: true, characterData: true, attributes: true, attributeFilter: [ 'class', 'disabled', 'hidden', 'style', 'title' ] });
		}
		let more = box.querySelector(':scope > .vt-acts-more');
		const on = fold.length >= 2;
		Array.prototype.forEach.call(box.children, c => c.classList.toggle('vt-acts-hidden', on && fold.includes(c)));
		box.classList.toggle('vt-acts', on);
		if (!on) {
			if (more) {
				/* focus on ⋯ or in its menu moves to the row's first action */
				const had = more.contains(document.activeElement) || (this.actBtn === more && this.actMenu.contains(document.activeElement));
				if (this.actBtn === more) this.closeActMenu(false);
				more.remove();
				if (had && btns[0]) btns[0].focus();
			}
			return;
		}
		if (!more) more = box.appendChild(this.moreButton(box));
		/* LuCI spins and disables the hidden original while its action
		   runs (ui.createHandlerFn, or the view itself): ⋯ shows the
		   spinner until it settles, and stays usable for the others */
		const busy = fold.some(b => b.classList.contains('spinning'));
		if (more.classList.contains('spinning') !== busy) {
			more.classList.toggle('spinning', busy);
			if (busy) more.setAttribute('aria-busy', 'true');
			else more.removeAttribute('aria-busy');
		}
		if (this.actBtn === more) this.fillActMenu(box, false);
	},

	moreButton(box) {
		/* the shared menu exists from the first ⋯ on, so aria-controls names a real element */
		this.actMenuEl();
		const btn = E('button', {
			'type': 'button', 'class': 'cbi-button cbi-button-neutral vt-acts-more',
			'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'vt-actmenu',
			'aria-label': _('More actions', 'vantage-theme'), 'title': _('More actions', 'vantage-theme')
		}, [ svg('more', 18) ]);
		btn.addEventListener('click', ev => {
			ev.preventDefault();
			if (this.actBtn === btn) this.closeActMenu(false);
			else this.openActMenu(btn, box, ev.detail === 0, false);
		});
		btn.addEventListener('keydown', ev => {
			if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
			ev.preventDefault();
			this.openActMenu(btn, box, true, ev.key === 'ArrowUp');
		});
		return btn;
	},

	actMenuEl() {
		if (this.actMenu) return this.actMenu;
		const menu = E('div', { 'id': 'vt-actmenu', 'class': 'vt-actmenu', 'role': 'menu', 'aria-label': _('More actions', 'vantage-theme'), 'hidden': 'hidden' });
		menu.addEventListener('keydown', ev => {
			const items = Array.prototype.filter.call(menu.querySelectorAll('[role="menuitem"]'), n => !n.disabled);
			const i = items.indexOf(document.activeElement);
			if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.closeActMenu(true); }
			/* back on ⋯ before the browser moves focus, so Tab goes on from
			   the row, not from the menu at the end of the page */
			else if (ev.key === 'Tab') this.closeActMenu(true);
			else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Home' || ev.key === 'End') {
				ev.preventDefault();
				const n = items.length;
				const to = ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : ev.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
				if (items[to]) items[to].focus();
			}
		});
		/* opened with the mouse or a tap, focus stays on ⋯ (or nowhere):
		   Escape and Tab still close it. Capture, so a modal under it
		   does not take the same Escape. */
		document.addEventListener('keydown', ev => {
			if (!this.actBtn || this.pal || menu.contains(ev.target)) return;
			if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.closeActMenu(true); }
			else if (ev.key === 'Tab') this.closeActMenu(false);
		}, true);
		document.addEventListener('pointerdown', ev => {
			if (this.actBtn && !menu.contains(ev.target) && !this.actBtn.contains(ev.target)) this.closeActMenu(false);
		}, true);
		window.addEventListener('resize', () => this.closeActMenu(false));
		/* the page scrolling away closes it; the menu's own scroll does not */
		window.addEventListener('scroll', ev => { if (!menu.contains(ev.target)) this.closeActMenu(false); }, true);
		document.body.appendChild(menu);
		return (this.actMenu = menu);
	},

	/* one item per hidden original, with its current label, tooltip and
	   disabled state. While open it is filled again when LuCI changes one
	   (DDNS's poll disables Stop), but only then, since a refill is a
	   childList change the body observer answers with another pass. */
	fillActMenu(box, force) {
		const menu = this.actMenuEl();
		const origs = Array.prototype.slice.call(box.querySelectorAll(':scope > .vt-acts-hidden'));
		const desc = origs.map(orig => {
			const title = orig.getAttribute('title');
			return {
				orig, title,
				label: (orig.tagName === 'INPUT' ? orig.value : orig.textContent.trim()) || title || orig.getAttribute('aria-label') || '',
				danger: orig.matches('.cbi-button-remove, .cbi-button-negative, .remove'),
				disabled: !!orig.disabled
			};
		});
		const sig = JSON.stringify(desc.map(d => [ d.label, d.title, d.danger, d.disabled ]));
		if (!force && sig === this.actSig && menu.children.length === origs.length &&
		    Array.prototype.every.call(menu.children, (item, k) => item._vtOrig === origs[k])) return;
		this.actSig = sig;
		const had = menu.contains(document.activeElement) ? document.activeElement._vtOrig : null;
		menu.textContent = '';
		desc.forEach(d => {
			const item = E('button', {
				'type': 'button', 'role': 'menuitem', 'tabindex': '-1',
				'class': 'vt-actmenu-item' + (d.danger ? ' is-danger' : ''),
				'title': d.title || null,
				'disabled': d.disabled ? 'disabled' : null
			}, [ d.label ]);
			item._vtOrig = d.orig;
			item.addEventListener('click', () => {
				this.closeActMenu(true);
				d.orig.click();
			});
			menu.appendChild(item);
		});
		/* the focused item was replaced: focus its successor, or the first
		   enabled one, so the arrow keys keep working */
		if (had) {
			const items = Array.prototype.filter.call(menu.children, n => !n.disabled);
			const same = items.find(n => n._vtOrig === had);
			if (same || items[0]) (same || items[0]).focus();
			else this.closeActMenu(true);
		}
	},

	openActMenu(btn, box, focusFirst, focusLast) {
		this.closeActMenu(false);
		const menu = this.actMenuEl();
		this.fillActMenu(box, true);
		menu.style.maxHeight = '';
		menu.hidden = false;
		/* below the button, or above it when the screen (or the phone's
		   bottom bar) leaves no room; right edges aligned. When neither
		   side fits (a landscape phone), the roomier one, scrolling, so
		   the menu never covers its own button. */
		const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
		const rail = this.mqMobile && this.mqMobile.matches ? document.querySelector('.vt-rail') : null;
		const floor = rail ? rail.getBoundingClientRect().top : window.innerHeight;
		const below = floor - 8 - (r.bottom + 6), above = r.top - 6 - 8;
		const down = h <= below || (h > above && below >= above);
		const room = down ? below : above;
		if (h > room) menu.style.maxHeight = Math.max(0, room).toFixed(0) + 'px';
		const top = down ? r.bottom + 6 : r.top - 6 - Math.min(h, room);
		const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
		menu.style.top = top.toFixed(0) + 'px';
		menu.style.left = left.toFixed(0) + 'px';
		btn.setAttribute('aria-expanded', 'true');
		this.actBtn = btn;
		if (focusFirst) {
			const items = Array.prototype.filter.call(menu.querySelectorAll('[role="menuitem"]'), n => !n.disabled);
			const target = focusLast ? items[items.length - 1] : items[0];
			if (target) target.focus();
		}
	},

	closeActMenu(refocus) {
		const btn = this.actBtn;
		if (!btn) return;
		this.actBtn = null;
		if (this.actMenu) this.actMenu.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
		if (refocus && btn.isConnected) btn.focus();
	},

	/* Help text that fits on one line shows as it is. Longer text folds to
	   one line, which ends after the first sentence or fades out, and (i)
	   shows all of it in a box over the page. LuCI also puts warnings here,
	   as a paragraph that opens with a label ("Note:", "注意："), so text
	   with one of those never folds.
	   Field help: the button sits in the label column, after the field,
	   because LuCI's label click handler finds the widget through
	   nextElementSibling. */
	addFieldHelp(desc) {
		const row = desc.parentNode.parentNode;
		const title = row.querySelector(':scope > .cbi-value-title');
		row.appendChild(this.helpToggle(desc, row, _('Show full help: %s').format(title.textContent.trim())));
	},

	/* Page and section intros: the button leads the first line, inside the
	   description, since nothing may stand between LuCI's siblings (ui.tabs
	   finds a tab menu as its pane group's previous sibling). The fold needs
	   the button, so a view that rewrote the text would show it whole until
	   the next pass adds the button again. The folded line opens the box on
	   a click too, a bigger target on touch than the icon. */
	addIntroHelp(desc) {
		if (desc.closest('.vt-app') || !desc.textContent.trim()) return;
		desc.insertBefore(this.helpToggle(desc, desc, _('Show full description')), desc.firstChild);
		if (desc._vtIntroClick) return;
		desc._vtIntroClick = true;
		desc.addEventListener('click', ev => {
			const btn = desc.querySelector(':scope > .vt-help');
			if (!btn || btn.hidden || btn.contains(ev.target) || ev.target.closest('a')) return;
			if (String(window.getSelection())) return;
			if (this.helpBtn === btn && this.helpPinned) this.closeHelp(false);
			else this.openHelp(btn, desc, true, false);
		});
	},

	/* The (i) button for desc. Whether desc folds lives on holder (the field
	   row, or the intro itself) as data-v-help, which the CSS folds by. The
	   box opens on hover and on keyboard focus, and a click or tap pins it. */
	helpToggle(desc, holder, label) {
		holder.setAttribute('data-v-help', this.helpSizes ? 'fold' : 'show');
		desc.classList.add('vt-help-text');
		if (!desc.id) desc.id = 'vt-help-' + (++this.helpSeq);
		const btn = E('button', {
			'class': 'vt-help', 'type': 'button', 'hidden': '',
			'aria-expanded': 'false', 'aria-controls': 'vt-help-pop', 'aria-describedby': desc.id,
			'aria-label': label,
			'click': ev => {
				if (this.helpBtn === btn && this.helpPinned) this.closeHelp(false);
				else this.openHelp(btn, desc, true, ev.detail === 0);
			},
			'mouseenter': () => this.hoverHelp(btn, desc),
			'mouseleave': () => this.leaveHelp(),
			'focus': () => { if (!this.helpRefocus && btn.matches(':focus-visible')) this.openHelp(btn, desc, false, false); },
			'blur': ev => {
				if (!this.helpPinned && this.helpBtn === btn && !(this.helpPop && this.helpPop.contains(ev.relatedTarget)))
					this.closeHelp(false);
			}
		}, [ svg('info', 16) ]);
		desc._vtHelp = { btn: btn, holder: holder };
		if (this.helpSizes) this.helpSizes.observe(desc);
		return btn;
	},

	/* (i) shows, and the text folds to a line, while the text needs more
	   than one line. Text that is not displayed (another tab, an unmet
	   dependency) measures 0 and waits for the next resize notification.
	   All sizes are read before any button changes: a write between two
	   reads forced a layout per field (66 when the Wireless modal opened).
	   Folded, the text still measures its full height. The line's end is
	   set as data-v-end ("cut" at --vt-cut, or "fade"), which the CSS reads. */
	fitHelps(descs) {
		const fits = [];
		for (const desc of descs) {
			if (!desc.isConnected) {
				if (this.helpSizes) this.helpSizes.unobserve(desc);
				continue;
			}
			const h = desc._vtHelp;
			if (!h || !h.btn.isConnected || !desc.clientWidth) continue;
			const cs = window.getComputedStyle(desc);
			const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
			const text = desc.scrollHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
			const fold = text > line * 1.5 && !helpWarns(desc);
			const cut = fold ? helpCut(desc, cs, line) : null;
			fits.push([ h, desc, fold, cut, line, fold && cut === null ? helpLineEnd(desc, cs, line) : null ]);
		}
		/* an intro's (i) sits in its line, so showing it moves the text:
		   that line is measured again once laid out */
		const again = [];
		for (const [ h, desc, fold, cut, line, end ] of fits) {
			const state = fold ? 'fold' : 'show';
			if (h.holder.getAttribute('data-v-help') !== state) h.holder.setAttribute('data-v-help', state);
			if (h.btn.hidden === fold) {
				h.btn.hidden = !fold;
				if (fold && h.holder === desc) again.push(desc);
			}
			if (!fold) {
				desc.removeAttribute('data-v-end');
				if (this.helpBtn === h.btn) this.closeHelp(false);
				continue;
			}
			desc.setAttribute('data-v-end', cut === null ? 'fade' : 'cut');
			if (cut !== null || end !== null) desc.style.setProperty('--vt-cut', (cut !== null ? cut : end).toFixed(0) + 'px');
			else desc.style.removeProperty('--vt-cut');
			desc.style.setProperty('--vt-line', line.toFixed(2) + 'px');
		}
		if (again.length) window.requestAnimationFrame(() => this.fitHelps(again));
	},

	/* the box (i) opens: one for the page, filled with a copy of the
	   description's nodes, so LuCI's own stay where they are */
	helpPopEl() {
		if (this.helpPop) return this.helpPop;
		const pop = E('div', { 'id': 'vt-help-pop', 'class': 'vt-help-pop', 'hidden': 'hidden' });
		pop.addEventListener('mouseenter', () => window.clearTimeout(this.helpTimer));
		pop.addEventListener('mouseleave', () => this.leaveHelp());
		/* opened from the keyboard, focus is in the box: Tab past either end
		   goes back on (i) first, so it goes on from the field, not from the
		   box at the end of the page */
		pop.addEventListener('keydown', ev => {
			if (ev.key !== 'Tab') return;
			const stops = pop.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
			const i = Array.prototype.indexOf.call(stops, document.activeElement);
			if (ev.shiftKey ? i <= 0 : i === stops.length - 1) this.closeHelp(true);
		});
		pop.addEventListener('focusout', ev => {
			if (this.helpBtn && !pop.contains(ev.relatedTarget) && ev.relatedTarget !== this.helpBtn) this.closeHelp(false);
		});
		/* capture, so a modal under it does not take the same Escape; an
		   open list takes its own first. Focus goes back to (i) only from
		   the box or (i), not from a field typed in under a hover box. */
		const openList = CSS.supports('selector(:open)') ? 'select:open, .cbi-dropdown[open]' : '.cbi-dropdown[open]';
		document.addEventListener('keydown', ev => {
			if (!this.helpBtn || ev.key !== 'Escape' || (ev.target.closest && ev.target.closest(openList))) return;
			ev.preventDefault();
			ev.stopPropagation();
			const from = document.activeElement;
			this.closeHelp(pop.contains(from) || from === this.helpBtn);
		}, true);
		/* a click on an intro's folded line toggles the box itself */
		document.addEventListener('pointerdown', ev => {
			if (!this.helpBtn || pop.contains(ev.target) || this.helpBtn.contains(ev.target)) return;
			const intro = this.helpBtn.parentNode;
			if (intro.matches('.cbi-map-descr, .cbi-section-descr') && intro.contains(ev.target)) return;
			this.closeHelp(false);
		}, true);
		window.addEventListener('resize', () => this.closeHelp(false));
		window.addEventListener('scroll', ev => { if (!pop.contains(ev.target)) this.closeHelp(false); }, true);
		document.body.appendChild(pop);
		return (this.helpPop = pop);
	},

	hoverHelp(btn, desc) {
		if (this.helpPinned) return;
		window.clearTimeout(this.helpTimer);
		this.helpTimer = window.setTimeout(() => this.openHelp(btn, desc, false, false), this.helpBtn ? 0 : 120);
	},

	leaveHelp() {
		if (this.helpPinned) return;
		window.clearTimeout(this.helpTimer);
		this.helpTimer = window.setTimeout(() => this.closeHelp(false), 160);
	},

	openHelp(btn, desc, pinned, focusIn) {
		window.clearTimeout(this.helpTimer);
		const pop = this.helpPopEl();
		const enter = () => {
			const link = focusIn && pop.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
			if (link) link.focus();
		};
		/* open already (on hover or keyboard focus): a click pins it, Enter
		   also moves into it */
		if (this.helpBtn === btn) {
			this.helpPinned = this.helpPinned || pinned;
			enter();
			return;
		}
		this.closeHelp(false);
		const copy = [];
		desc.childNodes.forEach(n => {
			if (n === btn) return;
			const c = n.cloneNode(true);
			if (c.nodeType === 1) {
				c.removeAttribute('id');
				c.querySelectorAll('[id]').forEach(m => m.removeAttribute('id'));
			}
			copy.push(c);
		});
		pop.replaceChildren.apply(pop, copy);
		pop.style.maxHeight = '';
		pop.hidden = false;
		/* under (i), or above it when the screen (or the phone's bottom bar)
		   leaves no room; the roomier side scrolls when neither fits */
		const r = btn.getBoundingClientRect(), w = pop.offsetWidth, ht = pop.offsetHeight;
		const rail = this.mqMobile && this.mqMobile.matches ? document.querySelector('.vt-rail') : null;
		const floor = rail ? rail.getBoundingClientRect().top : window.innerHeight;
		const below = floor - 8 - (r.bottom + 6), above = r.top - 6 - 8;
		const down = ht <= below || (ht > above && below >= above);
		const room = down ? below : above;
		if (ht > room) pop.style.maxHeight = Math.max(0, room).toFixed(0) + 'px';
		const top = down ? r.bottom + 6 : r.top - 6 - Math.min(ht, room);
		const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8));
		pop.style.top = top.toFixed(0) + 'px';
		pop.style.left = left.toFixed(0) + 'px';
		btn.setAttribute('aria-expanded', 'true');
		this.helpBtn = btn;
		this.helpPinned = pinned;
		enter();
	},

	closeHelp(refocus) {
		window.clearTimeout(this.helpTimer);
		const btn = this.helpBtn;
		if (!btn) return;
		this.helpBtn = null;
		this.helpPinned = false;
		this.helpPop.hidden = true;
		this.helpPop.textContent = '';
		btn.setAttribute('aria-expanded', 'false');
		if (refocus && btn.isConnected) {
			this.helpRefocus = true;
			btn.focus();
			this.helpRefocus = false;
		}
	},

	/* A page title or card heading that only repeats the breadcrumb, the
	   map title or its own tab's name is hidden visually; screen readers
	   still get it as a heading. Headings that hold a control (Overview's
	   Hide/Show label) always stay. */
	markRepeats() {
		/* template pages (Status -> Overview) print their title before #view */
		document.querySelectorAll('#maincontent > h2, #view h2, #view .cbi-section > h3:first-child').forEach(h => {
			if (h.closest('.vt-app') || h.querySelector('a, button, input, select, [data-clickable], [tabindex]')) return;
			const key = headingKey(h.textContent);
			let repeat = repeatsTrail(key, h.tagName, this.trail);
			if (!repeat && h.tagName === 'H3') {
				const map = h.closest('.cbi-map');
				const mapTitle = map && map.querySelector(':scope > h2');
				const pane = h.closest('[data-tab-title]');
				repeat = (mapTitle && headingKey(mapTitle.textContent) === key) ||
					(pane && headingKey(pane.getAttribute('data-tab-title')) === key);
			}
			h.classList.toggle('vt-repeat', !!(key && repeat));
		});
	}
});
