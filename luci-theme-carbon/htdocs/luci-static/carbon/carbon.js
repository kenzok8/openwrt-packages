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
	const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
	const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	const canWaapi = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
	const splitTokens = (val) => {
		if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
		const s = String(val == null ? '' : val).trim();
		if (!s || s === 'none') return [];
		return s.split(/\s+/).filter(Boolean);
	};

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
		chevup: '<path d="M6 15l6-6 6 6"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		close: '<path d="M6 6l12 12M18 6L6 18"/>',
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

	const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="cb-logo-bg" x1="10" y1="2" x2="56" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#707EFF"/><stop offset="46%" stop-color="#4F5BEA"/><stop offset="100%" stop-color="#292FA8"/></linearGradient><radialGradient id="cb-logo-glow" cx="32" cy="24" r="30" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#B6C1FF" stop-opacity=".46"/><stop offset="55%" stop-color="#6B78FF" stop-opacity=".14"/><stop offset="100%" stop-color="#4F5BEA" stop-opacity="0"/></radialGradient><radialGradient id="cb-logo-bounce" cx="46" cy="62" r="26" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#6CE5FF" stop-opacity=".28"/><stop offset="100%" stop-color="#4F5BEA" stop-opacity="0"/></radialGradient><linearGradient id="cb-logo-rim" x1="16" y1="0" x2="48" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF" stop-opacity=".58"/><stop offset="38%" stop-color="#FFF" stop-opacity=".1"/><stop offset="76%" stop-color="#9BA8FF" stop-opacity=".06"/><stop offset="100%" stop-color="#B8C8FF" stop-opacity=".3"/></linearGradient><linearGradient id="cb-logo-plate" x1="18" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF" stop-opacity=".32"/><stop offset="52%" stop-color="#DCE3FF" stop-opacity=".11"/><stop offset="100%" stop-color="#8998FF" stop-opacity=".06"/></linearGradient><linearGradient id="cb-logo-sheen" x1="16" y1="13" x2="40" y2="38" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF" stop-opacity=".3"/><stop offset="100%" stop-color="#FFF" stop-opacity="0"/></linearGradient><linearGradient id="cb-logo-hex" x1="20" y1="13" x2="44" y2="51" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF"/><stop offset="55%" stop-color="#EEF1FF"/><stop offset="100%" stop-color="#C7D1FF"/></linearGradient><radialGradient id="cb-logo-aura" cx="32" cy="32" r="10" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF" stop-opacity=".34"/><stop offset="100%" stop-color="#FFF" stop-opacity="0"/></radialGradient><radialGradient id="cb-logo-core" cx="30" cy="29.8" r="7" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFF"/><stop offset="65%" stop-color="#EFF2FF"/><stop offset="100%" stop-color="#BAC6FF"/></radialGradient><clipPath id="cb-logo-sq"><rect width="64" height="64" rx="16"/></clipPath><clipPath id="cb-logo-hc"><path d="M29.75 14.8Q32 13.5 34.25 14.8l11.52 6.65q2.25 1.3 2.25 3.9v13.3q0 2.6-2.25 3.9L34.25 49.2q-2.25 1.3-4.5 0l-11.52-6.65q-2.25-1.3-2.25-3.9v-13.3q0-2.6 2.25-3.9z"/></clipPath></defs><g clip-path="url(#cb-logo-sq)"><rect width="64" height="64" fill="url(#cb-logo-bg)"/><ellipse cx="26" cy="10" rx="34" ry="22" fill="url(#cb-logo-glow)"/><rect width="64" height="64" fill="url(#cb-logo-bounce)"/><ellipse cx="32" cy="-2" rx="34" ry="15" fill="#FFF" fill-opacity=".11"/></g><rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="url(#cb-logo-rim)" stroke-width="1.5"/><path d="M29.75 16.9Q32 15.6 34.25 16.9l11.52 6.65q2.25 1.3 2.25 3.9v13.3q0 2.6-2.25 3.9L34.25 51.3q-2.25 1.3-4.5 0l-11.52-6.65q-2.25-1.3-2.25-3.9v-13.3q0-2.6 2.25-3.9z" fill="#171C7A" fill-opacity=".26" stroke="#171C7A" stroke-opacity=".34" stroke-width="4.2"/><path d="M29.75 14.8Q32 13.5 34.25 14.8l11.52 6.65q2.25 1.3 2.25 3.9v13.3q0 2.6-2.25 3.9L34.25 49.2q-2.25 1.3-4.5 0l-11.52-6.65q-2.25-1.3-2.25-3.9v-13.3q0-2.6 2.25-3.9z" fill="url(#cb-logo-plate)"/><path d="M12 12h40L12 40z" fill="url(#cb-logo-sheen)" clip-path="url(#cb-logo-hc)"/><path d="M29.75 14.8Q32 13.5 34.25 14.8l11.52 6.65q2.25 1.3 2.25 3.9v13.3q0 2.6-2.25 3.9L34.25 49.2q-2.25 1.3-4.5 0l-11.52-6.65q-2.25-1.3-2.25-3.9v-13.3q0-2.6 2.25-3.9z" fill="none" stroke="url(#cb-logo-hex)" stroke-width="3.6" stroke-linejoin="round"/><circle cx="32" cy="32" r="10" fill="url(#cb-logo-aura)"/><circle cx="32" cy="33.3" r="5.3" fill="#1B2082" fill-opacity=".34"/><circle cx="32" cy="32" r="5.3" fill="url(#cb-logo-core)"/><circle cx="30.3" cy="30.2" r="1.4" fill="#FFF" fill-opacity=".95"/></svg>';
	let logoSeq = 0;
	const logo = C.logo = () => LOGO.replace(/\bcb-logo-/g, 'cb-h' + (++logoSeq) + '-');

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
		turboacc: 'zap', flowoffload: 'zap', flowcone: 'zap',
		/* services */
		ddns: 'refresh', upnp: 'link', wol: 'power', samba4: 'folder', samba: 'folder', ksmbd: 'folder',
		nfs: 'folder', vsftpd: 'folder', adblock: 'shield', adguardhome: 'shield', smartdns: 'server',
		mosdns: 'server', 'https-dns-proxy': 'server', acme: 'lock', users: 'users', openvpn: 'lock',
		zerotier: 'lock', tailscale: 'lock', frpc: 'cloud', frps: 'cloud', nps: 'cloud', cloudflared: 'cloud',
		openclash: 'send', passwall: 'send', passwall2: 'send', homeproxy: 'send', nikki: 'send',
		'ssr-plus': 'send', shadowsocksr: 'send', vssr: 'send', bypass: 'send', honk: 'send', aria2: 'download',
		transmission: 'download', qbittorrent: 'download', minidlna: 'play', jellyfin: 'play',
		rtp2httpd: 'fiber', rtp2httpx: 'fiber', udpxy: 'fiber', iptv: 'fiber',
		watchcat: 'eye', diskman: 'disk', 'hd-idle': 'disk', dockerman: 'docker', docker: 'docker',
		vlmcsd: 'key', ua2f: 'shield', accesscontrol: 'filter', timecontrol: 'clock', p910nd: 'printer',
		usb_printer: 'printer', alist: 'folder', 'ddns-go': 'refresh', wechatpush: 'bell', serverchan: 'bell',
		pushbot: 'bell', irqbalance: 'cpu'
	};
	const PAGE_KEYWORDS = [
		[/plugin|addon|extension/, 'puzzle'], [/theme|argon|design|kucat|skin/, 'palette'],
		[/vlan/, 'layers'], [/(^|[-_])[xge]?pon($|[-_])|optical|fiber/, 'fiber'], [/route|routing|mwan/, 'route'],
		[/clash|passwall|ssr|v2ray|xray|trojan|shadow|bypass|proxy|mihomo|sing-?box/, 'send'],
		[/frp|nps|ngrok|cloud/, 'cloud'], [/accel|turbo|offload|speed/, 'zap'],
		[/dlna|media|jellyfin|emby|music|video/, 'play'], [/^rtp|iptv|udpxy|multicast/, 'fiber'], [/aria|transmission|qbit|torrent/, 'download'],
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
	 * Customizable Simple menu model (pure helpers; UCI-backed on router,
	 * localStorage fallback in static preview)
	 * ------------------------------------------------------------------ */
	const MENU_GROUPS = ['common', 'system'];
	const MENU_MAX_ITEMS = 32;
	const MENU_MAX_BYTES = 1024;
	const MENU_PATH_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,63})?$/;
	const SIMPLE_BUILTIN_BY_PATH = Object.create(null);
	C.SIMPLE_MENU.forEach((grp, idx) => {
		const groupKey = MENU_GROUPS[idx] || 'system';
		grp.items.forEach((it) => {
			const meta = { group: groupKey, title: it.title, icon: it.icon, paths: it.paths };
			it.paths.forEach((p) => { SIMPLE_BUILTIN_BY_PATH[p] = meta; });
		});
	});

	function isValidMenuPath(p) {
		return typeof p === 'string' &&
			p !== 'none' && p !== 'logout' && p.indexOf('logout/') !== 0 &&
			p.indexOf('..') < 0 && MENU_PATH_RE.test(p);
	}
	function defaultSimpleMenu(known, root) {
		const prefix = root ? root + '/' : '';
		const out = { common: [], system: [] };
		C.SIMPLE_MENU.forEach((grp, idx) => {
			const key = MENU_GROUPS[idx] || 'system';
			grp.items.forEach((it) => {
				if (known) {
					for (const p of it.paths) {
						if (known[prefix + p]) { out[key].push(p); break; }
					}
				}
				else {
					out[key].push(it.paths[0]);
				}
			});
		});
		return out;
	}
	function resolveSimplePath(rel, known, root) {
		if (!known || !isValidMenuPath(rel)) return null;
		const prefix = root ? root + '/' : '';
		const builtin = SIMPLE_BUILTIN_BY_PATH[rel] || null;
		if (known[prefix + rel])
			return { rel: rel, path: prefix + rel, node: known[prefix + rel], builtin: builtin };
		if (builtin) {
			for (const alt of builtin.paths) {
				if (known[prefix + alt])
					return { rel: alt, path: prefix + alt, node: known[prefix + alt], builtin: builtin };
			}
		}
		return null;
	}
	const cloneSimpleMenu = (c) => ({
		common: (c && Array.isArray(c.common)) ? c.common.slice() : [],
		system: (c && Array.isArray(c.system)) ? c.system.slice() : []
	});
	function parseSimpleMenuObject(raw) {
		const seen = Object.create(null);
		const out = { common: [], system: [] };
		let total = 0;
		MENU_GROUPS.forEach((g) => {
			let bytes = 0;
			splitTokens(raw[g]).forEach((tok) => {
				if (total >= MENU_MAX_ITEMS) return;
				if (!isValidMenuPath(tok) || seen[tok]) return;
				const nextBytes = (bytes ? bytes + 1 : 0) + tok.length;
				if (nextBytes > MENU_MAX_BYTES) return;
				seen[tok] = true;
				out[g].push(tok);
				bytes = nextBytes;
				total++;
			});
		});
		return total > 0 ? out : null;
	}
	function normalizeSimpleMenu(raw, fallback) {
		const parsed = raw && typeof raw === 'object' ? parseSimpleMenuObject(raw) : null;
		return parsed || cloneSimpleMenu(fallback || defaultSimpleMenu());
	}
	function serializeSimpleMenu(cfg) {
		const c = normalizeSimpleMenu(cfg);
		return {
			common: c.common.length ? c.common.join(' ') : 'none',
			system: c.system.length ? c.system.join(' ') : 'none'
		};
	}
	function encodeSimpleMenuAttr(cfg) {
		const s = serializeSimpleMenu(cfg);
		return 'common=' + s.common + ';system=' + s.system;
	}
	function parseSimpleMenuAttr(str) {
		const s = String(str || '').trim();
		if (!s) return null;
		const obj = {};
		let any = false;
		s.split(';').forEach((part) => {
			const i = part.indexOf('=');
			if (i <= 0) return;
			const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
			if (k === 'common' || k === 'system') { obj[k] = v; any = true; }
		});
		return any ? parseSimpleMenuObject(obj) : null;
	}
	const countSimpleMenu = (cfg) => ((cfg && cfg.common && cfg.common.length) || 0) + ((cfg && cfg.system && cfg.system.length) || 0);
	const isDefaultSimpleMenu = (cfg, known, root) => encodeSimpleMenuAttr(cfg) === encodeSimpleMenuAttr(defaultSimpleMenu(known, root));

	C.simpleMenu = {
		GROUPS: MENU_GROUPS,
		MAX_ITEMS: MENU_MAX_ITEMS,
		MAX_BYTES: MENU_MAX_BYTES,
		isValidPath: isValidMenuPath,
		builtinFor: (rel) => SIMPLE_BUILTIN_BY_PATH[rel] || null,
		defaultConfig: defaultSimpleMenu,
		resolvePath: resolveSimplePath,
		clone: cloneSimpleMenu,
		normalize: normalizeSimpleMenu,
		serialize: serializeSimpleMenu,
		encodeAttr: encodeSimpleMenuAttr,
		parseAttr: parseSimpleMenuAttr,
		count: countSimpleMenu,
		isDefault: isDefaultSimpleMenu
	};

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
			seg.classList.toggle('cb-seg-none', idx < 0);
			if (idx >= 0) seg.style.setProperty('--i', idx);
			buttons.forEach((b, i) => {
				b.setAttribute('aria-checked', i === idx ? 'true' : 'false');
				b.tabIndex = (idx < 0 ? i === 0 : i === idx) ? 0 : -1;
			});
			if (fire && idx >= 0) onChange(options[idx].value);
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
		seg._select = (v) => {
			const idx = options.findIndex((o) => o.value === v);
			select(v == null ? -1 : (idx >= 0 ? idx : (options.length ? 0 : -1)), false);
		};
		seg._selectExact = (v) => select(options.findIndex((o) => o.value === v), false);
		seg._select(value);
		return seg;
	}
	C.segmented = segmented;

	/* ------------------------------------------------------------------
	 * Listbox: a select in Carbon's glass style (instead of a native <select>)
	 *
	 * listbox({ options: [{ value, label, group }], value, label, className, onChange(value) })
	 *   → { el, open({ anchor, beside }), toggle(…), close(), set(value), setOptions(options, value) }
	 * Consecutive options with the same `group` get a heading above them (like <optgroup>).
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
		const items = () => list ? Array.from(list.querySelectorAll('[role="option"]')) : [];
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
		/* page scroll or resize closes the list; scrolling inside it does not,
		   nor does a scroll that leaves the trigger in place (scroll anchoring
		   when a card above refreshes, a late event from the opening tap) */
		let anchorAt = null;
		const anchorMoved = () => {
			const r = opener ? opener.getBoundingClientRect() : null;
			return !r || !anchorAt || Math.abs(r.top - anchorAt.top) > 1 || Math.abs(r.left - anchorAt.left) > 1;
		};
		const dismiss = (e) => {
			if (e && e.type === 'scroll' && list && (list.contains(e.target) || !anchorMoved())) return;
			close(false);
		};

		function open(o) {
			o = o || {};
			if (list) return;
			opener = o.anchor || el;
			list = h('ul', { class: 'cb-lb-list', id: id, role: 'listbox', tabindex: '-1', 'aria-label': opts.label || null });
			let group = null;
			opts.options.forEach((opt, i) => {
				if (opt.group && opt.group !== group) list.appendChild(h('li', { class: 'cb-lb-group', role: 'presentation', text: opt.group }));
				group = opt.group || null;
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
			anchorAt = opener.getBoundingClientRect();
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
		return {
			el: el, open: open, toggle: toggle, close: close,
			set(v) { value = v; sync(); },
			setOptions(options, v) {
				close(false);
				opts.options = options;
				if (v !== undefined) value = v;
				sync();
			}
		};
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

	/* LuCI's legacy realtime plots cache their pixel width at initialization.
	 * Fit their existing coordinates to the current viewport without changing
	 * samples, polling or the time window. Only curves and time-grid positions
	 * scale horizontally; text and stroke widths retain their original size. */
	const realtimeRoots = new WeakSet();
	C.initRealtimeCharts = function (root) {
		if (!root || realtimeRoots.has(root) ||
			!/(?:^|-)status-realtime(?:-|$)/.test(document.body.getAttribute('data-page') || '')) return;
		realtimeRoots.add(root);
		const graphs = new Set();
		let pending = false;
		const schedule = () => {
			if (pending) return;
			pending = true;
			requestAnimationFrame(sync);
		};
		const resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;
		function sync() {
			pending = false;
			for (const svg of graphs) {
				if (!root.contains(svg)) {
					if (resize) resize.unobserve(svg);
					graphs.delete(svg);
				}
			}
			root.querySelectorAll('#view svg').forEach((svg) => {
				// Leave modern responsive SVGs and unrelated plugin charts alone.
				if (svg.hasAttribute('viewBox') || svg.getAttribute('width') !== '100%' ||
					!svg.querySelector('#label_25') || !svg.querySelector('#label_50') || !svg.querySelector('#label_75')) return;
				if (!graphs.has(svg)) {
					graphs.add(svg);
					if (resize) resize.observe(svg);
				}
				const lines = Array.from(svg.children).filter((el) => el.localName === 'polyline');
				const drawn = lines.find((el) => el.points.numberOfItems > 1);
				if (!drawn || !svg.clientWidth) return;
				// LuCI closes each filled curve at (cached width, baseline).
				const width = drawn.points.getItem(drawn.points.numberOfItems - 1).x;
				if (!(width > 0)) return;
				const scale = svg.clientWidth / width;
				for (const el of svg.children) {
					const vertical = el.localName === 'line' &&
						el.getAttribute('x1') === el.getAttribute('x2');
					if (el.localName === 'polyline' || vertical) {
						el.setAttribute('transform', 'scale(' + scale + ' 1)');
						el.setAttribute('vector-effect', 'non-scaling-stroke');
					}
					else if (el.localName === 'text' && !el.id && el.x.baseVal.numberOfItems) {
						const x = el.x.baseVal.getItem(0).value;
						el.setAttribute('transform', 'translate(' + (x * (scale - 1)) + ' 0)');
					}
				}
			});
		}
		const watch = new MutationObserver(schedule);
		watch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['points'] });
		window.addEventListener('resize', schedule, { passive: true });
		if (!resize) {
			// Older browsers: cover sidebar transitions and reduced-motion changes.
			watch.observe(rootEl, { attributes: true, attributeFilter: ['class'] });
			window.addEventListener('transitionend', schedule);
		}
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
		C.initRealtimeCharts(document.getElementById('maincontent'));
		C.initLeaseAvatars(document.getElementById('maincontent'));
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
		C._closeNavDrawer = () => setDrawer(false, false);

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
	let simpleMenuDrawer = null;

	function buildKnownMap(model) {
		const known = Object.create(null);
		(model.categories || []).forEach((c) => {
			const cIcon = CATEGORY_ICON[c.name] || pageIcon(c.name);
			known[c.path] = Object.assign({ icon: cIcon, catTitle: '' }, c);
			(c.children || []).forEach((ch) => {
				known[ch.path] = Object.assign({ icon: pageIcon(ch.name, c.name), catTitle: c.title }, ch);
			});
		});
		return known;
	}

	function savedSimpleMenu(model, known) {
		const hasUci = typeof model.saveSimpleMenu === 'function';
		const rawAttr = hasUci ? C._simpleMenuAttr : store.get('carbon.simpleMenu', '');
		return C.simpleMenu.parseAttr(rawAttr) || C.simpleMenu.defaultConfig(known, model.root);
	}

	C.setSimpleMenuAttr = function (attr) {
		C._simpleMenuAttr = String(attr || '');
		if (C._navModel && C._navModel.simpleMenuAttr !== undefined)
			C._navModel.simpleMenuAttr = C._simpleMenuAttr;
		const app = document.querySelector('.cb-app');
		if (app && app.dataset) {
			if (C._simpleMenuAttr) app.dataset.simpleMenu = C._simpleMenuAttr;
			else delete app.dataset.simpleMenu;
		}
		if (C._navModel) C.renderNav(C._navModel);
	};

	C.renderNav = function (model) {
		const isNewModel = model !== C._navModel;
		C._navModel = model;
		if (isNewModel && model.simpleMenuAttr !== undefined)
			C._simpleMenuAttr = model.simpleMenuAttr;
		const nav = document.getElementById('topmenu');
		if (!nav) return;
		nav.innerHTML = '';
		hideFlyout(true);

		const active = model.activePath.join('/');
		const isActive = (p) => active === p || active.indexOf(p + '/') === 0;
		const known = buildKnownMap(model);

		const link = (title, iconName, href, on) => {
			const a = h('a', { class: 'cb-nav-link' + (on ? ' active' : ''), href: href, 'aria-current': on ? 'page' : null }, [
				h('span', { class: 'cb-nav-ico', html: icon(iconName) }),
				h('span', { class: 'cb-nav-label', text: title })
			]);
			bindFlyout(a, title, null);
			return a;
		};

		if (C.mode.get() === 'simple' || (simpleMenuDrawer && !simpleMenuDrawer.closed)) {
			const cfg = (simpleMenuDrawer && !simpleMenuDrawer.closed) ? simpleMenuDrawer.draft : savedSimpleMenu(model, known);
			const groups = [
				{ key: 'common', label: C.SIMPLE_MENU[0].group },
				{ key: 'system', label: C.SIMPLE_MENU[1].group }
			];
			const seenFull = Object.create(null);
			let renderedCount = 0;
			groups.forEach((g) => {
				const items = [];
				(cfg[g.key] || []).forEach((rel) => {
					const resolved = C.simpleMenu.resolvePath(rel, known, model.root);
					if (!resolved || seenFull[resolved.path]) return;
					seenFull[resolved.path] = true;
					items.push({
						title: resolved.builtin ? t(resolved.builtin.title) : resolved.node.title,
						icon: resolved.builtin ? resolved.builtin.icon : resolved.node.icon,
						path: resolved.path
					});
				});
				if (!items.length) return;
				renderedCount += items.length;
				nav.appendChild(h('div', { class: 'cb-nav-sect', text: t(g.label) }));
				items.forEach((x) => nav.appendChild(link(x.title, x.icon, model.url(x.path), isActive(x.path))));
			});

			if (!renderedCount)
				nav.appendChild(h('div', { class: 'cb-nav-empty', text: t('No configured pages are currently installed.') }));

			const editBtn = h('button', { type: 'button', class: 'cb-nav-customize' }, [
				h('span', { class: 'cb-nav-customize-ico', html: icon('sliders') }),
				h('span', { class: 'cb-nav-label', text: t('Customize menu') })
			]);
			editBtn.addEventListener('click', () => C.openSimpleMenuCustomizer(editBtn));
			nav.appendChild(editBtn);

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

	/* ------------------------------------------------------------------
	 * Simple menu customizer drawer (reuses .cb-sheet glass drawer)
	 * ------------------------------------------------------------------ */
	const CAT_COLOR = {
		status: 'indigo', network: 'blue', system: 'purple', services: 'teal',
		vpn: 'green', docker: 'blue', nas: 'orange', statistics: 'pink', control: 'orange'
	};
	const menuColor = (rel) => COLORS[CAT_COLOR[String(rel || '').split('/')[0]] || 'blue'];

	C.openSimpleMenuCustomizer = function (opener) {
		const model = C._navModel;
		if (!model || simpleMenuDrawer || document.querySelector('.cb-sheet')) return;

		const openerInNav = !!(opener && opener.closest && opener.closest('#topmenu'));

		/* close mobile sidebar drawer before opening the bottom sheet */
		if (document.body.classList.contains('cb-nav-open') && typeof C._closeNavDrawer === 'function')
			C._closeNavDrawer();

		const M = C.simpleMenu;
		const appEl = document.querySelector('.cb-app');
		const known = buildKnownMap(model);
		const defCfg = M.defaultConfig(known, model.root);
		const initialCfg = savedSimpleMenu(model, known);
		const initialKey = M.encodeAttr(initialCfg);
		const draft = M.clone(initialCfg);
		const hasUciSave = typeof model.saveSimpleMenu === 'function';

		let viewMode = 'edit'; /* 'edit' | 'pick' */
		let pickGroup = 'common';
		let query = '';
		let saving = false;

		/* Build searchable catalog of all installed pages (excluding logout) */
		const catalog = [];
		(model.categories || []).forEach((cat) => {
			if (cat.name === 'logout') return;
			const entries = cat.children && cat.children.length
				? cat.children.map((ch) => ({ rel: cat.name + '/' + ch.name, title: ch.title, icon: pageIcon(ch.name, cat.name) }))
				: [{ rel: cat.name, title: cat.title, icon: CATEGORY_ICON[cat.name] || pageIcon(cat.name) }];
			const items = entries.filter((e) => M.isValidPath(e.rel)).map((e) => {
				const builtin = M.builtinFor(e.rel);
				const displayTitle = builtin ? t(builtin.title) : e.title;
				const subTitle = (builtin && e.title && e.title !== displayTitle) ? e.title : '';
				return {
					rel: e.rel,
					title: displayTitle,
					rawTitle: e.title,
					subTitle: subTitle,
					icon: builtin ? builtin.icon : e.icon,
					color: menuColor(e.rel),
					searchText: [displayTitle, e.title, cat.title, e.rel].join(' ').toLowerCase()
				};
			});
			if (items.length) catalog.push({ name: cat.name, title: cat.title, items: items });
		});

		const samePath = (a, b) => {
			if (a === b) return true;
			const ba = M.builtinFor(a), bb = M.builtinFor(b);
			return !!(ba && bb && ba.paths === bb.paths);
		};
		const findInList = (list, rel) => list.findIndex((x) => samePath(x, rel));
		const isDirty = () => M.encodeAttr(draft) !== initialKey;

		const titleId = uid();
		const scrim = h('div', { class: 'cb-sheet-scrim cb-sheet-scrim-menu' });
		const backBtn = h('button', {
			type: 'button', class: 'cb-sheet-back',
			'aria-label': t('Back'), title: t('Back'), html: icon('chevleft'), hidden: true
		});
		const titleEl = h('h3', { id: titleId, text: t('Customize simple menu') });
		const closeBtn = h('button', { type: 'button', class: 'cb-sheet-close', 'aria-label': t('Close'), title: t('Close'), html: icon('close') });

		const searchInput = h('input', {
			type: 'search', class: 'cb-sheet-search-input',
			placeholder: t('Search pages or plugins…'),
			'aria-label': t('Search pages or plugins…'),
			autocomplete: 'off', spellcheck: 'false'
		});
		const searchClear = h('button', {
			type: 'button', class: 'cb-sheet-search-clear',
			'aria-label': t('Clear'), title: t('Clear'), html: icon('close'), hidden: true
		});
		const searchBar = h('div', { class: 'cb-sheet-search', hidden: true }, [
			h('div', { class: 'cb-sheet-search-box' }, [
				h('span', { class: 'cb-sheet-search-ico', html: icon('search') }),
				searchInput,
				searchClear
			])
		]);

		const body = h('div', { class: 'cb-sheet-body' });
		const statusEl = h('div', { class: 'cb-sheet-status', role: 'status', 'aria-live': 'polite' });
		const resetBtn = h('button', { type: 'button', class: 'cbi-button cbi-button-reset', text: t('Restore default') });
		const cancelBtn = h('button', { type: 'button', class: 'cbi-button', text: t('Cancel') });
		const saveBtn = h('button', { type: 'button', class: 'cbi-button cbi-button-save', text: t('Save') });

		const sheet = h('aside', { class: 'cb-sheet cb-sheet-menu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
			h('div', { class: 'cb-sheet-head' }, [
				h('div', { class: 'cb-sheet-head-main' }, [backBtn, titleEl]),
				closeBtn
			]),
			searchBar,
			body,
			h('div', { class: 'cb-sheet-foot' }, [
				statusEl,
				h('div', { class: 'cb-sheet-actions' }, [resetBtn, h('div', { class: 'cb-sheet-actions-end' }, [cancelBtn, saveBtn])])
			])
		]);

		const makeMoveBtn = (dir, disabled, label, onClick) => {
			const b = h('button', {
				type: 'button',
				class: 'cbi-button ' + (dir < 0 ? 'cbi-button-up' : 'cbi-button-down') + ' cb-sheet-ico-btn',
				title: label, 'aria-label': label, html: icon(dir < 0 ? 'chevup' : 'chevdown')
			});
			b.disabled = !!disabled;
			b.addEventListener('click', onClick);
			return b;
		};
		const swap = (arr, i, j) => { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; };

		function describeSaved(rel) {
			const resolved = M.resolvePath(rel, known, model.root);
			if (resolved) {
				return {
					installed: true,
					title: resolved.builtin ? t(resolved.builtin.title) : resolved.node.title,
					sub: resolved.builtin ? '' : (resolved.node.catTitle || ''),
					icon: resolved.builtin ? resolved.builtin.icon : resolved.node.icon,
					color: menuColor(resolved.rel)
				};
			}
			const builtin = M.builtinFor(rel);
			const parts = rel.split('/');
			const fallbackIcon = builtin ? builtin.icon : (parts.length > 1 ? pageIcon(parts[1], parts[0]) : (CATEGORY_ICON[parts[0]] || pageIcon(parts[0])));
			return {
				installed: false,
				title: builtin ? t(builtin.title) : rel,
				sub: '',
				icon: fallbackIcon,
				color: COLORS.gray
			};
		}

		function syncControls() {
			const isPick = viewMode === 'pick';
			backBtn.hidden = !isPick;
			searchBar.hidden = !isPick;
			titleEl.textContent = isPick
				? (pickGroup === 'common' ? t('Add to Common') : t('Add to System'))
				: t('Customize simple menu');
			searchClear.hidden = !query;
			resetBtn.disabled = saving || M.isDefault(draft, known, model.root);
			saveBtn.disabled = saving;
			cancelBtn.disabled = saving;
			closeBtn.disabled = saving;
			backBtn.disabled = saving;
			searchInput.disabled = saving;
			searchClear.disabled = saving;
			if (saving) body.setAttribute('inert', '');
			else body.removeAttribute('inert');
		}

		const canAppendToGroup = (list, rel) => {
			const curBytes = list.length ? list.join(' ').length : 0;
			return M.count(draft) < M.MAX_ITEMS && ((curBytes ? curBytes + 1 : 0) + rel.length) <= M.MAX_BYTES;
		};

		function captureEditFocus() {
			const ae = document.activeElement;
			if (!ae || !body.contains(ae)) return null;
			const row = ae.closest('[data-row-key]');
			const grp = ae.closest('[data-group]');
			const btnKind = ['cbi-button-up', 'cbi-button-down', 'cbi-button-remove', 'cb-sheet-add'].find((c) => ae.classList.contains(c)) || '';
			return { rowKey: row ? row.dataset.rowKey : '', group: grp ? grp.dataset.group : '', btnKind: btnKind };
		}

		function restoreEditFocus(info) {
			if (!info) return;
			let target = null;
			if (info.rowKey) {
				const row = Array.from(body.querySelectorAll('[data-row-key]')).find((el) => el.dataset.rowKey === info.rowKey);
				if (row) {
					const order = info.btnKind === 'cbi-button-up' ? ['.cbi-button-up', '.cbi-button-down', '.cbi-button-remove'] :
						(info.btnKind === 'cbi-button-down' ? ['.cbi-button-down', '.cbi-button-up', '.cbi-button-remove'] :
							['.' + info.btnKind, '.cbi-button-remove', '.cbi-button-up', '.cbi-button-down']);
					for (const sel of order) {
						const cand = sel !== '.' ? row.querySelector(sel) : null;
						if (cand && !cand.disabled) { target = cand; break; }
					}
				}
			}
			if (!target && info.group) {
				const grp = body.querySelector('.cb-sheet-group[data-group="' + info.group + '"]');
				if (grp) {
					const add = grp.querySelector('.cb-sheet-add:not(:disabled)');
					const anyBtn = grp.querySelector('button:not(:disabled)');
					target = add || anyBtn;
				}
			}
			(target || closeBtn).focus({ preventScroll: true });
		}

		function paintEdit(animate) {
			const scrollTop = body.scrollTop;
			const focusInfo = captureEditFocus();
			const doAnim = !!(animate && canWaapi() && !reducedMotion());
			const prevRows = new Map();
			if (doAnim) {
				const br = body.getBoundingClientRect();
				body.querySelectorAll('[data-row-key]').forEach((el) => {
					prevRows.set(el.dataset.rowKey, el.getBoundingClientRect().top - br.top + scrollTop);
				});
			}

			body.innerHTML = '';
			const total = M.count(draft);
			const onlyOne = total <= 1;
			const atMax = total >= M.MAX_ITEMS;

			[
				{ key: 'common', label: C.SIMPLE_MENU[0].group },
				{ key: 'system', label: C.SIMPLE_MENU[1].group }
			].forEach((g) => {
				const list = draft[g.key];
				const rows = [];
				if (!list.length) {
					rows.push(h('div', { class: 'cb-sheet-empty', text: t('No items in this group.') }));
				}
				else {
					list.forEach((rel, idx) => {
						const info = describeSaved(rel);
						const rm = h('button', {
							type: 'button', class: 'cbi-button cbi-button-remove cb-sheet-ico-btn',
							title: t('Remove'), 'aria-label': t('Remove'), html: icon('close')
						});
						rm.disabled = onlyOne;
						rm.addEventListener('click', () => {
							if (M.count(draft) <= 1) { statusEl.textContent = t('Keep at least one menu item.'); return; }
							list.splice(idx, 1);
							statusEl.textContent = M.count(draft) <= 1 ? t('Keep at least one menu item.') : '';
							applyDraft(true);
						});
						const textKids = [h('span', { class: 'cb-sheet-name', text: info.title })];
						if (!info.installed)
							textKids.push(h('span', { class: 'cb-sheet-tag', text: t('Not installed') }));
						else if (info.sub)
							textKids.push(h('span', { class: 'cb-sheet-sub', text: info.sub }));

						rows.push(h('div', { class: 'cb-sheet-row' + (info.installed ? '' : ' is-off'), 'data-row-key': g.key + ':' + rel }, [
							h('span', { class: 'cb-ico', style: '--c:' + info.color, html: icon(info.icon) }),
							h('div', { class: 'cb-sheet-text' }, textKids),
							h('div', { class: 'cb-sheet-ctrl' }, [
								makeMoveBtn(-1, idx === 0, t('Move up'), () => { swap(list, idx, idx - 1); statusEl.textContent = ''; applyDraft(true); }),
								makeMoveBtn(1, idx === list.length - 1, t('Move down'), () => { swap(list, idx, idx + 1); statusEl.textContent = ''; applyDraft(true); }),
								rm
							])
						]));
					});
				}

				const addBtn = h('button', {
					type: 'button', class: 'cbi-button cbi-button-add cb-sheet-add',
					html: icon('plus') + '<span>' + esc(t('Add page')) + '</span>'
				});
				addBtn.disabled = atMax;
				addBtn.addEventListener('click', () => {
					if (M.count(draft) >= M.MAX_ITEMS) { statusEl.textContent = t('Maximum %d menu items.', M.MAX_ITEMS); return; }
					pickGroup = g.key;
					viewMode = 'pick';
					query = '';
					searchInput.value = '';
					statusEl.textContent = '';
					paintSheet(false);
					body.scrollTop = 0;
					searchInput.focus({ preventScroll: true });
				});
				rows.push(h('div', { class: 'cb-sheet-add-row', 'data-row-key': g.key + ':add' }, [
					addBtn,
					h('span', { class: 'cb-sheet-count', text: total + ' / ' + M.MAX_ITEMS })
				]));

				body.appendChild(h('div', { class: 'cb-sheet-group', 'data-group': g.key }, [
					h('div', { class: 'cb-sheet-group-head' }, [
						h('span', { class: 'cb-sheet-group-title', text: t(g.label) }),
						h('span', { class: 'cb-sheet-count', text: String(list.length) })
					]),
					h('div', { class: 'cb-sheet-list' }, rows)
				]));
			});

			syncControls();
			body.scrollTop = scrollTop;
			restoreEditFocus(focusInfo);

			if (doAnim && prevRows.size) {
				const br = body.getBoundingClientRect();
				body.querySelectorAll('[data-row-key]').forEach((el) => {
					const prevTop = prevRows.get(el.dataset.rowKey);
					if (prevTop == null) return;
					const dy = prevTop - (el.getBoundingClientRect().top - br.top + body.scrollTop);
					if (Math.abs(dy) > 2 && Math.abs(dy) < 360) {
						el.animate([
							{ transform: 'translate3d(0,' + dy + 'px,0)' },
							{ transform: 'translate3d(0,0,0)' }
						], { duration: 220, easing: EASE_OUT });
					}
				});
			}
		}

		function paintPicker() {
			const scrollTop = body.scrollTop;
			const focusedPath = (document.activeElement && body.contains(document.activeElement) && document.activeElement.dataset)
				? document.activeElement.dataset.path : '';
			body.innerHTML = '';
			const q = query.trim().toLowerCase();
			const otherGroup = pickGroup === 'common' ? 'system' : 'common';
			const targetList = draft[pickGroup];
			const otherList = draft[otherGroup];
			const total = M.count(draft);
			const onlyOne = total <= 1;
			let shown = 0;

			catalog.forEach((cat) => {
				const matches = q ? cat.items.filter((it) => it.searchText.indexOf(q) >= 0) : cat.items;
				if (!matches.length) return;
				shown += matches.length;
				const rows = matches.map((it) => {
					const inTarget = findInList(targetList, it.rel);
					const inOther = inTarget < 0 ? findInList(otherList, it.rel) : -1;
					const cls = 'cb-picker-item' + (inTarget >= 0 ? ' is-added' : (inOther >= 0 ? ' is-other' : ''));
					const badge = inTarget >= 0
						? h('span', { class: 'cb-picker-badge ok' }, [h('span', { class: 'cb-picker-badge-ico', html: icon('check') }), t('Added')])
						: (inOther >= 0
							? h('span', { class: 'cb-picker-badge muted', text: otherGroup === 'common' ? t('In Common') : t('In System') })
							: h('span', { class: 'cb-picker-plus', html: icon('plus') }));
					const textKids = [h('span', { class: 'cb-sheet-name', text: it.title })];
					if (it.subTitle) textKids.push(h('span', { class: 'cb-sheet-sub', text: it.subTitle }));
					const btn = h('button', {
						type: 'button', class: cls, 'data-path': it.rel,
						'aria-pressed': inTarget >= 0 ? 'true' : (inOther >= 0 ? null : 'false')
					}, [
						h('span', { class: 'cb-ico', style: '--c:' + (inOther >= 0 ? COLORS.gray : it.color), html: icon(it.icon) }),
						h('div', { class: 'cb-sheet-text' }, textKids),
						badge
					]);
					if (inOther >= 0) {
						btn.disabled = true;
					}
					else if (inTarget >= 0) {
						btn.disabled = onlyOne;
						btn.addEventListener('click', () => {
							if (M.count(draft) <= 1) { statusEl.textContent = t('Keep at least one menu item.'); return; }
							const idx = findInList(targetList, it.rel);
							if (idx >= 0) targetList.splice(idx, 1);
							statusEl.textContent = M.count(draft) <= 1 ? t('Keep at least one menu item.') : '';
							applyDraft(false);
						});
					}
					else {
						const canAdd = canAppendToGroup(targetList, it.rel);
						btn.disabled = !canAdd;
						btn.addEventListener('click', () => {
							if (!canAppendToGroup(targetList, it.rel)) {
								statusEl.textContent = t('Maximum %d menu items.', M.MAX_ITEMS);
								return;
							}
							targetList.push(it.rel);
							statusEl.textContent = M.count(draft) >= M.MAX_ITEMS ? t('Maximum %d menu items.', M.MAX_ITEMS) : '';
							applyDraft(false);
						});
					}
					return btn;
				});

				body.appendChild(h('div', { class: 'cb-sheet-group' }, [
					h('div', { class: 'cb-sheet-group-head' }, [
						h('span', { class: 'cb-sheet-group-title', text: cat.title }),
						h('span', { class: 'cb-sheet-count', text: String(matches.length) })
					]),
					h('div', { class: 'cb-sheet-list' }, rows)
				]));
			});

			if (!shown)
				body.appendChild(h('div', { class: 'cb-sheet-empty cb-sheet-empty-card', text: t('No matching pages.') }));

			syncControls();
			body.scrollTop = scrollTop;
			if (focusedPath) {
				const nextBtn = Array.from(body.querySelectorAll('.cb-picker-item')).find((el) => el.dataset.path === focusedPath && !el.disabled);
				(nextBtn || searchInput).focus({ preventScroll: true });
			}
		}

		function paintSheet(animate) {
			if (viewMode === 'pick') paintPicker();
			else paintEdit(animate);
		}

		function applyDraft(animate) {
			C.renderNav(model);
			paintSheet(animate);
		}

		function exitPicker() {
			viewMode = 'edit';
			statusEl.textContent = '';
			paintSheet(false);
			const addBtn = body.querySelector('.cb-sheet-group[data-group="' + pickGroup + '"] .cb-sheet-add:not(:disabled)');
			(addBtn || closeBtn).focus({ preventScroll: true });
		}

		function close(commit) {
			if (!simpleMenuDrawer) return;
			simpleMenuDrawer.closed = true;
			document.removeEventListener('keydown', onKey);
			scrim.remove();
			sheet.remove();
			document.body.classList.remove('cb-sheet-open');
			if (appEl) appEl.removeAttribute('inert');
			simpleMenuDrawer = null;
			C.renderNav(model);
			const target = openerInNav ? document.querySelector('#topmenu .cb-nav-customize') : opener;
			const burger = document.getElementById('cb-burger');
			if (target && target.offsetParent !== null && !target.closest('[inert]'))
				target.focus({ preventScroll: true });
			else if (burger && burger.offsetParent !== null)
				burger.focus({ preventScroll: true });
			void commit;
		}

		async function doSave() {
			if (saving) return;
			saving = true;
			statusEl.textContent = t('Saving…');
			syncControls();
			try {
				const clean = M.normalize(draft, defCfg);
				const isDef = M.isDefault(clean, known, model.root);
				if (hasUciSave) {
					if (isDef && typeof model.resetSimpleMenu === 'function') {
						await model.resetSimpleMenu();
						C._simpleMenuAttr = '';
						if (model.simpleMenuAttr !== undefined) model.simpleMenuAttr = '';
					}
					else {
						await model.saveSimpleMenu(clean);
						C._simpleMenuAttr = M.encodeAttr(clean);
						if (model.simpleMenuAttr !== undefined) model.simpleMenuAttr = C._simpleMenuAttr;
					}
				}
				else {
					if (isDef) {
						try { window.localStorage.removeItem('carbon.simpleMenu'); } catch (e) { /* ignore */ }
					}
					else {
						store.set('carbon.simpleMenu', M.encodeAttr(clean));
					}
				}
				try { document.dispatchEvent(new CustomEvent('carbon:simple-menu-change', { detail: { custom: !isDef } })); } catch (e) { /* ignore */ }
				saving = false;
				close(true);
			}
			catch (err) {
				saving = false;
				statusEl.textContent = (err && err.code === 'denied')
					? t('Permission denied. Log out and log in again once after updating Carbon, then retry.')
					: (err && err.code === 'invalid_simple_menu' ? t('Invalid simple menu configuration.') : t('Failed to save menu.'));
				syncControls();
			}
		}

		const onKey = (e) => {
			if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || saving) return;
			e.preventDefault();
			if (viewMode === 'pick') exitPicker();
			else close(false);
		};

		backBtn.addEventListener('click', () => { if (!saving) exitPicker(); });
		searchInput.addEventListener('input', () => {
			query = searchInput.value;
			searchClear.hidden = !query;
			paintPicker();
		});
		searchClear.addEventListener('click', () => {
			if (saving) return;
			query = '';
			searchInput.value = '';
			searchClear.hidden = true;
			paintPicker();
			searchInput.focus({ preventScroll: true });
		});
		resetBtn.addEventListener('click', () => {
			if (saving) return;
			const next = M.defaultConfig(known, model.root);
			draft.common = next.common;
			draft.system = next.system;
			viewMode = 'edit';
			statusEl.textContent = '';
			applyDraft(true);
		});
		cancelBtn.addEventListener('click', () => { if (!saving) close(false); });
		closeBtn.addEventListener('click', () => { if (!saving) close(false); });
		scrim.addEventListener('click', () => { if (!saving && !isDirty()) close(false); });
		saveBtn.addEventListener('click', doSave);

		simpleMenuDrawer = { draft: draft, closed: false };
		C.renderNav(model);
		paintSheet(false);
		document.body.appendChild(scrim);
		document.body.appendChild(sheet);
		document.body.classList.add('cb-sheet-open');
		if (appEl) appEl.setAttribute('inert', '');
		document.addEventListener('keydown', onKey);
		requestAnimationFrame(() => {
			if (!simpleMenuDrawer || simpleMenuDrawer.closed) return;
			scrim.classList.add('show');
			sheet.classList.add('show');
			closeBtn.focus({ preventScroll: true });
		});
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
		this.series = opts.series.map((s, i) => {
			const init = opts.initial && Array.isArray(opts.initial[i]) ? opts.initial[i].slice(-this.n) : null;
			const data = init && init.length === this.n ? init : new Array(this.n).fill(0);
			return { color: s.color, label: s.label, data: data };
		});
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

		this._onResize = () => this.draw();
		if (window.ResizeObserver) {
			this._ro = new ResizeObserver(this._onResize);
			this._ro.observe(el);
		}
		else window.addEventListener('resize', this._onResize);
		this.draw();
	}
	AreaChart.prototype.destroy = function () {
		if (this._ro) { this._ro.disconnect(); this._ro = null; }
		else if (this._onResize) window.removeEventListener('resize', this._onResize);
	};
	AreaChart.prototype.setData = function (seriesData) {
		this.series.forEach((s, i) => {
			const src = seriesData && Array.isArray(seriesData[i]) ? seriesData[i].slice(-this.n) : null;
			s.data = src && src.length === this.n ? src : new Array(this.n).fill(0);
		});
		this.hover = null;
		this.draw();
	};
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
		this.data = Array.isArray(opts.initial) ? opts.initial.slice(-this.n) : [];
		el.classList.add('cb-spark');
		if (this.data.length >= 2) this.draw();
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
	 *   deviceTraffic()    → { interval: seconds, columns, data } from an existing
	 *                        per-MAC collector (optional, read-only)
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

	C.loadStatus = function (load1, cores) {
		if (!Number.isFinite(load1) || load1 < 0 || !Number.isFinite(cores) || cores <= 0) return null;
		const ratio = load1 / cores;
		if (ratio >= 1) return { level: 'bad', label: N_('High') };
		if (ratio >= 0.7) return { level: 'warn', label: N_('Busy') };
		return { level: 'ok', label: N_('Normal') };
	};

	const BAND_LABEL = Object.assign(Object.create(null), { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' });
	function radioBandInfo(cfg) {
		cfg = cfg || {};
		const band = String(cfg.band || '').toLowerCase();
		if (band && BAND_LABEL[band]) return { key: band, label: BAND_LABEL[band] };
		if (cfg.hwmode) {
			const key = /a/.test(cfg.hwmode) ? '5g' : '2g';
			return { key: key, label: BAND_LABEL[key] };
		}
		const ch = parseInt(cfg.channel, 10);
		if (ch >= 1 && ch <= 14) return { key: '2g', label: '2.4 GHz' };
		if (ch >= 32 && ch <= 177) return { key: '5g', label: '5 GHz' };
		return { key: '', label: null };
	}
	function radioBand(cfg) {
		return radioBandInfo(cfg).label;
	}
	function wirelessWidth(htmode) {
		const m = String(htmode || '').trim().match(/(?:^|\D)(80\+80|320|160|80|40|20)[+-]?$/);
		return m ? m[1] + ' MHz' : null;
	}
	function wirelessEncryption(enc) {
		const raw = String(enc || '').trim().toLowerCase();
		if (!raw || raw === 'none') return null;
		if (/^sae-mixed\b/.test(raw)) return 'WPA2/WPA3';
		if (/^sae\b/.test(raw)) return 'WPA3';
		if (/^psk-mixed\b/.test(raw)) return 'WPA/WPA2';
		if (/^psk2\b/.test(raw)) return 'WPA2';
		if (/^psk\b/.test(raw)) return 'WPA';
		if (/^owe\b/.test(raw)) return 'OWE';
		return raw.toUpperCase();
	}

	C.wirelessSummary = function (w, stations) {
		const hasStations = Array.isArray(stations);
		const perIf = hasStations ? new Map() : null;
		const allMacs = hasStations ? new Set() : null;
		if (hasStations) {
			stations.forEach((s) => {
				if (!s || !s.ifname) return;
				const mac = String(s.mac || '').toLowerCase();
				if (!MAC_RE.test(mac) || mac === '00:00:00:00:00:00') return;
				let set = perIf.get(s.ifname);
				if (!set) perIf.set(s.ifname, set = new Set());
				set.add(mac);
			});
		}
		const rows = [];
		if (w && typeof w === 'object') {
			Object.keys(w).sort().forEach((radio) => {
				const r = w[radio] || {}, cfg = r.config || {};
				const b = radioBandInfo(cfg);
				const channel = cfg.channel && cfg.channel !== 'auto' ? String(cfg.channel) : null;
				const width = wirelessWidth(cfg.htmode);
				(r.interfaces || []).forEach((i) => {
					const ic = i.config || {};
					if (ic.mode && ic.mode !== 'ap') return;
					const ssid = ic.ssid ? String(ic.ssid) : '';
					const encryption = wirelessEncryption(ic.encryption);
					const meta = [channel ? 'CH ' + channel : null, width, encryption].filter(Boolean).join(' · ');
					const sub = [b.label, meta].filter(Boolean).join(' · ');
					const on = !!r.up && !r.disabled && !ic.disabled && !cfg.disabled;
					const ifname = i.ifname || '';
					let clients = null;
					if (on && ifname && hasStations) {
						const set = perIf.get(ifname);
						clients = set ? set.size : 0;
						if (set) set.forEach((mac) => allMacs.add(mac));
					}
					rows.push({
						radio: radio, ifname: ifname, ssid: ssid, hidden: !ssid,
						band: b.label, bandKey: b.key, channel: channel, width: width, encryption: encryption,
						meta: meta, sub: sub, on: on, clients: clients
					});
				});
			});
		}
		return { rows: rows, totalClients: hasStations ? allMacs.size : null };
	};

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
	 * Discovered devices: DHCPv4/v6 leases + Wi‑Fi stations + ARP neighbours
	 * + LuCI host hints for names. Keyed by MAC. Neither leases nor ARP cache
	 * entries prove current reachability; "active" means observed in ARP/Wi‑Fi.
	 *
	 * src = { leases, leases6, stations, arp, hints, bands: { ifname: '5 GHz' } }
	 * → [{ macaddr, hostname, ipaddr, ip6addr, expires, lease, active, wifi, gateway }]
	 * ------------------------------------------------------------------ */
	const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

	/* Sampled averages from cumulative per-MAC counters. Missing records, resets,
	 * failed reads and suspended tabs never count as zero. Records cannot create
	 * discovered devices, and query frequency never exceeds the collector cadence. */
	C.DeviceRates = function () { this.previous = null; };
	C.DeviceRates.prototype.reset = function () { this.previous = null; };
	C.DeviceRates.prototype.update = function (sample, now) {
		const invalid = () => { this.reset(); return null; };
		if (!sample || !Number.isFinite(now) || !Number.isFinite(sample.interval) || sample.interval < 5 ||
			!Array.isArray(sample.columns) || !Array.isArray(sample.data)) return invalid();
		const fields = ['mac', 'rx_bytes', 'tx_bytes'].map((k) => sample.columns.indexOf(k));
		if (fields.some((i) => i < 0)) return invalid();
		const identityIndex = sample.columns.indexOf('identity');
		const counters = new Map();
		for (const row of sample.data) {
			if (!Array.isArray(row)) return invalid();
			const mac = String(row[fields[0]] || '').toLowerCase();
			if (!MAC_RE.test(mac) || mac === '00:00:00:00:00:00') continue;
			const rx = row[fields[1]], tx = row[fields[2]];
			if (!Number.isSafeInteger(rx) || rx < 0 || !Number.isSafeInteger(tx) || tx < 0) return invalid();
			const old = counters.get(mac) || { rx: 0, tx: 0 };
			if (!Number.isSafeInteger(old.rx + rx) || !Number.isSafeInteger(old.tx + tx)) return invalid();
			const identity = identityIndex < 0 ? null : row[identityIndex];
			if (identityIndex >= 0 && (typeof identity !== 'string' || counters.has(mac))) return invalid();
			counters.set(mac, { rx: old.rx + rx, tx: old.tx + tx, identity: identity });
		}
		// Different collectors have unrelated totals.
		if (this.previous && this.previous.source !== sample.source) this.reset();
		const rates = new Map(), previous = this.previous;
		const dt = previous ? (now - previous.time) / 1000 : 0;
		const continuous = previous && previous.interval === sample.interval && dt >= sample.interval && dt <= sample.interval * 2.5;
		if (continuous) counters.forEach((value, mac) => {
			const old = previous.counters.get(mac);
			if (old && value.identity === old.identity && value.rx >= old.rx && value.tx >= old.tx)
				rates.set(mac, { down: (value.rx - old.rx) / dt, up: (value.tx - old.tx) / dt });
		});
		// An early read must not move the baseline closer to the next sample.
		if (!previous || dt <= 0 || dt >= sample.interval || previous.interval !== sample.interval)
			this.previous = { counters: counters, interval: sample.interval, time: now, source: sample.source };
		return { rates: rates, interval: sample.interval, seconds: continuous ? dt : null, source: sample.source };
	};

	C.parseArp = function (text, devices, ifs) {
		const gateways = new Set();
		(ifs || []).forEach((i) => {
			if (!i.up) return;
			(i.route || []).forEach((r) => {
				if (r.target !== '0.0.0.0' || r.mask !== 0 || !r.nexthop || r.nexthop === '0.0.0.0') return;
				[i.l3_device, i.device].forEach((d) => { if (d) gateways.add(d + '/' + r.nexthop); });
			});
		});
		return String(text || '').split('\n').slice(1).map((line) => line.trim().split(/\s+/)).filter((f) =>
			f.length >= 6 && (parseInt(f[2], 16) & 2) && MAC_RE.test(f[3].toLowerCase()) && f[3] !== '00:00:00:00:00:00' &&
			(!devices || devices.indexOf(f[5]) >= 0)
		).map((f) => ({ ip: f[0], mac: f[3].toLowerCase(), dev: f[5], gateway: gateways.has(f[5] + '/' + f[0]) }));
	};

	const IP_ADDR = /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}(?:(?:\d{1,3}\.){3}\d{1,3})?)(?:\/\d{1,3})?)$/i;
	const PLACEHOLDER_HOST = /^[-*?]+$/;
	const cleanHostname = (s) => {
		const v = String(s || '').trim();
		return (!v || PLACEHOLDER_HOST.test(v) || IP_ADDR.test(v)) ? '' : v;
	};

	C.mergeDevices = function (src) {
		src = src || {};
		const byMac = new Map(), list = [];
		const get = (mac) => {
			mac = String(mac || '').toLowerCase();
			if (!MAC_RE.test(mac) || mac === '00:00:00:00:00:00') return null;
			let d = byMac.get(mac);
			if (!d) {
				d = { macaddr: mac, hostname: '', ipaddr: '', ip6addr: '', expires: null, lease: false, active: false, wifi: null, gateway: false };
				byMac.set(mac, d);
				list.push(d);
			}
			return d;
		};
		const firstAddr = (v) => String((Array.isArray(v) ? v[0] : v) || '').replace(/\/\d+$/, '');

		(src.leases || []).forEach((l) => {
			const d = get(l.macaddr);
			if (!d) return;
			d.hostname = d.hostname || cleanHostname(l.hostname);
			d.ipaddr = d.ipaddr || l.ipaddr || '';
			d.expires = l.expires;
			d.lease = true;
		});
		(src.leases6 || []).forEach((l) => {
			const name = cleanHostname(l.hostname);
			const d = (l.macaddr && get(l.macaddr)) || (name ? list.find((x) => x.hostname === name) : null);
			if (!d) return;
			d.ip6addr = d.ip6addr || firstAddr(l.ip6addrs || l.ip6addr);
			d.hostname = d.hostname || name;
			if (!d.lease) d.expires = l.expires;
			d.lease = true;
		});
		(src.arp || []).forEach((n) => {
			const d = get(n.mac);
			if (!d) return;
			d.ipaddr = d.ipaddr || n.ip;
			d.active = true;
			d.gateway = d.gateway || !!n.gateway;
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
			d.hostname = d.hostname || cleanHostname(hint.name);
			d.ipaddr = d.ipaddr || firstAddr(hint.ipaddrs || hint.ipv4);
			d.ip6addr = d.ip6addr || firstAddr(hint.ip6addrs || hint.ipv6);
		});
		return list.sort((a, b) => (!a.ipaddr - !b.ipaddr) || (ipNum(a.ipaddr) - ipNum(b.ipaddr)) || a.macaddr.localeCompare(b.macaddr));
	};

	/* Group aliases before excluding separate uplinks, regardless of address protocol.
	 * The conventional LAN may also carry a side router's default route. Without
	 * that role anchor, custom default-route links are ambiguous: retain them unless
	 * explicitly WAN/PPP. Discovery does not imply that a neighbour is our client. */
	C.lanDevices = function (ifs) {
		if (!Array.isArray(ifs)) return null;
		const groups = new Map();
		ifs.forEach((i) => {
			const dev = i.l3_device || i.device;
			if (!i.up || i.interface === 'loopback' || !dev || dev === 'lo') return;
			let g = groups.get(dev);
			if (!g) { g = { devices: new Set(), lan: false, wan: false, uplink: false }; groups.set(dev, g); }
			[i.l3_device, i.device].forEach((d) => { if (d) g.devices.add(d); });
			g.lan = g.lan || i.interface === 'lan';
			g.wan = g.wan || /^wan\d*(?:_\d+)?$/i.test(i.interface || '') || /^ppp/.test(i.proto || '') || /^ppp/.test(dev);
			g.uplink = g.uplink || hasDefaultRoute(i);
		});
		const all = Array.from(groups.values());
		const hasLan = ifs.some((i) => i.interface === 'lan');
		const local = all.filter((g) => g.lan || (!g.wan && (!g.uplink || !hasLan)));
		return Array.from(new Set(local.flatMap((g) => Array.from(g.devices))));
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

		const host = cleanHostname(l.hostname);
		const key = (l.macaddr || host || '').toLowerCase();
		const color = COLORS[AVATAR_COLORS[hash(key) % AVATAR_COLORS.length]];
		const ch = host ? Array.from(host)[0] : null;
		return h('span', { class: 'cb-avatar', style: '--c:' + color, html: ch ? esc(ch) : icon('laptop') });
	}

	/* ------------------------------------------------------------------
	 * Brand avatars in LuCI's own lease tables (DHCP page, overview details)
	 *
	 * ui.Table rebuilds every row on each poll and sorts from its data, not
	 * the DOM, so the avatar is simply added again to each new row. The IP
	 * column is detected at the table level so rows whose hostname itself
	 * falls back to an IP address (e.g. DHCPv6 host hints or clients without
	 * a hostname) still decorate the hostname column rather than a preceding
	 * status or interface column. MAC addresses come from any cell holding
	 * one, or from a DUID-LL/LLT on DHCPv6 rows.
	 * ------------------------------------------------------------------ */
	const LEASE_TABLES = ['#lease_status_table', '#lease6_status_table', '#status_leases', '#status_leases6'];
	const LEASE_TABLE_SEL = LEASE_TABLES.join(', ');
	const LEASE_ROW_SEL = '.tr:not(.table-titles):not(.cbi-section-table-titles):not(.placeholder)';
	const MAC_TEXT = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i;
	const duidMac = (s) => {
		s = String(s || '').replace(/[^0-9a-f]/gi, '');
		if (s.length === 28 && /^00010001/i.test(s)) return s.slice(16);
		if (s.length === 20 && /^00030001/i.test(s)) return s.slice(8);
		return '';
	};
	function cellFirstLine(cell) {
		const root = cell.querySelector('.cb-host-name') || cell;
		let out = '';
		for (const node of root.childNodes) {
			if (node.nodeType === 1 && node.tagName === 'BR') {
				if (out.trim()) break;
				continue;
			}
			const parts = (node.textContent || '').split('\n');
			for (let i = 0; i < parts.length; i++) {
				if (i > 0 && out.trim()) return out.trim();
				out += parts[i];
			}
		}
		return out.trim();
	}
	function leaseAvatar(cells, hostCol) {
		const cell = cells[hostCol];
		if (!cell || cell.querySelector('.cb-host')) return;
		let mac = '';
		for (const c of cells) {
			const text = c.textContent.trim();
			const m = text.match(MAC_TEXT);
			mac = m ? m[0] : duidMac(text);
			if (mac) break;
		}
		const host = cleanHostname(cell.textContent);
		const id = C.identify(host.replace(/\s*\(.*\)$/, ''), mac);
		const avatar = deviceAvatar({ hostname: host, macaddr: mac }, id);
		avatar.setAttribute('aria-hidden', 'true');
		const name = h('span', { class: 'cb-host-name' }, Array.from(cell.childNodes));
		cell.appendChild(h('span', { class: 'cb-host' }, [avatar, name]));
	}
	function decorateLeaseTable(table) {
		const rows = Array.from(table.querySelectorAll(LEASE_ROW_SEL))
			.map((tr) => Array.from(tr.children).filter((c) => c.classList.contains('td')))
			.filter((cells) => cells.length > 1);
		if (!rows.length || rows.every((cells) => cells.some((c) => c.querySelector('.cb-host')))) return;
		const counts = [];
		for (const cells of rows) {
			for (let i = 1; i < cells.length; i++) {
				if (IP_ADDR.test(cellFirstLine(cells[i])))
					counts[i] = (counts[i] || 0) + 1;
			}
		}
		let ipCol = -1, best = 0;
		for (let i = 1; i < counts.length; i++) {
			const n = counts[i] || 0;
			/* break ties toward the later column: if every row's hostname is an IP,
			   the real IP address column sits immediately after the hostname column */
			if (n > 0 && n >= best) { best = n; ipCol = i; }
		}
		if (ipCol < 1) return;
		const hostCol = ipCol - 1;
		for (const cells of rows)
			leaseAvatar(cells, hostCol);
	}
	C.initLeaseAvatars = function (root) {
		if (!root || !window.MutationObserver) return;
		let ready = false;
		const run = () => { if (ready) root.querySelectorAll(LEASE_TABLE_SEL).forEach(decorateLeaseTable); };
		new MutationObserver(run).observe(root, { childList: true, subtree: true });
		/* brand data loads only once a lease table shows up */
		const start = () => {
			if (!root.querySelector(LEASE_TABLE_SEL)) return;
			C.loadBrands().then(() => { ready = true; run(); });
			watch.disconnect();
		};
		const watch = new MutationObserver(start);
		watch.observe(root, { childList: true, subtree: true });
		start();
	};

	/* ------------------------------------------------------------------
	 * Dashboard layout model: 4 visual tiers with automatic 12-col row
	 * packing so customised views stay balanced on desktop and phones.
	 * ------------------------------------------------------------------ */
	const DASH_SECTIONS = ['monitor', 'tiles', 'details'];
	const DASH_TILES = ['devices', 'connections', 'load', 'uptime', 'wifi', 'temp'];
	const DASH_DETAILS = ['clients', 'wireless', 'interfaces'];
	const DASH_MAX_TRAFFIC = 4;
	const DASH_DEV_RE = /^[A-Za-z0-9._:@-]{1,32}$/;

	const cleanDev = (v) => {
		const s = String(v == null ? '' : v).trim();
		return DASH_DEV_RE.test(s) ? s : 'auto';
	};
	const cloneLayout = (l) => ({
		hero: !!l.hero,
		sections: l.sections.slice(),
		monitor: l.monitor.map((m) => m.type === 'traffic' ? { type: 'traffic', source: m.source } : { type: 'resources' }),
		tiles: l.tiles.slice(),
		details: l.details.slice()
	});

	const DASH_PRESETS = [
		{
			id: 'default', label: N_('Default'),
			layout: {
				hero: true,
				sections: ['monitor', 'tiles', 'details'],
				monitor: [{ type: 'traffic', source: 'auto' }, { type: 'resources' }],
				tiles: ['devices', 'connections', 'load', 'uptime'],
				details: ['clients', 'wireless', 'interfaces']
			}
		},
		{
			id: 'wifi', label: N_('Home Wi-Fi'),
			layout: {
				hero: true,
				sections: ['monitor', 'tiles', 'details'],
				monitor: [{ type: 'traffic', source: 'auto' }, { type: 'resources' }],
				tiles: ['wifi', 'load', 'temp', 'uptime'],
				details: ['clients', 'wireless', 'interfaces']
			}
		},
		{
			id: 'multi', label: N_('Multi-WAN'),
			layout: {
				hero: true,
				sections: ['monitor', 'tiles', 'details'],
				monitor: [{ type: 'traffic', source: 'auto' }, { type: 'traffic', source: 'br-lan' }, { type: 'resources' }],
				tiles: ['connections', 'load', 'temp', 'uptime'],
				details: ['interfaces', 'clients']
			}
		}
	];

	function defaultLayout(legacyTraffic) {
		const l = cloneLayout(DASH_PRESETS[0].layout);
		if (legacyTraffic && DASH_DEV_RE.test(String(legacyTraffic)))
			l.monitor[0].source = String(legacyTraffic);
		return l;
	}

	function normalizeLayout(raw) {
		if (!raw || typeof raw !== 'object') return defaultLayout();
		const hero = raw.hero === false || raw.hero === 0 || raw.hero === '0' ? false : true;

		const sections = [];
		splitTokens(raw.sections).forEach((s) => {
			if (DASH_SECTIONS.indexOf(s) >= 0 && sections.indexOf(s) < 0) sections.push(s);
		});
		DASH_SECTIONS.forEach((s) => { if (sections.indexOf(s) < 0) sections.push(s); });

		const monitor = [];
		let trafficCount = 0, hasRes = false;
		const hasMonitorField = Object.prototype.hasOwnProperty.call(raw, 'monitor');
		const rawMonitor = hasMonitorField ? (Array.isArray(raw.monitor) ? raw.monitor : splitTokens(raw.monitor)) : DASH_PRESETS[0].layout.monitor;
		rawMonitor.forEach((item) => {
			if (item && typeof item === 'object') {
				if (item.type === 'traffic' && trafficCount < DASH_MAX_TRAFFIC) {
					monitor.push({ type: 'traffic', source: cleanDev(item.source) });
					trafficCount++;
				}
				else if (item.type === 'resources' && !hasRes) {
					monitor.push({ type: 'resources' });
					hasRes = true;
				}
				return;
			}
			const tok = String(item || '').trim();
			if (tok === 'resources' && !hasRes) {
				monitor.push({ type: 'resources' });
				hasRes = true;
			}
			else if ((tok === 'traffic' || tok.indexOf('traffic:') === 0) && trafficCount < DASH_MAX_TRAFFIC) {
				monitor.push({ type: 'traffic', source: tok === 'traffic' ? 'auto' : cleanDev(tok.slice(8)) });
				trafficCount++;
			}
		});

		const tiles = [];
		const hasTilesField = Object.prototype.hasOwnProperty.call(raw, 'tiles');
		(hasTilesField ? splitTokens(raw.tiles) : DASH_PRESETS[0].layout.tiles).forEach((k) => {
			if (DASH_TILES.indexOf(k) >= 0 && tiles.indexOf(k) < 0) tiles.push(k);
		});

		const details = [];
		const hasDetailsField = Object.prototype.hasOwnProperty.call(raw, 'details');
		(hasDetailsField ? splitTokens(raw.details) : DASH_PRESETS[0].layout.details).forEach((k) => {
			if (DASH_DETAILS.indexOf(k) >= 0 && details.indexOf(k) < 0) details.push(k);
		});

		if (!hero && !monitor.length && !tiles.length && !details.length) return defaultLayout();
		return { hero: hero, sections: sections, monitor: monitor, tiles: tiles, details: details };
	}

	function serializeLayout(layout) {
		const l = normalizeLayout(layout);
		return {
			hero: l.hero ? '1' : '0',
			sections: l.sections.join(' '),
			monitor: l.monitor.length ? l.monitor.map((m) => m.type === 'traffic' ? 'traffic:' + cleanDev(m.source) : 'resources').join(' ') : 'none',
			tiles: l.tiles.length ? l.tiles.join(' ') : 'none',
			details: l.details.length ? l.details.join(' ') : 'none'
		};
	}

	function encodeLayoutAttr(layout) {
		const s = serializeLayout(layout);
		return ['hero', 'sections', 'monitor', 'tiles', 'details'].map((k) => k + '=' + s[k]).join(';');
	}

	function parseLayoutAttr(str) {
		const s = String(str || '').trim();
		if (!s) return null;
		const obj = {};
		let any = false;
		s.split(';').forEach((part) => {
			const i = part.indexOf('=');
			if (i <= 0) return;
			const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
			if (['hero', 'sections', 'monitor', 'tiles', 'details'].indexOf(k) >= 0) { obj[k] = v; any = true; }
		});
		return any ? normalizeLayout(obj) : null;
	}

	function layoutKey(l, structural) {
		const n = normalizeLayout(l);
		return JSON.stringify({
			hero: n.hero,
			sections: n.sections,
			monitor: n.monitor.map((m) => structural ? m.type : (m.type === 'traffic' ? 'traffic:' + m.source : 'resources')),
			tiles: n.tiles,
			details: n.details
		});
	}

	function monitorSpans(items) {
		const spans = [];
		for (let i = 0; i < (items || []).length; ) {
			if (i + 1 < items.length) {
				const a = items[i].type, b = items[i + 1].type;
				if (a === 'traffic' && b === 'resources') spans.push(8, 4);
				else if (a === 'resources' && b === 'traffic') spans.push(4, 8);
				else spans.push(6, 6);
				i += 2;
			}
			else {
				spans.push(12);
				i += 1;
			}
		}
		return spans;
	}

	function tileSpans(count) {
		const map = { 0: [], 1: [12], 2: [6, 6], 3: [4, 4, 4], 4: [3, 3, 3, 3], 5: [4, 4, 4, 6, 6], 6: [4, 4, 4, 4, 4, 4] };
		return (map[count] || []).slice();
	}

	function detailSpans(visibleTypes) {
		const list = visibleTypes || [], spans = [];
		for (let i = 0; i < list.length; ) {
			if (list[i] === 'clients') { spans.push(12); i += 1; }
			else if (i + 1 < list.length && list[i + 1] !== 'clients') { spans.push(6, 6); i += 2; }
			else { spans.push(12); i += 1; }
		}
		return spans;
	}

	C.dashboardLayout = {
		SECTIONS: DASH_SECTIONS,
		TILES: DASH_TILES,
		DETAILS: DASH_DETAILS,
		MAX_TRAFFIC: DASH_MAX_TRAFFIC,
		defaultLayout: defaultLayout,
		clone: cloneLayout,
		normalize: normalizeLayout,
		serialize: serializeLayout,
		encodeAttr: encodeLayoutAttr,
		parseAttr: parseLayoutAttr,
		countEnabled: (l) => (l.hero ? 1 : 0) + l.monitor.length + l.tiles.length + l.details.length,
		isDefault: (l) => layoutKey(l, false) === layoutKey(DASH_PRESETS[0].layout, false),
		presets: () => DASH_PRESETS.map((p) => ({ id: p.id, label: p.label, layout: cloneLayout(p.layout) })),
		matchPreset: (l) => {
			const k = layoutKey(l, true);
			const hit = DASH_PRESETS.find((p) => layoutKey(p.layout, true) === k);
			return hit ? hit.id : 'custom';
		},
		monitorSpans: monitorSpans,
		tileSpans: tileSpans,
		detailSpans: detailSpans
	};

	C.Dashboard = {
		mount(host, P, opts) {
			opts = opts || {};
			const urls = opts.urls || {};
			const L = C.dashboardLayout;
			const hasUciSave = typeof opts.saveLayout === 'function';
			const dash = h('section', { class: 'cb-dash', 'aria-label': t('Overview') });
			host.appendChild(dash);

			/* initial layout: UCI attribute (router) → localStorage (preview) → default (+ legacy traffic) */
			const fromAttr = opts.dashboardAttr ? L.parseAttr(opts.dashboardAttr) : null;
			let hasRouterLayout = !!fromAttr;
			const fromLocal = !hasUciSave ? L.parseAttr(store.get('carbon.dashboard', '')) : null;
			let savedLayout = fromAttr || fromLocal || L.defaultLayout(store.get('carbon.traffic', 'auto'));
			let activeLayout = L.clone(savedLayout);

			const card = (cls, title, aside, body) => {
				const head = title ? h('div', { class: 'cb-card-head' }, [h('h3', null, title), aside]) : null;
				return h('div', { class: 'cb-card ' + cls }, [head].concat(body));
			};
			const metaItem = (label, valEl) => h('div', { class: 'cb-meta' }, [h('span', { class: 'cb-meta-label', text: label }), valEl]);
			const manage = (href) => href ? h('a', { class: 'cb-card-link', href: href, text: t('Manage') }) : null;
			const deviceTitle = () => h('span', { text: t('Discovered devices'), title: t('May include offline devices.') });
			const heroIcon = () => {
				const custom = document.querySelector('.cb-brand-logo[data-custom]');
				return custom ? h('div', { class: 'cb-hero-icon custom' }, h('img', { src: custom.getAttribute('src'), alt: '' }))
					: h('div', { class: 'cb-hero-icon', html: logo() });
			};
			const setRate = (r, v) => { const b = fmt.bytes(v, true); r.val.innerHTML = esc(b[0]) + '<small>' + esc(b[1]) + '</small>'; };
			const setSpan = (el, n) => {
				el.className = el.className.replace(/\bspan-\d+\b/g, '').trim() + ' span-' + n;
			};

			/* ---------------- cached telemetry (survives live layout re-renders) ---------------- */
			const st = {
				board: null, ifs: null, netdevs: null, netdevsAt: 0,
				info: null, conntrack: null, temps: null,
				wireless: undefined, noRadio: !urls.wireless,
				aps: null, stations: undefined, hints: null, hintsAt: 0, devices: null, wifiCount: null,
				prevCpu: null, cpuPct: null, cpuCores: 0, loadHistory: [],
				showAll: false,
				rateData: null, rateSeen: false, rateSource: '', rateNext: 0, rateGeneration: 0,
				devTrack: new Map(),
				fetched: { ifs: false, devices: false, wireless: false, stations: false, info: false, conntrack: false, temps: false, cpu: false }
			};
			const deviceRates = new C.DeviceRates();
			const safe = (fn) => {
				if (typeof fn !== 'function') return Promise.resolve(null);
				try { return Promise.resolve(fn()).catch(() => null); }
				catch (e) { return Promise.resolve(null); }
			};

			/* ---------------- active DOM handles ---------------- */
			let view = { hero: null, traffic: [], resources: null, tiles: {}, clients: null, wireless: null, interfaces: null };
			let drawer = null;

			function computeNeeds(layout) {
				const hasTraffic = layout.monitor.some((m) => m.type === 'traffic');
				const hasRes = layout.monitor.some((m) => m.type === 'resources');
				const hasTile = (k) => layout.tiles.indexOf(k) >= 0;
				const hasDet = (k) => layout.details.indexOf(k) >= 0;
				const needClients = hasDet('clients');
				const needDevices = needClients || hasTile('devices');
				const needWireless = hasDet('wireless') || hasTile('wifi') || needDevices;
				return {
					board: !!layout.hero,
					interfaces: !!layout.hero || hasTraffic || hasDet('interfaces') || needDevices,
					netdevs: hasTraffic,
					devStats: hasTraffic,
					cpu: hasRes,
					info: hasRes || hasTile('load') || hasTile('uptime'),
					conntrack: hasTile('connections'),
					temps: hasRes || hasTile('temp'),
					wireless: needWireless,
					stations: needWireless,
					leases: needDevices,
					neighbors: needDevices,
					hints: needDevices,
					deviceRates: needClients
				};
			}

			function uplinks(ifs) {
				const wan = ifs.find((i) => i.up && hasDefaultRoute(i) && i['ipv4-address'] && i['ipv4-address'].length) ||
					ifs.find((i) => i.up && hasDefaultRoute(i)) ||
					ifs.find((i) => i.interface === 'wan');
				return { wan: wan, lan: ifs.find((i) => i.interface === 'lan') };
			}

			function buildTrafficPickerInfo() {
				const ifs = st.ifs;
				if (!ifs) return { options: [{ value: 'auto', label: t('Auto') }], groups: [], devices: [], auto: null, autoDev: null, key: 'empty' };
				const src = C.trafficSources(ifs, st.netdevs);
				const groups = src.ifaces;
				const u = uplinks(ifs);
				const auto = (u.wan && u.wan.up) ? u.wan : u.lan;
				const autoDev = auto ? (auto.l3_device || auto.device) : null;
				const grouped = src.devices.length > 0;
				const options = [{
					value: 'auto',
					label: t('Auto') + (auto ? ' · ' + (auto.interface || '').toUpperCase() + (autoDev ? ' (' + autoDev + ')' : '') : '')
				}].concat(
					groups.map((g) => ({ value: g.dev, label: g.names.join(' / ') + ' (' + g.dev + ')', group: grouped ? t('Interfaces') : null })),
					src.devices.map((d) => ({ value: d.dev, label: d.dev, group: t('Network devices') }))
				);
				const key = groups.map((g) => g.dev + '=' + g.names.join(',')).join('|') + '#' +
					src.devices.map((d) => d.dev).join(',') + '#' + autoDev;
				return { options: options, groups: groups, devices: src.devices, auto: auto, autoDev: autoDev, key: key };
			}

			function secondaryDeviceFallback() {
				if (!st.ifs) return 'br-lan';
				const src = C.trafficSources(st.ifs, st.netdevs);
				const u = uplinks(st.ifs);
				const auto = (u.wan && u.wan.up) ? u.wan : u.lan;
				const autoDev = auto ? (auto.l3_device || auto.device) : null;
				const lan = src.ifaces.find((g) => g.dev === 'br-lan') || src.ifaces.find((g) => g.dev !== autoDev) || src.devices.find((d) => d.dev !== autoDev);
				return lan ? lan.dev : 'auto';
			}

			function syncLegacyTrafficStorage(layout) {
				const first = layout.monitor.find((m) => m.type === 'traffic');
				if (first) store.set('carbon.traffic', first.source);
			}

			async function persistLayout(nextLayout) {
				const clean = L.normalize(nextLayout);
				if (hasUciSave) {
					if (L.isDefault(clean) && typeof opts.resetLayout === 'function') {
						await opts.resetLayout();
						hasRouterLayout = false;
					}
					else {
						await opts.saveLayout(clean);
						hasRouterLayout = true;
					}
					syncLegacyTrafficStorage(clean);
				}
				else {
					if (L.isDefault(clean)) {
						try { window.localStorage.removeItem('carbon.dashboard'); } catch (e) { /* ignore */ }
						store.set('carbon.traffic', 'auto');
					}
					else {
						store.set('carbon.dashboard', L.encodeAttr(clean));
						syncLegacyTrafficStorage(clean);
					}
				}
				savedLayout = L.clone(clean);
			}

			function destroyView() {
				view.traffic.forEach((tc) => {
					if (tc.sel) tc.sel.close(false);
					if (tc.chart) tc.chart.destroy();
				});
				view = { hero: null, traffic: [], resources: null, tiles: {}, clients: null, wireless: null, interfaces: null };
			}

			function applyDetailSpans() {
				const items = [];
				activeLayout.details.forEach((k) => {
					const node = view[k];
					if (!node) return;
					if (k === 'wireless' && st.noRadio) {
						node.el.classList.add('hidden');
						return;
					}
					node.el.classList.remove('hidden');
					items.push({ type: k, el: node.el });
				});
				const spans = L.detailSpans(items.map((x) => x.type));
				items.forEach((x, i) => setSpan(x.el, spans[i]));
			}

			function buildHero() {
				const hostEl = h('h2', { class: 'cb-hero-title', text: '…' });
				const subEl = h('p', { class: 'cb-hero-sub' });
				const netEl = h('span', { class: 'cb-pill off', text: '…' });
				const wanEl = h('span', { class: 'cb-meta-val cb-mono', text: '—' });
				const lanEl = h('span', { class: 'cb-meta-val cb-mono', text: '—' });
				const wan6El = h('span', { class: 'cb-meta-val cb-mono cb-ip6', text: '—' });
				const wan6Item = metaItem(t('WAN IPv6'), wan6El);
				wan6Item.classList.add('hidden');
				const el = h('div', { class: 'cb-card cb-hero span-12', 'data-panel-key': 'hero' }, [
					h('div', { class: 'cb-hero-id' }, [
						heroIcon(),
						h('div', { class: 'cb-hero-text' }, [hostEl, subEl])
					]),
					h('div', { class: 'cb-hero-meta' }, [netEl, metaItem(t('WAN IP'), wanEl), wan6Item, metaItem(t('LAN IP'), lanEl)])
				]);
				dash.appendChild(el);
				view.hero = { el: el, host: hostEl, sub: subEl, net: netEl, wan: wanEl, lan: lanEl, wan6: wan6El, wan6Item: wan6Item };
			}

			function buildTraffic(monitorIndex, source, span, panelKey) {
				const rate = (label, color) => {
					const val = h('span', { class: 'cb-rate-val', html: '0<small>B/s</small>' });
					return { val: val, el: h('div', { class: 'cb-rate' }, [h('span', { class: 'cb-rate-label', style: '--c:' + color }, [h('i'), label]), val]) };
				};
				const dl = rate(t('Download'), COLORS.blue);
				const ul = rate(t('Upload'), COLORS.purple);
				const totals = h('div', { class: 'cb-totals' });
				const chartEl = h('div', { class: 'cb-chart' });
				const tc = { monitorIndex: monitorIndex, source: source, dev: null, devAlt: null, key: '', dl: dl, ul: ul, totals: totals, sel: null, chart: null, el: null };
				tc.sel = listbox({
					options: [{ value: 'auto', label: t('Auto') }], value: source || 'auto',
					label: t('Traffic interface'), className: 'cb-traffic-select',
					onChange: (v) => {
						tc.source = v;
						if (activeLayout.monitor[monitorIndex] && activeLayout.monitor[monitorIndex].type === 'traffic')
							activeLayout.monitor[monitorIndex].source = v;
						if (drawer) {
							if (drawer.isSaving()) return;
							if (drawer.draft.monitor[monitorIndex] && drawer.draft.monitor[monitorIndex].type === 'traffic')
								drawer.draft.monitor[monitorIndex].source = v;
							drawer.sync();
						}
						else {
							persistLayout(activeLayout).catch(() => {
								if (!hasRouterLayout) syncLegacyTrafficStorage(activeLayout);
							});
						}
						syncTrafficCards();
						fast();
					}
				});
				tc.el = card('cb-traffic span-' + span, t('Live Traffic'), tc.sel.el, [
					h('div', { class: 'cb-rates' }, [dl.el, ul.el, totals]),
					chartEl,
					h('div', { class: 'cb-chart-foot' }, [h('span', { text: t('2 min ago') }), h('span', { text: t('Now') })])
				]);
				tc.el.dataset.panelKey = panelKey;
				dash.appendChild(tc.el);
				tc.chart = new AreaChart(chartEl, {
					points: 60, interval: 2,
					series: [{ color: COLORS.blue, label: t('Download') }, { color: COLORS.purple, label: t('Upload') }]
				});
				view.traffic.push(tc);
			}

			function buildResources(span) {
				const ringCpu = h('div'), ringMem = h('div'), ringDisk = h('div');
				const memTitle = h('span');
				const membar = h('div', { class: 'cb-membar' });
				const memLegend = h('div', { class: 'cb-legend' });
				const kv = h('ul', { class: 'cb-kv' });
				const el = card('cb-resources span-' + span, t('Resources'), null, [
					h('div', { class: 'cb-res-body' }, [
						h('div', { class: 'cb-rings' }, [ringCpu, ringMem, ringDisk]),
						h('div', null, [
							h('div', { class: 'cb-membar-wrap' }, [
								h('div', { class: 'cb-membar-title' }, [t('Memory'), memTitle]),
								membar, memLegend
							]),
							kv
						])
					])
				]);
				el.dataset.panelKey = 'resources';
				dash.appendChild(el);
				view.resources = {
					el: el, memTitle: memTitle, membar: membar, memLegend: memLegend, kv: kv,
					rCpu: new Ring(ringCpu, { color: COLORS.blue, label: t('CPU') }),
					rMem: new Ring(ringMem, { color: COLORS.orange, label: t('Memory') }),
					rDisk: new Ring(ringDisk, { color: COLORS.purple, label: t('Storage') })
				};
			}

			function buildTile(type, span, wideMobile) {
				const meta = {
					devices: { icon: 'laptop', color: 'green', label: deviceTitle() },
					connections: { icon: 'link', color: 'teal', label: t('Connections') },
					load: { icon: 'pulse', color: 'indigo', label: t('Load') },
					uptime: { icon: 'clock', color: 'orange', label: t('Uptime') },
					wifi: { icon: 'wifi', color: 'blue', label: t('Wi-Fi') },
					temp: { icon: 'thermo', color: 'orange', label: t('Temperature') }
				}[type];
				const ico = h('span', { class: 'cb-ico', style: '--c:' + COLORS[meta.color], html: icon(meta.icon) });
				const val = h('div', { class: 'cb-tile-val', text: '—' });
				const sub = h('div', { class: 'cb-tile-sub' });
				const extra = h('div');
				const el = h('div', { class: 'cb-card cb-tile cb-tile-' + type + ' span-' + span + (wideMobile ? ' cb-tile-wide' : ''), 'data-panel-key': 'tile:' + type }, [
					h('div', { class: 'cb-tile-head' }, [ico, meta.label]),
					h('div', { class: 'cb-tile-row' }, [val, extra]),
					sub
				]);
				let bar = null, spark = null;
				if (type === 'connections') {
					bar = h('div', { class: 'cb-mini-bar', style: '--c:' + COLORS.teal }, h('i'));
					sub.parentNode.insertBefore(bar, sub);
				}
				dash.appendChild(el);
				if (type === 'load') spark = new Sparkline(extra, { color: COLORS.indigo, points: 30, initial: st.loadHistory });
				view.tiles[type] = { el: el, ico: ico, val: val, sub: sub, extra: extra, bar: bar, spark: spark };
			}

			function buildClients() {
				const count = h('span', { class: 'cb-count' });
				const list = h('ul', { class: 'cb-list' });
				const more = h('button', { type: 'button', class: 'cb-more hidden' });
				const rateNote = h('p', { class: 'cb-device-rate-note hidden', title: t('Device speeds use existing traffic statistics. Only traffic observed by this router is included.') });
				more.addEventListener('click', () => { st.showAll = !st.showAll; paintClients(); });
				const el = h('div', { class: 'cb-card cb-clients span-12', 'data-panel-key': 'detail:clients' }, [
					h('div', { class: 'cb-card-head' }, [h('h3', null, [deviceTitle(), count]), manage(urls.devices)]),
					rateNote, list, more
				]);
				dash.appendChild(el);
				view.clients = { el: el, count: count, list: list, more: more, rateNote: rateNote, rateNodes: new Map() };
			}

			function buildWireless() {
				const count = h('span', { class: 'cb-count' });
				const list = h('ul', { class: 'cb-list' });
				const el = h('div', { class: 'cb-card cb-wireless span-6' + (st.noRadio ? ' hidden' : ''), 'data-panel-key': 'detail:wireless' }, [
					h('div', { class: 'cb-card-head' }, [h('h3', null, [t('Wireless'), count]), manage(urls.wireless)]),
					list
				]);
				dash.appendChild(el);
				view.wireless = { el: el, count: count, list: list };
			}

			function buildInterfaces() {
				const list = h('ul', { class: 'cb-list' });
				const el = h('div', { class: 'cb-card cb-interfaces span-6', 'data-panel-key': 'detail:interfaces' }, [
					h('div', { class: 'cb-card-head' }, [h('h3', null, t('Interfaces')), manage(urls.network)]),
					list
				]);
				dash.appendChild(el);
				view.interfaces = { el: el, list: list };
			}

			/* ---------------- painters (pure render from cached st into active view) ---------------- */
			function paintBoard() {
				if (!view.hero || !st.board) return;
				view.hero.host.textContent = st.board.hostname || 'OpenWrt';
				view.hero.sub.textContent = [st.board.model, st.board.release && st.board.release.description].filter(Boolean).join(' · ');
			}

			function paintHeroNet() {
				if (!view.hero || !st.ifs) return;
				const ifs = st.ifs;
				const u = uplinks(ifs);
				const online = ifs.some((i) => i.up && hasDefaultRoute(i));
				view.hero.net.className = 'cb-pill ' + (online ? 'ok' : 'bad');
				view.hero.net.textContent = online ? t('Online') : t('Offline');
				const wv4 = u.wan && (u.wan['ipv4-address'] || [])[0];
				view.hero.wan.textContent = wv4 ? wv4.address : '—';
				const lv4 = u.lan && (u.lan['ipv4-address'] || [])[0];
				view.hero.lan.textContent = lv4 ? lv4.address : '—';
				const v6 = C.wanIPv6(ifs);
				view.hero.wan6Item.classList.toggle('hidden', !v6);
				view.hero.wan6.textContent = v6 ? v6.address : '—';
				view.hero.wan6.title = v6 ? v6.address + (v6.mask ? '/' + v6.mask : '') : '';
			}

			function paintTrafficCardTrack(tc, dev) {
				const tr = dev ? st.devTrack.get(dev) : null;
				if (tr) {
					tc.chart.setData(tr.series);
					setRate(tc.dl, tr.lastRates ? tr.lastRates[0] : 0);
					setRate(tc.ul, tr.lastRates ? tr.lastRates[1] : 0);
					if (tr.lastTotals)
						tc.totals.innerHTML = esc(t('Since boot')) + '<br>↓ <b>' + esc(fmt.bytesStr(tr.lastTotals.rx)) + '</b> &nbsp; ↑ <b>' + esc(fmt.bytesStr(tr.lastTotals.tx)) + '</b>';
					else tc.totals.innerHTML = '';
				}
				else {
					tc.chart.reset();
					setRate(tc.dl, 0);
					setRate(tc.ul, 0);
					tc.totals.innerHTML = '';
				}
			}

			/*
			 * traffic source: "auto" follows the uplink (the L3 device, e.g. pppoe-wan),
			 * or an interface / network device the user picked. The physical port
			 * below the uplink is not chosen automatically: on xPON it also carries
			 * IPTV and management VLANs, but on a one-armed router it carries LAN too.
			 */
			function syncTrafficCards() {
				if (!st.ifs || !view.traffic.length) return;
				const info = buildTrafficPickerInfo();
				view.traffic.forEach((tc) => {
					const pick = info.groups.find((g) => g.dev === tc.source) || info.devices.find((d) => d.dev === tc.source);
					const val = pick ? pick.dev : 'auto';
					if (info.key !== tc.key) {
						tc.key = info.key;
						tc.sel.setOptions(info.options, val);
					}
					else tc.sel.set(val);
					const dev = pick ? pick.dev : info.autoDev;
					const devAlt = pick ? pick.alt : (info.auto ? info.auto.device : null);
					if (dev !== tc.dev) {
						tc.dev = dev;
						tc.devAlt = devAlt;
						paintTrafficCardTrack(tc, dev);
					}
					else tc.devAlt = devAlt;
				});
			}

			function paintIfaces() {
				if (!view.interfaces || !st.fetched.ifs) return;
				const list = st.ifs;
				view.interfaces.list.innerHTML = '';
				if (!list) { view.interfaces.list.appendChild(h('li', { class: 'cb-empty', text: t('Unavailable') })); return; }
				list.filter((i) => i.interface !== 'loopback').forEach((i) => {
					const v4 = (i['ipv4-address'] || [])[0];
					const v6 = (i['ipv6-address'] || [])[0] || ((i['ipv6-prefix-assignment'] || [])[0] || {})['local-address'];
					const addr = v4 ? v4.address + '/' + v4.mask : (v6 ? v6.address + '/' + v6.mask : '');
					const proto = PROTO[i.proto] ? t(PROTO[i.proto]) : (i.proto || '').toUpperCase();
					const up = !!i.up;
					view.interfaces.list.appendChild(h('li', null, [
						h('span', { class: 'cb-ico', style: '--c:' + (up ? (hasDefaultRoute(i) ? COLORS.green : COLORS.teal) : COLORS.gray), html: icon('globe') }),
						h('div', { class: 'cb-list-main' }, [
							h('span', { class: 'cb-list-title', text: (i.interface || '').toUpperCase() }),
							h('span', { class: 'cb-list-sub' }, [proto, addr ? ' · ' : '', addr ? h('span', { class: 'cb-mono', text: addr }) : null])
						]),
						h('span', { class: 'cb-pill sm ' + (up ? 'ok' : 'off'), text: up ? t('Connected') : t('Not connected') })
					]));
				});
			}

			function paintDeviceRates() {
				if (!view.clients) return;
				const data = st.rateData;
				view.clients.rateNote.classList.toggle('hidden', !st.rateSeen);
				view.clients.rateNote.textContent = t('Device speeds') + ' · ' + (st.rateSource ? st.rateSource + ' · ' : '') + (!data ? t('Unavailable') :
					(data.seconds == null ? t('Waiting for next sample') : t('%d s average', Math.round(data.seconds))));
				view.clients.rateNodes.forEach((nodes, mac) => {
					nodes.row.classList.toggle('hidden', !st.rateSeen);
					const rate = data && data.rates.get(mac);
					const text = (v) => v == null ? '—' : fmt.bytes(v, true).join(' ');
					nodes.down.textContent = '↓ ' + text(rate && rate.down);
					nodes.up.textContent = '↑ ' + text(rate && rate.up);
					nodes.down.setAttribute('aria-label', t('Download') + ' ' + text(rate && rate.down));
					nodes.up.setAttribute('aria-label', t('Upload') + ' ' + text(rate && rate.up));
				});
			}

			function paintClients() {
				if (!st.fetched.devices) return;
				const list = st.devices;
				if (view.tiles.devices) {
					view.tiles.devices.val.textContent = list ? String(list.length) : '—';
					view.tiles.devices.sub.textContent = st.wifiCount != null ? t('%d on Wi-Fi', st.wifiCount) :
						(list ? t('Known to this router') : t('Unavailable'));
				}
				if (!view.clients) return;
				view.clients.list.innerHTML = '';
				view.clients.rateNodes.clear();
				view.clients.count.textContent = list ? String(list.length) : '';
				if (!list) { view.clients.list.appendChild(h('li', { class: 'cb-empty', text: t('Unavailable') })); view.clients.more.classList.add('hidden'); return; }
				if (!list.length) { view.clients.list.appendChild(h('li', { class: 'cb-empty', text: t('No devices yet') })); }
				const collapsed = getComputedStyle(view.clients.list).gridTemplateColumns.split(' ').length > 1 ? 12 : 8;
				const limit = st.showAll ? list.length : collapsed;
				list.slice(0, limit).forEach((l) => {
					const id = C.identify(l.hostname, l.macaddr);
					const kind = id.brand ? id.brand.n : (id.type ? t(TYPE_LABEL[id.type]) : null);
					const name = l.hostname || (kind ? t('%s device', kind) : t('Unknown device'));
					let lease = '';
					if (l.gateway) lease = t('Gateway');
					else if (l.lease) {
						lease = t('DHCP lease');
						if (l.expires > 0) lease += ' · ' + t('%s left', fmt.duration(l.expires));
					}
					else if (l.active && !l.wifi) lease = t('Neighbor entry');
					const wifi = l.wifi ? [l.wifi.band, l.wifi.signal != null ? l.wifi.signal + ' dBm' : null].filter(Boolean).join(' · ') : '';
					const down = h('span', { class: 'cb-device-rate', title: t('Download') });
					const up = h('span', { class: 'cb-device-rate', title: t('Upload') });
					const speeds = h('span', { class: 'cb-device-rates hidden' }, [down, up]);
					view.clients.rateNodes.set(l.macaddr, { row: speeds, down: down, up: up });
					view.clients.list.appendChild(h('li', null, [
						deviceAvatar(l, id),
						h('div', { class: 'cb-list-main' }, [
							h('span', { class: 'cb-list-title', text: name }),
							h('span', { class: 'cb-list-sub' }, [
								kind ? h('span', { class: 'cb-kind', text: kind }) : null,
								h('span', { class: 'cb-mono', text: l.ipaddr || l.ip6addr || '' })
							]),
							speeds
						]),
						h('div', { class: 'cb-list-aside' }, [
							h('span', { class: 'cb-mono cb-hide-sm', text: (l.macaddr || '').toUpperCase() }),
							h('span', null, [
								l.wifi ? h('span', { class: 'cb-tag cb-tag-wifi', title: t('Connected over Wi-Fi') + (wifi ? ' · ' + wifi : ''), 'aria-label': wifi || t('Wi-Fi'), html: icon('wifi') + '<span class="cb-tag-text">' + esc(wifi || t('Wi-Fi')) + '</span>' }) : null,
								id.priv ? h('span', { class: 'cb-tag', title: t('Randomised MAC address'), text: t('Private') }) : null,
								lease ? h('span', { class: 'cb-device-source', text: lease }) : null
							])
						])
					]));
				});
				if (list.length > collapsed) {
					view.clients.more.classList.remove('hidden');
					view.clients.more.textContent = st.showAll ? t('Show less') : t('Show all %d devices', list.length);
				}
				else view.clients.more.classList.add('hidden');
				paintDeviceRates();
			}

			function clientCountLabel(n) {
				return n === 1 ? t('%d device', 1) : t('%d devices', n);
			}

			function paintWireless() {
				if (!st.fetched.wireless) return;
				const w = st.wireless;
				const summary = C.wirelessSummary(w, st.stations);
				const rows = summary.rows;
				const active = rows.filter((x) => x.on);
				const total = summary.totalClients != null ? summary.totalClients : st.wifiCount;
				applyDetailSpans();
				if (view.wireless && !st.noRadio) {
					view.wireless.count.textContent = (active.length && total != null) ? String(total) : '';
					view.wireless.list.innerHTML = '';
					if (!rows.length) view.wireless.list.appendChild(h('li', { class: 'cb-empty', text: w ? t('No wireless') : t('Unavailable') }));
					else rows.forEach((x) => {
						const name = x.ssid || t('Hidden network');
						const head = h('span', { class: 'cb-list-title cb-wifi-head' }, [
							h('span', { class: 'cb-wifi-ssid', text: name }),
							x.band ? h('span', { class: 'cb-band' + (x.bandKey ? ' cb-band-' + x.bandKey : ''), text: x.band }) : null
						]);
						const aside = h('div', { class: 'cb-list-aside cb-wifi-aside' }, [
							x.on && x.clients != null ? h('span', { class: 'cb-wifi-clients', text: clientCountLabel(x.clients) }) : null,
							h('span', { class: 'cb-pill sm ' + (x.on ? 'ok' : 'off'), text: x.on ? t('On') : t('Off') })
						]);
						view.wireless.list.appendChild(h('li', null, [
							h('span', { class: 'cb-ico', style: '--c:' + (x.on ? COLORS.blue : COLORS.gray), html: icon('wifi') }),
							h('div', { class: 'cb-list-main' }, [
								head,
								x.meta ? h('span', { class: 'cb-list-sub', text: x.meta }) : null
							]),
							aside
						]));
					});
				}
				if (view.tiles.wifi) {
					const tw = view.tiles.wifi;
					if (st.noRadio) {
						tw.val.textContent = '—';
						tw.sub.textContent = t('No wireless');
						tw.el.title = '';
					}
					else if (!w) {
						tw.val.textContent = '—';
						tw.sub.textContent = t('Unavailable');
						tw.el.title = '';
					}
					else {
						if (!active.length) {
							tw.val.textContent = t('Off');
							tw.sub.textContent = rows.length ? rows.map((x) => x.ssid || t('Hidden network')).slice(0, 2).join(' · ') : t('No wireless');
						}
						else {
							tw.val.textContent = total != null ? String(total) : t('On');
							const shown = active.length > 3 ? active.slice(0, 2) : active;
							const list = h('div', { class: 'cb-wifi-rows' }, shown.map((x) => h('div', { class: 'cb-wifi-row' }, [
								h('span', { class: 'cb-wifi-row-head' }, [
									h('span', { class: 'cb-wifi-row-ssid', text: x.ssid || t('Hidden network') }),
									x.band ? h('span', { class: 'cb-band' + (x.bandKey ? ' cb-band-' + x.bandKey : '') + ' cb-wifi-row-band', text: x.band }) : null
								]),
								x.clients != null ? h('span', { class: 'cb-wifi-row-count', text: String(x.clients) }) : null
							])));
							if (active.length > 3)
								list.appendChild(h('div', { class: 'cb-wifi-row cb-wifi-row-more', text: t('+%d more', active.length - 2) }));
							tw.sub.innerHTML = '';
							tw.sub.appendChild(list);
						}
						tw.el.title = rows.map((x) => {
							const name = x.ssid || t('Hidden network');
							return [
								name + (x.sub ? ' (' + x.sub + ')' : ''),
								x.on && x.clients != null ? clientCountLabel(x.clients) : null,
								x.on ? t('On') : t('Off')
							].filter(Boolean).join(' · ');
						}).join('\n');
					}
				}
			}

			function paintCpu() {
				if (!view.resources || !st.fetched.cpu) return;
				if (st.cpuPct != null) view.resources.rCpu.set(st.cpuPct, st.cpuCores ? t('%d cores', st.cpuCores) : '');
				else if (!st.prevCpu) view.resources.rCpu.set(null, t('Unavailable'));
			}

			function loadTooltip(load) {
				const l = load.map((x) => (x / 65536).toFixed(2));
				return st.cpuCores > 0
					? t('1 / 5 / 15 min load: %s · %s · %s (%d cores)', l[0], l[1], l[2], st.cpuCores)
					: t('1 / 5 / 15 min load: %s · %s · %s', l[0], l[1], l[2]);
			}

			function paintKv() {
				if (!view.resources) return;
				const kv = view.resources.kv;
				kv.innerHTML = '';
				if (st.info && Array.isArray(st.info.load) && st.info.load.length >= 3) {
					const load1 = st.info.load[0] / 65536;
					const status = C.loadStatus(load1, st.cpuCores);
					kv.appendChild(h('li', { class: 'cb-kv-help', title: loadTooltip(st.info.load) }, [
						h('span', { text: t('Load average') }),
						h('span', { class: 'cb-load-val' }, [
							h('span', { class: 'cb-mono', text: load1.toFixed(2) }),
							status ? h('span', { class: 'cb-load-badge ' + status.level, text: t(status.label) }) : null
						])
					]));
				}
				if (st.temps && st.temps.length) {
					const sensorName = (n) => String(n || '').replace(/[-_ ]?thermal$/i, '').replace(/[-_]+/g, ' ').trim();
					const all = st.temps.map((x) => (sensorName(x.name) || t('Temperature')) + ': ' + (x.value / 1000).toFixed(1) + ' °C').join('\n');
					st.temps.slice(0, 3).forEach((x) => {
						const label = st.temps.length > 1 && sensorName(x.name) ? t('Temperature') + ' · ' + sensorName(x.name) : t('Temperature');
						kv.appendChild(h('li', { title: all }, [h('span', { text: label }), h('span', { text: (x.value / 1000).toFixed(1) + ' °C' })]));
					});
				}
			}

			function paintInfo() {
				if (!st.fetched.info) return;
				const info = st.info;
				if (view.resources) {
					if (info) {
						const m = info.memory || {};
						if (m.total) {
							const avail = m.available != null ? m.available : (m.free || 0) + (m.buffered || 0) + (m.cached || 0);
							const used = Math.max(0, m.total - avail);
							const cache = Math.min(Math.max(0, m.total - used), (m.buffered || 0) + (m.cached || 0));
							const free = Math.max(0, m.total - used - cache);
							view.resources.rMem.set(used / m.total * 100, fmt.pair(used, m.total));
							view.resources.memTitle.textContent = fmt.bytesStr(m.total);
							view.resources.membar.innerHTML = '';
							[[used, COLORS.orange, t('Used')], [cache, COLORS.yellow, t('Cache')], [free, 'var(--cb-fill)', t('Free')]].forEach((s) => {
								view.resources.membar.appendChild(h('i', { style: '--c:' + s[1] + ';flex-basis:' + (s[0] / m.total * 100).toFixed(2) + '%' }));
							});
							view.resources.memLegend.innerHTML = '';
							[[used, COLORS.orange, t('Used')], [cache, COLORS.yellow, t('Cache')], [free, 'var(--cb-gray)', t('Free')]].forEach((s) => {
								view.resources.memLegend.appendChild(h('span', { style: '--c:' + s[1] }, [h('i'), s[2] + ' ' + fmt.bytesStr(s[0])]));
							});
						}
						const root = info.root || {};
						if (root.total) {
							const used = root.used != null ? root.used : root.total - root.free;
							view.resources.rDisk.set(used / root.total * 100, fmt.pair(used * 1024, root.total * 1024));
						}
						else view.resources.rDisk.set(null, t('Unavailable'));
					}
					else {
						view.resources.rMem.set(null, t('Unavailable'));
						view.resources.rDisk.set(null, t('Unavailable'));
					}
				}
				if (info && Array.isArray(info.load) && info.load.length >= 3 && view.tiles.load) {
					const l = info.load.map((x) => (x / 65536).toFixed(2));
					view.tiles.load.val.textContent = l[0];
					view.tiles.load.sub.textContent = t('1 min average');
					view.tiles.load.el.title = loadTooltip(info.load);
				}
				if (info && info.uptime != null && view.tiles.uptime) {
					view.tiles.uptime.val.textContent = fmt.duration(info.uptime);
					view.tiles.uptime.sub.textContent = t('Since %s', fmt.since(info.uptime));
				}
				paintKv();
			}

			function paintConntrack() {
				if (!view.tiles.connections || !st.fetched.conntrack) return;
				const ct = st.conntrack;
				if (ct && ct[0] != null) {
					const n = parseInt(ct[0], 10), max = parseInt(ct[1], 10);
					view.tiles.connections.val.textContent = fmt.num(n);
					view.tiles.connections.sub.textContent = max ? t('of %s max', fmt.num(max)) : '';
					view.tiles.connections.bar.firstChild.style.width = max ? clamp(n / max * 100, 1, 100).toFixed(1) + '%' : '0';
				}
				else view.tiles.connections.sub.textContent = t('Unavailable');
			}

			function paintTemps() {
				if (!st.fetched.temps) return;
				paintKv();
				if (!view.tiles.temp) return;
				const tt = view.tiles.temp;
				const temps = st.temps || [];
				const sensorName = (n) => String(n || '').replace(/[-_ ]?thermal$/i, '').replace(/[-_]+/g, ' ').trim();
				if (!temps.length) {
					tt.val.textContent = '—';
					tt.sub.textContent = t('Unavailable');
					tt.el.title = '';
					return;
				}
				const top = temps[0], deg = top.value / 1000;
				tt.ico.style.setProperty('--c', deg >= 75 ? COLORS.red : COLORS.orange);
				tt.val.innerHTML = esc(deg.toFixed(1)) + '<small>°C</small>';
				const name = sensorName(top.name) || t('Temperature');
				tt.sub.textContent = temps.length > 1 ? name + ' (+' + (temps.length - 1) + ')' : name;
				tt.el.title = temps.map((x) => (sensorName(x.name) || t('Temperature')) + ': ' + (x.value / 1000).toFixed(1) + ' °C').join('\n');
			}

			/* ---------------- grid mount & live layout apply ---------------- */
			let hasRendered = false;
			let ghostLayer = null;

			function renderLayout(layout, animate) {
				const isUpdate = hasRendered;
				hasRendered = true;
				const doAnim = !!(animate && isUpdate && canWaapi());
				const reduce = doAnim && reducedMotion();

				if (ghostLayer) { ghostLayer.remove(); ghostLayer = null; }

				const scrollX = window.scrollX;
				const scrollY = window.scrollY;
				const prevH = dash.offsetHeight;
				const prevMap = new Map();

				if (doAnim) {
					const dashRect = dash.getBoundingClientRect();
					dash.querySelectorAll(':scope > .cb-card:not(.hidden)[data-panel-key]').forEach((el) => {
						const r = el.getBoundingClientRect();
						if (!r.width || !r.height) return;
						prevMap.set(el.dataset.panelKey, {
							left: r.left - dashRect.left,
							top: r.top - dashRect.top,
							width: r.width,
							height: r.height,
							el: el
						});
					});
				}

				if (prevH) dash.style.minHeight = prevH + 'px';
				if (isUpdate) dash.classList.add('cb-dash-live');
				try {
					activeLayout = L.normalize(layout);
					destroyView();
					dash.innerHTML = '';

					if (activeLayout.hero) buildHero();
					activeLayout.sections.forEach((sec) => {
						if (sec === 'monitor' && activeLayout.monitor.length) {
							const spans = L.monitorSpans(activeLayout.monitor);
							const seenSrc = Object.create(null);
							activeLayout.monitor.forEach((m, i) => {
								if (m.type === 'traffic') {
									const src = m.source || 'auto';
									const occ = seenSrc[src] || 0;
									seenSrc[src] = occ + 1;
									buildTraffic(i, src, spans[i], 'traffic:' + src + '#' + occ);
								}
								else if (m.type === 'resources') buildResources(spans[i]);
							});
						}
						else if (sec === 'tiles' && activeLayout.tiles.length) {
							const spans = L.tileSpans(activeLayout.tiles.length);
							const odd = activeLayout.tiles.length % 2 === 1;
							activeLayout.tiles.forEach((k, i) => buildTile(k, spans[i], odd && i === activeLayout.tiles.length - 1));
						}
						else if (sec === 'details' && activeLayout.details.length) {
							activeLayout.details.forEach((k) => {
								if (k === 'clients') buildClients();
								else if (k === 'wireless') buildWireless();
								else if (k === 'interfaces') buildInterfaces();
							});
							applyDetailSpans();
						}
					});

					paintBoard();
					paintHeroNet();
					syncTrafficCards();
					paintIfaces();
					paintClients();
					paintWireless();
					paintCpu();
					paintInfo();
					paintConntrack();
					paintTemps();
				}
				finally {
					dash.style.minHeight = '';
				}
				if (window.scrollX !== scrollX || window.scrollY !== scrollY)
					window.scrollTo(scrollX, scrollY);

				if (!doAnim || !prevMap.size) return;

				const newDashRect = dash.getBoundingClientRect();
				const nextKeys = new Set();
				let enterIdx = 0;

				dash.querySelectorAll(':scope > .cb-card:not(.hidden)[data-panel-key]').forEach((el) => {
					const key = el.dataset.panelKey;
					nextKeys.add(key);
					const prev = prevMap.get(key);
					if (!prev) {
						const delay = Math.min(enterIdx * 28, 112);
						enterIdx++;
						const kf = reduce
							? [{ opacity: 0 }, { opacity: 1 }]
							: [{ opacity: 0, transform: 'translate3d(0,10px,0) scale(0.96)' }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }];
						el.animate(kf, { duration: reduce ? 140 : 240, delay: delay, easing: EASE_OUT, fill: delay ? 'backwards' : 'none' });
						return;
					}
					if (reduce) return;
					const nr = el.getBoundingClientRect();
					const newLeft = nr.left - newDashRect.left;
					const newTop = nr.top - newDashRect.top;
					const newRight = newLeft + nr.width;
					const prevRight = prev.left + prev.width;
					const dy = prev.top - newTop;
					const dw = nr.width - prev.width;

					if (dw > 24) {
						const clipL = Math.max(0, prev.left - newLeft);
						const clipR = Math.max(0, newRight - prevRight);
						if (clipL + clipR < nr.width - 20) {
							el.animate([
								{ transform: 'translate3d(0,' + dy + 'px,0)', clipPath: 'inset(0 ' + clipR + 'px 0 ' + clipL + 'px round 18px)' },
								{ transform: 'translate3d(0,0,0)', clipPath: 'inset(0 0 0 0 round 18px)' }
							], { duration: 260, easing: EASE_OUT });
							return;
						}
					}

					let dx = prev.left - newLeft;
					if (dw < -24 && newLeft >= prev.left - 2 && newRight <= prevRight + 2) dx = 0;
					else if (Math.abs(dw) > 24) dx = clamp(dx, -newLeft, Math.max(0, newDashRect.width - newRight));

					if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
						el.animate([
							{ transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)' },
							{ transform: 'translate3d(0,0,0)' }
						], { duration: 260, easing: EASE_OUT });
					}
				});

				const leaving = [];
				prevMap.forEach((prev, key) => { if (!nextKeys.has(key)) leaving.push(prev); });
				if (leaving.length) {
					const layer = h('div', { class: 'cb-dash-ghosts', 'aria-hidden': 'true', inert: '' });
					ghostLayer = layer;
					dash.insertBefore(layer, dash.firstChild);
					let pending = leaving.length;
					const done = () => {
						pending--;
						if (pending <= 0) {
							layer.remove();
							if (ghostLayer === layer) ghostLayer = null;
						}
					};
					leaving.forEach((prev) => {
						const ghost = prev.el.cloneNode(true);
						ghost.removeAttribute('data-panel-key');
						ghost.setAttribute('inert', '');
						ghost.classList.remove(
							'cb-traffic', 'cb-wireless', 'cb-interfaces',
							'cb-tile-devices', 'cb-tile-connections', 'cb-tile-load', 'cb-tile-uptime', 'cb-tile-wifi', 'cb-tile-temp'
						);
						ghost.classList.add('cb-card-leaving');
						ghost.style.left = prev.left + 'px';
						ghost.style.top = prev.top + 'px';
						ghost.style.width = prev.width + 'px';
						ghost.style.height = prev.height + 'px';
						layer.appendChild(ghost);
						const kf = reduce
							? [{ opacity: 1 }, { opacity: 0 }]
							: [{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }, { opacity: 0, transform: 'translate3d(0,6px,0) scale(0.95)' }];
						const anim = ghost.animate(kf, { duration: reduce ? 120 : 180, easing: EASE_OUT, fill: 'forwards' });
						anim.onfinish = done;
						anim.oncancel = done;
					});
				}
			}

			function ensureFreshForLayout() {
				const needs = computeNeeds(activeLayout);
				if (needs.board && !st.board) safe(P.board).then((b) => { if (b) { st.board = b; paintBoard(); } });
				if ((needs.interfaces && !st.fetched.ifs) || (needs.leases && !st.fetched.devices) ||
					(needs.wireless && !st.fetched.wireless) || (needs.stations && !st.fetched.stations))
					slow();
				if ((needs.info && !st.fetched.info) || (needs.conntrack && !st.fetched.conntrack) || (needs.temps && !st.fetched.temps))
					mid();
				if ((needs.cpu && !st.fetched.cpu) || (needs.devStats && view.traffic.some((tc) => tc.dev && !st.devTrack.has(tc.dev))))
					fast();
				if (needs.deviceRates && typeof P.deviceTraffic === 'function' && !st.rateSeen)
					readDeviceRates();
			}

			/* ---------------- polling (demand-driven by activeLayout) ---------------- */
			async function readDeviceRates() {
				if (!computeNeeds(activeLayout).deviceRates) return;
				if (Date.now() < st.rateNext) return;
				const generation = st.rateGeneration;
				const sample = await safe(P.deviceTraffic);
				if (generation !== st.rateGeneration) return;
				const now = Date.now();
				// Responses arriving after the page is hidden cannot establish a baseline.
				st.rateData = deviceRates.update(document.hidden ? null : sample, now);
				if (st.rateData) {
					st.rateSeen = true;
					st.rateSource = st.rateData.source === 'nftables' ? 'nftables' : '';
				}
				st.rateNext = now + (st.rateData ? st.rateData.interval : 60) * 1000;
				paintDeviceRates();
			}
			document.addEventListener('visibilitychange', () => {
				st.rateGeneration++;
				deviceRates.reset();
				st.rateData = null;
				st.rateNext = 0;
				paintDeviceRates();
			});
			C.loadBrands().then((d) => { if (d && st.devices) paintClients(); });

			async function slow() {
				const needs = computeNeeds(activeLayout);
				const hintsDue = needs.hints && Date.now() - st.hintsAt > 30000;
				const netdevsDue = needs.netdevs && Date.now() - st.netdevsAt > 30000;
				const known = st.aps;
				const r = await Promise.all([
					needs.interfaces ? safe(P.interfaces) : Promise.resolve(undefined),
					needs.leases ? safe(P.leases) : Promise.resolve(undefined),
					needs.wireless ? safe(P.wireless) : Promise.resolve(undefined),
					needs.neighbors ? safe(P.neighbors) : Promise.resolve(undefined),
					hintsDue ? safe(P.hostHints) : Promise.resolve(st.hints),
					needs.stations && known && known.length && P.stations ? safe(() => P.stations(known)) : Promise.resolve(null),
					netdevsDue ? safe(P.netDevices) : Promise.resolve(st.netdevs)
				]);

				if (needs.interfaces) {
					const ifs = Array.isArray(r[0]) ? r[0] : null;
					st.ifs = ifs;
					st.fetched.ifs = true;
					if (netdevsDue && r[6] && typeof r[6] === 'object') { st.netdevs = r[6]; st.netdevsAt = Date.now(); }
					paintHeroNet();
					syncTrafficCards();
					paintIfaces();
					if (drawer) drawer.refreshSources();
				}

				if (hintsDue && r[4] && typeof r[4] === 'object') { st.hints = r[4]; st.hintsAt = Date.now(); }
				let w = st.wireless;
				let aps = { ifnames: st.aps || [], bands: {} };
				if (needs.wireless) {
					w = r[2] && typeof r[2] === 'object' ? r[2] : null;
					st.wireless = w || (r[2] == null ? null : {});
					st.noRadio = st.wireless ? !Object.keys(st.wireless).length : !urls.wireless;
					st.fetched.wireless = true;
					aps = apInterfaces(w);
				}

				let stations = null;
				if (needs.stations) {
					const same = known && known.join() === aps.ifnames.join();
					st.aps = aps.ifnames;
					stations = same ? r[5] : (aps.ifnames.length && P.stations ? await safe(() => P.stations(aps.ifnames)) : null);
					st.stations = stations;
					st.fetched.stations = true;
					if (!needs.leases && !needs.neighbors)
						st.wifiCount = C.wirelessSummary(st.wireless, stations).totalClients;
				}

				if (needs.leases || needs.neighbors) {
					const leases = r[1] && Array.isArray(r[1].dhcp_leases) ? r[1].dhcp_leases : null;
					const arp = r[3] != null ? C.parseArp(r[3], C.lanDevices(st.ifs), st.ifs) : null;
					st.devices = (leases || arp || stations) ? C.mergeDevices({
						leases: leases, leases6: r[1] && r[1].dhcp6_leases, stations: stations, arp: arp, hints: st.hints, bands: aps.bands
					}) : null;
					st.wifiCount = (st.devices && Array.isArray(stations)) ? st.devices.filter((d) => d.wifi).length : null;
					st.fetched.devices = true;
					paintClients();
				}
				if (needs.wireless) paintWireless();
			}

			async function mid() {
				const needs = computeNeeds(activeLayout);
				if (!needs.info && !needs.conntrack && !needs.temps) return;
				const r = await Promise.all([
					needs.info ? safe(P.info) : Promise.resolve(undefined),
					needs.conntrack ? safe(P.conntrack) : Promise.resolve(undefined),
					needs.temps ? safe(P.temperatures || P.temperature) : Promise.resolve(undefined)
				]);

				if (needs.info) {
					st.info = r[0];
					st.fetched.info = true;
					if (st.info && st.info.load) {
						const v = +(st.info.load[0] / 65536).toFixed(2);
						if (!st.loadHistory.length) st.loadHistory = new Array(29).fill(v);
						st.loadHistory.push(v);
						while (st.loadHistory.length > 30) st.loadHistory.shift();
						if (view.tiles.load && view.tiles.load.spark) view.tiles.load.spark.push(v);
					}
					paintInfo();
				}
				if (needs.conntrack) {
					st.conntrack = r[1];
					st.fetched.conntrack = true;
					paintConntrack();
				}
				if (needs.temps) {
					st.temps = (Array.isArray(r[2]) ? r[2] : (r[2] != null ? [{ name: '', value: parseInt(r[2], 10) }] : []))
						.filter((x) => x && !isNaN(x.value) && x.value > 0).sort((a, b) => b.value - a.value);
					st.fetched.temps = true;
					paintTemps();
				}
			}

			async function fast() {
				const needs = computeNeeds(activeLayout);
				if (!needs.cpu && !needs.devStats) return;
				const uniqueDevs = [];
				const seen = new Set();
				if (needs.devStats) {
					view.traffic.forEach((tc) => {
						if (tc.dev && !seen.has(tc.dev)) {
							seen.add(tc.dev);
							uniqueDevs.push({ dev: tc.dev, alt: tc.devAlt });
						}
					});
				}
				const r = await Promise.all([
					needs.cpu ? safe(P.cpuStat) : Promise.resolve(undefined)
				].concat(uniqueDevs.map((d) => safe(() => P.devStats(d.dev, d.alt)))));

				if (needs.cpu) {
					const cpu = parseCpu(r[0]);
					st.fetched.cpu = true;
					let coresChanged = false;
					if (cpu) {
						if (cpu.cores && cpu.cores !== st.cpuCores) {
							st.cpuCores = cpu.cores;
							coresChanged = true;
						}
						if (st.prevCpu && cpu.total > st.prevCpu.total) {
							const dt = cpu.total - st.prevCpu.total, di = cpu.idle - st.prevCpu.idle;
							st.cpuPct = (1 - di / dt) * 100;
						}
						st.prevCpu = cpu;
					}
					paintCpu();
					if (coresChanged && st.info && Array.isArray(st.info.load) && st.info.load.length >= 3) {
						paintKv();
						if (view.tiles.load) view.tiles.load.el.title = loadTooltip(st.info.load);
					}
				}

				const now = Date.now();
				uniqueDevs.forEach((d, idx) => {
					const s = r[idx + 1];
					if (!s || s.rx_bytes == null) return;
					let tr = st.devTrack.get(d.dev);
					if (!tr) {
						tr = { prevNet: null, lastRates: [0, 0], lastTotals: null, series: [new Array(60).fill(0), new Array(60).fill(0)] };
						st.devTrack.set(d.dev, tr);
					}
					let pushed = false;
					const dtMs = tr.prevNet ? (now - tr.prevNet.t) : 0;
					if (tr.prevNet && dtMs > 0 && dtMs <= 15000 && s.rx_bytes >= tr.prevNet.rx && s.tx_bytes >= tr.prevNet.tx) {
						const dt = dtMs / 1000;
						const rx = (s.rx_bytes - tr.prevNet.rx) / dt, tx = (s.tx_bytes - tr.prevNet.tx) / dt;
						tr.lastRates = [rx, tx];
						tr.series[0].push(Math.max(0, rx));
						tr.series[1].push(Math.max(0, tx));
						while (tr.series[0].length > 60) tr.series[0].shift();
						while (tr.series[1].length > 60) tr.series[1].shift();
						pushed = true;
					}
					tr.prevNet = { rx: s.rx_bytes, tx: s.tx_bytes, t: now };
					tr.lastTotals = { rx: s.rx_bytes, tx: s.tx_bytes };

					view.traffic.forEach((tc) => {
						if (tc.dev !== d.dev) return;
						if (pushed) {
							tc.chart.push(tr.lastRates);
							setRate(tc.dl, tr.lastRates[0]);
							setRate(tc.ul, tr.lastRates[1]);
						}
						tc.totals.innerHTML = esc(t('Since boot')) + '<br>↓ <b>' + esc(fmt.bytesStr(s.rx_bytes)) + '</b> &nbsp; ↑ <b>' + esc(fmt.bytesStr(s.tx_bytes)) + '</b>';
					});
				});
			}

			/* ---------------- Customize drawer (reuses Carbon controls) ---------------- */
			const SECTION_META = {
				monitor: N_('Core monitoring'),
				tiles: N_('Stat tiles'),
				details: N_('Details')
			};
			const TILE_META = {
				devices: { label: N_('Discovered devices'), icon: 'laptop', color: 'green' },
				connections: { label: N_('Connections'), icon: 'link', color: 'teal' },
				load: { label: N_('Load'), icon: 'pulse', color: 'indigo' },
				uptime: { label: N_('Uptime'), icon: 'clock', color: 'orange' },
				wifi: { label: N_('Wi-Fi'), icon: 'wifi', color: 'blue' },
				temp: { label: N_('Temperature'), icon: 'thermo', color: 'orange' }
			};
			const DETAIL_META = {
				clients: { label: N_('Discovered devices'), icon: 'laptop', color: 'green' },
				wireless: { label: N_('Wireless'), icon: 'wifi', color: 'blue' },
				interfaces: { label: N_('Interfaces'), icon: 'globe', color: 'teal' }
			};

			function openCustomizer(opener) {
				if (drawer) {
					if (drawer.collapsed) drawer.expand();
					return;
				}
				const appEl = document.querySelector('.cb-app');
				const draft = L.clone(savedLayout);
				let saving = false;
				let collapsed = false;
				let rowListboxes = [];
				let lastPickerKey = '';

				const closeListboxes = () => { rowListboxes.forEach((lb) => lb.close(false)); rowListboxes = []; };
				const titleId = uid();
				const scrim = h('div', { class: 'cb-sheet-scrim' });
				const collapseBtn = h('button', {
					type: 'button', class: 'cb-sheet-collapse',
					'aria-expanded': 'true', 'aria-label': t('Collapse panel to preview'),
					title: t('Collapse panel to preview'), html: icon('chevron')
				});
				const closeBtn = h('button', { type: 'button', class: 'cb-sheet-close', 'aria-label': t('Close'), title: t('Close'), html: icon('close') });
				const body = h('div', { class: 'cb-sheet-body' });
				const statusEl = h('div', { class: 'cb-sheet-status', role: 'status', 'aria-live': 'polite' });
				const resetBtn = h('button', { type: 'button', class: 'cbi-button cbi-button-reset', text: t('Restore default') });
				const cancelBtn = h('button', { type: 'button', class: 'cbi-button', text: t('Cancel') });
				const saveBtn = h('button', { type: 'button', class: 'cbi-button cbi-button-save', text: t('Save') });

				const sheet = h('aside', { class: 'cb-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
					collapseBtn,
					h('div', { class: 'cb-sheet-head' }, [
						h('h3', { id: titleId, text: t('Customize dashboard') }),
						closeBtn
					]),
					body,
					h('div', { class: 'cb-sheet-foot' }, [
						statusEl,
						h('div', { class: 'cb-sheet-actions' }, [resetBtn, h('div', { class: 'cb-sheet-actions-end' }, [cancelBtn, saveBtn])])
					])
				]);

				const expandBtn = h('button', {
					type: 'button', class: 'cbi-button cbi-button-action cb-sheet-expand',
					'aria-expanded': 'false',
					html: icon('sliders') + '<span>' + esc(t('Expand')) + '</span>'
				});
				const dockCancelBtn = h('button', { type: 'button', class: 'cbi-button', text: t('Cancel') });
				const dockSaveBtn = h('button', { type: 'button', class: 'cbi-button cbi-button-save', text: t('Save') });
				const dock = h('div', { class: 'cb-sheet-dock', role: 'region', 'aria-label': t('Customize dashboard'), inert: '' }, [
					expandBtn, dockCancelBtn, dockSaveBtn
				]);

				const presetItems = L.presets();
				const presetSeg = segmented(
					presetItems.map((p) => ({ value: p.id, label: t(p.label) })),
					L.matchPreset(draft),
					(id) => {
						const found = presetItems.find((p) => p.id === id);
						if (!found) return;
						const next = L.clone(found.layout);
						if (id === 'multi' && next.monitor.length >= 2 && next.monitor[1].type === 'traffic')
							next.monitor[1].source = secondaryDeviceFallback();
						Object.assign(draft, next);
						statusEl.textContent = '';
						applyDraft();
					},
					t('Preset')
				);

				const makeSwitch = (checked, disabled, label, onToggle) => {
					const input = h('input', { type: 'checkbox', 'aria-label': label });
					input.checked = !!checked;
					input.disabled = !!disabled;
					input.addEventListener('change', () => onToggle(input.checked));
					return h('div', { class: 'cbi-checkbox' }, [input, h('label')]);
				};
				const makeMoveBtn = (dir, disabled, label, onClick) => {
					const b = h('button', {
						type: 'button',
						class: 'cbi-button ' + (dir < 0 ? 'cbi-button-up' : 'cbi-button-down') + ' cb-sheet-ico-btn',
						title: label, 'aria-label': label, html: icon(dir < 0 ? 'chevup' : 'chevdown')
					});
					b.disabled = !!disabled;
					b.addEventListener('click', onClick);
					return b;
				};
				const swap = (arr, i, j) => { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; };

				function paintDrawer(animate) {
					const scrollTop = body.scrollTop;
					const doRowAnim = !!(animate && canWaapi() && !reducedMotion());
					const prevGroups = new Map();
					const prevRows = new Map();
					if (doRowAnim) {
						const br = body.getBoundingClientRect();
						body.querySelectorAll('[data-sec-key]').forEach((el) => {
							prevGroups.set(el.dataset.secKey, el.getBoundingClientRect().top - br.top + scrollTop);
						});
						body.querySelectorAll('[data-row-key]').forEach((el) => {
							prevRows.set(el.dataset.rowKey, el.getBoundingClientRect().top - br.top + scrollTop);
						});
					}
					closeListboxes();
					body.innerHTML = '';
					const onlyOne = L.countEnabled(draft) <= 1;
					const pickerInfo = buildTrafficPickerInfo();
					lastPickerKey = pickerInfo.key;

					/* presets */
					presetSeg._selectExact(L.matchPreset(draft));
					body.appendChild(h('div', { class: 'cb-sheet-presets' }, [
						h('span', { class: 'cb-sheet-label', text: t('Preset') }),
						presetSeg
					]));

					/* top banner toggle */
					body.appendChild(h('div', { class: 'cb-sheet-group' }, [
						h('div', { class: 'cb-sheet-row', 'data-row-key': 'hero' }, [
							h('span', { class: 'cb-ico', style: '--c:' + COLORS.indigo, html: icon('carbon') }),
							h('span', { class: 'cb-sheet-name', text: t('Router overview') }),
							makeSwitch(draft.hero, draft.hero && onlyOne, t('Router overview'), (on) => {
								if (!on && L.countEnabled(draft) <= 1) { statusEl.textContent = t('Keep at least one panel visible.'); paintDrawer(false); return; }
								draft.hero = on;
								statusEl.textContent = '';
								applyDraft(true);
							})
						])
					]));

					/* 3 reorderable tier sections */
					draft.sections.forEach((sec, secIdx) => {
						const rows = [];
						if (sec === 'monitor') {
							let tCount = 0;
							const seenSrc = Object.create(null);
							draft.monitor.forEach((m, idx) => {
								if (m.type === 'traffic') {
									tCount++;
									const src = m.source || 'auto';
									const occ = seenSrc[src] || 0;
									seenSrc[src] = occ + 1;
									const lb = listbox({
										options: pickerInfo.options, value: src,
										label: t('Traffic interface'), className: 'cb-sheet-select',
										onChange: (v) => { m.source = v; statusEl.textContent = ''; applyDraft(false); }
									});
									rowListboxes.push(lb);
									const rm = h('button', {
										type: 'button', class: 'cbi-button cbi-button-remove cb-sheet-ico-btn',
										title: t('Remove'), 'aria-label': t('Remove'), html: icon('close')
									});
									rm.disabled = onlyOne;
									rm.addEventListener('click', () => {
										if (L.countEnabled(draft) <= 1) { statusEl.textContent = t('Keep at least one panel visible.'); return; }
										draft.monitor.splice(idx, 1);
										statusEl.textContent = '';
										applyDraft(true);
									});
									rows.push(h('div', { class: 'cb-sheet-row cb-sheet-row-traffic', 'data-row-key': 'traffic:' + src + '#' + occ }, [
										h('span', { class: 'cb-ico', style: '--c:' + COLORS.blue, html: icon('chart') }),
										h('div', { class: 'cb-sheet-traffic-main' }, [
											h('span', { class: 'cb-sheet-name', text: t('Live Traffic') }),
											lb.el
										]),
										h('div', { class: 'cb-sheet-ctrl' }, [
											makeMoveBtn(-1, idx === 0, t('Move up'), () => { swap(draft.monitor, idx, idx - 1); applyDraft(true); }),
											makeMoveBtn(1, idx === draft.monitor.length - 1, t('Move down'), () => { swap(draft.monitor, idx, idx + 1); applyDraft(true); }),
											rm
										])
									]));
								}
								else {
									rows.push(h('div', { class: 'cb-sheet-row', 'data-row-key': 'resources' }, [
										h('span', { class: 'cb-ico', style: '--c:' + COLORS.purple, html: icon('cpu') }),
										h('span', { class: 'cb-sheet-name', text: t('Resources') }),
										h('div', { class: 'cb-sheet-ctrl' }, [
											makeMoveBtn(-1, idx === 0, t('Move up'), () => { swap(draft.monitor, idx, idx - 1); applyDraft(true); }),
											makeMoveBtn(1, idx === draft.monitor.length - 1, t('Move down'), () => { swap(draft.monitor, idx, idx + 1); applyDraft(true); }),
											makeSwitch(true, onlyOne, t('Resources'), (on) => {
												if (!on) {
													if (L.countEnabled(draft) <= 1) { statusEl.textContent = t('Keep at least one panel visible.'); paintDrawer(false); return; }
													draft.monitor.splice(idx, 1);
													statusEl.textContent = '';
													applyDraft(true);
												}
											})
										])
									]));
								}
							});
							if (!draft.monitor.some((m) => m.type === 'resources')) {
								rows.push(h('div', { class: 'cb-sheet-row is-off', 'data-row-key': 'resources' }, [
									h('span', { class: 'cb-ico', style: '--c:' + COLORS.gray, html: icon('cpu') }),
									h('span', { class: 'cb-sheet-name', text: t('Resources') }),
									makeSwitch(false, false, t('Resources'), (on) => {
										if (on) { draft.monitor.push({ type: 'resources' }); statusEl.textContent = ''; applyDraft(true); }
									})
								]));
							}
							const addBtn = h('button', {
								type: 'button', class: 'cbi-button cbi-button-add cb-sheet-add',
								html: icon('plus') + '<span>' + esc(t('Add live traffic')) + '</span>'
							});
							addBtn.disabled = tCount >= L.MAX_TRAFFIC;
							addBtn.addEventListener('click', () => {
								if (tCount >= L.MAX_TRAFFIC) return;
								const used = new Set(draft.monitor.filter((m) => m.type === 'traffic').map((m) => m.source));
								const nextSrc = used.has('auto') ? secondaryDeviceFallback() : 'auto';
								const resIdx = draft.monitor.findIndex((m) => m.type === 'resources');
								const entry = { type: 'traffic', source: nextSrc };
								if (resIdx >= 0) draft.monitor.splice(resIdx, 0, entry);
								else draft.monitor.push(entry);
								statusEl.textContent = '';
								applyDraft(true);
							});
							rows.push(h('div', { class: 'cb-sheet-add-row', 'data-row-key': 'monitor:add' }, [
								addBtn,
								h('span', { class: 'cb-sheet-count', text: tCount + ' / ' + L.MAX_TRAFFIC })
							]));
						}
						else {
							const active = sec === 'tiles' ? draft.tiles : draft.details;
							const catalog = sec === 'tiles' ? L.TILES : L.DETAILS;
							const metaMap = sec === 'tiles' ? TILE_META : DETAIL_META;
							active.forEach((k, idx) => {
								const m = metaMap[k];
								rows.push(h('div', { class: 'cb-sheet-row', 'data-row-key': sec + ':' + k }, [
									h('span', { class: 'cb-ico', style: '--c:' + COLORS[m.color], html: icon(m.icon) }),
									h('span', { class: 'cb-sheet-name', text: t(m.label) }),
									h('div', { class: 'cb-sheet-ctrl' }, [
										makeMoveBtn(-1, idx === 0, t('Move up'), () => { swap(active, idx, idx - 1); applyDraft(true); }),
										makeMoveBtn(1, idx === active.length - 1, t('Move down'), () => { swap(active, idx, idx + 1); applyDraft(true); }),
										makeSwitch(true, onlyOne, t(m.label), (on) => {
											if (!on) {
												if (L.countEnabled(draft) <= 1) { statusEl.textContent = t('Keep at least one panel visible.'); paintDrawer(false); return; }
												active.splice(idx, 1);
												statusEl.textContent = '';
												applyDraft(true);
											}
										})
									])
								]));
							});
							catalog.filter((k) => active.indexOf(k) < 0).forEach((k) => {
								const m = metaMap[k];
								rows.push(h('div', { class: 'cb-sheet-row is-off', 'data-row-key': sec + ':' + k }, [
									h('span', { class: 'cb-ico', style: '--c:' + COLORS.gray, html: icon(m.icon) }),
									h('span', { class: 'cb-sheet-name', text: t(m.label) }),
									makeSwitch(false, false, t(m.label), (on) => {
										if (on) { active.push(k); statusEl.textContent = ''; applyDraft(true); }
									})
								]));
							});
						}

						body.appendChild(h('div', { class: 'cb-sheet-group', 'data-sec-key': sec }, [
							h('div', { class: 'cb-sheet-group-head' }, [
								h('span', { class: 'cb-sheet-group-title', text: t(SECTION_META[sec]) }),
								h('div', { class: 'cb-sheet-ctrl' }, [
									makeMoveBtn(-1, secIdx === 0, t('Move up'), () => { swap(draft.sections, secIdx, secIdx - 1); applyDraft(true); }),
									makeMoveBtn(1, secIdx === draft.sections.length - 1, t('Move down'), () => { swap(draft.sections, secIdx, secIdx + 1); applyDraft(true); })
								])
							]),
							h('div', { class: 'cb-sheet-list' }, rows)
						]));
					});

					resetBtn.disabled = saving || L.isDefault(draft);
					saveBtn.disabled = saving;
					cancelBtn.disabled = saving;
					closeBtn.disabled = saving;
					collapseBtn.disabled = saving;
					expandBtn.disabled = saving;
					dockCancelBtn.disabled = saving;
					dockSaveBtn.disabled = saving;
					if (saving) body.setAttribute('inert', '');
					else body.removeAttribute('inert');
					body.scrollTop = scrollTop;

					if (doRowAnim && prevRows.size) {
						const br = body.getBoundingClientRect();
						const groupShift = new Map();
						body.querySelectorAll('[data-sec-key]').forEach((el) => {
							const sk = el.dataset.secKey;
							const prevTop = prevGroups.get(sk);
							if (prevTop == null) return;
							const dy = prevTop - (el.getBoundingClientRect().top - br.top + body.scrollTop);
							if (Math.abs(dy) > 2 && Math.abs(dy) < 520) {
								groupShift.set(sk, dy);
								el.animate([
									{ transform: 'translate3d(0,' + dy + 'px,0)' },
									{ transform: 'translate3d(0,0,0)' }
								], { duration: 240, easing: EASE_OUT });
							}
						});
						body.querySelectorAll('[data-row-key]').forEach((el) => {
							const rk = el.dataset.rowKey;
							const prevTop = prevRows.get(rk);
							if (prevTop == null) {
								el.animate([
									{ opacity: 0, transform: 'translate3d(0,-6px,0) scale(0.97)' },
									{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
								], { duration: 200, easing: EASE_OUT });
								return;
							}
							const parentGroup = el.closest('[data-sec-key]');
							const gDy = parentGroup ? (groupShift.get(parentGroup.dataset.secKey) || 0) : 0;
							const dy = (prevTop - (el.getBoundingClientRect().top - br.top + body.scrollTop)) - gDy;
							if (Math.abs(dy) > 2 && Math.abs(dy) < 360) {
								el.animate([
									{ transform: 'translate3d(0,' + dy + 'px,0)' },
									{ transform: 'translate3d(0,0,0)' }
								], { duration: 220, easing: EASE_OUT });
							}
						});
					}
				}

				function applyDraft(animate) {
					const anim = animate !== false;
					renderLayout(draft, anim);
					ensureFreshForLayout();
					paintDrawer(anim);
				}

				function setCollapsed(on) {
					on = !!on;
					if (collapsed === on) return;
					collapsed = on;
					if (drawer) drawer.collapsed = on;
					closeListboxes();
					scrim.classList.toggle('show', !on);
					sheet.classList.toggle('show', !on);
					sheet.classList.toggle('collapsed', on);
					dock.classList.toggle('show', on);
					collapseBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
					expandBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
					if (on) {
						sheet.setAttribute('inert', '');
						sheet.setAttribute('aria-hidden', 'true');
						dock.removeAttribute('inert');
						if (appEl) appEl.removeAttribute('inert');
						expandBtn.focus({ preventScroll: true });
					}
					else {
						sheet.removeAttribute('inert');
						sheet.removeAttribute('aria-hidden');
						dock.setAttribute('inert', '');
						if (appEl) appEl.setAttribute('inert', '');
						paintDrawer(false);
						collapseBtn.focus({ preventScroll: true });
					}
				}

				function close(commit) {
					if (!drawer) return;
					closeListboxes();
					document.removeEventListener('keydown', onKey);
					scrim.remove();
					sheet.remove();
					dock.remove();
					document.body.classList.remove('cb-sheet-open');
					if (appEl) appEl.removeAttribute('inert');
					drawer = null;
					if (!commit) {
						renderLayout(savedLayout, true);
						ensureFreshForLayout();
					}
					if (opener && opener.offsetParent !== null) opener.focus({ preventScroll: true });
				}

				async function doSave() {
					if (saving) return;
					saving = true;
					statusEl.textContent = t('Saving…');
					paintDrawer();
					try {
						await persistLayout(draft);
						saving = false;
						close(true);
					}
					catch (err) {
						saving = false;
						statusEl.textContent = (err && err.code === 'denied')
							? t('Permission denied. Log out and log in again once after updating Carbon, then retry.')
							: (err && err.code === 'invalid_dashboard' ? t('Invalid dashboard layout.') : t('Failed to save layout.'));
						if (collapsed) setCollapsed(false);
						else paintDrawer();
					}
				}

				const onKey = (e) => {
					if (e.key === 'Escape' && !saving && !collapsed) { e.preventDefault(); close(false); }
				};

				resetBtn.addEventListener('click', () => {
					if (saving) return;
					Object.assign(draft, L.defaultLayout());
					statusEl.textContent = '';
					applyDraft();
				});
				collapseBtn.addEventListener('click', () => { if (!saving) setCollapsed(true); });
				expandBtn.addEventListener('click', () => { if (!saving) setCollapsed(false); });
				cancelBtn.addEventListener('click', () => { if (!saving) close(false); });
				dockCancelBtn.addEventListener('click', () => { if (!saving) close(false); });
				closeBtn.addEventListener('click', () => { if (!saving) close(false); });
				scrim.addEventListener('click', () => { if (!saving) setCollapsed(true); });
				saveBtn.addEventListener('click', doSave);
				dockSaveBtn.addEventListener('click', doSave);

				drawer = {
					draft: draft,
					collapsed: false,
					isSaving: () => saving,
					expand: () => setCollapsed(false),
					sync: () => paintDrawer(false),
					refreshSources: () => {
						if (!drawer || saving) return;
						const info = buildTrafficPickerInfo();
						if (info.key === lastPickerKey) return;
						if (rowListboxes.some((lb) => lb.el.getAttribute('aria-expanded') === 'true')) return;
						lastPickerKey = info.key;
						const trafficItems = draft.monitor.filter((m) => m.type === 'traffic');
						rowListboxes.forEach((lb, i) => {
							const src = trafficItems[i] ? trafficItems[i].source : 'auto';
							const pick = info.groups.find((g) => g.dev === src) || info.devices.find((d) => d.dev === src);
							lb.setOptions(info.options, pick ? pick.dev : 'auto');
						});
					}
				};
				paintDrawer();
				document.body.appendChild(scrim);
				document.body.appendChild(sheet);
				document.body.appendChild(dock);
				document.body.classList.add('cb-sheet-open');
				if (appEl) appEl.setAttribute('inert', '');
				document.addEventListener('keydown', onKey);
				requestAnimationFrame(() => {
					scrim.classList.add('show');
					sheet.classList.add('show');
					closeBtn.focus({ preventScroll: true });
				});
			}

			host._cbCustomize = openCustomizer;
			renderLayout(activeLayout);

			/* poll with setTimeout chains; pause while the tab is hidden */
			const loop = (fn, ms) => {
				const run = () => {
					const p = document.hidden ? Promise.resolve() : fn().catch((e) => { if (window.console) console.warn('[carbon]', e); });
					p.then(() => setTimeout(run, ms));
				};
				run();
			};

			if (computeNeeds(activeLayout).board) safe(P.board).then((b) => { if (b) { st.board = b; paintBoard(); } });
			slow().then(() => {
				loop(fast, 2000);
				setTimeout(() => loop(slow, 10000), 10000);
			});
			loop(mid, 5000);
			if (typeof P.deviceTraffic === 'function') loop(readDeviceRates, 5000);

			if (window.location && window.location.hash === '#customize') {
				if (window.history && window.history.replaceState)
					window.history.replaceState(null, '', window.location.pathname + window.location.search);
				setTimeout(() => openCustomizer(host.querySelector('.cb-customize-btn')), 0);
			}

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
		const items = [btn];
		if (host && typeof host._cbCustomize === 'function') {
			const customBtn = h('button', {
				type: 'button',
				class: 'cb-details-btn cb-customize-btn',
				html: icon('sliders') + '<span>' + esc(t('Customize')) + '</span>'
			});
			customBtn.addEventListener('click', () => host._cbCustomize(customBtn));
			items.push(customBtn);
		}
		const bar = h('div', { class: 'cb-details-bar' }, items);
		host.appendChild(bar);
		return bar;
	};

})(window, document);
