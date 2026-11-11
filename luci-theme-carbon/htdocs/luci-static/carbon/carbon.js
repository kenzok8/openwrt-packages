/*!
 * Carbon — an Apple-style LuCI theme for everyday users
 * UI runtime: appearance, navigation, charts and the dashboard.
 *
 * This file has no LuCI dependency. LuCI-specific glue (menu tree,
 * ubus calls) lives in luci-static/resources/menu-carbon.js; the
 * preview pages feed it mock data instead.
 *
 * Licensed under the Apache License 2.0.
 */
(function (window, document) {
	'use strict';

	const C = window.Carbon = window.Carbon || {};

	/* directory this script was loaded from (…/luci-static/carbon/). The theme
	   template appends ?v=<package version>, the single version source. */
	const SRC = (document.currentScript && document.currentScript.src) || '';
	const BASE = SRC.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
	C.version = (/[?&]v=([0-9A-Za-z._-]+)/.exec(SRC) || [])[1] || C.version || 'dev';

	/* ------------------------------------------------------------------
	 * Storage (never throws)
	 * ------------------------------------------------------------------ */
	const store = C.store = {
		get(key, def) {
			try { const v = window.localStorage.getItem(key); return v == null ? def : v; }
			catch (e) { return def; }
		},
		set(key, val) {
			try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
		}
	};

	/* ------------------------------------------------------------------
	 * i18n — theme strings come from po/<lang>/carbon.po, compiled into
	 * i18n/<lang>.js (C.I18N) by scripts/gen-i18n.py and loaded before this
	 * file. Strings without a bundled translation fall back to LuCI's own
	 * catalogues (window._), then English. N_() only marks table strings
	 * for extraction.
	 * ------------------------------------------------------------------ */
	const langAttr = (document.documentElement.getAttribute('lang') || navigator.language || 'en').replace(/_/g, '-');
	/* LuCI language code → catalogue code (same table as the theme header and
	   scripts/gen-i18n.py) */
	const LANG_ALIAS = C.LANG_ALIAS = { 'zh-hans': 'zh-cn', 'zh-sg': 'zh-cn', 'zh-hant': 'zh-tw', 'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw' };
	const LOCALE_ALIAS = { 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW' };
	C.locale = LOCALE_ALIAS[LANG_ALIAS[langAttr.toLowerCase()] || langAttr.toLowerCase()] || langAttr;
	try { new Intl.NumberFormat(C.locale); } catch (e) { C.locale = 'en-US'; }
	C.lang = C.locale.split('-')[0].toLowerCase();
	const N_ = (s) => s;
	C.t = function (s) {
		const dict = C.I18N || {};
		let out = Object.prototype.hasOwnProperty.call(dict, s) && dict[s] ? dict[s] : null;
		if (out == null && C.lang !== 'en' && typeof window._ === 'function') {
			try { out = window._(s); } catch (e) { out = null; }
		}
		if (typeof out !== 'string' || !out) out = s;
		const args = Array.prototype.slice.call(arguments, 1);
		let i = 0;
		/* one pass, literal values: arguments may contain "%s" or "$&" */
		return args.length ? out.replace(/%[sd]/g, (m) => (i < args.length ? String(args[i++]) : m)) : out;
	};
	const t = C.t;

	/* ------------------------------------------------------------------
	 * Helpers
	 * ------------------------------------------------------------------ */
	const esc = C.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

	const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

	function h(tag, attrs, children) {
		const el = document.createElement(tag);
		if (attrs) {
			for (const k in attrs) {
				const v = attrs[k];
				if (v == null || v === false) continue;
				if (k === 'class') el.className = v;
				else if (k === 'html') el.innerHTML = v;
				else if (k === 'text') el.textContent = v;
				else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
				else el.setAttribute(k, v === true ? '' : v);
			}
		}
		append(el, children);
		return el;
	}
	function append(el, children) {
		if (children == null) return;
		if (!Array.isArray(children)) children = [children];
		children.forEach((c) => {
			if (c == null || c === false) return;
			el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
		});
	}
	C.h = h;

	/* ------------------------------------------------------------------
	 * Formatting
	 * ------------------------------------------------------------------ */
	const fmt = C.fmt = {
		bytes(n, perSec) {
			if (n == null || isNaN(n)) return ['—', ''];
			const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
			let i = 0;
			n = Math.max(0, +n);
			while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
			const s = (i === 0 || n >= 100) ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '');
			return [s, units[i] + (perSec ? '/s' : '')];
		},
		/* "used / total UNIT", both expressed in the total's unit: "149 / 428 MB", "0.99 / 177 MB" */
		pair(a, b) {
			const y = fmt.bytes(b);
			const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
			const v = Math.max(0, +a || 0) / Math.pow(1024, Math.max(0, units.indexOf(y[1])));
			const s = v >= 100 || v === 0 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '');
			return s + ' / ' + y[0] + ' ' + y[1];
		},
		bytesStr(n, perSec) {
			const r = fmt.bytes(n, perSec);
			return r[1] ? r[0] + ' ' + r[1] : r[0];
		},
		num(n) {
			if (n == null || isNaN(n)) return '—';
			try { return Number(n).toLocaleString(C.locale); }
			catch (e) { return String(n); }
		},
		duration(sec) {
			if (sec == null || isNaN(sec)) return '—';
			sec = Math.max(0, Math.floor(sec));
			const d = Math.floor(sec / 86400), hr = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
			if (d) return t('%dd %dh', d, hr);
			if (hr) return t('%dh %dm', hr, m);
			return m ? t('%d min', m) : t('<1 min');
		},
		since(sec) {
			const dt = new Date(Date.now() - sec * 1000);
			try {
				return dt.toLocaleString(C.locale,
					{ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
			}
			catch (e) { return dt.toISOString().slice(5, 16).replace('T', ' '); }
		}
	};

	/* ------------------------------------------------------------------
	 * Icons (24×24, stroke = currentColor)
	 * ------------------------------------------------------------------ */
	const ICONS = {
		carbon: '<path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
		gauge: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="M12 16l3.5-4.5"/><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"/>',
		globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
		sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
		grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
		lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
		disk: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 13h17"/><circle cx="16.5" cy="15.5" r=".9" fill="currentColor" stroke="none"/>',
		chart: '<path d="M5 20V12M10 20V5M15 20v-9M20 20V8"/>',
		logout: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
		wifi: '<path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.4a4.2 4.2 0 0 1 6 0"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor" stroke="none"/>',
		box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
		key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.2 2.2M14.3 8.7l2 2"/>',
		download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 16v2A2 2 0 0 0 6.5 20h11a2 2 0 0 0 2-2v-2"/>',
		power: '<path d="M12 3.5v8"/><path d="M7 6.4a7.5 7.5 0 1 0 10 0"/>',
		square: '<rect x="6" y="6" width="12" height="12" rx="3"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
		moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
		auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
		laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2.5 19h19"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
		pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
		clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
		chevron: '<path d="M9 6l6 6-6 6"/>',
		chevdown: '<path d="M6 9l6 6 6-6"/>',
		check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6z"/>',
		phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
		tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8"/>',
		tablet: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M11 18h2"/>',
		pc: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8"/><path d="M9 20h6M12 16v4"/>',
		gamepad: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.3 2.3 0 0 1-4 .7L14.5 16h-5l-1.3 1.8a2.3 2.3 0 0 1-4-.7l-1-3.3A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.5" r=".8" fill="currentColor" stroke="none"/>',
		speaker: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7.5" r=".9" fill="currentColor" stroke="none"/>',
		printer: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6H7z"/>',
		camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
		nas: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M5 9.5h14M5 15h14"/><circle cx="15.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/><circle cx="15.5" cy="12.2" r=".8" fill="currentColor" stroke="none"/>',
		iot: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>'
	};
	const icon = C.icon = (name) =>
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		(ICONS[name] || ICONS.square) + '</svg>';

	const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#4F5BEA"/><path d="M32 14.5l15.2 8.75v17.5L32 49.5l-15.2-8.75v-17.5z" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/><circle cx="32" cy="32" r="5" fill="#fff"/></svg>';

	const COLORS = {
		blue: 'var(--cb-blue)', green: 'var(--cb-green)', orange: 'var(--cb-orange)', red: 'var(--cb-red)',
		purple: 'var(--cb-purple)', teal: 'var(--cb-teal)', indigo: 'var(--cb-indigo)', pink: 'var(--cb-pink)',
		gray: 'var(--cb-gray)', yellow: 'var(--cb-yellow)'
	};

	/* Extra line icons used by the sidebar (24×24, stroke = currentColor) */
	Object.assign(ICONS, {
		github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19 4.77 5.07 5.07 0 0 0 18.91 1S17.73.65 15 2.48a13.38 13.38 0 0 0-7 0C5.27.65 4.09 1 4.09 1A5.07 5.07 0 0 0 4 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8 18.13V22"/>',
		route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
		doc: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/>',
		cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
		gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.6-1.5L14 2.6h-4l-.5 2.5A7.5 7.5 0 0 0 6.9 6.6l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3 1 2-3.4z"/>',
		user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
		rocket: '<path d="M14 4c3.5 0 6 2.5 6 6-1.5 2-4 4.5-7 6.5L7.5 11C9.5 8 12 5.5 14 4z"/><path d="M7.5 11L4 11.5 6.5 9M13 16.5l-.5 3.5 2.5-2.5"/><circle cx="14.5" cy="9.5" r="1.4"/><path d="M6 17l-2 3"/>',
		bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
		terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17"/>',
		folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
		server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>',
		ports: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M10.3 10v4M13.6 10v4M17 10v4"/>',
		search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
		refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L20 9.4"/><path d="M20 4.5v4.9h-4.9"/>',
		list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
		tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>',
		filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
		users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.3 3.3 0 0 1 0 5.8M17.5 14a6 6 0 0 1 3.5 5.5"/>',
		dot: '<circle cx="12" cy="12" r="3"/>',
		puzzle: '<path d="M10 4.5a2 2 0 0 1 4 0V6h3.5A1.5 1.5 0 0 1 19 7.5V11h-1.5a2 2 0 0 0 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 0 0-4 0V20H6.5A1.5 1.5 0 0 1 5 18.5V15h1.5a2 2 0 0 0 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6H10z"/>',
		palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.8 1.7-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.1a3.9 3.9 0 0 0 3.9-3.9C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.6" cy="11.2" r="1.15" fill="currentColor" stroke="none"/><circle cx="10.2" cy="7.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="14.6" cy="7.4" r="1.15" fill="currentColor" stroke="none"/>',
		layers: '<path d="M12 4l8.5 4.3L12 12.6 3.5 8.3z"/><path d="M3.5 12.2L12 16.5l8.5-4.3"/><path d="M3.5 16L12 20.3l8.5-4.3"/>',
		fiber: '<path d="M3 19.5c3 0 4.2-2.2 5.2-4.3S10.6 11 13.5 11H15"/><rect x="15" y="8.5" width="4" height="5" rx="1.2"/><path d="M19 11h2.5M19.8 7.2l1.6-1.6M19.8 14.8l1.6 1.6"/>',
		send: '<path d="M20.5 3.5L10.2 13.8"/><path d="M20.5 3.5l-6.3 17-4-6.7-6.7-4z"/>',
		cloud: '<path d="M7.2 18.5h9.8a4 4 0 0 0 .7-7.9 5.6 5.6 0 0 0-10.8-1.2A4.6 4.6 0 0 0 7.2 18.5z"/>',
		zap: '<path d="M13.2 3L5 13.5h6.2L10.5 21l8.5-10.5h-6.2z"/>',
		play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10.2 9.4v5.2l4.4-2.6z"/>',
		upload: '<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
		thermo: '<path d="M10 14.3V5.5a2 2 0 0 1 4 0v8.8a4 4 0 1 1-4 0z"/><path d="M12 10v6.5"/>',
		bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
		eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
		chevleft: '<path d="M14.5 6l-6 6 6 6"/>',
		/* whale carrying a stack of containers (Docker) */
		docker: '<path d="M2.6 12.4h16.7c.5-1.3 1.6-2 2.9-1.8-.1 1.2-.9 2-2.1 2.3-1.3 4-4.9 6.6-9.4 6.6-4.4 0-7.2-2.8-8.1-7.1z"/>' +
			'<g fill="currentColor" stroke="none"><rect x="4.6" y="9" width="2.7" height="2.4" rx=".4"/><rect x="7.9" y="9" width="2.7" height="2.4" rx=".4"/>' +
			'<rect x="11.2" y="9" width="2.7" height="2.4" rx=".4"/><rect x="7.9" y="5.9" width="2.7" height="2.4" rx=".4"/>' +
			'<rect x="11.2" y="5.9" width="2.7" height="2.4" rx=".4"/><rect x="11.2" y="2.8" width="2.7" height="2.4" rx=".4"/><circle cx="7.4" cy="15.4" r=".9"/></g>',
		nodes: '<circle cx="12" cy="5.5" r="2.3"/><circle cx="5.5" cy="18" r="2.3"/><circle cx="18.5" cy="18" r="2.3"/><path d="M10.9 7.6l-4.3 8.3M13.1 7.6l4.3 8.3M7.8 18h8.4"/>',
		sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'
	});

	/* Top-level LuCI menu categories → line icon */
	const CATEGORY_ICON = {
		status: 'gauge', system: 'gear', services: 'grid', network: 'globe', vpn: 'lock',
		nas: 'disk', statistics: 'chart', control: 'shield', docker: 'docker', logout: 'logout'
	};

	/* Second-level pages → icon (exact node name first, then keyword match).
	   Covers stock LuCI plus the plugins most often found on OpenWrt / ImmortalWrt. */
	const PAGE_ICON = {
		/* status */
		overview: 'gauge', routes: 'route', routesj: 'route', syslog: 'doc', dmesg: 'doc', logs: 'doc',
		processes: 'cpu', realtime: 'pulse', iptables: 'shield', nftables: 'shield', channel_analysis: 'wifi',
		wireguard: 'lock', nlbw: 'chart', statistics: 'chart', netdata: 'chart', 'temperature': 'thermo',
		/* system */
		system: 'gear', admin: 'user', 'package-manager': 'box', opkg: 'box', startup: 'rocket',
		'carbon-update': 'carbon',
		crontab: 'clock', mounts: 'disk', leds: 'bulb', flash: 'download', reboot: 'power', plugins: 'puzzle',
		ttyd: 'terminal', commands: 'terminal', filetransfer: 'upload', fileassistant: 'folder',
		autoreboot: 'clock', 'argon-config': 'palette', 'design-config': 'palette', 'kucat-config': 'palette',
		'alpha-config': 'palette', 'material-config': 'palette',
		/* network */
		network: 'ports', wireless: 'wifi', dhcp: 'list', dns: 'server', hosts: 'tag', diagnostics: 'search',
		firewall: 'shield', switch: 'ports', 'switch-vlan': 'layers', vlan: 'layers', pon: 'fiber',
		gpon: 'fiber', xpon: 'fiber', sqm: 'sliders', qos: 'sliders', eqos: 'sliders', mwan3: 'route',
		turboacc: 'zap', flowoffload: 'zap',
		/* services */
		ddns: 'refresh', upnp: 'link', wol: 'power', samba4: 'folder', samba: 'folder', ksmbd: 'folder',
		nfs: 'folder', vsftpd: 'folder', adblock: 'shield', adguardhome: 'shield', smartdns: 'server',
		mosdns: 'server', 'https-dns-proxy': 'server', acme: 'lock', users: 'users', openvpn: 'lock',
		zerotier: 'lock', tailscale: 'lock', frpc: 'cloud', frps: 'cloud', nps: 'cloud', cloudflared: 'cloud',
		openclash: 'send', passwall: 'send', passwall2: 'send', homeproxy: 'send', nikki: 'send',
		'ssr-plus': 'send', shadowsocksr: 'send', vssr: 'send', bypass: 'send', aria2: 'download',
		transmission: 'download', qbittorrent: 'download', minidlna: 'play', jellyfin: 'play',
		watchcat: 'eye', diskman: 'disk', 'hd-idle': 'disk', dockerman: 'docker', docker: 'docker',
		vlmcsd: 'key', ua2f: 'shield', accesscontrol: 'filter', timecontrol: 'clock', p910nd: 'printer',
		usb_printer: 'printer', alist: 'folder', 'ddns-go': 'refresh', wechatpush: 'bell', serverchan: 'bell',
		pushbot: 'bell'
	};
	const PAGE_KEYWORDS = [
		[/plugin|addon|extension/, 'puzzle'], [/theme|argon|design|kucat|skin/, 'palette'],
		[/vlan/, 'layers'], [/(^|[-_])[xge]?pon($|[-_])|optical|fiber/, 'fiber'], [/route|routing|mwan/, 'route'],
		[/clash|passwall|ssr|v2ray|xray|trojan|shadow|bypass|proxy|mihomo|sing-?box/, 'send'],
		[/frp|nps|ngrok|cloud/, 'cloud'], [/accel|turbo|offload|speed/, 'zap'],
		[/dlna|media|jellyfin|emby|music|video/, 'play'], [/aria|transmission|qbit|torrent/, 'download'],
		[/upload|transfer/, 'upload'], [/temp|thermal/, 'thermo'], [/print/, 'printer'], [/qos|sqm|shap/, 'sliders'],
		[/watch/, 'eye'], [/log/, 'doc'], [/wifi|wlan|wireless/, 'wifi'],
		[/vpn|wireguard|tunnel|ipsec|pptp|l2tp|zerotier|tailscale/, 'lock'], [/push|notif|chan|bot/, 'bell'], [/dns/, 'server'],
		[/firewall|guard|block|filter/, 'shield'], [/stat|graph|monitor|bandwidth/, 'chart'],
		[/disk|storage|mount/, 'disk'], [/nas|share|smb|nfs|ftp|file/, 'folder'], [/docker/, 'docker'], [/container/, 'box'],
		[/time|cron|schedule/, 'clock'], [/user|account|admin/, 'user'], [/terminal|shell|ssh/, 'terminal'],
		[/update|upgrade|flash|backup/, 'download']
	];
	/* Pages whose generic names only mean something inside their category
	   (Docker → config / images / networks / volumes / events …). Checked
	   before PAGE_ICON; add a category here rather than special cases below. */
	const CATEGORY_PAGE_ICON = {
		docker: {
			config: 'sliders', overview: 'gauge', containers: 'box', images: 'layers',
			networks: 'nodes', volumes: 'disk', events: 'pulse'
		}
	};
	const pageIcon = (name, category) => {
		const own = CATEGORY_PAGE_ICON[category];
		if (own && own[name]) return own[name];
		if (PAGE_ICON[name]) return PAGE_ICON[name];
		for (const k of PAGE_KEYWORDS) if (k[0].test(name)) return k[1];
		return 'dot';
	};
	C.pageIcon = pageIcon;

	/* Simple mode: hand-picked LuCI pages (first existing path wins) */
	C.SIMPLE_MENU = [
		{ group: N_('Common'), items: [
			{ title: N_('Overview'), icon: 'gauge', paths: ['status/overview'] },
			{ title: N_('Internet & Network'), icon: 'globe', paths: ['network/network'] },
			{ title: N_('Wi-Fi'), icon: 'wifi', paths: ['network/wireless'] }
		] },
		{ group: N_('System'), items: [
			{ title: N_('Software'), icon: 'box', paths: ['system/package-manager', 'system/opkg'] },
			{ title: N_('Carbon Theme Settings'), icon: 'carbon', paths: ['system/carbon-update'] },
			{ title: N_('Password'), icon: 'key', paths: ['system/admin'] },
			{ title: N_('Backup & Upgrade'), icon: 'download', paths: ['system/flash'] },
			{ title: N_('Reboot'), icon: 'power', paths: ['system/reboot'] }
		] }
	];

	/* ------------------------------------------------------------------
	 * Appearance (auto / light / dark) — applied immediately on load
	 * ------------------------------------------------------------------ */
	const rootEl = document.documentElement;
	const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

	C.appearance = {
		get() {
			const v = store.get('carbon.appearance', 'auto');
			return (v === 'light' || v === 'dark') ? v : 'auto';
		},
		set(v) {
			store.set('carbon.appearance', v);
			C.appearance.apply();
		},
		apply() {
			const v = C.appearance.get();
			const dark = v === 'dark' || (v === 'auto' && !!(mq && mq.matches));
			rootEl.setAttribute('data-appearance', v);
			rootEl.setAttribute('data-darkmode', dark ? 'true' : 'false');
			const meta = document.querySelector('meta[name="theme-color"]');
			if (meta) meta.setAttribute('content', dark ? '#000000' : '#f2f2f7');
		}
	};
	C.appearance.apply();

	if (mq) {
		const onChange = () => C.appearance.apply();
		if (mq.addEventListener) mq.addEventListener('change', onChange);
		else if (mq.addListener) mq.addListener(onChange);
	}

	/* Navigation mode (simple / pro) */
	C.mode = {
		get() { return store.get('carbon.mode', 'simple') === 'pro' ? 'pro' : 'simple'; },
		set(v) { store.set('carbon.mode', v === 'pro' ? 'pro' : 'simple'); }
	};

	/* Collapsed sidebar (icon rail) — class on <html> so it applies before first paint */
	C.sidebar = {
		collapsed() { return rootEl.classList.contains('cb-collapsed'); },
		set(on) {
			rootEl.classList.toggle('cb-collapsed', !!on);
			store.set('carbon.collapsed', on ? '1' : '0');
			const btn = document.getElementById('cb-collapse');
			if (btn) btn.setAttribute('aria-label', on ? t('Expand sidebar') : t('Collapse sidebar'));
			hideFlyout(true);
		},
		toggle() { C.sidebar.set(!C.sidebar.collapsed()); }
	};
	rootEl.classList.toggle('cb-collapsed', store.get('carbon.collapsed', '0') === '1');

	const railActive = () => C.sidebar.collapsed() && !(window.matchMedia && window.matchMedia('(max-width: 1023px)').matches);

	/* ------------------------------------------------------------------
	 * Segmented control
	 * ------------------------------------------------------------------ */
	/* Radio group: arrow keys move between options (and select them unless
	   `manual`, used where selecting is expensive, e.g. a page reload). */
	function segmented(options, value, onChange, label, manual) {
		const seg = h('div', { class: 'cb-seg', role: 'radiogroup', 'aria-label': label || null });
		const buttons = [];
		const select = (idx, fire) => {
			seg.style.setProperty('--i', idx);
			buttons.forEach((b, i) => {
				b.setAttribute('aria-checked', i === idx ? 'true' : 'false');
				b.tabIndex = i === idx ? 0 : -1;
			});
			if (fire) onChange(options[idx].value);
		};
		seg.addEventListener('keydown', (e) => {
			const cur = buttons.indexOf(document.activeElement);
			if (cur < 0) return;
			const n = buttons.length;
			const next = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 0, End: n - 1 }[e.key];
			if (next == null) return;
			e.preventDefault();
			const idx = (next + n) % n;
			buttons[idx].focus();
			if (manual) buttons.forEach((b, i) => { b.tabIndex = i === idx ? 0 : -1; });
			else select(idx, true);
		});
		seg.style.setProperty('--n', options.length);
		options.forEach((o, i) => {
			const b = h('button', {
				type: 'button', class: 'cb-seg-btn', role: 'radio', title: o.title || null,
				'aria-label': o.title || null, html: o.html || null, text: o.html ? null : o.label
			});
			b.addEventListener('click', () => select(i, true));
			buttons.push(b);
			seg.appendChild(b);
		});
		seg._select = (v) => select(Math.max(0, options.findIndex((o) => o.value === v)), false);
		seg._select(value);
		return seg;
	}
	C.segmented = segmented;

	/* ------------------------------------------------------------------
	 * Listbox: a select in Carbon's glass style (instead of a native <select>)
	 *
	 * listbox({ options: [{ value, label }], value, label, className, onChange(value) })
	 *   → { el, open({ anchor, beside }), toggle(…), close(), set(value) }
	 * Select-only combobox pattern: the trigger is a button; ↑/↓/Enter/Space
	 * open the list, ↑/↓/Home/End/typing move, Enter/Space pick, Esc/Tab close.
	 * The list lives on <body> (position: fixed) so no container clips it; it
	 * opens below its anchor, above when there is no room, or `beside` a rail.
	 * ------------------------------------------------------------------ */
	function listbox(opts) {
		const id = uid();
		let value = opts.value, list = null, opener = null, active = -1, typed = '', typedAt = 0;
		const text = h('span', { class: 'cb-lb-text' });
		const el = h('button', {
			type: 'button', class: 'cb-lb' + (opts.className ? ' ' + opts.className : ''),
			'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': opts.label || null
		}, [text, h('span', { class: 'cb-lb-chev', html: icon('chevdown') })]);
		const index = (v) => opts.options.findIndex((o) => o.value === v);
		const sync = () => {
			const o = opts.options[index(value)] || opts.options[0];
			text.textContent = o ? o.label : '';
			el.title = (opts.label ? opts.label + ' · ' : '') + text.textContent;
		};
		const items = () => list ? Array.from(list.children) : [];
		const highlight = (i) => {
			const all = items();
			if (!all.length) return;
			active = clamp(i, 0, all.length - 1);
			all.forEach((li, k) => li.classList.toggle('active', k === active));
			list.setAttribute('aria-activedescendant', all[active].id);
			all[active].scrollIntoView({ block: 'nearest' });
		};
		const place = (anchor, beside) => {
			const r = anchor.getBoundingClientRect(), gap = 6, pad = 8;
			list.style.minWidth = beside ? '' : r.width + 'px';
			const lh = list.offsetHeight, lw = list.offsetWidth;
			let left, top;
			if (beside) {
				const side = document.getElementById('cb-sidebar');
				left = (side ? side.getBoundingClientRect().right : r.right) + 10;
				top = r.bottom - lh;
			}
			else {
				left = r.left;
				top = r.bottom + gap + lh <= window.innerHeight - pad ? r.bottom + gap : r.top - gap - lh;
			}
			list.style.left = clamp(left, pad, Math.max(pad, window.innerWidth - lw - pad)) + 'px';
			list.style.top = clamp(top, pad, Math.max(pad, window.innerHeight - lh - pad)) + 'px';
		};
		const choose = (i) => {
			const o = opts.options[i];
			close(true);
			if (!o || o.value === value) return;
			value = o.value;
			sync();
			if (typeof opts.onChange === 'function') opts.onChange(value);
		};
		const inside = (node) => !!node && ((list && list.contains(node)) || el.contains(node) || (opener && opener.contains(node)));
		const outside = (e) => { if (!inside(e.target)) close(false); };
		/* page scroll or resize closes the list; scrolling inside it does not */
		const dismiss = (e) => { if (!(e && e.type === 'scroll' && list && list.contains(e.target))) close(false); };

		function open(o) {
			o = o || {};
			if (list) return;
			opener = o.anchor || el;
			list = h('ul', { class: 'cb-lb-list', id: id, role: 'listbox', tabindex: '-1', 'aria-label': opts.label || null });
			opts.options.forEach((opt, i) => {
				const li = h('li', { id: id + '-' + i, role: 'option', 'aria-selected': opt.value === value ? 'true' : 'false' }, [
					h('span', { class: 'cb-lb-check', html: icon('check') }), h('span', { text: opt.label })
				]);
				li.addEventListener('pointermove', () => { if (active !== i) highlight(i); });
				li.addEventListener('click', () => choose(i));
				list.appendChild(li);
			});
			list.addEventListener('keydown', onListKey);
			list.addEventListener('focusout', (e) => { if (!inside(e.relatedTarget)) close(false); });
			document.body.appendChild(list);
			place(o.anchor || el, !!o.beside);
			list.classList.add('show');
			el.setAttribute('aria-expanded', 'true');
			highlight(o.last ? opts.options.length - 1 : Math.max(0, index(value)));
			list.focus({ preventScroll: true });
			document.addEventListener('pointerdown', outside, true);
			window.addEventListener('resize', dismiss);
			window.addEventListener('scroll', dismiss, true);
		}
		function close(restoreFocus) {
			if (!list) return;
			document.removeEventListener('pointerdown', outside, true);
			window.removeEventListener('resize', dismiss);
			window.removeEventListener('scroll', dismiss, true);
			const old = list;
			list = null;
			active = -1;
			old.remove();
			el.setAttribute('aria-expanded', 'false');
			/* back to whatever opened the list (the trigger, or e.g. a rail button) */
			const back = opener && opener.offsetParent !== null ? opener : el;
			opener = null;
			if (restoreFocus && back.offsetParent !== null) back.focus({ preventScroll: true });
		}
		function toggle(o) { if (list) close(true); else open(o); }
		function onListKey(e) {
			const n = opts.options.length;
			const move = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: n - 1, PageDown: active + 5, PageUp: active - 5 }[e.key];
			if (move != null) { e.preventDefault(); highlight(move); }
			else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
			else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
			else if (e.key === 'Tab') close(false);
			else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
				/* type-ahead: jump to the next label starting with what was typed */
				const now = Date.now();
				typed = (now - typedAt > 700 ? '' : typed) + e.key.toLowerCase();
				typedAt = now;
				/* a new first letter searches after the current option, more letters refine it */
				const start = typed.length > 1 ? active : active + 1;
				for (let k = 0; k < n; k++) {
					const i = (start + k) % n;
					if (opts.options[i].label.toLowerCase().startsWith(typed)) { highlight(i); break; }
				}
			}
		}
		el.addEventListener('click', () => toggle());
		el.addEventListener('keydown', (e) => {
			if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(e.key) < 0) return;
			e.preventDefault();
			open({ last: e.key === 'ArrowUp' });
		});
		sync();
		return { el: el, open: open, toggle: toggle, close: close, set(v) { value = v; sync(); } };
	}
	C.listbox = listbox;

	/* ------------------------------------------------------------------
	 * Flyout (collapsed rail): label or sub-menu next to a hovered icon
	 * ------------------------------------------------------------------ */
	let fly = null, flyTimer = null, flyOwner = null;
	const flyOpenFor = (owner) => !!(fly && fly.classList.contains('show') && flyOwner === owner);

	function hideFlyout(now) {
		clearTimeout(flyTimer);
		const go = () => { if (fly) fly.classList.remove('show'); flyOwner = null; };
		if (now) go(); else flyTimer = setTimeout(go, 160);
	}

	function showFlyout(owner, title, items, focusFirst) {
		if (!railActive()) return;
		clearTimeout(flyTimer);
		if (!fly) {
			fly = h('div', { class: 'cb-fly' });
			fly.addEventListener('mouseenter', () => clearTimeout(flyTimer));
			fly.addEventListener('mouseleave', () => hideFlyout());
			fly.addEventListener('focusin', () => clearTimeout(flyTimer));
			fly.addEventListener('focusout', (e) => { if (!fly.contains(e.relatedTarget)) hideFlyout(); });
			fly.addEventListener('keydown', (e) => {
				const links = Array.from(fly.querySelectorAll('a'));
				const cur = links.indexOf(document.activeElement);
				if (e.key === 'Escape') {
					const owner = flyOwner;
					hideFlyout(true);
					if (owner) owner.focus();
				}
				else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && links.length) {
					e.preventDefault();
					links[(cur + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
				}
			});
			document.body.appendChild(fly);
		}
		if (flyOwner !== owner) {
			fly.innerHTML = '';
			fly.classList.toggle('cb-fly-tip', !items);
			if (items) fly.setAttribute('role', 'menu');
			else fly.removeAttribute('role');
			fly.appendChild(h('div', { class: 'cb-fly-title', text: title }));
			(items || []).forEach((it) => {
				fly.appendChild(h('a', { class: 'cb-nav-item' + (it.active ? ' active' : ''), href: it.url, role: 'menuitem' }, [
					h('span', { class: 'cb-sub-ico', html: icon(it.icon) }),
					h('span', { class: 'cb-nav-label', text: it.title })
				]));
			});
			flyOwner = owner;
		}
		const r = owner.getBoundingClientRect();
		const side = document.getElementById('cb-sidebar');
		const left = (side ? side.getBoundingClientRect().right : r.right) + 10;
		fly.style.left = left + 'px';
		fly.style.top = '0px';
		fly.classList.add('show');
		const fh = fly.offsetHeight;
		const top = items ? r.top - 6 : r.top + r.height / 2 - fh / 2;
		fly.style.top = Math.max(8, Math.min(top, window.innerHeight - fh - 8)) + 'px';
		if (focusFirst && items) {
			const first = fly.querySelector('a.active') || fly.querySelector('a');
			if (first) first.focus();
		}
	}

	/* Mouse: hover. Touch / pen: a tap toggles the sub-menu (see the group
	   head). Keyboard: focus previews it, Enter or → moves into it. */
	const focusVisible = (el) => { try { return el.matches(':focus-visible'); } catch (e) { return true; } };
	function bindFlyout(el, title, items) {
		el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showFlyout(el, title, items); });
		el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideFlyout(); });
		el.addEventListener('focus', () => { if (focusVisible(el)) showFlyout(el, title, items); });
		el.addEventListener('blur', () => hideFlyout());
		if (items) el.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowRight' && railActive()) { e.preventDefault(); showFlyout(el, title, items, true); }
		});
	}
	let lastPointer = 'mouse';

	/* Keep the active route / form tab visible without moving focus or the page.
	 * LuCI inserts form tabs asynchronously and can reveal nested tab groups. */
	const tabRoots = new WeakSet();
	C.initTabs = function (root) {
		if (!root || tabRoots.has(root)) return;
		tabRoots.add(root);
		const rows = new Map();
		let pending = false;
		const schedule = () => {
			if (pending) return;
			pending = true;
			requestAnimationFrame(sync);
		};
		const resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;
		function sync() {
			pending = false;
			for (const row of rows.keys()) {
				if (!root.contains(row)) {
					if (resize) resize.unobserve(row);
					rows.delete(row);
				}
			}
			root.querySelectorAll('.tabs, .cbi-tabmenu').forEach((row) => {
				const previous = rows.get(row);
				if (!previous && resize) resize.observe(row);
				const active = Array.from(row.children).find((li) => li.classList.contains('active') || li.classList.contains('cbi-tab'));
				const width = row.clientWidth, contentWidth = row.scrollWidth;
				rows.set(row, { active, width, contentWidth });
				// Do not snap back when the user browses other tabs or a status poll
				// changes unrelated content. Only selection or layout changes count.
				if (!active || !width || contentWidth <= width + 1 ||
					(previous && previous.active === active && previous.width === width && previous.contentWidth === contentWidth)) return;
				const bounds = row.getBoundingClientRect(), item = active.getBoundingClientRect();
				if (!item.width) return;
				const left = bounds.left + row.clientLeft, right = left + width;
				if (item.left < left || item.right > right)
					row.scrollLeft += item.left - left - Math.max(0, (width - item.width) / 2);
			});
		}
		new MutationObserver(schedule).observe(root, {
			childList: true, subtree: true, attributes: true,
			attributeFilter: ['class', 'style', 'hidden', 'data-tab-active']
		});
		window.addEventListener('resize', schedule, { passive: true });
		if (document.fonts) document.fonts.ready.then(schedule);
		schedule();
	};

	/* ------------------------------------------------------------------
	 * Language switch (rendered once the installed catalogues are known)
	 * ------------------------------------------------------------------ */
	const normLang = (c) => String(c || '').toLowerCase().replace(/_/g, '-');
	C.matchLanguage = function (options, current) {
		const cur = normLang(current), base = cur.split('-')[0];
		const want = LANG_ALIAS[cur] || cur;
		return options.find((o) => normLang(o.code) === want) ||
			options.find((o) => normLang(o.code).split('-')[0] === base) || options[0];
	};

	function renderLanguage(wrap, L10N, info) {
		const options = info.options;
		const active = C.matchLanguage(options, L10N.current);
		const currentValue = options.length === 2 ? active.code : info.selected;
		let reset = () => {};
		const go = (v) => {
			if (v === currentValue || wrap.classList.contains('busy')) return;
			wrap.classList.add('busy');
			Promise.resolve().then(() => L10N.set(v)).then(() => window.location.reload()).catch((err) => {
				reset();
				wrap.classList.remove('busy');
				wrap.classList.add('err');
				wrap.title = (err && err.message) || String(err);
				setTimeout(() => wrap.classList.remove('err'), 1600);
				if (window.console) console.warn('[carbon] language switch failed:', err);
			});
		};
		const mini = h('button', { type: 'button', class: 'cb-mini cb-lang-mini', text: active.short || active.code.slice(0, 2).toUpperCase() });
		mini.title = t('Language') + ' · ' + active.label;
		wrap.appendChild(h('span', { class: 'cb-lang-ico', html: icon('globe') }));

		if (options.length === 2) {
			const label = (o) => (o.short === '中' ? '中文' : o.label);
			const seg = segmented(options.map((o) => ({ value: o.code, label: label(o), title: o.label })), active.code, go, t('Language'), true);
			reset = () => seg._select(active.code);
			const other = options.find((o) => o !== active);
			mini.title += ' · ' + t('click to switch');
			mini.addEventListener('click', () => go(other.code));
			wrap.appendChild(seg);
		}
		else {
			const list = listbox({
				options: [{ value: 'auto', label: t('Auto') }].concat(options.map((o) => ({ value: o.code, label: o.label }))),
				value: info.selected, label: t('Language'), className: 'cb-lang-list', onChange: go
			});
			reset = () => list.set(info.selected);
			/* on the rail the list opens beside it, like the sub-menus */
			mini.setAttribute('aria-haspopup', 'listbox');
			mini.addEventListener('click', () => list.toggle({ anchor: mini, beside: railActive() }));
			wrap.classList.add('cb-lang-many');
			wrap.appendChild(list.el);
		}
		mini.setAttribute('aria-label', mini.title);
		wrap.appendChild(mini);
	}

	/* ------------------------------------------------------------------
	 * Shell: drawer, collapse, mode switch, appearance switch, logout
	 * ------------------------------------------------------------------ */
	C.initShell = function (opts) {
		opts = opts || {};
		C.initTabs(document.getElementById('maincontent'));
		const body = document.body;
		const burger = document.getElementById('cb-burger');
		const scrim = document.getElementById('cb-scrim');
		const main = document.querySelector('.cb-main');
		const sidebar = document.getElementById('cb-sidebar');
		const drawerMode = () => !!(window.matchMedia && window.matchMedia('(max-width: 1023px)').matches);
		/* mobile drawer: the page behind is inert while it is open; focus moves in and back */
		/* the off-canvas drawer must not be reachable with Tab while it is closed */
		const syncSidebar = () => {
			if (!sidebar) return;
			if (drawerMode() && !body.classList.contains('cb-nav-open')) sidebar.setAttribute('inert', '');
			else sidebar.removeAttribute('inert');
		};
		const setDrawer = (on, restoreFocus) => {
			const was = body.classList.contains('cb-nav-open');
			on = !!on && drawerMode();
			body.classList.toggle('cb-nav-open', on);
			syncSidebar();
			if (burger) burger.setAttribute('aria-expanded', on ? 'true' : 'false');
			if (main) { if (on) main.setAttribute('inert', ''); else main.removeAttribute('inert'); }
			if (on && !was && sidebar) {
				const first = sidebar.querySelector('.cb-nav a.active') || sidebar.querySelector('.cb-nav a, .cb-nav button');
				if (first) first.focus({ preventScroll: true });
			}
			if (!on && was && restoreFocus && burger) burger.focus();
		};
		const close = () => setDrawer(false, sidebar && sidebar.contains(document.activeElement));

		if (burger) {
			burger.setAttribute('aria-label', t('Menu'));
			burger.setAttribute('aria-controls', 'cb-sidebar');
			burger.setAttribute('aria-expanded', 'false');
			burger.addEventListener('click', () => setDrawer(!body.classList.contains('cb-nav-open')));
		}
		if (scrim) scrim.addEventListener('click', close);
		window.addEventListener('resize', () => {
			if (!drawerMode() && body.classList.contains('cb-nav-open')) setDrawer(false);
			else syncSidebar();
		});
		syncSidebar();
		document.addEventListener('pointerdown', (e) => {
			lastPointer = e.pointerType || 'mouse';
			if (fly && fly.classList.contains('show') && !fly.contains(e.target) && !(flyOwner && flyOwner.contains(e.target)))
				hideFlyout(true);
		}, true);
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') { if (body.classList.contains('cb-nav-open')) close(); hideFlyout(true); }
			/* Ctrl/Cmd + \ toggles the rail */
			if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); C.sidebar.toggle(); }
		});

		const onScroll = () => body.classList.toggle('cb-scrolled', window.scrollY > 4);
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();

		/* theme switch — toolbar, top-right */
		const APPEARANCES = ['auto', 'light', 'dark'];
		const APPEARANCE_ICON = { auto: 'auto', light: 'sun', dark: 'moon' };
		const APPEARANCE_LABEL = { auto: N_('Auto'), light: N_('Light'), dark: N_('Dark') };
		const appearanceLabel = (v) => t(APPEARANCE_LABEL[v]);
		const themeHost = document.getElementById('cb-appearance');
		if (themeHost) {
			themeHost.innerHTML = '';
			themeHost.title = t('Appearance');
			themeHost.appendChild(segmented(
				APPEARANCES.map((v) => ({ value: v, title: appearanceLabel(v), html: icon(APPEARANCE_ICON[v]) })),
				C.appearance.get(), (v) => C.appearance.set(v), t('Appearance')));
		}

		const toolbar = document.querySelector('.cb-toolbar');
		if (toolbar && !toolbar.querySelector('.cb-github')) {
			toolbar.appendChild(h('a', {
				class: 'cb-github', href: 'https://github.com/mrjoechen/luci-theme-carbon',
				target: '_blank', rel: 'noopener noreferrer',
				title: t('GitHub (opens in a new tab)'), 'aria-label': t('GitHub (opens in a new tab)'),
				html: icon('github')
			}));
		}

		const collapse = document.getElementById('cb-collapse');
		if (collapse) {
			collapse.innerHTML = icon('chevleft');
			collapse.title = t('Collapse sidebar') + ' (Ctrl+\\)';
			collapse.setAttribute('aria-label', C.sidebar.collapsed() ? t('Expand sidebar') : t('Collapse sidebar'));
			collapse.addEventListener('click', () => C.sidebar.toggle());
		}

		/* mode: segmented when expanded, single icon button on the rail */
		const modeHost = document.getElementById('cb-mode');
		if (modeHost) {
			modeHost.innerHTML = '';
			const apply = (v) => {
				C.mode.set(v);
				seg._select(v);
				mini.innerHTML = icon(v === 'pro' ? 'sliders' : 'sparkle');
				mini.title = t(v === 'pro' ? 'Pro' : 'Simple') + ' · ' + t('click to switch');
				mini.setAttribute('aria-label', mini.title);
				if (C._navModel) C.renderNav(C._navModel);
				if (typeof opts.onModeChange === 'function') opts.onModeChange(v);
			};
			const seg = segmented([
				{ value: 'simple', label: t('Simple') },
				{ value: 'pro', label: t('Pro') }
			], C.mode.get(), apply);
			const mini = h('button', { type: 'button', class: 'cb-mini' });
			mini.addEventListener('click', () => apply(C.mode.get() === 'pro' ? 'simple' : 'pro'));
			mini.innerHTML = icon(C.mode.get() === 'pro' ? 'sliders' : 'sparkle');
			mini.title = t(C.mode.get() === 'pro' ? 'Pro' : 'Simple') + ' · ' + t('click to switch');
			mini.setAttribute('aria-label', mini.title);
			modeHost.appendChild(seg);
			modeHost.appendChild(mini);
		}

		/* language switch — sidebar footer, bottom-left.
		   opts.language = {
		     current: '<html lang>',
		     load() → Promise<{ options: [{ code, label, short }], selected: code|'auto' }>,
		     set(code) → Promise
		   }
		   Two catalogues → segmented control; more → a native select. */
		const foot = document.getElementById('cb-sidebar-foot');
		if (foot) {
			foot.innerHTML = '';
			if (opts.language && typeof opts.language.load === 'function') {
				const L10N = opts.language;
				const wrap = h('div', { class: 'cb-lang', title: t('Language') });
				foot.appendChild(wrap);
				Promise.resolve().then(() => L10N.load()).then((info) => {
					if (!info || !info.options || info.options.length < 2) { wrap.remove(); return; }
					renderLanguage(wrap, L10N, info);
				}).catch((err) => {
					wrap.remove();
					if (window.console) console.warn('[carbon] languages unavailable:', err);
				});
			}
			if (opts.logoutUrl) {
				const out = h('a', { class: 'cb-logout', href: opts.logoutUrl, html: icon('logout') + '<span>' + esc(t('Log out')) + '</span>' });
				bindFlyout(out, t('Log out'), null);
				foot.appendChild(out);
			}
		}

		window.addEventListener('resize', () => hideFlyout(true));
		const nav = document.getElementById('topmenu');
		if (nav) nav.addEventListener('scroll', () => hideFlyout(true), { passive: true });
	};

	/* ------------------------------------------------------------------
	 * Sidebar navigation
	 *
	 * model = {
	 *   root: 'admin',
	 *   categories: [{ name, title, path, url, children: [{ name, title, path, url }] }],
	 *   activePath: ['admin', 'network', 'wireless'],
	 *   url(path) → href
	 * }
	 * ------------------------------------------------------------------ */
	C.renderNav = function (model) {
		C._navModel = model;
		const nav = document.getElementById('topmenu');
		if (!nav) return;
		nav.innerHTML = '';
		hideFlyout(true);

		const active = model.activePath.join('/');
		const isActive = (p) => active === p || active.indexOf(p + '/') === 0;
		const known = {};
		model.categories.forEach((c) => {
			known[c.path] = c;
			c.children.forEach((ch) => { known[ch.path] = ch; });
		});

		const link = (title, iconName, href, on) => {
			const a = h('a', { class: 'cb-nav-link' + (on ? ' active' : ''), href: href, 'aria-current': on ? 'page' : null }, [
				h('span', { class: 'cb-nav-ico', html: icon(iconName) }),
				h('span', { class: 'cb-nav-label', text: title })
			]);
			bindFlyout(a, title, null);
			return a;
		};

		if (C.mode.get() === 'simple') {
			C.SIMPLE_MENU.forEach((group) => {
				const items = [];
				group.items.forEach((it) => {
					for (const p of it.paths) {
						const full = model.root + '/' + p;
						if (known[full]) { items.push({ it: it, path: full }); break; }
					}
				});
				if (!items.length) return;
				nav.appendChild(h('div', { class: 'cb-nav-sect', text: t(group.group) }));
				items.forEach((x) => nav.appendChild(link(t(x.it.title), x.it.icon, model.url(x.path), isActive(x.path))));
			});

			const hint = h('div', { class: 'cb-nav-hint' }, [
				h('span', { class: 'cb-nav-hint-ico', html: icon('sliders') }),
				h('span', null, [t('Need more settings? Switch to') + ' '])
			]);
			const a = h('a', { href: '#', text: t('Pro mode') });
			a.addEventListener('click', (e) => {
				e.preventDefault();
				const btn = document.querySelector('#cb-mode .cb-seg-btn:last-child');
				if (btn) btn.click();
			});
			hint.lastChild.appendChild(a);
			nav.appendChild(hint);
		}
		else {
			let openSet = {};
			try { openSet = JSON.parse(store.get('carbon.open', '{}')) || {}; } catch (e) { openSet = {}; }

			nav.appendChild(h('div', { class: 'cb-nav-sect', text: t('All settings') }));
			model.categories.forEach((cat) => {
				if (cat.name === 'logout') return;
				const catIcon = CATEGORY_ICON[cat.name] || pageIcon(cat.name);
				if (!cat.children.length) {
					nav.appendChild(link(cat.title, catIcon, cat.url, isActive(cat.path)));
					return;
				}
				const on = isActive(cat.path);
				const open = on || !!openSet[cat.name];
				const grp = h('div', { class: 'cb-nav-group' + (open ? ' open' : '') + (on ? ' active' : '') });
				const head = h('button', { type: 'button', class: 'cb-nav-head', 'aria-expanded': open ? 'true' : 'false', 'aria-haspopup': 'menu' }, [
					h('span', { class: 'cb-nav-ico', html: icon(catIcon) }),
					h('span', { class: 'cb-nav-label', text: cat.title }),
					h('span', { class: 'cb-chev', html: icon('chevron') })
				]);
				const subs = cat.children.map((ch) => ({ title: ch.title, url: ch.url, icon: pageIcon(ch.name, cat.name), active: isActive(ch.path) }));

				head.addEventListener('click', (e) => {
					if (railActive()) {
						/* keyboard: move into the sub-menu; touch: toggle it; mouse: open the current/first page */
						if (e.detail === 0) showFlyout(head, cat.title, subs, true);
						else if (lastPointer !== 'mouse') {
							if (flyOpenFor(head)) hideFlyout(true);
							else showFlyout(head, cat.title, subs);
						}
						else if (subs.length) window.location.href = (subs.find((s) => s.active) || subs[0]).url;
						return;
					}
					const now = grp.classList.toggle('open');
					head.setAttribute('aria-expanded', now ? 'true' : 'false');
					openSet[cat.name] = now;
					store.set('carbon.open', JSON.stringify(openSet));
				});
				bindFlyout(head, cat.title, subs);

				const inner = h('div', { class: 'cb-nav-sub' });
				subs.forEach((s) => {
					inner.appendChild(h('a', { class: 'cb-nav-item' + (s.active ? ' active' : ''), href: s.url, 'aria-current': s.active ? 'page' : null }, [
						h('span', { class: 'cb-sub-ico', html: icon(s.icon) }),
						h('span', { class: 'cb-nav-label', text: s.title })
					]));
				});
				grp.appendChild(head);
				grp.appendChild(h('div', { class: 'cb-nav-items' }, inner));
				nav.appendChild(grp);
			});
		}

		nav.style.display = '';
		const cur = nav.querySelector('.cb-nav-item.active, .cb-nav-link.active');
		if (cur && cur.scrollIntoView && nav.scrollHeight > nav.clientHeight)
			cur.scrollIntoView({ block: 'nearest' });
	};

	/* Toolbar title: "Network › Wireless" */
	C.setTitle = function (parts) {
		const el = document.getElementById('cb-title');
		if (!el) return;
		parts = (parts || []).filter(Boolean);
		if (!parts.length) return;
		el.innerHTML = '';
		parts.forEach((p, i) => {
			if (i) el.appendChild(h('span', { class: 'cb-crumb-sep', html: icon('chevron') }));
			el.appendChild(h('span', { class: i < parts.length - 1 ? 'cb-crumb' : null, text: p }));
		});
	};

	/* ------------------------------------------------------------------
	 * Charts
	 * ------------------------------------------------------------------ */
	const SVGNS = 'http://www.w3.org/2000/svg';
	let uidSeq = 0;
	const uid = () => 'cb' + (++uidSeq);

	/* Catmull-Rom → cubic Bézier, control points clamped to the plot area */
	function smoothPath(pts, minY, maxY) {
		if (!pts.length) return '';
		let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
			const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6, minY, maxY);
			const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6, minY, maxY);
			d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
		}
		return d;
	}

	/* "Nice" axis maximum on a 1024 scale (min 8 KB/s so idle noise stays flat) */
	function niceTop(v) {
		v = Math.max(v * 1.15, 8 * 1024);
		const unit = Math.pow(1024, Math.floor(Math.log(v) / Math.log(1024)));
		const m = v / unit;
		const steps = [1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 64, 80, 100, 128, 200, 256, 400, 500, 512, 800, 1024];
		for (const s of steps) if (s >= m) return s * unit;
		return 1024 * unit;
	}

	/* Smooth multi-series area chart with hover inspector */
	function AreaChart(el, opts) {
		this.el = el;
		this.n = opts.points || 60;
		this.interval = opts.interval || 2;
		this.id = uid();
		this.series = opts.series.map((s) => ({ color: s.color, label: s.label, data: new Array(this.n).fill(0) }));
		this.hover = null;

		this.svg = document.createElementNS(SVGNS, 'svg');
		this.svg.setAttribute('class', 'cb-area-svg');
		this.svg.setAttribute('aria-hidden', 'true');
		this.tip = h('div', { class: 'cb-tip' });
		el.appendChild(this.svg);
		el.appendChild(this.tip);

		const move = (e) => {
			const r = el.getBoundingClientRect();
			const x = e.clientX - r.left;
			const step = r.width / (this.n - 1);
			this.hover = clamp(Math.round(x / step), 0, this.n - 1);
			this.draw();
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerdown', move);
		el.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });

		if (window.ResizeObserver) new ResizeObserver(() => this.draw()).observe(el);
		else window.addEventListener('resize', () => this.draw());
		this.draw();
	}
	AreaChart.prototype.push = function (values) {
		this.series.forEach((s, i) => {
			s.data.push(Math.max(0, +values[i] || 0));
			while (s.data.length > this.n) s.data.shift();
		});
		this.draw();
	};
	AreaChart.prototype.reset = function () {
		this.series.forEach((s) => { s.data = new Array(this.n).fill(0); });
		this.hover = null;
		this.draw();
	};
	AreaChart.prototype.draw = function () {
		const W = this.el.clientWidth, H = this.el.clientHeight;
		if (!W || !H) return;
		const pt = 14, pb = 2;
		let max = 0;
		this.series.forEach((s) => s.data.forEach((v) => { if (v > max) max = v; }));
		const top = niceTop(max);
		const y = (v) => pt + (H - pt - pb) * (1 - Math.min(v, top) / top);
		const step = W / (this.n - 1);
		const id = this.id;

		let out = '<defs>';
		this.series.forEach((s, i) => {
			out += '<linearGradient id="' + id + 'g' + i + '" x1="0" y1="0" x2="0" y2="1">' +
				'<stop offset="0" style="stop-color:' + s.color + ';stop-opacity:.3"/>' +
				'<stop offset="1" style="stop-color:' + s.color + ';stop-opacity:0"/></linearGradient>';
		});
		out += '</defs>';

		[1, .5].forEach((f) => {
			const yy = Math.round(y(top * f)) + .5;
			out += '<line class="cb-grid-line" x1="0" x2="' + W + '" y1="' + yy + '" y2="' + yy + '"/>';
			out += '<text class="cb-axis" x="4" y="' + (yy - 4) + '">' + esc(fmt.bytesStr(top * f, true)) + '</text>';
		});
		const base = Math.round(y(0)) - .5;
		out += '<line class="cb-grid-line base" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>';

		/* draw the last series first so the first (download) sits on top */
		for (let i = this.series.length - 1; i >= 0; i--) {
			const s = this.series[i];
			const pts = s.data.map((v, k) => [k * step, y(v)]);
			const line = smoothPath(pts, pt, H - pb);
			out += '<path d="' + line + 'L' + W + ',' + (H - pb) + 'L0,' + (H - pb) + 'Z" fill="url(#' + id + 'g' + i + ')"/>';
			out += '<path class="cb-line" d="' + line + '" style="stroke:' + s.color + '"/>';
		}

		const idx = this.hover == null ? this.n - 1 : this.hover;
		const hx = idx * step;
		if (this.hover != null)
			out += '<line class="cb-cross" x1="' + hx + '" x2="' + hx + '" y1="' + pt + '" y2="' + (H - pb) + '"/>';
		this.series.forEach((s) => {
			out += '<circle class="cb-dot" cx="' + hx + '" cy="' + y(s.data[idx]) + '" r="4" style="fill:' + s.color + '"/>';
		});
		this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		this.svg.innerHTML = out;

		if (this.hover != null) {
			const ago = (this.n - 1 - idx) * this.interval;
			let html = '<div class="cb-tip-time">' + esc(ago ? t('%ds ago', ago) : t('Now')) + '</div>';
			this.series.forEach((s) => {
				html += '<div class="cb-tip-row" style="--c:' + s.color + '"><i></i>' + esc(s.label) +
					'<b>' + esc(fmt.bytesStr(s.data[idx], true)) + '</b></div>';
			});
			this.tip.innerHTML = html;
			const tw = this.tip.offsetWidth || 150;
			this.tip.style.left = clamp(hx + 14 > W - tw ? hx - tw - 14 : hx + 14, 0, Math.max(0, W - tw)) + 'px';
			this.tip.classList.add('show');
		}
		else {
			this.tip.classList.remove('show');
		}
	};
	C.AreaChart = AreaChart;

	/* Activity-style ring gauge */
	const CIRC = 2 * Math.PI * 42;
	function Ring(el, opts) {
		this.color = opts.color;
		el.classList.add('cb-ring');
		el.innerHTML =
			'<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="cb-ring-track" cx="50" cy="50" r="42"/>' +
			'<circle class="cb-ring-bar" cx="50" cy="50" r="42" style="stroke:' + opts.color + '" stroke-dasharray="' + CIRC.toFixed(2) + '" stroke-dashoffset="' + CIRC.toFixed(2) + '"/></svg>' +
			'<div class="cb-ring-center"><b>—</b></div>' +
			'<div class="cb-ring-label">' + esc(opts.label) + '</div><div class="cb-ring-sub">&nbsp;</div>';
		this.bar = el.querySelector('.cb-ring-bar');
		this.val = el.querySelector('.cb-ring-center b');
		this.sub = el.querySelector('.cb-ring-sub');
	}
	Ring.prototype.set = function (pct, sub) {
		this.sub.textContent = sub || ' ';
		if (pct == null || isNaN(pct)) {
			this.val.textContent = '—';
			this.bar.style.strokeDashoffset = CIRC;
			return;
		}
		pct = clamp(pct, 0, 100);
		this.bar.style.strokeDashoffset = (CIRC * (1 - pct / 100)).toFixed(2);
		this.bar.style.stroke = pct >= 90 ? 'var(--cb-red)' : this.color;
		this.val.innerHTML = Math.round(pct) + '<small>%</small>';
	};
	C.Ring = Ring;

	/* Sparkline */
	function Sparkline(el, opts) {
		this.el = el;
		this.n = opts.points || 30;
		this.color = opts.color;
		this.id = uid();
		this.data = [];
		el.classList.add('cb-spark');
	}
	Sparkline.prototype.push = function (v) {
		/* seed with the first reading so the line starts flat, not as a stub */
		if (!this.data.length) this.data = new Array(this.n - 1).fill(+v || 0);
		this.data.push(+v || 0);
		while (this.data.length > this.n) this.data.shift();
		this.draw();
	};
	Sparkline.prototype.draw = function () {
		const W = 100, H = 32, d = this.data;
		if (d.length < 2) { this.el.innerHTML = ''; return; }
		const max = Math.max.apply(null, d) * 1.2 || 1;
		const step = W / (this.n - 1);
		const off = (this.n - d.length) * step;
		const pts = d.map((v, i) => [off + i * step, H - 2 - (H - 4) * (v / max)]);
		const line = smoothPath(pts, 1, H - 1);
		this.el.innerHTML =
			'<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + this.id + '" x1="0" y1="0" x2="0" y2="1">' +
			'<stop offset="0" style="stop-color:' + this.color + ';stop-opacity:.28"/><stop offset="1" style="stop-color:' + this.color + ';stop-opacity:0"/></linearGradient></defs>' +
			'<path d="' + line + 'L' + W + ',' + H + 'L' + off + ',' + H + 'Z" fill="url(#' + this.id + ')"/>' +
			'<path d="' + line + '" fill="none" style="stroke:' + this.color + '" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
	};
	C.Sparkline = Sparkline;

	/* ------------------------------------------------------------------
	 * Dashboard
	 *
	 * provider (all methods return Promises, any may reject):
	 *   board()            → ubus system.board
	 *   info()             → ubus system.info
	 *   cpuStat()          → contents of /proc/stat
	 *   interfaces()       → ubus network.interface dump (array)
	 *   devStats(dev)      → { rx_bytes, tx_bytes }
	 *   netDevices()       → luci-rpc getNetworkDevices, keyed by name (optional;
	 *                        lists physical ports such as pon0 in the traffic picker)
	 *   leases()           → luci-rpc getDHCPLeases
	 *   wireless()         → ubus network.wireless status
	 *   stations(ifnames)  → [{ ifname, mac, signal }] from iwinfo assoclist (optional)
	 *   neighbors()        → contents of /proc/net/arp (optional)
	 *   hostHints()        → luci-rpc getHostHints (optional)
	 *   conntrack()        → [count, max]
	 *   temperatures()     → [{ name, value (millidegrees) }]
	 *                        (temperature() → millidegrees string is still accepted)
	 * opts.urls: { network, wireless, devices }
	 * ------------------------------------------------------------------ */
	const AVATAR_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'indigo', 'pink'];
	const hash = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); };
	const ipNum = (ip) => String(ip || '').split('.').reduce((a, b) => a * 256 + (+b || 0), 0);
	const PROTO = { static: N_('Static address'), dhcp: N_('DHCP client'), pppoe: N_('PPPoE'), none: N_('Unmanaged') };

	function parseCpu(text) {
		const lines = String(text || '').split('\n');
		if (lines[0].indexOf('cpu ') !== 0) return null;
		const v = lines[0].trim().split(/\s+/).slice(1).map(Number);
		const total = v.slice(0, 8).reduce((a, b) => a + (b || 0), 0);
		return { idle: (v[3] || 0) + (v[4] || 0), total: total, cores: lines.filter((l) => /^cpu\d/.test(l)).length };
	}

	function radioBand(cfg) {
		cfg = cfg || {};
		const band = cfg.band ? ({ '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' })[cfg.band] : null;
		return band || (cfg.hwmode ? (/a/.test(cfg.hwmode) ? '5 GHz' : '2.4 GHz') : null);
	}

	/* AP interfaces that are up → { ifnames: [...], bands: { ifname: '5 GHz' } } */
	function apInterfaces(w) {
		const out = { ifnames: [], bands: {} };
		Object.keys(w || {}).forEach((radio) => {
			const r = w[radio] || {}, cfg = r.config || {};
			if (!r.up || r.disabled || cfg.disabled) return;
			(r.interfaces || []).forEach((i) => {
				const ic = i.config || {};
				if (!i.ifname || ic.disabled || (ic.mode && ic.mode !== 'ap')) return;
				out.ifnames.push(i.ifname);
				out.bands[i.ifname] = radioBand(cfg);
			});
		});
		return out;
	}

	function hasDefaultRoute(iface) {
		return (iface.route || []).some((r) => (r.target === '0.0.0.0' || r.target === '::') && r.mask === 0);
	}

	/* ------------------------------------------------------------------
	 * Device brand recognition (data in brands.js, loaded on demand)
	 * ------------------------------------------------------------------ */
	const TYPE_LABEL = {
		phone: N_('Phone'), tablet: N_('Tablet'), pc: N_('Computer'), tv: N_('TV'), speaker: N_('Speaker'),
		game: N_('Game console'), printer: N_('Printer'), camera: N_('Camera'), nas: N_('Storage'), iot: N_('Smart device')
	};
	const TYPE_GLYPH = { game: 'gamepad' };

	let brandsPromise = null, hostRules = null, ouiMap = null;

	C.loadBrands = function () {
		if (C.BRAND_DATA) return Promise.resolve(C.BRAND_DATA);
		if (brandsPromise) return brandsPromise;
		brandsPromise = new Promise((resolve) => {
			C.onBrands = () => resolve(C.BRAND_DATA);
			const s = document.createElement('script');
			s.src = BASE + 'brands.js?v=' + C.version;
			s.async = true;
			s.onerror = () => resolve(null);
			document.head.appendChild(s);
		});
		return brandsPromise;
	};

	function buildIndex(data) {
		hostRules = data.host.map((r) => {
			try { return [new RegExp(r[0], 'i'), r[1], r[2]]; } catch (e) { return null; }
		}).filter(Boolean);
		ouiMap = new Map();
		Object.keys(data.oui).forEach((key) => {
			const bin = window.atob(data.oui[key]);
			for (let i = 0; i + 2 < bin.length; i += 3)
				ouiMap.set((bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8) | bin.charCodeAt(i + 2), key);
		});
	}

	/* → { key, brand, type, priv } — brand/type may be null */
	C.identify = function (hostname, mac) {
		const data = C.BRAND_DATA;
		const res = { key: null, brand: null, type: null, priv: false };
		const m = String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
		/* locally administered bit → randomised "private Wi‑Fi address" */
		res.priv = m.length === 12 && (parseInt(m[1], 16) & 2) === 2;
		if (!data) return res;
		if (!hostRules) buildIndex(data);

		const host = String(hostname || '');
		for (const r of hostRules) {
			if (r[0].test(host)) {
				res.key = r[1];
				res.type = r[2];
				break;
			}
		}
		if (!res.key && m.length === 12 && !res.priv) {
			const k = ouiMap.get(parseInt(m.slice(0, 6), 16));
			if (k) res.key = k;
		}
		if (res.key && data.brands[res.key]) {
			res.brand = data.brands[res.key];
			if (!res.brand.n) {          /* chip-vendor hint only, e.g. Intel Wi‑Fi → computer */
				res.type = res.type || (res.brand.g === 'pc' ? 'pc' : null);
				res.brand = null;
				res.key = null;
			}
		}
		return res;
	};

	/* ------------------------------------------------------------------
	 * Connected devices: DHCPv4/v6 leases + Wi‑Fi stations + ARP neighbours
	 * (static-IP clients) + LuCI host hints for names. Keyed by MAC.
	 *
	 * src = { leases, leases6, stations, arp, hints, bands: { ifname: '5 GHz' } }
	 * → [{ macaddr, hostname, ipaddr, ip6addr, expires, lease, active, wifi }]
	 * ------------------------------------------------------------------ */
	const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
	C.parseArp = function (text, devices) {
		return String(text || '').split('\n').slice(1).map((line) => line.trim().split(/\s+/)).filter((f) =>
			f.length >= 6 && (parseInt(f[2], 16) & 2) && MAC_RE.test(f[3].toLowerCase()) && f[3] !== '00:00:00:00:00:00' &&
			(!devices || devices.indexOf(f[5]) >= 0)
		).map((f) => ({ ip: f[0], mac: f[3].toLowerCase(), dev: f[5] }));
	};

	C.mergeDevices = function (src) {
		src = src || {};
		const byMac = new Map(), list = [];
		const get = (mac) => {
			mac = String(mac || '').toLowerCase();
			if (!MAC_RE.test(mac) || mac === '00:00:00:00:00:00') return null;
			let d = byMac.get(mac);
			if (!d) {
				d = { macaddr: mac, hostname: '', ipaddr: '', ip6addr: '', expires: null, lease: false, active: false, wifi: null };
				byMac.set(mac, d);
				list.push(d);
			}
			return d;
		};
		const firstAddr = (v) => String((Array.isArray(v) ? v[0] : v) || '').replace(/\/\d+$/, '');

		(src.leases || []).forEach((l) => {
			const d = get(l.macaddr);
			if (!d) return;
			d.hostname = d.hostname || l.hostname || '';
			d.ipaddr = d.ipaddr || l.ipaddr || '';
			d.expires = l.expires;
			d.lease = true;
		});
		(src.leases6 || []).forEach((l) => {
			const d = (l.macaddr && get(l.macaddr)) || (l.hostname ? list.find((x) => x.hostname === l.hostname) : null);
			if (!d) return;
			d.ip6addr = d.ip6addr || firstAddr(l.ip6addrs || l.ip6addr);
			d.hostname = d.hostname || l.hostname || '';
		});
		(src.arp || []).forEach((n) => {
			const d = get(n.mac);
			if (!d) return;
			d.ipaddr = d.ipaddr || n.ip;
			d.active = true;
		});
		(src.stations || []).forEach((st) => {
			const d = get(st.mac);
			if (!d) return;
			d.active = true;
			d.wifi = { band: (src.bands || {})[st.ifname] || null, signal: st.signal != null && st.signal < 0 ? st.signal : null };
		});
		const hints = src.hints || {};
		list.forEach((d) => {
			const hint = hints[d.macaddr.toUpperCase()] || hints[d.macaddr];
			if (!hint) return;
			d.hostname = d.hostname || hint.name || '';
			d.ipaddr = d.ipaddr || firstAddr(hint.ipaddrs || hint.ipv4);
			d.ip6addr = d.ip6addr || firstAddr(hint.ip6addrs || hint.ipv6);
		});
		return list.sort((a, b) => (!a.ipaddr - !b.ipaddr) || (ipNum(a.ipaddr) - ipNum(b.ipaddr)) || a.macaddr.localeCompare(b.macaddr));
	};

	/* LAN-side devices for ARP: skip uplinks (non-static interfaces with a default route) */
	C.lanDevices = function (ifs) {
		if (!Array.isArray(ifs)) return null;
		const devs = [];
		ifs.forEach((i) => {
			if (!i.up || i.interface === 'loopback' || (hasDefaultRoute(i) && i.proto !== 'static')) return;
			[i.l3_device, i.device].forEach((d) => { if (d && devs.indexOf(d) < 0) devs.push(d); });
		});
		return devs;
	};

	/*
	 * Traffic picker choices.
	 *   ifaces:  one entry per L3 device of an up logical interface ({ dev, alt, names })
	 *   devices: other up kernel devices from getNetworkDevices ({ dev }) — physical
	 *            uplinks such as an xPON port (pon0) carrying several VLANs/PPPoE
	 *            sessions, switch ports, VLANs, radios. Kernel placeholder devices
	 *            (lo, ifb, sit0, gre0 …) are left out.
	 */
	const NOISE_DEV = /^(lo|ifb\d*|imq\d+|teql\d+|dummy\d*|bonding_masters|tunl0|sit0|ip6tnl0|ip6gre0|gre0|gretap0|erspan0|ip_vti0|ip6_vti0)$/;
	C.trafficSources = function (ifs, netdevs) {
		const ifaces = [], devices = [], seen = {};
		(ifs || []).forEach((i) => {
			const dev = i.l3_device || i.device;
			if (!i.up || i.interface === 'loopback' || !dev) return;
			let g = ifaces.find((x) => x.dev === dev);
			if (!g) { ifaces.push(g = { dev: dev, alt: i.device, names: [] }); seen[dev] = true; }
			g.names.push((i.interface || '').toUpperCase());
		});
		if (netdevs && typeof netdevs === 'object') {
			Object.keys(netdevs).forEach((k) => {
				const d = netdevs[k] || {};
				const name = d.name || k;
				const up = d.up != null ? d.up : (d.flags && d.flags.up);
				if (!up || seen[name] || NOISE_DEV.test(name) || (d.flags && d.flags.loopback)) return;
				seen[name] = true;
				devices.push({ dev: name });
			});
			devices.sort((a, b) => a.dev.localeCompare(b.dev, undefined, { numeric: true }));
		}
		return { ifaces: ifaces, devices: devices };
	};

	/* first global IPv6 address of the interface carrying the IPv6 default route */
	C.wanIPv6 = function (ifs) {
		const up = (ifs || []).filter((i) => i.up && (i.route || []).some((r) => r.target === '::' && r.mask === 0));
		for (const i of up) {
			const addrs = (i['ipv6-address'] || []).concat(i['ipv6-prefix-assignment'] || [], i['ipv6-prefix'] || []);
			const a = addrs.find((x) => x && x.address && !/^fe80:/i.test(x.address));
			if (a) return { address: a.address, mask: a.mask, iface: i.interface };
		}
		return null;
	};

	/* avatar element for a device */
	function deviceAvatar(l, id) {
		const b = id.brand;
		if (b) {
			const cls = 'cb-avatar cb-avatar-brand' + (b.inv ? ' inv' : '');
			const style = b.bg ? '--c:' + b.bg + (b.fg ? ';--f:' + b.fg : '') : (b.fg ? '--f:' + b.fg : null);
			let inner;
			if (b.p) inner = '<svg class="cb-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="' + esc(b.p) + '"/></svg>';
			else if (b.m) inner = '<b>' + esc(b.m) + '</b>';
			else inner = icon(TYPE_GLYPH[b.g] || b.g);
			return h('span', { class: cls, style: style, title: b.n, html: inner });
		}
		if (id.type)
			return h('span', { class: 'cb-avatar cb-type', title: t(TYPE_LABEL[id.type]), html: icon(TYPE_GLYPH[id.type] || id.type) });

		const key = (l.macaddr || l.hostname || '').toLowerCase();
		const color = COLORS[AVATAR_COLORS[hash(key) % AVATAR_COLORS.length]];
		const ch = l.hostname ? Array.from(l.hostname)[0] : null;
		return h('span', { class: 'cb-avatar', style: '--c:' + color, html: ch ? esc(ch) : icon('laptop') });
	}

	C.Dashboard = {
		mount(host, P, opts) {
			opts = opts || {};
			const urls = opts.urls || {};
			const ui = {};
			const dash = h('section', { class: 'cb-dash', 'aria-label': t('Overview') });

			const card = (cls, title, aside, body) => {
				const head = title ? h('div', { class: 'cb-card-head' }, [h('h3', null, title), aside]) : null;
				return h('div', { class: 'cb-card ' + cls }, [head].concat(body));
			};
			const metaItem = (label, valEl) => h('div', { class: 'cb-meta' }, [h('span', { class: 'cb-meta-label', text: label }), valEl]);
			const manage = (href) => href ? h('a', { class: 'cb-card-link', href: href, text: t('Manage') }) : null;

			/* hero: the router's logo (a custom one from Carbon Theme Settings when set) */
			const heroIcon = () => {
				const custom = document.querySelector('.cb-brand-logo[data-custom]');
				return custom ? h('div', { class: 'cb-hero-icon custom' }, h('img', { src: custom.getAttribute('src'), alt: '' }))
					: h('div', { class: 'cb-hero-icon', html: LOGO });
			};
			ui.host = h('h2', { class: 'cb-hero-title', text: '…' });
			ui.sub = h('p', { class: 'cb-hero-sub' });
			ui.net = h('span', { class: 'cb-pill off', text: '…' });
			ui.wan = h('span', { class: 'cb-meta-val cb-mono', text: '—' });
			ui.lan = h('span', { class: 'cb-meta-val cb-mono', text: '—' });
			ui.wan6 = h('span', { class: 'cb-meta-val cb-mono cb-ip6', text: '—' });
			ui.wan6Item = metaItem(t('WAN IPv6'), ui.wan6);
			ui.wan6Item.classList.add('hidden');
			dash.appendChild(h('div', { class: 'cb-card cb-hero span-12' }, [
				h('div', { class: 'cb-hero-id' }, [
					heroIcon(),
					h('div', { class: 'cb-hero-text' }, [ui.host, ui.sub])
				]),
				h('div', { class: 'cb-hero-meta' }, [ui.net, metaItem(t('WAN IP'), ui.wan), ui.wan6Item, metaItem(t('LAN IP'), ui.lan)])
			]));

			/* traffic */
			const rate = (label, color) => {
				const val = h('span', { class: 'cb-rate-val', html: '0<small>B/s</small>' });
				return { val: val, el: h('div', { class: 'cb-rate' }, [h('span', { class: 'cb-rate-label', style: '--c:' + color }, [h('i'), label]), val]) };
			};
			ui.dl = rate(t('Download'), COLORS.blue);
			ui.ul = rate(t('Upload'), COLORS.purple);
			ui.totals = h('div', { class: 'cb-totals' });
			ui.trafficSel = h('select', { class: 'cb-traffic-select', 'aria-label': t('Traffic interface') });
			ui.trafficSel.appendChild(h('option', { value: 'auto' }, t('Auto')));
			ui.chart = h('div', { class: 'cb-chart' });
			dash.appendChild(card('cb-traffic span-8', t('Live Traffic'), ui.trafficSel, [
				h('div', { class: 'cb-rates' }, [ui.dl.el, ui.ul.el, ui.totals]),
				ui.chart,
				h('div', { class: 'cb-chart-foot' }, [h('span', { text: t('2 min ago') }), h('span', { text: t('Now') })])
			]));

			/* resources */
			const ringCpu = h('div'), ringMem = h('div'), ringDisk = h('div');
			ui.memTitle = h('span');
			ui.membar = h('div', { class: 'cb-membar' });
			ui.memLegend = h('div', { class: 'cb-legend' });
			ui.kv = h('ul', { class: 'cb-kv' });
			dash.appendChild(card('cb-resources span-4', t('Resources'), null, [
				h('div', { class: 'cb-res-body' }, [
					h('div', { class: 'cb-rings' }, [ringCpu, ringMem, ringDisk]),
					h('div', null, [
						h('div', { class: 'cb-membar-wrap' }, [
							h('div', { class: 'cb-membar-title' }, [t('Memory'), ui.memTitle]),
							ui.membar, ui.memLegend
						]),
						ui.kv
					])
				])
			]));

			/* tiles */
			const tile = (iconName, color, label) => {
				const val = h('div', { class: 'cb-tile-val', text: '—' });
				const sub = h('div', { class: 'cb-tile-sub' });
				const extra = h('div');
				const el = h('div', { class: 'cb-card cb-tile span-3' }, [
					h('div', { class: 'cb-tile-head' }, [h('span', { class: 'cb-ico', style: '--c:' + COLORS[color], html: icon(iconName) }), label]),
					h('div', { class: 'cb-tile-row' }, [val, extra]),
					sub
				]);
				dash.appendChild(el);
				return { val: val, sub: sub, extra: extra };
			};
			ui.tDevices = tile('laptop', 'green', t('Devices'));
			ui.tConn = tile('link', 'teal', t('Connections'));
			ui.tLoad = tile('pulse', 'indigo', t('Load'));
			ui.tUp = tile('clock', 'orange', t('Uptime'));
			ui.connBar = h('div', { class: 'cb-mini-bar', style: '--c:' + COLORS.teal }, h('i'));
			ui.tConn.sub.parentNode.insertBefore(ui.connBar, ui.tConn.sub);

			/* clients */
			ui.clientCount = h('span', { class: 'cb-count' });
			ui.clients = h('ul', { class: 'cb-list' });
			ui.clientMore = h('button', { type: 'button', class: 'cb-more hidden' });
			dash.appendChild(h('div', { class: 'cb-card span-8' }, [
				h('div', { class: 'cb-card-head' }, [h('h3', null, [t('Connected Devices'), ui.clientCount]), manage(urls.devices)]),
				ui.clients, ui.clientMore
			]));

			/* wireless + interfaces */
			ui.wifi = h('ul', { class: 'cb-list' });
			ui.ifaces = h('ul', { class: 'cb-list' });
			ui.wifiHead = h('div', { class: 'cb-card-head' }, [h('h3', null, t('Wireless')), manage(urls.wireless)]);
			ui.ifHead = h('div', { class: 'cb-card-head', style: 'margin-top:18px' }, [h('h3', null, t('Interfaces')), manage(urls.network)]);
			dash.appendChild(h('div', { class: 'cb-card span-4' }, [ui.wifiHead, ui.wifi, ui.ifHead, ui.ifaces]));

			host.appendChild(dash);

			/* charts need the DOM to measure */
			const chart = new AreaChart(ui.chart, {
				points: 60, interval: 2,
				series: [{ color: COLORS.blue, label: t('Download') }, { color: COLORS.purple, label: t('Upload') }]
			});
			const rCpu = new Ring(ringCpu, { color: COLORS.blue, label: t('CPU') });
			const rMem = new Ring(ringMem, { color: COLORS.orange, label: t('Memory') });
			const rDisk = new Ring(ringDisk, { color: COLORS.purple, label: t('Storage') });
			const loadSpark = new Sparkline(ui.tLoad.extra, { color: COLORS.indigo, points: 30 });

			/* ---------------- data ---------------- */
			const st = {
				dev: null, devAlt: null, prevNet: null, prevCpu: null, showAll: false, devices: [], wifiCount: null,
				traffic: store.get('carbon.traffic', 'auto'), trafficKey: '', ifs: null, hints: null, hintsAt: 0, aps: null,
				netdevs: null, netdevsAt: 0
			};
			const safe = (fn) => {
				if (typeof fn !== 'function') return Promise.resolve(null);
				try { return Promise.resolve(fn()).catch(() => null); }
				catch (e) { return Promise.resolve(null); }
			};

			const setRate = (r, v) => { const b = fmt.bytes(v, true); r.val.innerHTML = esc(b[0]) + '<small>' + esc(b[1]) + '</small>'; };

			function renderBoard(b) {
				if (!b) return;
				ui.host.textContent = b.hostname || 'OpenWrt';
				ui.sub.textContent = [b.model, b.release && b.release.description].filter(Boolean).join(' · ');
			}

			function renderClients() {
				const list = st.devices;
				ui.clients.innerHTML = '';
				ui.clientCount.textContent = list ? String(list.length) : '';
				ui.tDevices.val.textContent = list ? String(list.length) : '—';
				ui.tDevices.sub.textContent = st.wifiCount != null ? t('%d on Wi-Fi', st.wifiCount) :
					(list && list.some((d) => !d.lease) ? t('Recently active') : t('DHCP clients'));
				if (!list) { ui.clients.appendChild(h('li', { class: 'cb-empty', text: t('Unavailable') })); return; }
				if (!list.length) { ui.clients.appendChild(h('li', { class: 'cb-empty', text: t('No devices yet') })); }
				const limit = st.showAll ? list.length : 8;
				list.slice(0, limit).forEach((l) => {
					const id = C.identify(l.hostname, l.macaddr);
					const kind = id.brand ? id.brand.n : (id.type ? t(TYPE_LABEL[id.type]) : null);
					const name = l.hostname || (kind ? t('%s device', kind) : t('Unknown device'));
					let lease = '';
					if (l.lease) {
						if (l.expires === false || l.expires == null || l.expires < 0) lease = t('Static');
						else if (l.expires > 0) lease = t('%s left', fmt.duration(l.expires));
					}
					else if (l.active && !l.wifi) lease = t('Fixed IP');
					const wifi = l.wifi ? [l.wifi.band, l.wifi.signal != null ? l.wifi.signal + ' dBm' : null].filter(Boolean).join(' · ') : '';
					ui.clients.appendChild(h('li', null, [
						deviceAvatar(l, id),
						h('div', { class: 'cb-list-main' }, [
							h('span', { class: 'cb-list-title', text: name }),
							h('span', { class: 'cb-list-sub' }, [
								kind ? h('span', { class: 'cb-kind', text: kind }) : null,
								h('span', { class: 'cb-mono', text: l.ipaddr || l.ip6addr || '' })
							])
						]),
						h('div', { class: 'cb-list-aside' }, [
							h('span', { class: 'cb-mono cb-hide-sm', text: (l.macaddr || '').toUpperCase() }),
							h('span', null, [
								l.wifi ? h('span', { class: 'cb-tag cb-tag-wifi', title: t('Connected over Wi-Fi') + (wifi ? ' · ' + wifi : ''), 'aria-label': wifi || t('Wi-Fi'), html: icon('wifi') + '<span class="cb-tag-text">' + esc(wifi || t('Wi-Fi')) + '</span>' }) : null,
								id.priv ? h('span', { class: 'cb-tag', title: t('Randomised MAC address'), text: t('Private') }) : null,
								lease
							])
						])
					]));
				});
				if (list.length > 8) {
					ui.clientMore.classList.remove('hidden');
					ui.clientMore.textContent = st.showAll ? t('Show less') : t('Show all %d devices', list.length);
				}
				else ui.clientMore.classList.add('hidden');
			}
			ui.clientMore.addEventListener('click', () => { st.showAll = !st.showAll; renderClients(); });
			C.loadBrands().then((d) => { if (d && st.devices) renderClients(); });

			function renderWireless(w) {
				ui.wifi.innerHTML = '';
				/* devices without Wi‑Fi hardware (no radios, or no wireless menu
				   and the ubus object is missing): drop the section entirely */
				const noRadio = w ? !Object.keys(w).length : !urls.wireless;
				ui.wifiHead.classList.toggle('hidden', noRadio);
				ui.wifi.classList.toggle('hidden', noRadio);
				ui.ifHead.style.marginTop = noRadio ? '0' : '18px';
				if (noRadio) return;
				const rows = [];
				if (w) Object.keys(w).sort().forEach((radio) => {
					const r = w[radio] || {}, cfg = r.config || {};
					const band = radioBand(cfg);
					(r.interfaces || []).forEach((i) => {
						const ic = i.config || {};
						if (ic.mode && ic.mode !== 'ap') return;
						rows.push({
							ssid: ic.ssid || t('Hidden network'),
							sub: [band, cfg.channel && cfg.channel !== 'auto' ? 'CH ' + cfg.channel : null, (ic.encryption || '').toUpperCase().replace(/^PSK2.*/, 'WPA2').replace(/^SAE.*/, 'WPA3').replace(/^NONE$/, '') || null].filter(Boolean).join(' · '),
							on: !!r.up && !r.disabled && !ic.disabled && !cfg.disabled
						});
					});
				});
				if (!rows.length) { ui.wifi.appendChild(h('li', { class: 'cb-empty', text: w ? t('No wireless') : t('Unavailable') })); return; }
				rows.forEach((x) => ui.wifi.appendChild(h('li', null, [
					h('span', { class: 'cb-ico', style: '--c:' + (x.on ? COLORS.blue : COLORS.gray), html: icon('wifi') }),
					h('div', { class: 'cb-list-main' }, [h('span', { class: 'cb-list-title', text: x.ssid }), h('span', { class: 'cb-list-sub', text: x.sub })]),
					h('span', { class: 'cb-pill sm ' + (x.on ? 'ok' : 'off'), text: x.on ? t('On') : t('Off') })
				])));
			}

			function renderIfaces(list) {
				ui.ifaces.innerHTML = '';
				if (!list) { ui.ifaces.appendChild(h('li', { class: 'cb-empty', text: t('Unavailable') })); return; }
				list.filter((i) => i.interface !== 'loopback').forEach((i) => {
					const v4 = (i['ipv4-address'] || [])[0];
					const v6 = (i['ipv6-address'] || [])[0] || ((i['ipv6-prefix-assignment'] || [])[0] || {})['local-address'];
					const addr = v4 ? v4.address + '/' + v4.mask : (v6 ? v6.address + '/' + v6.mask : '');
					const proto = PROTO[i.proto] ? t(PROTO[i.proto]) : (i.proto || '').toUpperCase();
					const up = !!i.up;
					ui.ifaces.appendChild(h('li', null, [
						h('span', { class: 'cb-ico', style: '--c:' + (up ? (hasDefaultRoute(i) ? COLORS.green : COLORS.teal) : COLORS.gray), html: icon('globe') }),
						h('div', { class: 'cb-list-main' }, [
							h('span', { class: 'cb-list-title', text: (i.interface || '').toUpperCase() }),
							h('span', { class: 'cb-list-sub' }, [proto, addr ? ' · ' : '', addr ? h('span', { class: 'cb-mono', text: addr }) : null])
						]),
						h('span', { class: 'cb-pill sm ' + (up ? 'ok' : 'off'), text: up ? t('Connected') : t('Not connected') })
					]));
				});
			}

			function uplinks(ifs) {
				const wan = ifs.find((i) => i.up && hasDefaultRoute(i) && i['ipv4-address'] && i['ipv4-address'].length) ||
					ifs.find((i) => i.up && hasDefaultRoute(i)) ||
					ifs.find((i) => i.interface === 'wan');
				return { wan: wan, lan: ifs.find((i) => i.interface === 'lan') };
			}

			/*
			 * traffic source: "auto" follows the uplink (the L3 device, e.g. pppoe-wan),
			 * or an interface / network device the user picked. The physical port
			 * below the uplink is not chosen automatically: on xPON it also carries
			 * IPTV and management VLANs, but on a one-armed router it carries LAN too.
			 */
			function updateTraffic() {
				const ifs = st.ifs;
				if (!ifs) return;
				const src = C.trafficSources(ifs, st.netdevs);
				const groups = src.ifaces;
				const u = uplinks(ifs);
				const auto = (u.wan && u.wan.up) ? u.wan : u.lan;
				const autoDev = auto ? (auto.l3_device || auto.device) : null;
				const key = groups.map((g) => g.dev + '=' + g.names.join(',')).join('|') + '#' +
					src.devices.map((d) => d.dev).join(',') + '#' + autoDev;
				if (key !== st.trafficKey) {
					st.trafficKey = key;
					ui.trafficSel.innerHTML = '';
					ui.trafficSel.appendChild(h('option', { value: 'auto' },
						t('Auto') + (auto ? ' · ' + (auto.interface || '').toUpperCase() + (autoDev ? ' (' + autoDev + ')' : '') : '')));
					const ifOpts = groups.map((g) => h('option', { value: g.dev }, g.names.join(' / ') + ' (' + g.dev + ')'));
					if (src.devices.length) {
						ui.trafficSel.appendChild(h('optgroup', { label: t('Interfaces') }, ifOpts));
						ui.trafficSel.appendChild(h('optgroup', { label: t('Network devices') },
							src.devices.map((d) => h('option', { value: d.dev }, d.dev))));
					}
					else ifOpts.forEach((o) => ui.trafficSel.appendChild(o));
				}
				const pick = groups.find((g) => g.dev === st.traffic) || src.devices.find((d) => d.dev === st.traffic);
				ui.trafficSel.value = pick ? pick.dev : 'auto';
				const dev = pick ? pick.dev : autoDev;
				if (dev !== st.dev) {
					st.prevNet = null;
					chart.reset();
					setRate(ui.dl, 0);
					setRate(ui.ul, 0);
				}
				st.dev = dev;
				st.devAlt = pick ? pick.alt : (auto ? auto.device : null);
			}
			ui.trafficSel.addEventListener('change', () => {
				st.traffic = ui.trafficSel.value;
				store.set('carbon.traffic', st.traffic);
				updateTraffic();
			});

			async function slow() {
				const hintsDue = Date.now() - st.hintsAt > 30000;
				const netdevsDue = Date.now() - st.netdevsAt > 30000;
				/* stations use the AP list from the previous tick, so everything goes in one batch */
				const known = st.aps;
				const r = await Promise.all([
					safe(P.interfaces), safe(P.leases), safe(P.wireless), safe(P.neighbors),
					hintsDue ? safe(P.hostHints) : Promise.resolve(st.hints),
					known && known.length && P.stations ? safe(() => P.stations(known)) : Promise.resolve(null),
					netdevsDue ? safe(P.netDevices) : Promise.resolve(st.netdevs)
				]);
				const ifs = Array.isArray(r[0]) ? r[0] : null;
				st.ifs = ifs;
				/* device list for the traffic picker; keep the last good one if a refresh fails */
				if (netdevsDue && r[6] && typeof r[6] === 'object') { st.netdevs = r[6]; st.netdevsAt = Date.now(); }

				if (ifs) {
					const u = uplinks(ifs);
					const online = ifs.some((i) => i.up && hasDefaultRoute(i));
					ui.net.className = 'cb-pill ' + (online ? 'ok' : 'bad');
					ui.net.textContent = online ? t('Online') : t('Offline');
					const wv4 = u.wan && (u.wan['ipv4-address'] || [])[0];
					ui.wan.textContent = wv4 ? wv4.address : '—';
					const lv4 = u.lan && (u.lan['ipv4-address'] || [])[0];
					ui.lan.textContent = lv4 ? lv4.address : '—';
					const v6 = C.wanIPv6(ifs);
					ui.wan6Item.classList.toggle('hidden', !v6);
					ui.wan6.textContent = v6 ? v6.address : '—';
					ui.wan6.title = v6 ? v6.address + (v6.mask ? '/' + v6.mask : '') : '';
					updateTraffic();
				}
				renderIfaces(ifs);

				if (hintsDue && r[4] && typeof r[4] === 'object') { st.hints = r[4]; st.hintsAt = Date.now(); }
				const w = r[2] && typeof r[2] === 'object' ? r[2] : null;
				const aps = apInterfaces(w);
				const same = known && known.join() === aps.ifnames.join();
				st.aps = aps.ifnames;
				/* first tick, or the AP set changed: one extra request */
				const stations = same ? r[5] : (aps.ifnames.length && P.stations ? await safe(() => P.stations(aps.ifnames)) : null);
				const leases = r[1] && Array.isArray(r[1].dhcp_leases) ? r[1].dhcp_leases : null;
				const arp = r[3] != null ? C.parseArp(r[3], C.lanDevices(ifs)) : null;
				st.devices = (leases || arp || stations) ? C.mergeDevices({
					leases: leases, leases6: r[1] && r[1].dhcp6_leases, stations: stations, arp: arp, hints: st.hints, bands: aps.bands
				}) : null;
				st.wifiCount = (st.devices && Array.isArray(stations)) ? st.devices.filter((d) => d.wifi).length : null;
				renderClients();
				renderWireless(w || (r[2] == null ? null : {}));
			}

			async function mid() {
				const r = await Promise.all([safe(P.info), safe(P.conntrack), safe(P.temperatures || P.temperature)]);
				const info = r[0];
				ui.kv.innerHTML = '';
				if (info) {
					const m = info.memory || {};
					if (m.total) {
						const avail = m.available != null ? m.available : (m.free || 0) + (m.buffered || 0) + (m.cached || 0);
						const used = Math.max(0, m.total - avail);
						const cache = Math.min(Math.max(0, m.total - used), (m.buffered || 0) + (m.cached || 0));
						const free = Math.max(0, m.total - used - cache);
						rMem.set(used / m.total * 100, fmt.pair(used, m.total));
						ui.memTitle.textContent = fmt.bytesStr(m.total);
						ui.membar.innerHTML = '';
						[[used, COLORS.orange, t('Used')], [cache, COLORS.yellow, t('Cache')], [free, 'var(--cb-fill)', t('Free')]].forEach((s) => {
							ui.membar.appendChild(h('i', { style: '--c:' + s[1] + ';flex-basis:' + (s[0] / m.total * 100).toFixed(2) + '%' }));
						});
						ui.memLegend.innerHTML = '';
						[[used, COLORS.orange, t('Used')], [cache, COLORS.yellow, t('Cache')], [free, 'var(--cb-gray)', t('Free')]].forEach((s) => {
							ui.memLegend.appendChild(h('span', { style: '--c:' + s[1] }, [h('i'), s[2] + ' ' + fmt.bytesStr(s[0])]));
						});
					}
					const root = info.root || {};
					if (root.total) {
						const used = root.used != null ? root.used : root.total - root.free;
						rDisk.set(used / root.total * 100, fmt.pair(used * 1024, root.total * 1024));
					}
					else rDisk.set(null, t('Unavailable'));

					if (info.load) {
						const l = info.load.map((x) => (x / 65536).toFixed(2));
						ui.tLoad.val.textContent = l[0];
						ui.tLoad.sub.textContent = t('1 min average');
						loadSpark.push(+l[0]);
						ui.kv.appendChild(h('li', null, [h('span', { text: t('Load average') }), h('span', { class: 'cb-mono', text: l.join(' · ') })]));
					}
					if (info.uptime != null) {
						ui.tUp.val.textContent = fmt.duration(info.uptime);
						ui.tUp.sub.textContent = t('Since %s', fmt.since(info.uptime));
					}
				}
				else {
					rMem.set(null, t('Unavailable'));
					rDisk.set(null, t('Unavailable'));
				}

				const ct = r[1];
				if (ct && ct[0] != null) {
					const n = parseInt(ct[0], 10), max = parseInt(ct[1], 10);
					ui.tConn.val.textContent = fmt.num(n);
					ui.tConn.sub.textContent = max ? t('of %s max', fmt.num(max)) : '';
					ui.connBar.firstChild.style.width = max ? clamp(n / max * 100, 1, 100).toFixed(1) + '%' : '0';
				}
				else ui.tConn.sub.textContent = t('Unavailable');

				/* sensors: [{ name, value (m°C) }] — or a bare reading from older providers */
				const temps = (Array.isArray(r[2]) ? r[2] : (r[2] != null ? [{ name: '', value: parseInt(r[2], 10) }] : []))
					.filter((x) => x && !isNaN(x.value) && x.value > 0).sort((a, b) => b.value - a.value);
				const sensorName = (n) => String(n || '').replace(/[-_ ]?thermal$/i, '').replace(/[-_]+/g, ' ').trim();
				const all = temps.map((x) => (sensorName(x.name) || t('Temperature')) + ': ' + (x.value / 1000).toFixed(1) + ' °C').join('\n');
				temps.slice(0, 3).forEach((x) => {
					const label = temps.length > 1 && sensorName(x.name) ? t('Temperature') + ' · ' + sensorName(x.name) : t('Temperature');
					ui.kv.appendChild(h('li', { title: all }, [h('span', { text: label }), h('span', { text: (x.value / 1000).toFixed(1) + ' °C' })]));
				});
			}

			async function fast() {
				const dev = st.dev;
				const r = await Promise.all([
					safe(P.cpuStat),
					dev ? safe(() => P.devStats(dev, st.devAlt)) : Promise.resolve(null)
				]);

				const cpu = parseCpu(r[0]);
				if (cpu) {
					if (st.prevCpu && cpu.total > st.prevCpu.total) {
						const dt = cpu.total - st.prevCpu.total, di = cpu.idle - st.prevCpu.idle;
						rCpu.set((1 - di / dt) * 100, cpu.cores ? t('%d cores', cpu.cores) : '');
					}
					st.prevCpu = cpu;
				}
				else if (!st.prevCpu) rCpu.set(null, t('Unavailable'));

				const s = r[1];
				/* the traffic source may have changed while this sample was in flight */
				if (s && s.rx_bytes != null && dev === st.dev) {
					const now = Date.now();
					if (st.prevNet && s.rx_bytes >= st.prevNet.rx && s.tx_bytes >= st.prevNet.tx) {
						const dt = (now - st.prevNet.t) / 1000 || 1;
						const rx = (s.rx_bytes - st.prevNet.rx) / dt, tx = (s.tx_bytes - st.prevNet.tx) / dt;
						chart.push([rx, tx]);
						setRate(ui.dl, rx);
						setRate(ui.ul, tx);
					}
					st.prevNet = { rx: s.rx_bytes, tx: s.tx_bytes, t: now };
					ui.totals.innerHTML = esc(t('Since boot')) + '<br>↓ <b>' + esc(fmt.bytesStr(s.rx_bytes)) + '</b> &nbsp; ↑ <b>' + esc(fmt.bytesStr(s.tx_bytes)) + '</b>';
				}
			}

			/* poll with setTimeout chains; pause while the tab is hidden */
			const loop = (fn, ms) => {
				const run = () => {
					const p = document.hidden ? Promise.resolve() : fn().catch((e) => { if (window.console) console.warn('[carbon]', e); });
					p.then(() => setTimeout(run, ms));
				};
				run();
			};

			safe(P.board).then(renderBoard);
			slow().then(() => {
				loop(fast, 2000);
				setTimeout(() => loop(slow, 10000), 10000);
			});
			loop(mid, 5000);

			return dash;
		}
	};

	/* Details toggle (LuCI's original status widgets live below) */
	C.detailsToggle = function (host, defaultOpen, onToggle) {
		const body = document.body;
		const saved = store.get('carbon.details', '');
		const open = saved ? saved === '1' : !!defaultOpen;
		const btn = h('button', { type: 'button', class: 'cb-details-btn', 'aria-controls': 'view' });
		const sync = (on) => {
			body.classList.toggle('cb-show-details', on);
			btn.setAttribute('aria-expanded', on ? 'true' : 'false');
			btn.innerHTML = esc(on ? t('Hide detailed status') : t('Show detailed status')) + icon('chevdown');
			if (typeof onToggle === 'function') onToggle(on);
		};
		btn.addEventListener('click', () => {
			const on = !body.classList.contains('cb-show-details');
			store.set('carbon.details', on ? '1' : '0');
			sync(on);
		});
		body.classList.add('cb-has-dash');
		sync(open);
		const bar = h('div', { class: 'cb-details-bar' }, btn);
		host.appendChild(bar);
		return bar;
	};

})(window, document);
