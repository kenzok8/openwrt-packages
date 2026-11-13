'use strict';
'require baseclass';

/* Time series kept in the browser for the session, and the SVG path
   geometry to draw them. A series is an array of [ t (ms), v0, v1, ... ]
   in strictly increasing t. Pure functions. */

function finite(v) { return typeof v === 'number' && isFinite(v); }
function r1(v) { return Math.round(v * 10) / 10; }

return baseclass.extend({
	/* append, keeping entries newer than now - windowMs and at most max */
	push: function(series, point, windowMs, max) {
		var out = Array.isArray(series) ? series : [];
		if (!Array.isArray(point) || !finite(point[0])) return out;
		if (out.length && out[out.length - 1][0] >= point[0]) return out;
		out.push(point);
		var cutoff = point[0] - (windowMs > 0 ? windowMs : Infinity);
		while (out.length && (out[0][0] < cutoff || (max > 0 && out.length > max))) out.shift();
		return out;
	},

	/* Stored series (sessionStorage) are untrusted: keep arrays of exactly
	   `width` finite numbers with values >= 0 (except t), strictly
	   increasing t, nothing after notAfter, at most maxLen (newest). */
	/* maxValue (optional): larger values are dropped as well */
	valid: function(arr, width, maxLen, notAfter, maxValue) {
		if (!Array.isArray(arr)) return [];
		var out = [], lastT = -Infinity;
		for (var i = 0; i < arr.length; i++) {
			var p = arr[i], ok = Array.isArray(p) && p.length === width;
			for (var j = 0; ok && j < width; j++) ok = finite(p[j]) && (j === 0 || (p[j] >= 0 && !(maxValue != null && p[j] > maxValue)));
			if (!ok || p[0] <= lastT || (notAfter != null && p[0] > notAfter)) continue;
			out.push(p.slice());
			lastT = p[0];
		}
		return out.length > maxLen ? out.slice(out.length - maxLen) : out;
	},

	/* a round axis maximum >= v with finer steps (1, 1.5, 2, 2.5, 3, 4,
	   5, 6, 8, 10 x 10^n), so a 374 Mbit/s peak gets a 400 axis, not 500 */
	niceCeil: function(v) {
		if (!finite(v) || v <= 0) return 1;
		var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
		var steps = [ 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 ];
		for (var i = 0; i < steps.length; i++)
			if (f <= steps[i] * (1 + 1e-9)) return steps[i] * e;
		return 10 * e;
	},

	/* { now, peak, avg, n } of column idx over points with t >= t0 (now:
	   the newest finite value); nulls when there is no point */
	stats: function(series, idx, t0) {
		var n = 0, sum = 0, peak = null, now = null;
		(series || []).forEach(function(p) {
			if (!Array.isArray(p) || !finite(p[idx]) || (t0 != null && p[0] < t0)) return;
			n++; sum += p[idx];
			if (peak == null || p[idx] > peak) peak = p[idx];
			now = p[idx];
		});
		return { now: now, peak: peak, avg: n ? sum / n : null, n: n };
	},

	/* Time domain of a chart that fills in while history accumulates:
	   [t1 - span, t1] where span is the age of the oldest point (of any
	   of the series) clamped to [minMs, maxMs]. age: of the oldest point;
	   full: the whole window is covered. -> { t0, t1, span, age, full } */
	domain: function(list, t1, minMs, maxMs) {
		var first = Infinity;
		(list || []).forEach(function(sr) {
			(sr || []).forEach(function(p) { if (Array.isArray(p) && finite(p[0]) && p[0] < first) first = p[0]; });
		});
		var span = isFinite(first) ? Math.max(minMs, Math.min(maxMs, t1 - first)) : minMs;
		return { t0: t1 - span, t1: t1, span: span, age: isFinite(first) ? Math.min(maxMs, t1 - first) : 0, full: span >= maxMs - 1000 };
	},

	/* max over columns idx of the series (for a shared y scale) */
	max: function(series, idx) {
		var m = 0;
		(series || []).forEach(function(p) {
			idx.forEach(function(i) { if (finite(p[i]) && p[i] > m) m = p[i]; });
		});
		return m;
	},

	/* Screen points of column idx within a w x h box: x by time over
	   [t0, t1], y by value over [0, vmax] (0 at the bottom). A gap longer
	   than maxGap ms starts a new segment. -> [ [ [x, y], ... ], ... ] */
	segments: function(series, idx, t0, t1, vmax, w, h, maxGap) {
		var segs = [], cur = null, lastT = null, span = (t1 - t0) || 1;
		vmax = vmax > 0 ? vmax : 1;
		(series || []).forEach(function(p) {
			var v = p[idx];
			if (!finite(v) || p[0] < t0 - (maxGap || 0)) { cur = null; return; }
			if (cur && maxGap && lastT != null && p[0] - lastT > maxGap) cur = null;
			if (!cur) { cur = []; segs.push(cur); }
			var x = (p[0] - t0) / span * w, y = h - Math.min(1, Math.max(0, v / vmax)) * h;
			cur.push([ r1(x), r1(y) ]);
			lastT = p[0];
		});
		return segs;
	},

	/* 'M x y L x y ...' for line segments */
	linePath: function(segs) {
		return (segs || []).filter(function(s) { return s.length > 0; }).map(function(s) {
			if (s.length === 1) return 'M' + s[0][0] + ' ' + s[0][1] + 'h0.1';
			return 'M' + s.map(function(pt) { return pt[0] + ' ' + pt[1]; }).join('L');
		}).join('');
	},

	/* closed area down to the baseline y = h */
	areaPath: function(segs, h) {
		return (segs || []).filter(function(s) { return s.length > 1; }).map(function(s) {
			return 'M' + s[0][0] + ' ' + h + 'L' + s.map(function(pt) { return pt[0] + ' ' + pt[1]; }).join('L') +
				'L' + s[s.length - 1][0] + ' ' + h + 'Z';
		}).join('');
	},

	/* Throughput chart styles, the default first. chartGeom maps a value
	   to a height for each direction (frac: 0 at the top of the plot, 1 at
	   the bottom) and gives the baselines, grid lines and scale labels.
	   Linear scales never go below CHART_FLOOR, so an idle link stays a
	   flat line, and round up with niceCeil. */
	CHART_STYLES: [ 'overlay', 'log', 'mirror', 'mirror-split', 'lanes' ],

	/* the style in force: the router's first for a login that may save
	   there, for any other only where this browser has none */
	chartPick: function(saved, mine, first) {
		var ok = this.CHART_STYLES;
		if (ok.indexOf(saved) >= 0 && (first || ok.indexOf(mine) < 0)) return saved;
		return ok.indexOf(mine) >= 0 ? mine : ok[0];
	},
	CHART_FLOOR: 1e4,

	chartGeom: function(style, peakDn, peakUp) {
		var self = this, floor = this.CHART_FLOOR;
		/* peaks are capped so the scale arithmetic stays finite */
		var cap = function(v) { return finite(v) ? Math.min(Math.max(v, 0), 1e13) : 0; };
		var pd = cap(peakDn), pu = cap(peakUp);
		var nice = function(v) { return self.niceCeil(Math.max(v * 1.05, floor)); };
		var clamp = function(x) { return Math.max(0, Math.min(1, x)); };
		/* a direction drawn over [top, base] (rising) or [base, top] (hanging) */
		var lin = function(scale, top, base) {
			return { scale: scale, base: base, flip: base < top,
				frac: function(v) { return base + (top - base) * clamp(v / scale); } };
		};
		var shared = nice(Math.max(pd, pu)), sd = nice(pd), su = nice(pu);
		switch (style) {
		case 'log':
			/* a grid line per x10 from 1 kbit/s (less sits on the baseline)
			   to at least 1 Mbit/s, so idle chatter stays low */
			var lo = 1e3, hi = Math.max(1e6, Math.pow(10, Math.ceil(Math.log10(Math.max(pd, pu, 1) * 1.05))));
			var span = Math.log10(hi / lo), grid = [];
			var lf = function(v) { return 1 - clamp(Math.log10(Math.max(v, lo) / lo) / span); };
			for (var v = lo * 10; v < hi; v *= 10) grid.push(lf(v));
			var dir = { scale: hi, base: 1, flip: false, frac: lf };
			return { dn: dir, up: dir, grid: [ 0 ].concat(grid), axis: [ 1 ],
				labels: [ { at: 0, v: hi }, { at: 1, v: lo, below: true } ] };
		case 'mirror':
			return { dn: lin(shared, 0, .5), up: lin(shared, 1, .5), grid: [ 0, 1 ], axis: [ .5 ],
				labels: [ { at: 0, v: shared }, { at: 1, v: shared, below: true } ] };
		case 'mirror-split':
			return { dn: lin(sd, 0, .5), up: lin(su, 1, .5), grid: [ 0, 1 ], axis: [ .5 ],
				labels: [ { at: 0, v: sd, dir: 'dn' }, { at: 1, v: su, dir: 'up', below: true } ] };
		case 'lanes':
			return { dn: lin(sd, 0, .36), up: lin(su, .64, 1), grid: [ 0, .64 ], axis: [ .36, 1 ],
				/* each lane's scale on its own top line, the upload's in the gap
				   between the lanes, clear of both curves: at the 72 px minimum
				   the gap (20 px) holds the label and the download's end dot */
				labels: [ { at: 0, v: sd, dir: 'dn' }, { at: .64, v: su, dir: 'up' } ] };
		default:
			return { dn: lin(shared, 0, 1), up: lin(shared, 0, 1), grid: [ 0, .5 ], axis: [ 1 ],
				labels: [ { at: 0, v: shared } ] };
		}
	},

	/* Like segments(), with y = frac(v) * h for any scale */
	trace: function(series, idx, t0, t1, w, h, maxGap, frac) {
		var segs = [], cur = null, lastT = null, span = (t1 - t0) || 1;
		(series || []).forEach(function(p) {
			var v = p[idx];
			if (!finite(v) || p[0] < t0 - (maxGap || 0)) { cur = null; return; }
			if (cur && maxGap && lastT != null && p[0] - lastT > maxGap) cur = null;
			if (!cur) { cur = []; segs.push(cur); }
			cur.push([ r1((p[0] - t0) / span * w), r1(frac(v) * h) ]);
			lastT = p[0];
		});
		return segs;
	},

	/* Stretches of [t0, t1] without samples (the page was hidden, polls
	   failed), as [ x0, x1 ] fractions of the width */
	gaps: function(series, t0, t1, maxGap) {
		var out = [], span = (t1 - t0) || 1, prev = null;
		(series || []).forEach(function(p) {
			if (!Array.isArray(p) || !finite(p[0])) return;
			if (prev != null && p[0] - prev > maxGap && p[0] > t0)
				out.push([ Math.max(0, (prev - t0) / span), Math.min(1, (p[0] - t0) / span) ]);
			prev = p[0];
		});
		return out;
	},

	/* Smooth path through each segment: monotone cubic (Fritsch-Carlson),
	   so the curve never overshoots a sample */
	curvePath: function(segs) {
		return (segs || []).filter(function(s) { return s.length > 0; }).map(function(p) {
			var n = p.length, d = [], m = [], i;
			if (n < 3) return n === 1 ? 'M' + p[0][0] + ' ' + p[0][1] + 'h0.1' : 'M' + p[0][0] + ' ' + p[0][1] + 'L' + p[1][0] + ' ' + p[1][1];
			for (i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / ((p[i + 1][0] - p[i][0]) || 1));
			m[0] = d[0]; m[n - 1] = d[n - 2];
			for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
			for (i = 0; i < n - 1; i++) {
				if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
				var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
				if (s > 9) { var k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
			}
			var out = 'M' + p[0][0] + ' ' + p[0][1];
			for (i = 0; i < n - 1; i++) {
				var h = (p[i + 1][0] - p[i][0]) / 3;
				out += 'C' + r1(p[i][0] + h) + ' ' + r1(p[i][1] + m[i] * h) + ' ' + r1(p[i + 1][0] - h) + ' ' +
					r1(p[i + 1][1] - m[i + 1] * h) + ' ' + p[i + 1][0] + ' ' + p[i + 1][1];
			}
			return out;
		}).join('');
	},

	/* curvePath() closed down (or up) to the baseline y = base */
	curveArea: function(segs, base) {
		var self = this;
		return (segs || []).filter(function(s) { return s.length > 1; }).map(function(s) {
			return self.curvePath([ s ]) + 'L' + s[s.length - 1][0] + ' ' + base + 'L' + s[0][0] + ' ' + base + 'Z';
		}).join('');
	},

	/* index of the point closest in time to t (for hover), or -1 */
	nearest: function(series, t) {
		var best = -1, bd = Infinity;
		(series || []).forEach(function(p, i) {
			var d = Math.abs(p[0] - t);
			if (d < bd) { bd = d; best = i; }
		});
		return best;
	}
});
