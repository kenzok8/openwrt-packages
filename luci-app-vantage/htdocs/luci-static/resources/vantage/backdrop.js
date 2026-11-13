'use strict';
'require baseclass';

/* The network path's backdrop: one canvas behind the nodes and wires, in
   the style the viewer picked under Customize. The two styles are the
   login page's (luci-theme-vantage login.js), here driven by the live
   uplink rate:
     grid    packets on the tile's dot grid: downloads enter from the
             gateway's side and run right, uploads come back, now and then
             a packet steps a row up or down; how many and how fast
             follows the rate
     stars   a starfield streaming out of this device's node, faster with
             more traffic
     none    the dot grid alone
   It draws over the path's height only (not under the numbers below),
   20 frames a second while the traffic is light and up to 30 as it
   grows (it is the frames, not the drawing, that cost), and stops
   while another window has the focus (as the login page does), the
   tab is hidden, or the tile is scrolled out of view or folded. With
   reduced motion it draws one still frame. No libraries; the pure
   parts are exported for tests. */

var STYLES = [ 'grid', 'stars', 'none' ];
var GRID = 18, DOT = 1;     /* app.css .vt-hero::before: 18 px tiles, a dot at 1 px */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* bit/s -> 0 (10 kbit/s or less) .. 1 (1 Gbit/s or more), one fifth per
   decade */
function level(bps) {
	return bps > 1e4 ? clamp(Math.log(bps / 1e4) / Math.LN10 / 5, 0, 1) : 0;
}

/* the share of packets going right (downloads), kept between a sixth and
   nine tenths so either direction stays visible; 0.7 before any rate */
function downShare(down, up) {
	var d = +down || 0, u = +up || 0;
	return d + u > 0 ? clamp(d / (d + u), 0.16, 0.9) : 0.7;
}

/* packets in a w x h area at a level: a couple when idle, about one per
   14,000 px² at the top (six to 36) */
function packetCount(w, h, lvl) {
	var top = clamp(Math.round(w * h / 14000), 6, 36);
	return Math.round(2 + (top - 2) * clamp(lvl, 0, 1));
}

/* px per second along the grid */
function packetSpeed(lvl) { return 45 + 175 * clamp(lvl, 0, 1); }

/* depth per second of the starfield */
function starSpeed(lvl) { return 0.03 + 0.32 * clamp(lvl, 0, 1); }

/* ms between frames: 50 (20 a second) up to 100 kbit/s, where a packet
   moves a few px a frame, down to 33 (30 a second) from 10 Mbit/s */
function frameMs(lvl) { return Math.round(50 - 17 * clamp((lvl - .2) / .4, 0, 1)); }

/* ---------------------------------------------------------------- grid */

function packets(env) {
	var SHADES = 5, ALPHA = [ .6, .36, .2, .1, .04 ];
	var DIRS = [ [ 1, 0 ], [ 0, 1 ], [ -1, 0 ], [ 0, -1 ] ];
	var list = [];

	/* lattice lines inside the band: x = DOT + GRID * i */
	function line(v) { return DOT + GRID * v; }
	function firstIn(lo) { return Math.ceil((lo - DOT) / GRID); }
	function lastIn(hi) { return Math.floor((hi - DOT) / GRID); }

	function spawn(p, anywhere) {
		var b = env.box, r0 = firstIn(b.t + 4), r1 = lastIn(b.b - 4), c0 = firstIn(0), c1 = lastIn(env.w);
		if (r1 < r0) r1 = r0;
		var main = Math.random() < env.share ? 0 : 2;
		var row = r0 + Math.floor(Math.random() * (r1 - r0 + 1));
		var col = anywhere ? c0 + Math.floor(Math.random() * (c1 - c0 + 1)) : main === 0 ? c0 - 2 : c1 + 2;
		p.main = main; p.d = main; p.x = line(col); p.y = line(row); p.pts = [ [ p.x, p.y ] ];
		p.v = env.speed * (0.7 + Math.random() * 0.6);
		p.len = clamp(p.v * 0.45, 28, 120);
		p.next = GRID; p.retire = false;
		return p;
	}

	/* drops the corners behind the end of the trail; returns its tail */
	function trim(p) {
		var left = p.len, hx = p.x, hy = p.y;
		for (var k = p.pts.length - 1; k >= 0; k--) {
			var q = p.pts[k], seg = Math.abs(hx - q[0]) + Math.abs(hy - q[1]);
			if (seg >= left) {
				if (k > 0) p.pts.splice(0, k);
				return [ hx + (q[0] - hx) * left / (seg || 1), hy + (q[1] - hy) * left / (seg || 1) ];
			}
			left -= seg; hx = q[0]; hy = q[1];
		}
		return [ hx, hy ];
	}

	/* at a crossing: off the main line now and then, back onto it soon;
	   never out of the band */
	function turn(p) {
		var b = env.box;
		if (p.d === 0 || p.d === 2) {
			if (Math.random() < 0.16) {
				var d = Math.random() < 0.5 ? 1 : 3, ny = p.y + DIRS[d][1] * GRID;
				if (ny < b.t + 4 || ny > b.b - 4) d = 4 - d;
				p.pts.push([ p.x, p.y ]); p.d = d;
			}
		}
		else {
			var ny2 = p.y + DIRS[p.d][1] * GRID;
			if (Math.random() < 0.55 || ny2 < b.t + 4 || ny2 > b.b - 4) { p.pts.push([ p.x, p.y ]); p.d = p.main; }
		}
	}

	return {
		/* the count follows the level: new packets enter at an edge,
		   extra ones finish their run; a finishing one is called back
		   before a new one is made, so the list never outgrows the
		   largest count, also while nothing moves */
		resize: function(initial) {
			var n = env.count, live = 0, i;
			list.forEach(function(p) { if (!p.retire) live++; });
			if (initial) { list.length = 0; live = 0; }
			for (i = 0; i < list.length && live > n; i++) if (!list[i].retire) { list[i].retire = true; live--; }
			for (i = 0; i < list.length && live < n; i++) if (list[i].retire) { list[i].retire = false; live++; }
			while (live < n) { list.push(spawn({}, !!initial)); live++; }
		},
		step: function(dt) {
			var b = env.box, m = 3 * GRID;
			for (var i = 0; i < list.length; i++) {
				var p = list[i], go = p.v * dt;
				while (go > 0) {
					var s = Math.min(go, p.next);
					p.x += DIRS[p.d][0] * s; p.y += DIRS[p.d][1] * s; p.next -= s; go -= s;
					if (p.next <= 0) { p.next = GRID; turn(p); }
				}
				var tail = trim(p);
				if ((p.x < -m || p.x > env.w + m) && (tail[0] < -m || tail[0] > env.w + m)) {
					if (p.retire) { list.splice(i, 1); i--; }
					else spawn(p, false);
				}
				/* a band that shrank under a packet */
				else if (p.y < b.t - GRID || p.y > b.b + GRID) spawn(p, false);
			}
		},
		draw: function(ctx) {
			var shade = [], heads = new Path2D(), glow = new Path2D();
			for (var k = 0; k < SHADES; k++) shade.push(new Path2D());
			for (var i = 0; i < list.length; i++) {
				var p = list[i], hx = p.x, hy = p.y, run = 0, piece = p.len / SHADES;
				for (var j = p.pts.length - 1, n = 0; j >= 0 && n < SHADES; j--) {
					var q = p.pts[j], seg = Math.abs(hx - q[0]) + Math.abs(hy - q[1]), at = 0;
					while (at < seg && n < SHADES) {
						var take = Math.min(seg - at, piece * (n + 1) - run), t0 = at / (seg || 1), t1 = (at + take) / (seg || 1);
						shade[n].moveTo(hx + (q[0] - hx) * t0, hy + (q[1] - hy) * t0);
						shade[n].lineTo(hx + (q[0] - hx) * t1, hy + (q[1] - hy) * t1);
						at += take; run += take;
						if (run >= piece * (n + 1) - .01) n++;
					}
					hx = q[0]; hy = q[1];
				}
				heads.rect(p.x - 1.25, p.y - 1.25, 2.5, 2.5);
				glow.rect(p.x - 3.5, p.y - 3.5, 7, 7);
			}
			ctx.strokeStyle = ctx.fillStyle = env.colour;
			ctx.lineWidth = 1.25;
			for (var s = 0; s < SHADES; s++) { ctx.globalAlpha = ALPHA[s]; ctx.stroke(shade[s]); }
			ctx.globalAlpha = .12; ctx.fill(glow);
			ctx.globalAlpha = .8; ctx.fill(heads);
			ctx.globalAlpha = 1;
		},
		size: function() { return list.length; },
		/* for tests */
		items: function() { return list; }
	};
}

/* --------------------------------------------------------------- stars */

function starfield(env) {
	var TRAIL = .1, WIDTH = [ .8, 1, 1.3 ], ALPHA = [ .2, .32, .45 ];
	/* it starts fast and settles to the rate's speed, as on the login page */
	var list = [], speed = 0.45, f = 1;

	function place(s, z) {
		var a = Math.random() * 2 * Math.PI, r = .03 + Math.sqrt(Math.random()) * .97;
		s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; s.z = z; s.c = Math.random() < .25 ? 1 : 0;
		return s;
	}

	return {
		resize: function() {
			f = Math.max(env.w, env.box.b - env.box.t) * .12;
			var n = clamp(Math.round(env.w * (env.box.b - env.box.t) / 7000), 24, 160);
			while (list.length < n) list.push(place({}, .05 + Math.random() * .95));
			list.length = n;
		},
		step: function(dt) {
			speed += (env.speed - speed) * Math.min(1, dt * 1.5);
			var o = env.origin, b = env.box;
			for (var i = 0; i < list.length; i++) {
				var s = list[i];
				s.z -= speed * dt;
				var px = o.x + s.x * f / s.z, py = o.y + s.y * f / s.z;
				if (s.z <= .02 || px < -20 || px > env.w + 20 || py < b.t - 20 || py > b.b + 20) place(s, .8 + Math.random() * .2);
			}
		},
		draw: function(ctx) {
			var o = env.origin, paths = [ new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D() ];
			for (var i = 0; i < list.length; i++) {
				var s = list[i], z0 = Math.min(1, s.z + speed * TRAIL + .004);
				var p = paths[(s.z > .5 ? 0 : s.z > .2 ? 1 : 2) * 2 + s.c];
				p.moveTo(o.x + s.x * f / z0, o.y + s.y * f / z0);
				p.lineTo(o.x + s.x * f / s.z, o.y + s.y * f / s.z);
			}
			ctx.lineCap = 'round';
			for (var k = 0; k < 6; k++) {
				ctx.globalAlpha = ALPHA[k >> 1];
				ctx.lineWidth = WIDTH[k >> 1];
				ctx.strokeStyle = (k & 1) ? env.colour : env.muted;
				ctx.stroke(paths[k]);
			}
			ctx.globalAlpha = 1;
		},
		size: function() { return list.length; },
		/* for tests */
		items: function() { return list; }
	};
}

/* ---------------------------------------------------------- the canvas */

/* host: the tile (the canvas covers its padding box, as the dot grid);
   band: the element whose height it draws over; style: one of STYLES.
   opts.external: no frame loop of its own; the caller's clock asks for
   each frame with frame(t) and takes the rate from period(), so the
   backdrop, the flow dots and the pulses share one frame (overview.js
   tickMotion) */
function mount(host, band, style, opts) {
	var external = !!(opts && opts.external), live = false;
	var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
	var env = { w: 0, h: 0, box: { t: 0, b: 0 }, origin: { x: 0, y: 0 }, count: 2, speed: packetSpeed(0), share: 0.7, frame: frameMs(0), colour: '#7a9a3a', muted: '#8a9099' };
	var down = null, up = null, originEl = null;
	var scene = null, cur = 'none', raf = 0, timer = 0, last = 0, dpr = 1, inView = true, hidden = false, still = false, paused = false, mq = null;
	var focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
	var ro = null, io = null, onMq = null, stillRated = false, mo = null, scheme = null, onScheme = null, stale = false, coloured = false;

	cv.className = 'vt-backdrop';
	cv.setAttribute('aria-hidden', 'true');
	if (!ctx || typeof Path2D !== 'function') return { style: function() {}, update: function() {}, stop: function() {}, canvas: null, frame: function() { return false; }, wants: function() { return false; }, period: function() { return 50; } };
	host.insertBefore(cv, host.firstChild);

	if (window.matchMedia) {
		mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		still = !!mq.matches;
		onMq = function() { still = !!mq.matches; run(); paint(); };
		if (mq.addEventListener) mq.addEventListener('change', onMq);
	}

	/* a colour token of the app (set on .vt-app, often a color-mix())
	   as the canvas takes it: the computed colour of the canvas element,
	   kept only when the context parses it */
	function token(name, fallback) {
		var v = '';
		try { cv.style.color = 'var(' + name + ')'; v = getComputedStyle(cv).color; } catch (e) { v = ''; }
		if (!v || !cv.isConnected) return fallback;
		ctx.fillStyle = '#010203';
		ctx.fillStyle = v;
		return ctx.fillStyle !== '#010203' ? v : fallback;
	}

	/* read once the canvas is in the page (mounted before, it has none),
	   then again on a theme switch only */
	function colours() {
		env.colour = token('--vt-accent-line', env.colour);
		env.muted = token('--vt-text-3', env.muted);
		coloured = !!cv.isConnected;
	}

	function measure() {
		var hr = host.getBoundingClientRect(), br = band.getBoundingClientRect();
		var ox = hr.left + host.clientLeft, oy = hr.top + host.clientTop;
		env.w = host.clientWidth; env.h = host.clientHeight;
		env.box = { t: Math.max(0, br.top - oy), b: Math.min(env.h, br.bottom - oy) };
		if (originEl) {
			var r = originEl.getBoundingClientRect();
			env.origin = { x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy };
		}
		else env.origin = { x: env.w / 2, y: (env.box.t + env.box.b) / 2 };
	}

	function load() {
		var lvl = level((+down || 0) + (+up || 0));
		env.count = packetCount(env.w, env.box.b - env.box.t, lvl);
		env.speed = cur === 'stars' ? starSpeed(lvl) : packetSpeed(lvl);
		env.share = downShare(down, up);
		env.frame = frameMs(lvl);
	}

	function usable() { return cur !== 'none' && env.w > 40 && env.box.b - env.box.t > 40; }

	/* the scene to the size and level: built across the band the first
	   time it has room and run for a moment, so the trails are there;
	   adjusted after that. A still frame is built once more when the
	   first rate is in, and then left alone. */
	function fit(initial) {
		if (!scene || !usable()) return;
		var rated = down != null || up != null;
		if (initial || !scene.size() || (still && rated && !stillRated)) {
			stillRated = still && rated;
			scene.resize(true);
			for (var i = 0; i < 12; i++) scene.step(.05);
		}
		else if (!still) scene.resize(false);
	}

	/* a poll's rate and geometry: read with the frame drawn, not between
	   the poll's own DOM writes, where the read would make the browser lay
	   the page out an extra time */
	function refit() {
		stale = false;
		measure();
		load();
		fit(false);
		if (still) paint();
	}

	function size(initial) {
		stale = false;
		measure();
		dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		cv.width = Math.round(env.w * dpr); cv.height = Math.round(env.h * dpr);
		cv.style.width = env.w + 'px'; cv.style.height = env.h + 'px';
		load();
		fit(initial);
		paint();
	}

	function paint() {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, env.w, env.h);
		if (!scene || !usable()) return;
		ctx.save();
		ctx.beginPath(); ctx.rect(0, env.box.t, env.w, env.box.b - env.box.t); ctx.clip();
		scene.draw(ctx);
		ctx.restore();
	}

	/* one frame, then a wait: the browser is asked only for the frames
	   that are drawn (not one per display refresh), and they stay on its
	   frame clock; the clock starts when the loop does */
	function tick(t) {
		raf = 0;
		if (!running()) return;
		if (stale) refit();
		scene.step(clamp((t - last) / 1000, 0, .1));
		last = t;
		paint();
		/* the wait ends a little early, the browser's next frame is the one */
		timer = setTimeout(again, Math.max(0, env.frame - 12));
	}
	function again() { timer = 0; if (running() && !raf) raf = requestAnimationFrame(tick); }

	function running() { return !!scene && !still && !paused && !hidden && focused && inView && usable(); }
	function halt() {
		if (raf) cancelAnimationFrame(raf);
		if (timer) clearTimeout(timer);
		raf = timer = 0;
	}
	function run() {
		/* on the caller's clock: only whether the next frame(t) draws */
		if (external) { var on = running(); if (on && !live) last = performance.now(); live = on; return; }
		if (running()) { if (!raf && !timer) { last = performance.now(); raf = requestAnimationFrame(tick); } }
		else halt();
	}
	/* one frame at the caller's time t (external); false when there is
	   nothing to draw, so the caller's clock can rest */
	function frame(t) {
		if (!running()) { live = false; return false; }
		if (!live) { live = true; last = t; }
		if (stale) refit();
		scene.step(clamp((t - last) / 1000, 0, .1));
		last = t;
		paint();
		return true;
	}

	function setStyle(s) {
		s = STYLES.indexOf(s) >= 0 ? s : 'grid';
		if (s === cur && scene) return;
		cur = s;
		scene = s === 'grid' ? packets(env) : s === 'stars' ? starfield(env) : null;
		cv.hidden = !scene;
		colours();
		size(true);
		run();
	}

	if (typeof ResizeObserver === 'function') {
		ro = new ResizeObserver(function() { size(false); run(); });
		ro.observe(host);
		ro.observe(band);
	}
	if (typeof IntersectionObserver === 'function') {
		io = new IntersectionObserver(function(es) { inView = es.some(function(e) { return e.isIntersecting; }); run(); });
		io.observe(host);
	}
	/* a theme switch (the theme's data-darkmode / data-theme, or the
	   system's scheme): the new colours at once, not at the next poll */
	onScheme = function() { colours(); if (!running()) paint(); };
	if (typeof MutationObserver === 'function') {
		mo = new MutationObserver(onScheme);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-darkmode', 'data-theme' ] });
	}
	if (window.matchMedia) {
		scheme = window.matchMedia('(prefers-color-scheme: dark)');
		if (scheme.addEventListener) scheme.addEventListener('change', onScheme);
	}
	var onVis = function() { hidden = !!document.hidden; run(); };
	document.addEventListener('visibilitychange', onVis);
	/* another window has the focus: the last frame stays */
	var onBlur = function() { focused = false; run(); }, onFocus = function() { focused = true; run(); };
	window.addEventListener('blur', onBlur);
	window.addEventListener('focus', onFocus);

	setStyle(style);

	return {
		canvas: cv,
		style: setStyle,
		/* each poll: the uplink's rate (bit/s each way) and the node the
		   stars stream from; the colours follow a theme switch */
		/* (the colours follow a theme switch, onScheme) */
		update: function(o) {
			o = o || {};
			down = o.down; up = o.up;
			if (o.origin !== undefined) originEl = o.origin;
			stale = true;
			if (!coloured) colours();
			/* a still frame: at the next frame, after the poll's own DOM
			   writes (measuring here would lay the page out an extra
			   time); nothing to draw (none, folded, out of view): nothing
			   read, the resize observer measures */
			if (still && scene && !raf) raf = requestAnimationFrame(function() { raf = 0; if (still && scene && stale) refit(); });
			run();
		},
		running: running,
		/* external: draw one frame now; whether the next one is wanted;
		   ms between frames at the current rate */
		frame: frame,
		wants: running,
		period: function() { return env.frame; },
		/* the page's refresh is paused: the last frame stays */
		pause: function(on) { paused = !!on; run(); },
		stop: function() {
			halt(); scene = null;
			if (ro) ro.disconnect();
			if (io) io.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('blur', onBlur);
			window.removeEventListener('focus', onFocus);
			if (mq && onMq && mq.removeEventListener) mq.removeEventListener('change', onMq);
			if (scheme && scheme.removeEventListener) scheme.removeEventListener('change', onScheme);
			if (mo) mo.disconnect();
			if (cv.parentNode) cv.parentNode.removeChild(cv);
		}
	};
}

return baseclass.extend({
	STYLES: STYLES,
	GRID: GRID,
	DOT: DOT,
	level: level,
	downShare: downShare,
	packetCount: packetCount,
	packetSpeed: packetSpeed,
	starSpeed: starSpeed,
	frameMs: frameMs,
	packets: packets,
	starfield: starfield,
	mount: mount
});
