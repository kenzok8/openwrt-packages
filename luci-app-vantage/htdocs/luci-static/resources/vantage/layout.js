'use strict';
'require baseclass';

/* Dashboard layout: which tiles show, where and how wide, per screen
   class. The view measures the tiles and positions them; this module
   only holds the rules. Pure functions.

   A layout is a list of { id, c, w, hide } in reading order: the tile
   starts in column c and spans w columns. Each tile goes below what
   earlier tiles left in its columns, so a column keeps its tiles
   whatever their heights, and a short tile never stretches a tall
   neighbour. */

var TILES = [ 'hero', 'chart', 'radios', 'clients', 'sys', 'talk', 'ssids' ];

/* tiles that only exist with Wi-Fi (Clients lists wired hosts too) */
var WIFI = { radios: true, talk: true, ssids: true };

var COLS = { wide: 4, mid: 2, narrow: 1 };

/* narrowest each tile may get, in columns of that screen class */
var MIN = {
	wide: { hero: 3, chart: 2, clients: 2 },
	mid: { hero: 2 }
};

/* tiles whose content grows to fill a taller slot */
var FLEX = { chart: true, radios: true };

/* how far a tile stretches to line up with the tile below it */
var SNAP = 48;

/* [ id, column, width ] */
var DEFAULTS = {
	wide: [ [ 'hero', 0, 4 ], [ 'chart', 0, 2 ], [ 'radios', 2, 2 ], [ 'clients', 0, 3 ], [ 'sys', 3, 1 ], [ 'talk', 3, 1 ], [ 'ssids', 3, 1 ] ],
	mid: [ [ 'hero', 0, 2 ], [ 'radios', 0, 2 ], [ 'clients', 0, 2 ], [ 'chart', 0, 2 ], [ 'sys', 0, 1 ], [ 'talk', 1, 1 ], [ 'ssids', 1, 1 ] ],
	narrow: [ [ 'clients', 0, 1 ], [ 'talk', 0, 1 ], [ 'radios', 0, 1 ], [ 'hero', 0, 1 ], [ 'ssids', 0, 1 ], [ 'chart', 0, 1 ], [ 'sys', 0, 1 ] ]
};
var DEFAULTS_WIRED = {
	wide: [ [ 'hero', 0, 4 ], [ 'chart', 0, 3 ], [ 'sys', 3, 1 ], [ 'clients', 0, 4 ] ],
	mid: [ [ 'hero', 0, 2 ], [ 'chart', 0, 2 ], [ 'sys', 0, 2 ], [ 'clients', 0, 2 ] ],
	narrow: [ [ 'hero', 0, 1 ], [ 'clients', 0, 1 ], [ 'chart', 0, 1 ], [ 'sys', 0, 1 ] ]
};

function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
function int(v, d) { v = Math.round(+v); return isFinite(v) ? v : d; }

return baseclass.extend({
	TILES: TILES,
	SNAP: SNAP,

	/* screen class for a layout width; the breakpoints match app.css */
	tier: function(width) {
		return width >= 1100 ? 'wide' : width >= 700 ? 'mid' : 'narrow';
	},

	cols: function(tier) { return own(COLS, tier) ? COLS[tier] : 1; },

	/* the storage key of a layout: Wi-Fi and wired devices differ */
	key: function(tier, wired) { return tier + (wired ? '-wired' : ''); },

	available: function(id, wired) { return TILES.indexOf(id) >= 0 && !(wired && WIFI[id]); },

	minW: function(id, tier) {
		var m = own(MIN, tier) && own(MIN[tier], id) ? MIN[tier][id] : 1;
		return Math.min(m, this.cols(tier));
	},

	/* a tile with its width in range and its column inside the grid */
	fit: function(e, tier) {
		var n = this.cols(tier);
		var w = Math.max(this.minW(e.id, tier), Math.min(n, int(e.w, 1)));
		var c = Math.max(0, Math.min(n - w, int(e.c, 0)));
		return { id: e.id, c: c, w: w, hide: e.hide === true };
	},

	defaults: function(tier, wired) {
		var src = own(DEFAULTS, tier) ? (wired ? DEFAULTS_WIRED : DEFAULTS)[tier] : DEFAULTS.narrow;
		var self = this;
		return src.map(function(d) { return self.fit({ id: d[0], c: d[1], w: d[2] }, tier); });
	},

	/* a stored layout made safe: known tiles only, each once, sizes in
	   range, tiles it does not mention added after the tile that
	   precedes them by default */
	normalize: function(saved, tier, wired) {
		var self = this, seen = Object.create(null), out = [];
		var def = this.defaults(tier, wired);
		if (!Array.isArray(saved)) return def;
		saved.slice(0, 32).forEach(function(e) {
			if (!e || typeof e !== 'object' || typeof e.id !== 'string' || seen[e.id] || !self.available(e.id, wired)) return;
			seen[e.id] = true;
			out.push(self.fit(e, tier));
		});
		if (!out.length) return def;
		def.forEach(function(d, i) {
			if (seen[d.id]) return;
			var at = 0;
			for (var j = i - 1; j >= 0; j--) {
				var k = self.indexOf(out, def[j].id);
				if (k >= 0) { at = k + 1; break; }
			}
			out.splice(at, 0, d);
		});
		if (!out.some(function(e) { return !e.hide; })) out[0].hide = false;
		return out;
	},

	/* the option of a layout in /etc/config/vantage_theme */
	option: function(key) { return 'layout_' + key.replace('-', '_'); },

	/* a layout as that option's value: 'hero:0:4 chart:0:2:h' */
	encode: function(list) {
		return list.filter(function(e) { return e && typeof e === 'object'; })
			.map(function(e) { return e.id + ':' + e.c + ':' + e.w + (e.hide ? ':h' : ''); }).join(' ');
	},

	/* the template's data-vt-look-layout, 'wide=hero:0:4 chart:0:2:h;mid=default',
	   as { wide: [ ... ], mid: null }: null is the default layout. Lists go
	   through normalize like any stored layout. */
	decode: function(text) {
		var out = Object.create(null);
		String(text || '').split(';').forEach(function(part) {
			var m = /^(wide|mid|narrow)(_wired)?=(.+)$/.exec(part);
			if (!m) return;
			out[m[1] + (m[2] ? '-wired' : '')] = m[3] === 'default' ? null : m[3].split(' ').map(function(t) {
				var f = t.split(':'), e = { id: f[0], c: int(f[1], 0), w: int(f[2], 1) };
				if (f[3] === 'h') e.hide = true;
				return e;
			});
		});
		return out;
	},

	/* this browser's layouts with the router's (decode): the router's
	   first for a login that may save there, for any other only where
	   this browser has none */
	merge: function(mine, saved, first) {
		var out = Object.create(null);
		Object.keys(mine).forEach(function(k) { out[k] = mine[k]; });
		Object.keys(saved).forEach(function(k) {
			if (!first && own(out, k)) return;
			if (saved[k]) out[k] = saved[k];
			else delete out[k];
		});
		return out;
	},

	/* what is worth storing */
	compact: function(list) {
		return list.map(function(e) { var o = { id: e.id, c: e.c, w: e.w }; if (e.hide) o.hide = true; return o; });
	},

	same: function(a, b) {
		return a.length === b.length && a.every(function(e, i) {
			return e.id === b[i].id && e.c === b[i].c && e.w === b[i].w && !!e.hide === !!b[i].hide;
		});
	},

	indexOf: function(list, id) {
		for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
		return -1;
	},

	copy: function(list) { return list.map(function(e) { return { id: e.id, c: e.c, w: e.w, hide: !!e.hide }; }); },

	/* swap with the next shown tile before (-1) or after (+1) */
	move: function(list, id, dir) {
		var out = this.copy(list), i = this.indexOf(out, id);
		if (i < 0) return out;
		for (var j = i + dir; j >= 0 && j < out.length; j += dir) {
			if (out[j].hide) continue;
			var t = out.splice(i, 1)[0];
			out.splice(j, 0, t);
			break;
		}
		return out;
	},

	/* one column left (-1) or right (+1) */
	shift: function(list, id, dc, tier) {
		var self = this;
		return this.copy(list).map(function(e) { return e.id === id ? self.fit({ id: e.id, c: e.c + dc, w: e.w, hide: e.hide }, tier) : e; });
	},

	/* wider or narrower; a tile at the right edge grows to the left */
	resize: function(list, id, dw, tier) {
		var self = this, n = this.cols(tier);
		return this.copy(list).map(function(e) {
			if (e.id !== id) return e;
			var w = Math.max(self.minW(id, tier), Math.min(n, e.w + dw));
			return self.fit({ id: id, c: Math.min(e.c, n - w), w: w, hide: e.hide }, tier);
		});
	},

	/* dragging: put a tile in column c, before or after another tile */
	drop: function(list, id, c, target, after, tier) {
		var out = this.copy(list), i = this.indexOf(out, id);
		if (i < 0) return out;
		var t = this.fit({ id: id, c: c, w: out[i].w, hide: out[i].hide }, tier);
		out.splice(i, 1);
		var j = target != null && target !== id ? this.indexOf(out, target) : -1;
		if (j < 0) out.splice(i, 0, t);
		else out.splice(after ? j + 1 : j, 0, t);
		return out;
	},

	/* hiding keeps the tile's place, so showing it again restores it;
	   the last shown tile cannot be hidden */
	setHidden: function(list, id, hide) {
		var out = this.copy(list), i = this.indexOf(out, id);
		if (i < 0) return out;
		if (hide && out.filter(function(e) { return !e.hide; }).length <= 1) return out;
		out[i].hide = !!hide;
		return out;
	},

	/* a tile's height between polls: it grows at once but shrinks only
	   after its content stayed smaller for HOLD_MS, so a talker or a
	   client dropping out for one poll doesn't move the page. prev is
	   the last { h, since } (or null); returns the next one */
	HOLD_MS: 30000,
	settle: function(prev, natural, now) {
		if (!prev || natural >= prev.h) return { h: natural, since: null };
		var since = prev.since == null ? now : prev.since;
		if (now - since >= this.HOLD_MS) return { h: natural, since: null };
		return { h: prev.h, since: since };
	},

	/* ms until the earliest held height may be released (0 when one is
	   already due), or null when nothing is held */
	nextRelease: function(held, now) {
		var next = null, self = this;
		Object.keys(held || {}).forEach(function(id) {
			var s = held[id];
			if (!s || s.since == null) return;
			var left = Math.max(0, s.since + self.HOLD_MS - now);
			if (next == null || left < next) next = left;
		});
		return next;
	},

	/* where shown tiles go. items: [{ id, c, w, h }] in order, h measured;
	   returns { rects: { id: { c, w, top, h } }, height }. A tile that
	   ends a little above the next one in its columns stretches to meet
	   it (any amount for FLEX tiles), so neighbours line up. */
	pack: function(items, cols, gap) {
		var bottoms = [], last = [], rects = Object.create(null), c, i;
		for (c = 0; c < cols; c++) { bottoms.push(0); last.push(null); }

		/* only a tile with nothing under it in any of its columns, or it
		   would grow over that tile */
		function stretch(col, top) {
			var id = last[col], r = id && rects[id];
			if (!r) return;
			var g = top - bottoms[col];
			if (g <= 0 || !(FLEX[id] || g <= SNAP)) return;
			for (var j = r.c; j < r.c + r.w; j++) if (last[j] !== id) return;
			r.h += g;
			for (var k = r.c; k < r.c + r.w; k++)
				if (last[k] === id) bottoms[k] = r.top + r.h + gap;
		}

		items.forEach(function(it) {
			var w = Math.max(1, Math.min(cols, it.w | 0)), at = Math.max(0, Math.min(cols - w, it.c | 0)), top = 0;
			for (i = at; i < at + w; i++) top = Math.max(top, bottoms[i]);
			for (i = at; i < at + w; i++) stretch(i, top);
			rects[it.id] = { c: at, w: w, top: top, h: Math.max(0, +it.h || 0) };
			for (i = at; i < at + w; i++) { bottoms[i] = top + rects[it.id].h + gap; last[i] = it.id; }
		});

		var end = Math.max.apply(null, bottoms);
		for (c = 0; c < cols; c++) stretch(c, end);
		end = Math.max.apply(null, bottoms);
		return { rects: rects, height: Math.max(0, end - gap) };
	}
});
