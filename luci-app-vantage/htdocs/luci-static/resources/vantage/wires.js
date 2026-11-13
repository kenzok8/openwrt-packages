'use strict';
'require baseclass';

/* Geometry of the network path's wires and of the dots that flow along
   them. The view measures the nodes; this module turns two boxes into a
   path (`d` for the SVG wire) plus the same curve as points, and the
   points into evenly spaced keyframes, so the dots can move with
   transform (compositor only) instead of an animated stroke-dashoffset,
   which repainted the whole wire layer every frame. Pure functions.

   A box is { l, r, t, b, cy } relative to the path element. */

var STEPS = 32;            /* points per curve before resampling */
var LANE = 10;             /* px between the main line's drop and the other lines', stacked */
var GAP = 16;              /* px between dots, as the old dash pattern */
var STRIDE = 32;           /* px a dot travels per period */
var PERIOD = { 1: 1600, 2: 1050, 3: 600 };   /* ms per STRIDE by speed */

function f1(v) { return v.toFixed(1); }

return baseclass.extend({
	GAP: GAP,

	/* bits per second -> 1 (idle trickle), 2, 3 (busy) */
	speed: function(bps) { return bps > 100e6 ? 3 : bps > 5e6 ? 2 : 1; },

	/* from box a to box b: side by side an S-curve between their facing
	   edges, stacked an elbow down a's left side into b */
	curve: function(a, b) {
		var x1, y1, x2, y2, pts = [], i;
		if (b.l >= a.r - 2) {
			x1 = a.r; y1 = a.cy; x2 = b.l; y2 = b.cy;
			var mx = (x1 + x2) / 2;
			for (i = 0; i <= STEPS; i++) {
				var t = i / STEPS, u = 1 - t;
				/* cubic Bézier with both control points at mx */
				pts.push([ u * u * u * x1 + 3 * u * t * mx + t * t * t * x2, (u * u * u + 3 * u * u * t) * y1 + (3 * u * t * t + t * t * t) * y2 ]);
			}
			return { d: 'M' + f1(x1) + ' ' + f1(y1) + 'C' + f1(mx) + ' ' + f1(y1) + ' ' + f1(mx) + ' ' + f1(y2) + ' ' + f1(x2) + ' ' + f1(y2), pts: pts };
		}
		x1 = a.l + 18; y1 = a.b; x2 = b.l; y2 = b.cy;
		if (x2 <= x1 + 6) return { d: 'M' + f1(x1) + ' ' + f1(y1) + 'V' + f1(b.t), pts: [ [ x1, y1 ], [ x1, b.t ] ] };
		var rad = Math.min(8, Math.max(0, y2 - y1));
		pts.push([ x1, y1 ]);
		for (i = 0; i <= 8; i++) {
			/* quadratic corner from (x1, y2 - rad) via (x1, y2) to (x1 + rad, y2) */
			var s = i / 8, v = 1 - s;
			pts.push([ v * v * x1 + 2 * v * s * x1 + s * s * (x1 + rad), v * v * (y2 - rad) + 2 * v * s * y2 + s * s * y2 ]);
		}
		pts.push([ x2, y2 ]);
		return { d: 'M' + f1(x1) + ' ' + f1(y1) + 'V' + f1(y2 - rad) + 'Q' + f1(x1) + ' ' + f1(y2) + ' ' + f1(x1 + rad) + ' ' + f1(y2) + 'H' + f1(x2), pts: pts };
	},

	/* from another line to the internet (a, the k-th beside the main
	   one) into the device (b), clear of the main line's rates: side by
	   side and below the device, along a's middle and up into b's bottom
	   edge, each further line 14 px further in, so the wires nest
	   without crossing; stacked (a phone), from a's left edge down a lane
	   of their own beside the main line's drop (LANE px to its right, so
	   no line runs inside another's wire or a tunnel's pipe) into b's top
	   edge. Otherwise as curve(). */
	line: function(a, b, k) {
		var x1, y1, x2, y2, rad, i, s, v, pts = [];
		if (b.l >= a.r - 2 && a.cy > b.b) {
			x1 = a.r; y1 = a.cy; y2 = b.b;
			x2 = Math.min(b.l + 18 + 14 * (k || 0), (b.l + b.r) / 2);
			rad = Math.min(8, y1 - y2, x2 - x1);
			if (rad > 0) {
				pts.push([ x1, y1 ]);
				for (i = 0; i <= 8; i++) {
					/* quadratic corner from (x2 - rad, y1) via (x2, y1) to (x2, y1 - rad) */
					s = i / 8; v = 1 - s;
					pts.push([ v * v * (x2 - rad) + 2 * v * s * x2 + s * s * x2, v * v * y1 + 2 * v * s * y1 + s * s * (y1 - rad) ]);
				}
				pts.push([ x2, y2 ]);
				return { d: 'M' + f1(x1) + ' ' + f1(y1) + 'H' + f1(x2 - rad) + 'Q' + f1(x2) + ' ' + f1(y1) + ' ' + f1(x2) + ' ' + f1(y1 - rad) + 'V' + f1(y2), pts: pts };
			}
		}
		if (b.l < a.r - 2 && a.b <= b.t) {
			x1 = a.l; y1 = a.cy; x2 = b.l + 18 + LANE; y2 = b.t;
			rad = Math.min(8, x1 - x2, y2 - y1);
			if (rad > 0) {
				pts.push([ x1, y1 ]);
				for (i = 0; i <= 8; i++) {
					/* quadratic corner from (x2 + rad, y1) via (x2, y1) to (x2, y1 + rad) */
					s = i / 8; v = 1 - s;
					pts.push([ v * v * (x2 + rad) + 2 * v * s * x2 + s * s * x2, v * v * y1 + 2 * v * s * y1 + s * s * (y1 + rad) ]);
				}
				pts.push([ x2, y2 ]);
				return { d: 'M' + f1(x1) + ' ' + f1(y1) + 'H' + f1(x2 + rad) + 'Q' + f1(x2) + ' ' + f1(y1) + ' ' + f1(x2) + ' ' + f1(y1 + rad) + 'V' + f1(y2), pts: pts };
			}
		}
		return this.curve(a, b);
	},

	/* points at equal distances along a polyline, about `step` px apart,
	   each with the direction of travel in degrees (unwrapped, so the
	   keyframes never turn the long way round); { pts: [[x, y, deg]], len } */
	resample: function(pts, step) {
		var cum = [ 0 ], i, out = [];
		for (i = 1; i < pts.length; i++)
			cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
		var len = cum[cum.length - 1];
		if (!(len > 0)) return { pts: [], len: 0 };
		var n = Math.max(1, Math.ceil(len / step)), j = 1, prev = null;
		for (i = 0; i <= n; i++) {
			var s = len * i / n;
			while (j < pts.length - 1 && cum[j] < s) j++;
			/* the segment [j-1, j] holds s; skip zero-length segments for the angle */
			var k = j;
			while (k < pts.length - 1 && cum[k] === cum[k - 1]) k++;
			var seg = cum[j] - cum[j - 1], f = seg > 0 ? (s - cum[j - 1]) / seg : 0;
			var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
			var deg = Math.atan2(dy, dx) * 180 / Math.PI;
			if (prev != null) { while (deg - prev > 180) deg -= 360; while (deg - prev < -180) deg += 360; }
			prev = deg;
			out.push([ pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f, deg ]);
		}
		return { pts: out, len: len };
	},

	/* the Web Animations keyframes for one trip along the samples */
	keyframes: function(samples) {
		var frames = [];
		samples.forEach(function(p) {
			frames.push({ transform: 'translate(' + p[0].toFixed(2) + 'px, ' + p[1].toFixed(2) + 'px) rotate(' + p[2].toFixed(1) + 'deg)' });
		});
		return frames;
	},

	/* how many dots a wire of this length carries (about GAP apart) */
	dots: function(len) { return Math.max(1, Math.round(len / GAP)); },

	/* one trip along a wire at speed 1, in ms; faster speeds play it at
	   rate(speed), so a speed change keeps every dot where it is */
	trip: function(len) { return len / STRIDE * PERIOD[1]; },
	rate: function(speed) { return PERIOD[1] / (PERIOD[speed] || PERIOD[1]); }
});
