'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const ucode = process.env.UCODE_BIN || 'ucode';
const args = ['-L', path.join(path.dirname(ucode), '*.so'), '-L', path.resolve(__dirname, '../root/usr/share/ucode/*.uc')];
function evaluate(expression, values) {
	return JSON.parse(execFileSync(ucode, [...args, '-Dvalues=' + JSON.stringify(values), '-e',
		'import { dark_palette, normalize_hex, appearance_modes } from "luci.argon-palette"; print(sprintf("%J", ' + expression + '));'], { encoding: 'utf8' }));
}

// Independently measure the final, quantized sRGB values emitted to the page.
function contrast(a, b) {
	const luminance = hex => {
		const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
		return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
	};
	const x = luminance(a), y = luminance(b);
	return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('generated dark roles remain readable across saturated, neutral and extreme seeds', () => {
	const seeds = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#5e72e4', '#483d8b', '#888888'];
	for (let n = 0; n < 80; n++) seeds.push('#' + ((n * 104729 + 139967) % 0x1000000).toString(16).padStart(6, '0'));
	const palettes = evaluate('map(values, color => [dark_palette(color, false), dark_palette(color, true)])', seeds);
	palettes.forEach((variants, index) => variants.forEach((p, custom) => {
		for (const role of ['primary', 'on_primary', 'link', 'focus', 'control_focus', 'progress', 'selected', 'hover'])
			assert.match(p[role], /^#[0-9a-f]{6}$/, role);
		assert.ok(contrast(p.on_primary, p.primary) >= 4.5, 'button text ' + seeds[index]);
		if (custom) assert.equal(p.primary, seeds[index]);
		else assert.ok(contrast('#ffffff', p.primary) >= 4.6);
		for (const surface of ['#181819', '#1e1e1e', '#252526', '#2d2d2d', '#333333', p.selected, p.hover])
			assert.ok(contrast(p.link, surface) >= 4.5, 'link on ' + surface + ' from ' + seeds[index]);
		assert.ok(contrast(p.focus, '#333333') >= 3);
		assert.ok(contrast(p.control_focus, '#333333') >= 3, 'field focus from ' + seeds[index]);
		assert.ok(contrast(p.progress, '#1e1e1e') >= 3, 'progress fill from ' + seeds[index]);
		assert.notEqual(p.control_focus, p.focus, 'field border must differ from keyboard ring');
		const controlRgb = p.control_focus.slice(1).match(/../g).map(v => parseInt(v, 16));
		assert.equal(p.control_ring, 'rgba(' + controlRgb.join(', ') + ', .18)');
		assert.ok(contrast('#cccccc', p.selected) >= 4.5);
		assert.ok(contrast('#cccccc', p.hover) >= 4.5);
	}));
	for (const index of [0, 1, 10]) for (const role of ['primary', 'link', 'focus', 'control_focus', 'progress', 'selected', 'hover']) {
		const rgb = palettes[index][0][role].slice(1).match(/../g);
		assert.equal(new Set(rgb).size, 1, 'neutral gained a hue');
	}
});

test('color input normalization rejects CSS injection and handles short and mixed-case HEX', () => {
	const values = ['#AbC', '#ABCDEF', '', 'red', '#1234', '#abcdef;}', '#abc\n.foo{}', null, 123, ['#abc'], {}];
	assert.deepEqual(evaluate('map(values, normalize_hex)', values), ['#aabbcc', '#abcdef', null, null, null, null, null, null, null, null, null]);
});

test('appearance mode inference preserves legacy overrides and honors explicit automatic/shared choices', () => {
	const values = [{}, { dark_primary: '#abc' }, { blur: '0', blur_dark: '10' },
		{ transparency: '0', transparency_dark: '0.5' }, { blur: '10.0', blur_dark: '10', transparency: '0', transparency_dark: '0.0' },
		{ dark_primary: '#abc', dark_primary_mode: 'auto', dark_glass_mode: 'inherit', blur_dark: '25' },
		{ dark_primary_mode: 'custom', dark_glass_mode: 'custom' },
		{ dark_primary_mode: 'unknown', dark_primary: 'red;}', dark_glass_mode: 'unknown', blur_dark: '-1' }];
	assert.deepEqual(evaluate('map(values, appearance_modes)', values), [
		{ color: 'auto', glass: 'inherit' }, { color: 'custom', glass: 'inherit' },
		{ color: 'auto', glass: 'custom' }, { color: 'auto', glass: 'custom' },
		{ color: 'auto', glass: 'inherit' }, { color: 'auto', glass: 'inherit' },
		{ color: 'custom', glass: 'custom' }, { color: 'auto', glass: 'inherit' }
	]);
});
