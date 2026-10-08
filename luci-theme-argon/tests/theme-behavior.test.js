'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const test = require('node:test');

const root = path.join(__dirname, '..');
const menuSource = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/menu-argon.js'), 'utf8');

function element(tag, attrs = {}, children = []) {
	const node = {
		tag,
		attrs,
		children: [],
		style: {},
		appendChild(child) {
			if (child && child.parent)
				child.parent.children.splice(child.parent.children.indexOf(child), 1);
			this.children.push(child);
			if (child && typeof child === 'object')
				child.parent = this;
		}
	};
	for (const child of children)
		node.appendChild(child);
	return node;
}

String.prototype.format = function(...values) {
	let i = 0;
	return this.replace(/%s/g, () => values[i++]);
};

function loadMenu(dispatchpath, container) {
	return new Function('baseclass', 'ui', 'L', 'E', 'document', '_', menuSource)(
		{ extend: value => value },
		{ menu: { getChildren: node => node.children || [] } },
		{ env: { dispatchpath }, url: (...parts) => parts.join('/') },
		element,
		{ querySelector: () => container },
		value => value
	);
}

test('nested LuCI tabs stay in parent-to-child order', () => {
	const container = element('div');
	const menu = loadMenu(['admin', 'system', 'demo', 'a', 'b', 'c', 'd'], container);
	const tree = { children: [{ name: 'a', title: 'A', children: [
		{ name: 'b', title: 'B', children: [
			{ name: 'c', title: 'C', children: [
				{ name: 'd', title: 'D', children: [] }
			] }
		] }
	] }] };

	menu.renderTabMenu(tree, 'admin/system/demo');
	assert.deepEqual(container.children.map(ul => ul.children[0].children[0].children[0]), ['A', 'B', 'C', 'D']);
	assert.equal(container.children[0].children[0].attrs.class, 'tabmenu-item-a  active');
	assert.equal(container.children[3].children[0].children[0].attrs.href, 'admin/system/demo/a/b/c/d');
});

function runUcodeSnippet(file, start, end, setup, result, settings = {}, hasConfig = true) {
	const source = fs.readFileSync(path.join(root, file), 'utf8');
	const first = source.indexOf(start);
	const last = source.indexOf(end, first);
	assert.ok(first >= 0 && last > first, `Cannot find Ucode snippet in ${file}`);
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-ucode-test-'));
	const script = path.join(dir, 'test.uc');
	writeFileSync(script, `${setup}\n${source.slice(first, last)}\nprint(sprintf("%J", ${result}));\n`);
	try {
		const output = execFileSync(process.env.UCODE_BIN || 'ucode', [
			`-Dsettings=${JSON.stringify(settings)}`,
			`-DhasConfig=${JSON.stringify(hasConfig)}`,
			script
		], { encoding: 'utf8' });
		return JSON.parse(output);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const configSetup = `
let cfg = { get_first: (packageName, section, key) => settings[key] };
function access(path) { return hasConfig; }
`;
const configResult = '{mode, primary, dark_primary, blur_radius, blur_radius_dark, blur_opacity, blur_opacity_dark, bar_color}';

for (const template of ['header.ut', 'header_login.ut']) {
	const file = `ucode/template/themes/argon/${template}`;
	test(`${template} uses safe defaults for missing and invalid settings`, () => {
		const empty = runUcodeSnippet(file, 'function validColor', '\n-%}', configSetup, configResult);
		assert.deepEqual(empty, {
			mode: 'normal', primary: '#5e72e4', dark_primary: '#483d8b',
			blur_radius: '10', blur_radius_dark: '10',
			blur_opacity: '0.5', blur_opacity_dark: '0.5', bar_color: '#5e72e4'
		});
		assert.deepEqual(runUcodeSnippet(file, 'function validColor', '\n-%}', configSetup, configResult, {}, false), empty);
		const invalid = runUcodeSnippet(file, 'function validColor', '\n-%}', configSetup, configResult, {
			primary: 'red;}', blur: '-1', transparency: '2', mode: 'unknown'
		});
		assert.deepEqual(invalid, empty);
		const dark = runUcodeSnippet(file, 'function validColor', '\n-%}', configSetup, configResult, {
			primary: '#123456', dark_primary: '#abcdef', blur: '0', transparency: '0.7', mode: 'dark'
		});
		assert.equal(dark.mode, 'dark');
		assert.equal(dark.bar_color, '#abcdef');
		assert.equal(dark.blur_radius, '0');
		assert.equal(dark.blur_opacity, '0.7');
		const light = runUcodeSnippet(file, 'function validColor', '\n-%}', configSetup, configResult, {
			primary: '#123456', mode: 'light'
		});
		assert.equal(light.mode, 'light');
		assert.equal(light.bar_color, '#123456');
	});
}

test('login layouts allow supported styles and fall back for old or invalid configs', () => {
	const selected = (value, hasConfig = true) => runUcodeSnippet(
		'ucode/template/themes/argon/sysauth.ut',
		"let login_style = 'classic';", '\n\t// Per-request',
		configSetup + '\nlet fs = { access };', 'login_style', { login_style: value }, hasConfig
	);
	assert.equal(selected('classic'), 'classic');
	assert.equal(selected('centered'), 'centered');
	assert.equal(selected('centered', false), 'classic');
	for (const value of [undefined, null, '', 'unknown', 'CENTERED', '" onclick="alert(1)', '../centered', 1, ['centered'], {}])
		assert.equal(selected(value), 'classic');
});

test('local backgrounds accept dotted names and encode spaces', () => {
	const setup = `
let fs = { lsdir: path => ['photo.jpg', 'my.photo.jpg', 'space name.webp', 'hash#name.jpg', 'what?.png', 'VIDEO.MP4', 'notes.txt'] };
let http = { urlencode: value => replace(replace(replace(value, ' ', '%20'), '#', '%23'), '?', '%3F') };
`;
	const backgrounds = runUcodeSnippet(
		'ucode/template/themes/argon/sysauth.ut',
		'const imageTypes', '\n\tfunction selectBackground',
		setup, 'fetchMedia("/www/luci-static/argon/background", "/luci-static/argon/background/")'
	);
	assert.deepEqual(backgrounds.map(bg => bg.url), [
		'/luci-static/argon/background/photo.jpg',
		'/luci-static/argon/background/my.photo.jpg',
		'/luci-static/argon/background/space%20name.webp',
		'/luci-static/argon/background/hash%23name.jpg',
		'/luci-static/argon/background/what%3F.png',
		'/luci-static/argon/background/VIDEO.MP4'
	]);
	assert.deepEqual(backgrounds.map(bg => bg.type), ['jpg', 'jpg', 'webp', 'jpg', 'png', 'mp4']);
});

test('online wallpaper URLs require HTTPS and fall back locally', () => {
	const setup = `
let media = "/luci-static/argon";
let fs = { access: path => true };
let cfg = { get_first: (packageName, section, key) => key == 'online_wallpaper' ? 'bing' : null };
let ubus = { call: (object, method) => ({ url: settings.url }) };
let videoTypes = " mp4 webm ";
function fetchMedia() {
  if (settings.empty) return [];
  if (settings.video) return [{ type: 'mp4', url: '/luci-static/argon/background/local.mp4' }];
  return [{ type: 'jpg', url: '/luci-static/argon/background/local.jpg' }];
}
function randomIndex() { return 0; }
`;
	const file = 'ucode/template/themes/argon/sysauth.ut';
	const start = 'function selectBackground';
	const end = '\n\tconst boardinfo';
	const selected = settings => runUcodeSnippet(file, start, end, setup, 'selectBackground("/luci-static/argon/background/")', settings);
	assert.equal(selected({ url: 'https://example.com/image.jpg' }).bgUrl, 'https://example.com/image.jpg');
	for (const invalid of ['http://example.com/image.jpg', 'https://example.com/a b.jpg', 'javascript:alert(1)', 'https://example.com/"bad'])
		assert.equal(selected({ url: invalid }).bgUrl, '/luci-static/argon/background/local.jpg');
	assert.equal(selected({ url: 'http://example.com/image.jpg', empty: true }).bgUrl, '/luci-static/argon/img/bg1.jpg');
	assert.deepEqual(selected({ url: '', video: true }), {
		bgUrl: '/luci-static/argon/background/local.mp4',
		backgroundType: 'Video',
		mimeType: 'video/mp4'
	});
});

test('authentication fields preserve numeric length limits and escape attributes', () => {
	const source = fs.readFileSync(path.join(root, 'ucode/template/themes/argon/sysauth.ut'), 'utf8');
	const first = source.indexOf('{%- if (auth_fields): %}');
	const last = source.indexOf('{%- if (auth_html): %}', first);
	assert.ok(first >= 0 && last > first);
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-auth-test-'));
	const script = path.join(dir, 'auth.ut');
	// LuCI's html module returns null for non-string values, including numbers.
	const setup = `{%
function _(value) { return value; }
function entityencode(value, attribute) {
  if (type(value) != 'string') return null;
  return replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
}
%}`;
	try {
		writeFileSync(script, setup + source.slice(first, last));
		const output = execFileSync(process.env.UCODE_BIN || 'ucode', [
			'-T,', `-Dauth_fields=${JSON.stringify([{
				name: 'luci_otp', type: 'text', label: 'One-Time Password',
				placeholder: 'Code "123456"', inputmode: 'numeric', pattern: '[0-9]*',
				maxlength: 6, autocomplete: 'one-time-code', required: true
			}])}`, script
		], { encoding: 'utf8' });
		assert.match(output, /maxlength="6"/);
		assert.match(output, /for="luci_otp">One-Time Password<\/label>/);
		assert.match(output, /title="Code &quot;123456&quot;"/);
		assert.match(output, /autocomplete="one-time-code"/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('Unsplash falls back on missing key or failed fetch', () => {
	const source = fs.readFileSync(path.join(root, 'root/usr/libexec/rpcd/luci.argon_wallpaper'), 'utf8');
	const imports = '. /lib/functions.sh\n. /usr/share/libubox/jshn.sh';
	assert.ok(source.includes(imports));
	const stub = `
uci() {
  case "$*" in
    *online_wallpaper) printf '%s\\n' "$TEST_WALLPAPER" ;;
    *use_api_key) [ -n "$TEST_KEY" ] && printf '%s\\n' "$TEST_KEY" ;;
    *use_exact_resolution) printf '1\\n' ;;
  esac
}
json_init() { json_url=''; }
json_add_string() { [ "$1" = url ] && json_url="$2"; }
json_dump() { printf '{"url":"%s"}\\n' "$json_url"; }
json_cleanup() { :; }
flock() { return 0; }
wget() { return 1; }
jsonfilter() { return 1; }
`;
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-wallpaper-test-'));
	try {
		const script = path.join(dir, 'wallpaper.sh');
		const cache = path.join(dir, 'wallpaper.url');
		writeFileSync(cache, 'https://example.com/old.jpg\n');
		writeFileSync(script, source.replace(imports, stub)
			.replace('CACHE="/var/run/argon_${WEB_PIC_SRC}.url"', 'CACHE="$TEST_CACHE"')
			.replace('WRLOCK="/var/lock/argon_${WEB_PIC_SRC}.lock"', 'WRLOCK="$TEST_LOCK"'));
		for (const wallpaper of ['unsplash', 'unsplash_123']) {
			const output = execFileSync('sh', [script, 'call', 'get_url'], {
				input: '{}\n', encoding: 'utf8',
				env: { ...process.env, TEST_WALLPAPER: wallpaper, TEST_KEY: '', TEST_CACHE: cache, TEST_LOCK: path.join(dir, 'lock') }
			});
			assert.deepEqual(JSON.parse(output), { url: '' });
		}
		rmSync(cache);
		const failedFetch = execFileSync('bash', [script, 'call', 'get_url'], {
			input: '{}\n', encoding: 'utf8',
			env: { ...process.env, TEST_WALLPAPER: 'unsplash', TEST_KEY: 'test-key', TEST_CACHE: cache, TEST_LOCK: path.join(dir, 'lock') }
		});
		assert.deepEqual(JSON.parse(failedFetch), { url: '' });
		assert.equal(fs.readFileSync(cache, 'utf8'), '');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
