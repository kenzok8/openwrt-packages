'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const createRenderer = require('./helpers/render-templates');

const templates = path.join(__dirname, '../ucode/template/themes/argon');

test('application and login compose the same head with their own resource boundaries', () => {
	const renderer = createRenderer(templates);
	try {
		for (const entry of ['application', 'sysauth']) {
			const { html, contentTypes } = renderer.render(entry, {
				hostname: 'Test Router', node: { title: 'Settings', css: 'extra.css' }, css: '.fixture { color: red; }',
				settings: { mode: 'dark', primary: '#123456', dark_primary: '#abcdef', blur: '0', transparency: '0.7' }
			});
			assert.deepEqual(contentTypes, ['text/html; charset=UTF-8']);
			assert.equal((html.match(/<!DOCTYPE html>/g) || []).length, 1);
			assert.match(html, /<title>Test Router - Settings - LuCI<\/title>/);
			assert.match(html, /data-argon-mode="dark"/);
			assert.match(html, /name="theme-color" content="#abcdef"/);
			assert.match(html, /--light-primary: #123456/);
			assert.match(html, /--light-on-primary: #ffffff/);
			assert.match(html, /--blur-radius-light:0px/);
			assert.match(html, /--blur-opacity-light:0.7/);
			assert.match(html, /\/css\/base\.css/);
			assert.ok(html.indexOf('/css/base.css') < html.indexOf('/extra.css'));
			assert.ok(html.indexOf('/extra.css') < html.indexOf('.fixture { color: red; }'));
			assert.match(html, /var luciLocation =/);
			if (entry === 'application') {
				assert.ok(html.indexOf('/css/admin.css') > html.indexOf('/css/base.css'));
				assert.ok(html.indexOf('/css/admin.css') < html.indexOf('/extra.css'));
				assert.match(html, /name="argon-menu-icons" content="default.svg status.svg"/);
				assert.match(html, /\/luci\.js\?v=test-build/);
				assert.match(html, /L\.require\('menu-argon'\)/);
				assert.match(html, /L\.require\('argon-sshkeys'\)/);
				assert.match(html, /id="argon-appearance" hidden/);
				assert.match(html, /L\.require\('argon-appearance'\)/);
			} else {
				assert.doesNotMatch(html, /admin\.css|argon-menu-icons|argon-appearance|\/luci\.js|\/cbi\.js|L\.require/);
			}
		}
		assert.equal((renderer.render('headers-twice').html.match(/<!DOCTYPE html>/g) || []).length, 1);
	} finally { renderer.close(); }
});

test('first-child entry routes identify the resolved page and retain wildcard request suffixes', () => {
	const renderer = createRenderer(templates);
	try {
		for (const request_path of [[], ['admin'], ['admin', 'status'], ['admin', 'status', 'overview']]) {
			const { html } = renderer.render('application', {
				ctx: { path: ['admin', 'status', 'overview'], request_path, authsession: 'session' }
			});
			assert.match(html, /data-page="admin-status-overview"/);
		}
		const { html } = renderer.render('application', {
			ctx: { path: ['admin', 'network', 'network'], request_path: ['admin', 'network', 'network', 'lan'], authsession: 'session' }
		});
		assert.match(html, /data-page="admin-network-network-lan"/);
	} finally { renderer.close(); }
});

test('stylesheet URLs track source rebuilds and preserved timestamps on application and login pages', () => {
	const renderer = createRenderer(templates);
	try {
		const base = '/www/luci-static/argon/css/base.css';
		const admin = '/www/luci-static/argon/css/admin.css';
		const original = { mtime: 10, ctime: 11, size: 12 };
		const links = (entry, stats, extra = {}) => [...renderer.render(entry, {
			stylesheetStats: stats, ...extra
		}).html.matchAll(/href="[^"]*\/css\/([^"]+\.css\?v=[^"]+)"/g)].map(m => m[1]);
		const stats = { [base]: original, [admin]: { ...original, size: 50 } };
		assert.deepEqual(links('sysauth', stats), ['base.css?v=10-11-12']);
		assert.deepEqual(links('application', stats), ['base.css?v=10-11-12', 'admin.css?v=10-11-50']);
		assert.deepEqual(links('sysauth', stats, { auth_html: '<div>Plugin UI</div>' }), links('application', stats));
		for (const field of ['mtime', 'ctime', 'size']) {
			const changed = { ...stats, [base]: { ...original, [field]: 90 } };
			assert.notEqual(links('sysauth', changed)[0], links('sysauth', stats)[0]);
			assert.equal(links('application', changed)[1], links('application', stats)[1]);
		}
		assert.deepEqual(links('sysauth', {}), ['base.css?v=0']);
	} finally { renderer.close(); }
});

test('standalone stylesheet imports follow the contents of each compiled sheet', () => {
	const css = path.join(__dirname, '../htdocs/luci-static/argon/css');
	const imports = ['base', 'admin'].map(name => {
		const content = fs.readFileSync(path.join(css, name + '.css'));
		const revision = createHash('sha256').update(content).digest('hex').slice(0, 16);
		return `@import "${name}.css?v=${revision}";`;
	});
	assert.deepEqual(fs.readFileSync(path.join(css, 'cascade.css'), 'utf8').trim().split('\n'), imports);
});

test('LuCI module URLs are versioned for both LuCI and Argon independently', () => {
	const renderer = createRenderer(templates);
	try {
		for (const scriptVersion of ['f1a2b3c4', '99887766']) {
			const { html } = renderer.render('application', { scriptVersion });
			assert.ok(html.includes('/luci.js?v=test-build-argon-' + scriptVersion + '"'));
		}
	} finally { renderer.close(); }
});

test('admin pages reuse the login wallpaper layer only when enabled', () => {
	const renderer = createRenderer(templates);
	try {
		const off = renderer.render('application', { backgrounds: ['photo.jpg'] }).html;
		assert.doesNotMatch(off, /argon-wallpaper|class="main-bg|<video/);
		const on = renderer.render('application', { settings: { main_background: '1' }, backgrounds: ['photo.jpg'] }).html;
		assert.match(on, /argon-wallpaper/);
		assert.match(on, /class="main-bg argon-background-media"/);
		const solid = renderer.render('application', { settings: { main_background: '1', main_glass: '0' }, backgrounds: ['photo.jpg'] }).html;
		assert.doesNotMatch(solid, /argon-wallpaper|class="main-bg/);
		assert.match(on, /photo\.jpg/);
		assert.ok(on.indexOf('skip-link') < on.indexOf('class="main-bg'));
		const video = renderer.render('application', { settings: { main_background: '1' }, backgrounds: ['clip.mp4'] }).html;
		assert.match(video, /<video loop muted playsinline id="video"/);
		assert.match(video, /class="video argon-background-media"/);
		assert.match(video, /class="background-controls argon-background-controls"/);
		assert.match(video, /playback-control/);
		assert.match(video, /volume-control mute/);
		assert.ok(video.indexOf('skip-link') < video.indexOf('background-controls'));
	} finally { renderer.close(); }
});

test('login partials retain image/video, branding and authentication scope and script order', () => {
	const renderer = createRenderer(templates);
	try {
		const { html } = renderer.render('sysauth', {
			settings: { login_style: 'centered' }, backgrounds: ['background.webm'],
			branding: { logo: 'custom.png', favicon: 'custom.png' },
			fuser: 'root', auth_plugin: 'otp', auth_message: 'Enter one-time code',
			auth_fields: [{ name: 'luci_otp', label: 'One-time code', type: 'text', placeholder: 'Code "123456"', maxlength: 6, inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'one-time-code', required: true }],
			auth_html: '<div id="auth-widget">Challenge</div>', auth_assets: [{ type: 'script', src: '/auth-plugin.js' }]
		});
		assert.match(html, /data-login-style="centered"/);
		assert.match(html, /\/branding\/custom.png/);
		assert.match(html, /<video loop muted playsinline id="video"/);
		assert.match(html, /background.webm" type="video\/webm"/);
		assert.match(html, /prefers-reduced-motion: reduce/);
		assert.match(html, /Enter one-time code/);
		assert.doesNotMatch(html, /Invalid username and\/or password/);
		assert.match(html, /maxlength="6"/);
		assert.match(html, /title="Code &quot;123456&quot;"/);
		assert.match(html, /autocomplete="one-time-code"/);
		assert.ok(html.indexOf('id="auth-widget"') < html.indexOf('src="/auth-plugin.js"'));
		assert.ok(html.indexOf('src="/auth-plugin.js"') < html.indexOf('input.focus()'));
		const image = renderer.render('sysauth', { configExists: false, backgrounds: [] }).html;
		assert.match(image, /data-login-style="classic"/);
		assert.match(image, /class="main-bg argon-background-media"/);
		assert.match(image, /img\/bg1.webp/);
		assert.doesNotMatch(image, /<video/);
		assert.match(image, /--dark-primary: #5a6cc5/);
		assert.match(renderer.render('sysauth', { fuser: 'root' }).html, /Invalid username and\/or password/);
	} finally { renderer.close(); }
});

test('anonymous login renders the alternate Bing image origin for old and new cache entries', () => {
	const renderer = createRenderer(templates);
	try {
		const hosts = ['www.bing.com', 'cn.bing.com'];
		const imagePath = '/th?id=Fixture_UHD.jpg&pid=hp';
		for (const [index, host] of hosts.entries()) {
			const { html } = renderer.render('sysauth', {
				ctx: { path: [], request_path: [] },
				settings: index === 0 ? { bing_background: '1' } : { online_wallpaper: 'bing' },
				wallpaper: { url: 'https://' + host + imagePath }
			});
			assert.ok(html.includes('src="https://' + host + imagePath.replace('&', '&amp;') + '"'));
			assert.ok(html.includes('data-mirror="https://' + hosts[1 - index] + imagePath.replace('&', '&amp;') + '"'));
			assert.match(html, /data-fallback="\/luci-static\/argon\/img\/bg1\.webp"/);
		}
		const { html } = renderer.render('sysauth', {
			settings: { online_wallpaper: 'unsplash' },
			wallpaper: { url: 'https://images.unsplash.com/example.jpg' }
		});
		assert.match(html, /src="https:\/\/images\.unsplash\.com\/example\.jpg"/);
		assert.doesNotMatch(html, /data-mirror=/);
	} finally { renderer.close(); }
});

test('a failed online image activates the selected local image or video after the Bing mirror', () => {
	const renderer = createRenderer(templates);
	try {
		for (const file of ['local image.webp', 'local video.mp4']) {
			const { html } = renderer.render('sysauth', {
				settings: { online_wallpaper: 'bing' }, backgrounds: [file],
				wallpaper: { url: 'https://www.bing.com/th?id=Missing' }
			});
			const fallback = html.match(/<template id="argon-local-background">([\s\S]*?)<\/template>/)[1];
			assert.ok(fallback.includes('/background/' + encodeURIComponent(file)));
			const online = html.slice(html.indexOf('</template>'));
			const onerror = new Function('document', online.match(/onerror="([^"]+)"/)[1]);
			const template = { content: fallback, remove() {} };
			const mirror = 'https://cn.bing.com/th?id=Missing';
			let replacement;
			const img = { dataset: { mirror }, parentNode: { replaceWith(node) { replacement = node; } } };
			const document = { getElementById: () => template, importNode: content => content };
			onerror.call(img, document);
			assert.equal(img.src, mirror);
			assert.equal(replacement, undefined);
			onerror.call(img, document);
			assert.equal(replacement, fallback);
		}
	} finally { renderer.close(); }
});

test('automatic palette and shared glass are emitted on application and anonymous login before styles paint', () => {
	const renderer = createRenderer(templates);
	try {
		for (const entry of ['application', 'sysauth']) {
			const { html } = renderer.render(entry, { settings: { primary: '#008800', dark_primary_mode: 'auto',
				dark_primary: '#ff00ff', dark_glass_mode: 'inherit', blur: '0', blur_dark: '20', transparency: '0.3', transparency_dark: '0.9' } });
			assert.match(html, /--blur-radius-dark:0px/);
			assert.match(html, /--blur-opacity-dark:0.3/);
			assert.doesNotMatch(html, /--dark-primary: #ff00ff/);
			assert.match(html, /--dark-link-color: #[0-9a-f]{6}/);
			assert.match(html, /--dark-control-focus: #[0-9a-f]{6}/);
			assert.match(html, /--dark-progress-fill: #[0-9a-f]{6}/);
			assert.match(html, /--dark-control-ring: rgba\([\d, .]+\)/);
			assert.match(html, /name="theme-color" media="\(prefers-color-scheme: dark\)"/);
			assert.ok(html.indexOf('--dark-primary:') < html.indexOf('</head>'));
			const custom = renderer.render(entry, { settings: { dark_primary_mode: 'custom', dark_primary: '#ffffff',
				dark_glass_mode: 'custom', blur: '0', blur_dark: '20', transparency: '0.3', transparency_dark: '0.9' } }).html;
			assert.match(custom, /--dark-primary: #ffffff/);
			assert.match(custom, /--dark-on-primary: #000000/);
			assert.match(custom, /--blur-radius-dark:20px/);
			assert.match(custom, /--blur-opacity-dark:0.9/);
		}
	} finally { renderer.close(); }
});
