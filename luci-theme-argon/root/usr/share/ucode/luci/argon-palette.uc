'use strict';

import { pow } from 'math';

// The linear-sRGB/Oklab transforms below are ported from Culori 4.0.2.
// https://github.com/Evercoder/culori/tree/v4.0.2/src/oklab
// MIT License
// Copyright (c) 2018 Dan Burzo
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

export function normalize_hex(value) {
	if (type(value) != 'string' || !match(value, /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/))
		return null;
	if (length(value) == 4)
		value = '#' + substr(value, 1, 1) + substr(value, 1, 1) +
			substr(value, 2, 1) + substr(value, 2, 1) + substr(value, 3, 1) + substr(value, 3, 1);
	return lc(value);
};

function linear(value) {
	return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

function rgb(hex) {
	return map([1, 3, 5], offset => int(substr(hex, offset, 2), 16) / 255.0);
}

function luminance(hex) {
	let v = map(rgb(hex), linear);
	return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export function contrast(a, b) {
	let x = luminance(a), y = luminance(b);
	return x > y ? (x + 0.05) / (y + 0.05) : (y + 0.05) / (x + 0.05);
};

function oklab(hex) {
	let v = map(rgb(hex), linear), r = v[0], g = v[1], b = v[2];
	let l = pow(0.412221469470763 * r + 0.5363325372617348 * g + 0.0514459932675022 * b, 1.0 / 3);
	let m = pow(0.2119034958178252 * r + 0.6806995506452344 * g + 0.1073969535369406 * b, 1.0 / 3);
	let s = pow(0.0883024591900564 * r + 0.2817188391361215 * g + 0.6299787016738222 * b, 1.0 / 3);
	let a = 1.9779985324311684 * l - 2.4285922420485799 * m + 0.450593709617411 * s;
	let b1 = 0.0259040424655478 * l + 0.7827717124575296 * m - 0.8086757549230774 * s;
	// Achromatic seeds must not acquire a hue from floating-point noise.
	if (a * a + b1 * b1 < 0.000000000001)
		a = b1 = 0;
	return [0.210454268309314 * l + 0.7936177747023054 * m - 0.0040720430116193 * s, a, b1];
}

function linear_rgb(l, a, b) {
	let x = pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3);
	let y = pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3);
	let z = pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3);
	return [4.0767416360759574 * x - 3.3077115392580616 * y + 0.2309699031821044 * z,
		-1.2684379732850317 * x + 2.6097573492876887 * y - 0.3413193760026573 * z,
		-0.0041960761386756 * x - 0.7034186179359362 * y + 1.7076146940746117 * z];
}

function in_gamut(v) {
	return v[0] >= 0 && v[0] <= 1 && v[1] >= 0 && v[1] <= 1 && v[2] >= 0 && v[2] <= 1;
}

function encode(v) {
	let x = v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
	return int((x < 0 ? 0 : x > 1 ? 1 : x) * 255 + 0.5);
}

function tone(seed, lightness, scale) {
	let lo = 0, hi = scale;
	let v = linear_rgb(lightness, seed[1] * hi, seed[2] * hi);
	// Preserve OKLCH hue/lightness; reduce chroma rather than clipping channels.
	if (!in_gamut(v)) {
		for (let i = 0; i < 20; i++) {
			let mid = (lo + hi) / 2;
			if (in_gamut(linear_rgb(lightness, seed[1] * mid, seed[2] * mid)))
				lo = mid;
			else
				hi = mid;
		}
		v = linear_rgb(lightness, seed[1] * lo, seed[2] * lo);
	}
	return sprintf('#%02x%02x%02x', encode(v[0]), encode(v[1]), encode(v[2]));
}

export function dark_palette(color, custom) {
	color = normalize_hex(color) ?? '#5e72e4';
	let seed = oklab(color);
	let fill = color;
	if (!custom) {
		for (let l = 0.57; l >= 0.3; l -= 0.01) {
			fill = tone(seed, l, 0.8);
			if (contrast('#ffffff', fill) >= 4.6)
				break;
		}
	}
	let link = tone(seed, 0.82, 0.65);
	// Field edges keep more chroma than the pale keyboard focus ring.
	let control_focus = tone(seed, 0.69, 0.95);
	return {
		primary: fill,
		on_primary: contrast('#ffffff', fill) >= contrast('#000000', fill) ? '#ffffff' : '#000000',
		link: link,
		focus: tone(seed, 0.90, 0.4),
		control_focus: control_focus,
		progress: tone(seed, 0.74, 0.8),
		control_ring: sprintf('rgba(%d, %d, %d, .18)', int(substr(control_focus, 1, 2), 16), int(substr(control_focus, 3, 2), 16), int(substr(control_focus, 5, 2), 16)),
		selected: tone(seed, 0.31, 0.35),
		hover: tone(seed, 0.37, 0.4),
		shadow: sprintf('rgba(%d, %d, %d, .1)', int(substr(link, 1, 2), 16), int(substr(link, 3, 2), 16), int(substr(link, 5, 2), 16)),
		ring: sprintf('rgba(%d, %d, %d, .28)', int(substr(link, 1, 2), 16), int(substr(link, 3, 2), 16), int(substr(link, 5, 2), 16))
	};
};

function valid_number(value, fallback, maximum) {
	return type(value) == 'string' && match(value, /^(0|[1-9][0-9]*)(\.[0-9]+)?$/) && +value <= maximum ? value : fallback;
}

export function appearance_modes(settings) {
	let color = settings.dark_primary_mode;
	if (color != 'auto' && color != 'custom')
		color = normalize_hex(settings.dark_primary) ? 'custom' : 'auto';
	let glass = settings.dark_glass_mode;
	if (glass != 'inherit' && glass != 'custom') {
		let blur = valid_number(settings.blur, '10', 100);
		let opacity = valid_number(settings.transparency, '0.5', 1);
		glass = +valid_number(settings.blur_dark, blur, 100) != +blur ||
			+valid_number(settings.transparency_dark, opacity, 1) != +opacity ? 'custom' : 'inherit';
	}
	return { color, glass };
};
