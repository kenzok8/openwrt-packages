#!/usr/bin/env node
/*
 * Minify the theme's static assets in place, for release packaging only.
 *
 *   node scripts/minify.mjs [package-root]     (default: repository root)
 *
 * CI runs this on a disposable checkout before building packages. Sources in
 * git stay readable. LuCI view modules ('require …' directives, top-level
 * return) are not touched.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)));
const media = join(root, 'htdocs/luci-static/carbon');
const i18n = join(media, 'i18n');
const files = [
	join(media, 'carbon.css'),
	join(media, 'carbon.js'),
	join(media, 'brands.js'),
	...(existsSync(i18n) ? readdirSync(i18n).filter((f) => f.endsWith('.js')).map((f) => join(i18n, f)) : [])
];

let before = 0, after = 0;
for (const file of files) {
	const source = readFileSync(file, 'utf8');
	const { code, warnings } = await transform(source, {
		loader: file.endsWith('.css') ? 'css' : 'js',
		minify: true,
		legalComments: 'inline',
		charset: 'utf8'
	});
	if (warnings.length)
		throw new Error(relative(root, file) + ': ' + warnings.map((w) => w.text).join('; '));
	writeFileSync(file, code);
	before += Buffer.byteLength(source);
	after += Buffer.byteLength(code);
	console.log(relative(root, file).padEnd(44), String(Buffer.byteLength(source)).padStart(7), '→', String(Buffer.byteLength(code)).padStart(7));
}
console.log('total'.padEnd(44), String(before).padStart(7), '→', String(after).padStart(7), `(${Math.round((1 - after / before) * 100)}% smaller)`);
