/*
 * Vantage theme - login page backdrop, over the page grid: packets running
 * along the grid lines (the default) or a starfield flown through, as
 * picked under Appearance: saved for every browser on the router
 * (sysauth.ut's data-vt-look-login), else in this browser (localStorage
 * vantage.login.own for one who may not save it for everyone, vantage.login
 * from before; menu-vantage.js lookValue). One canvas, no libraries: a
 * frame is a handful of batched draws, at most about 60 a second, and nothing runs while the
 * window is in the background. With reduced motion it draws one still
 * frame, with Low-power router (Appearance, picked the same way) none: the
 * page grid alone. Logging in speeds it up while the form posts.
 *
 * This page means there is no session, so it also drops the history the
 * dashboard kept in this tab (overview.js STORE_KEY): station MACs and samples
 * shouldn't outlive a logout.
 */
(function () {
	'use strict';
	try { sessionStorage.removeItem('vantage.hist.v1'); } catch (e) {}
	var v = [ null, document.documentElement.getAttribute('data-vt-look-login'), null ], ok = [ 'grid', 'stars', 'none' ], pick = 'grid', i;
	try { v[0] = localStorage.getItem('vantage.login.own'); v[2] = localStorage.getItem('vantage.login'); } catch (e) {}
	for (i = 2; i >= 0; i--) if (ok.indexOf(v[i]) >= 0) pick = v[i];
	var p = [ null, document.documentElement.getAttribute('data-vt-look-power'), null ], power = 'normal';
	try { p[0] = localStorage.getItem('vantage.power.own'); p[2] = localStorage.getItem('vantage.power'); } catch (e) {}
	for (i = 2; i >= 0; i--) if (p[i] === 'normal' || p[i] === 'low') power = p[i];
	if (pick === 'none' || power === 'low') return;
	var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
	if (!ctx || typeof Path2D !== 'function') return;
	cv.className = 'vt-login-sky';
	cv.setAttribute('aria-hidden', 'true');
	document.body.insertBefore(cv, document.body.firstChild);

	var still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
	var w, h, dpr, last = 0, raf = 0, paused = false;

	function token(name, fallback) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
	}

	/* Packets enter on a grid line from an edge (at the start: anywhere on
	   the grid), turn left or right at one crossing in four, and trail off
	   in five shades. The page grid is 32px from the top left corner, its
	   lines 1px wide. */
	function packets() {
		var GRID = 32, SHADES = 5, ALPHA = [ .9, .55, .32, .16, .06 ];
		var DIRS = [ [ 1, 0 ], [ 0, 1 ], [ -1, 0 ], [ 0, -1 ] ];
		var list = [], col, boost = 1, target = 1;

		function spawn(p, anywhere) {
			var d = (Math.random() * 4) | 0, cols = Math.ceil(w / GRID), rows = Math.ceil(h / GRID);
			var x = ((Math.random() * cols) | 0) * GRID, y = ((Math.random() * rows) | 0) * GRID;
			if (!anywhere) {
				if (d === 0) x = -GRID;
				else if (d === 2) x = (cols + 1) * GRID;
				else if (d === 1) y = -GRID;
				else y = (rows + 1) * GRID;
			}
			p.d = d; p.x = x + .5; p.y = y + .5; p.pts = [ [ p.x, p.y ] ];
			p.v = 70 + Math.random() * 190; p.len = p.v * (.5 + Math.random() * .5);
			p.next = GRID;
			return p;
		}

		/* drops the corners that fell off the end of the trail; returns its tail */
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

		return {
			size: function () {
				col = token('--accent-text', '#c8f031');
				var n = Math.min(40, Math.round(w * h / 36000));
				while (list.length < n) list.push(spawn({}, true));
				list.length = n;
			},
			step: function (dt) {
				boost += (target - boost) * Math.min(1, dt * 5);
				for (var i = 0; i < list.length; i++) {
					var p = list[i], go = p.v * boost * dt;
					while (go > 0) {
						var s = Math.min(go, p.next);
						p.x += DIRS[p.d][0] * s; p.y += DIRS[p.d][1] * s; p.next -= s; go -= s;
						if (p.next <= 0) {
							p.next = GRID;
							if (Math.random() < .25) { p.pts.push([ p.x, p.y ]); p.d = (p.d + (Math.random() < .5 ? 1 : 3)) & 3; }
						}
					}
					/* gone once head and tail are both past the edge (packets
					   enter within two grid steps of it) */
					var tail = trim(p), m = 3 * GRID;
					if ((tail[0] < -m || tail[0] > w + m || tail[1] < -m || tail[1] > h + m) &&
					    (p.x < -m || p.x > w + m || p.y < -m || p.y > h + m)) spawn(p, false);
				}
			},
			draw: function () {
				var shade = [], heads = new Path2D(), glow = new Path2D();
				for (var k = 0; k < SHADES; k++) shade.push(new Path2D());
				for (var i = 0; i < list.length; i++) {
					var p = list[i], hx = p.x, hy = p.y, run = 0, piece = p.len / SHADES;
					/* the trail back from the head in equal pieces, each one
					   shade fainter */
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
					heads.rect(p.x - 1.5, p.y - 1.5, 3, 3);
					glow.rect(p.x - 4, p.y - 4, 8, 8);
				}
				ctx.strokeStyle = ctx.fillStyle = col;
				ctx.lineWidth = 1.5;
				for (var s = 0; s < SHADES; s++) { ctx.globalAlpha = ALPHA[s]; ctx.stroke(shade[s]); }
				ctx.globalAlpha = .18; ctx.fill(glow);
				ctx.globalAlpha = 1; ctx.fill(heads);
			},
			go: function () { target = 4; }
		};
	}

	/* Stars on a disk at depth z, 1 far (the vanishing point, behind the
	   card) to 0 at the screen, one in five lime; drawn in three depths.
	   The flight starts fast and settles to a cruise; logging in jumps to
	   warp. */
	function stars() {
		var CRUISE = .12, WARP = 2.4, TRAIL = .1, WIDTH = [ .8, 1.2, 1.8 ], ALPHA = [ .35, .6, .95 ];
		var card = document.querySelector('.vt-login-card');
		var list = [], cols, cx, cy, f, speed = still ? 0 : WARP / 2, target = CRUISE;

		function place(s, z) {
			var a = Math.random() * 2 * Math.PI, r = .03 + Math.sqrt(Math.random()) * .97;
			s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; s.z = z; s.c = Math.random() < .2 ? 1 : 0;
			return s;
		}

		return {
			size: function () {
				var r = card ? card.getBoundingClientRect() : null;
				cols = [ token('--text-2', '#a9afb7'), token('--accent-text', '#c8f031') ];
				cx = r ? r.left + r.width / 2 : w / 2; cy = r ? r.top + r.height / 2 : h / 2;
				f = Math.max(w, h) * .12;
				var n = Math.min(240, Math.round(w * h / 6000));
				while (list.length < n) list.push(place({}, .05 + Math.random() * .95));
				list.length = n;
			},
			step: function (dt) {
				speed += (target - speed) * Math.min(1, dt * (target > speed ? 5 : 1.5));
				for (var i = 0; i < list.length; i++) {
					var s = list[i];
					s.z -= speed * dt;
					if (s.z <= .02 || Math.abs(s.x * f / s.z) > w || Math.abs(s.y * f / s.z) > h)
						place(s, .8 + Math.random() * .2);
				}
			},
			draw: function () {
				var paths = [ new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D() ];
				for (var i = 0; i < list.length; i++) {
					var s = list[i], z0 = Math.min(1, s.z + speed * TRAIL + .004);
					var p = paths[(s.z > .5 ? 0 : s.z > .2 ? 1 : 2) * 2 + s.c];
					p.moveTo(cx + s.x * f / z0, cy + s.y * f / z0);
					p.lineTo(cx + s.x * f / s.z, cy + s.y * f / s.z);
				}
				ctx.lineCap = 'round';
				for (var k = 0; k < 6; k++) {
					ctx.globalAlpha = ALPHA[k >> 1];
					ctx.lineWidth = WIDTH[k >> 1];
					ctx.strokeStyle = cols[k & 1];
					ctx.stroke(paths[k]);
				}
			},
			go: function () { target = WARP; }
		};
	}

	var scene = pick === 'stars' ? stars() : packets();

	function size() {
		dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		w = window.innerWidth; h = window.innerHeight;
		cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		scene.size();
	}

	function draw() {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		scene.draw();
	}

	/* frames 12 ms apart at least: 60 a second at 60 and 120 Hz, 72 at 144 */
	function tick(t) {
		raf = 0;
		if (t - last >= 12) {
			scene.step(Math.min((t - last) / 1000, .05));
			last = t;
			draw();
		}
		run();
	}
	function run() { if (!raf && !paused && !still) raf = requestAnimationFrame(tick); }

	size();
	draw();
	window.addEventListener('resize', function () { size(); draw(); });
	if (still) return;
	window.addEventListener('blur', function () { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; });
	window.addEventListener('focus', function () { paused = false; run(); });
	var form = document.querySelector('form.vt-login-form');
	if (form) form.addEventListener('submit', function () { scene.go(); });
	run();
})();
