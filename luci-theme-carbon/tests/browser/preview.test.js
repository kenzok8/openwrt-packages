'use strict';

/*
 * Browser tests against the static preview (no router needed):
 *   npm install && npx playwright install chromium && npm run test:browser
 *
 * - tests/navigation.html regression page at phone width
 * - preview pages in zh/en × light/dark × desktop/phone: no script errors,
 *   screenshots written to .cache/screenshots for review
 * - dashboard data (devices, Wi‑Fi, IPv6, sensors, traffic picker)
 * - keyboard / touch / drawer accessibility
 * - the minified release build computes the same styles as the sources
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, '.cache', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

let server, base, browser, minRoot;

function serve(roots) {
	return http.createServer((req, res) => {
		const url = new URL(req.url, 'http://x');
		const [, mount, ...rest] = url.pathname.split('/');
		const root = roots[mount];
		const file = root && path.resolve(root, decodeURIComponent(rest.join('/')));
		if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404); res.end(); return;
		}
		res.writeHead(200, { 'content-type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
		fs.createReadStream(file).pipe(res);
	});
}

test.before(async () => {
	minRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-min-'));
	for (const dir of ['htdocs', 'preview'])
		fs.cpSync(path.join(ROOT, dir), path.join(minRoot, dir), { recursive: true });
	execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'minify.mjs'), minRoot], { stdio: 'pipe' });
	server = serve({ src: ROOT, min: minRoot });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = 'http://127.0.0.1:' + server.address().port;
	browser = await chromium.launch();
	fs.mkdirSync(SHOTS, { recursive: true });
});

test.after(async () => {
	if (browser) await browser.close();
	if (server) server.close();
	if (minRoot) fs.rmSync(minRoot, { recursive: true, force: true });
});

async function open(url, { width = 1280, height = 900, appearance = 'light', storage = {}, touch = false } = {}) {
	const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, colorScheme: appearance === 'dark' ? 'dark' : 'light' });
	await context.addInitScript((items) => {
		for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
	}, Object.assign({ 'carbon.appearance': appearance }, storage));
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.goto(base + url);
	return { page, context, errors };
}

/* every async source has rendered: leases, Wi‑Fi stations, sensors, languages */
const dashboardReady = (page) => page.waitForFunction(() =>
	document.querySelectorAll('.cb-card.span-8 .cb-list li').length >= 8 && document.querySelector('.cb-tag-wifi') &&
	document.querySelectorAll('.cb-kv li').length >= 3 && document.querySelector('.cb-lang .cb-lb'));

test('navigation regression page passes at phone width', async () => {
	const { page, context } = await open('/src/tests/navigation.html', { width: 390, height: 844 });
	await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.title));
	const results = await page.textContent('#results');
	assert.match(await page.title(), /^PASS/, results);
	await context.close();
});

for (const lang of ['zh-Hans', 'en']) {
	for (const appearance of ['light', 'dark']) {
		for (const [device, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
			test(`preview ${lang} ${appearance} ${device} renders without errors`, async () => {
				const { page, context, errors } = await open(`/src/preview/index.html?lang=${lang}`, { width, height, appearance });
				await dashboardReady(page);
				assert.equal(await page.getAttribute('html', 'data-darkmode'), appearance === 'dark' ? 'true' : 'false');
				await page.screenshot({ path: path.join(SHOTS, `overview-${lang}-${appearance}-${device}.png`), fullPage: true });
				assert.deepEqual(errors, []);
				await context.close();
			});
		}
	}
}

test('dashboard shows merged devices, Wi-Fi details, IPv6, sensors and a traffic picker', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en');
	await dashboardReady(page);
	const info = await page.evaluate(() => ({
		count: document.querySelector('.cb-count').textContent,
		wifiTags: document.querySelectorAll('.cb-tag-wifi').length,
		nas: [...document.querySelectorAll('.cb-list-title')].some((e) => e.textContent === 'DiskStation'),
		gateway: document.body.textContent.includes('100.64.0.1') && [...document.querySelectorAll('.cb-list .cb-mono')].some((e) => e.textContent === '100.64.0.1'),
		ipv6: !document.querySelector('.cb-ip6').closest('.cb-meta').classList.contains('hidden') && document.querySelector('.cb-ip6').textContent,
		sensors: [...document.querySelectorAll('.cb-kv li')].map((li) => li.firstChild.textContent).filter((t) => t.startsWith('Temperature')),
		tile: document.querySelector('.cb-tile .cb-tile-sub').textContent
	}));
	assert.equal(info.count, '17');
	assert.ok(info.wifiTags >= 3, 'Wi-Fi tags among the first eight devices');
	assert.ok(info.nas, 'static-IP device from ARP named by host hints');
	assert.equal(info.gateway, false, 'upstream gateway is not a LAN device');
	assert.equal(info.ipv6, '240e:3a1:4c2:8f0::1');
	assert.deepEqual(info.sensors, ['Temperature · cpu', 'Temperature · mt7986 phy1']);
	assert.match(info.tile, /^\d+ on Wi-Fi$/);

	/* the traffic picker is a Carbon listbox (same control as the language switch), grouped like <optgroup> */
	const picker = '.cb-card.cb-traffic .cb-lb.cb-traffic-select';
	const listed = async () => {
		await page.click(picker);
		await page.waitForSelector('.cb-lb-list.show');
		return page.evaluate(() => {
			const ul = document.querySelector('.cb-lb-list');
			return {
				options: [...ul.querySelectorAll('[role="option"]')].map((li) => li.textContent),
				groups: [...ul.querySelectorAll('.cb-lb-group')].map((li) => li.textContent)
			};
		});
	};
	let list = await listed();
	assert.equal(list.options.length, 10);
	assert.match(list.options[0], /^Auto/);
	assert.deepEqual(list.groups, ['Interfaces', 'Network devices']);
	assert.ok(list.options.includes('LAN (br-lan)') || list.options.some((o) => o.endsWith('(br-lan)')));
	await page.click('.cb-lb-list li[role="option"]:has-text("(br-lan)")');
	assert.equal(await page.evaluate(() => localStorage.getItem('carbon.traffic')), 'br-lan');
	assert.match(await page.textContent(picker), /\(br-lan\)$/);
	/* a physical port (e.g. an xPON uplink) is selectable and survives the next refresh */
	list = await listed();
	await page.click('.cb-lb-list li[role="option"] >> text="wan"');
	assert.equal(await page.evaluate(() => localStorage.getItem('carbon.traffic')), 'wan');
	assert.equal(await page.textContent(picker), 'wan');
	/* keyboard: Escape closes and returns focus to the trigger */
	await page.focus(picker);
	await page.keyboard.press('ArrowDown');
	await page.waitForSelector('.cb-lb-list.show');
	await page.keyboard.press('Escape');
	assert.equal(await page.$('.cb-lb-list'), null);
	assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cb-traffic-select')), true);
	await context.close();
});

/* every bundled catalogue loads, translates the shell and fits the sidebar */
const CATALOGUES = fs.readdirSync(path.join(ROOT, 'htdocs/luci-static/carbon/i18n')).map((f) => f.replace(/\.js$/, ''));
test('bundled catalogues translate the shell and fit the sidebar', async () => {
	assert.ok(CATALOGUES.length >= 12, CATALOGUES.join(','));
	for (const code of CATALOGUES) {
		const lang = { 'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hant', 'pt-br': 'pt-BR' }[code] || code;
		const { page, context, errors } = await open(`/src/preview/index.html?lang=${lang}`, { width: 1280 });
		await dashboardReady(page);
		const r = await page.evaluate(() => ({
			loaded: Object.keys(window.Carbon.I18N || {}).length,
			common: document.querySelector('.cb-nav-sect').textContent,
			expected: window.Carbon.I18N.Common,
			/* segmented labels must not overflow their buttons */
			clipped: [...document.querySelectorAll('.cb-mode .cb-seg-btn, .cb-lang .cb-seg-btn')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
			navClipped: [...document.querySelectorAll('.cb-nav-label')].filter((l) => l.scrollWidth > l.clientWidth + 1 && getComputedStyle(l).textOverflow !== 'ellipsis').map((l) => l.textContent)
		}));
		assert.ok(r.loaded > 150, `${code}: catalogue loaded`);
		assert.equal(r.common, r.expected, `${code}: sidebar section translated`);
		assert.deepEqual(r.clipped, [], `${code}: segmented labels fit`);
		assert.deepEqual(r.navClipped, [], `${code}: menu labels fit or ellipsize`);
		assert.deepEqual(errors, [], code);
		if (code === 'de' || code === 'ja')
			await page.screenshot({ path: path.join(SHOTS, `overview-${code}-light-desktop.png`), fullPage: true });
		await context.close();
	}
});

test('a custom logo replaces the sidebar logo and the dashboard hero icon', async () => {
	/* the theme header marks an uploaded logo with data-custom */
	const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx2.route('**/preview/index.html*', async (route) => {
		const res = await route.fetch();
		const body = (await res.text()).replace('<img class="cb-brand-logo" src="../htdocs/luci-static/carbon/logo.svg" alt="">',
			'<img class="cb-brand-logo" src="../htdocs/luci-static/carbon/logo.svg?v=1" alt="" data-custom>');
		await route.fulfill({ response: res, body });
	});
	const p2 = await ctx2.newPage();
	await p2.goto(base + '/src/preview/index.html?lang=en');
	await dashboardReady(p2);
	const hero = await p2.evaluate(() => {
		const img = document.querySelector('.cb-hero-icon.custom img');
		const brand = document.querySelector('.cb-brand-logo');
		return { src: img && img.getAttribute('src'), fit: getComputedStyle(brand).objectFit, shadow: getComputedStyle(brand).boxShadow };
	});
	assert.equal(hero.src, '../htdocs/luci-static/carbon/logo.svg?v=1');
	assert.equal(hero.fit, 'contain');
	assert.equal(hero.shadow, 'none');
	await ctx2.close();
});

/* plugin adapters (styles/18-plugins.css) against markup copied from luci-app-diskman */
const DISKMAN_FIXTURE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/htdocs/luci-static/carbon/carbon.css">
</head><body data-page="admin-system-diskman-disks"><div id="maincontent">
<table class="table cbi-section-table"><tbody><tr><td>/dev/sda</td><td>2.38 GB</td></tr>
<tr width="100%" style="white-space:nowrap;"><td style="margin:0px; padding:0px; border:0px; white-space:nowrap;" colspan="15">
<div title="sda1 fat16 128.00 MB" style="color:#525F7F; display:inline-block; text-align:center; background-color:#fbbd00; width:8%">sda1 fat16 128.00 MB </div><div title="sda2 squashfs 256.00 MB" style="color:#525F7F; display:inline-block; text-align:center; background-color:#e97c30; width:8.4%">sda2 squashfs 256.00 MB </div><div title="sda3 ext4 2.00 GB" style="color:#525F7F; display:inline-block; text-align:center; background-color:#a0e0a0; width:83.6%">sda3 ext4 2.00 GB </div>
</td></tr></tbody></table></div></body></html>`;

test('DiskMan partition bar stays inside its card on desktop and phone', async () => {
	for (const width of [1280, 390]) {
		const context = await browser.newContext({ viewport: { width, height: 800 } });
		const page = await context.newPage();
		await page.goto(base + '/src/preview/form.html');
		await page.setContent(DISKMAN_FIXTURE, { waitUntil: 'load' });
		const r = await page.evaluate(() => {
			const td = document.querySelector('td[colspan]');
			const segs = [...td.children].map((d) => d.getBoundingClientRect());
			return {
				pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
				inside: segs.every((b) => b.right <= td.getBoundingClientRect().right + 1),
				clipped: [...td.children].every((d) => getComputedStyle(d).textOverflow === 'ellipsis')
			};
		});
		assert.equal(r.pageScroll, 0, `${width}px: no sideways scroll`);
		assert.ok(r.inside, `${width}px: segments fit the row`);
		assert.ok(r.clipped, `${width}px: long labels ellipsize`);
		await context.close();
	}
});

test('settings page: buttons, links, fields and status text share one centre line', async () => {
	for (const width of [1200, 390]) {
		const { page, context, errors } = await open('/src/tests/fixtures/settings.html', { width });
		await page.waitForSelector('body[data-ready]');
		/* a status message next to the mirror field, as after saving */
		await page.evaluate(() => { document.querySelector('.cb-update-field .cb-update-note').textContent = '已保存。'; });
		const rows = await page.evaluate(() => [...document.querySelectorAll('.cb-update-actions, .cb-logo-actions, .cb-update-field')].map((row) => {
			const kids = [...row.children].filter((c) => c.offsetParent && c.getBoundingClientRect().width);
			/* compare items on the same line only (rows may wrap on phones) */
			const lines = {};
			kids.forEach((c) => {
				const r = c.getBoundingClientRect(), mid = r.top + r.height / 2;
				const key = Object.keys(lines).find((k) => Math.abs(k - mid) < 12) || mid;
				(lines[key] = lines[key] || []).push(mid);
			});
			return { row: row.className, spread: Math.max(...Object.values(lines).map((m) => Math.max(...m) - Math.min(...m))) };
		}));
		assert.equal(rows.length, 3, JSON.stringify(rows));
		const stray = await page.evaluate(() => [...document.querySelectorAll('#view *')].flatMap((el) => [...el.childNodes])
			.filter((n) => n.nodeType === 3 && /^(null|undefined)$/.test(n.textContent.trim())).length);
		assert.equal(stray, 0, 'no "null" / "undefined" text from absent children');
		/* release notes from the built-in renderer: structure, safe links, local scrolling */
		const notes = await page.evaluate(() => {
			const box = document.querySelector('.cb-release-notes');
			return {
				tags: ['h2', 'h3', 'ul', 'li', 'strong', 'table', 'pre', 'code'].filter((t) => box.querySelector(t)),
				links: [...box.querySelectorAll('a')].every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer'),
				fits: box.scrollWidth <= box.clientWidth + 1 || getComputedStyle(box).overflowX !== 'visible'
			};
		});
		assert.deepEqual(notes.tags, ['h2', 'h3', 'ul', 'li', 'strong', 'table', 'pre', 'code']);
		assert.ok(notes.links && notes.fits);
		if (width === 1200) await page.screenshot({ path: path.join(SHOTS, 'settings-release-notes.png'), fullPage: true });
		rows.forEach((r) => assert.ok(r.spread <= 0.5, `${width}px ${r.row}: ${r.spread}px off centre`));
		assert.deepEqual(errors, []);
		await context.close();
	}
});

test('settings page: the mirror explanation lives in a ? toggletip', async () => {
	for (const width of [1200, 390]) {
		const { page, context, errors } = await open('/src/tests/fixtures/settings.html', { width, height: 900 });
		await page.waitForSelector('body[data-ready]');
		const section = page.locator('section.cbi-section', { has: page.locator('#carbon-mirror') });
		assert.equal(await section.locator('.cbi-section-descr').count(), 0, 'no long paragraph on the page');
		const btn = section.locator('h3 .cb-hint-btn'), bubble = section.locator('.cb-hint-bubble');
		const shown = () => bubble.evaluate((b) => getComputedStyle(b).visibility === 'visible');
		assert.equal(await btn.getAttribute('aria-describedby'), await bubble.getAttribute('id'));
		assert.match(await bubble.textContent(), /HTTPS/);
		assert.equal(await shown(), false, 'hidden by default');
		await btn.hover();
		await page.waitForTimeout(200);
		assert.equal(await shown(), true, 'hover shows it');
		await page.mouse.move(5, 5);
		await page.waitForTimeout(200);
		assert.equal(await shown(), false, 'leaving hides it');
		await btn.click();
		await page.mouse.move(5, 5);
		await page.waitForTimeout(200);
		assert.equal(await shown(), true, 'a click pins it');
		assert.equal(await btn.getAttribute('aria-expanded'), 'true');
		const box = await bubble.boundingBox();
		assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px: bubble inside the window`);
		await page.mouse.click(5, 5);
		await page.waitForTimeout(200);
		assert.equal(await shown(), false, 'a click elsewhere closes it');
		await btn.click();
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
		assert.equal(await btn.getAttribute('aria-expanded'), 'false', 'Esc closes it');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Shift+Tab');
		await page.waitForTimeout(200);
		assert.equal(await shown(), true, 'keyboard focus shows it');
		if (width === 1200) {
			await page.mouse.move(5, 5);
			await btn.hover();
			await page.waitForTimeout(200);
			await section.screenshot({ path: path.join(SHOTS, 'settings-mirror-hint.png') });
		}
		assert.deepEqual(errors, []);
		await context.close();
	}
});

test('language switch is a Carbon listbox with every bundled language', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en');
	await page.waitForSelector('.cb-lang .cb-lb');
	assert.equal(await page.$('.cb-lang select'), null, 'no native select');
	assert.equal(await page.textContent('.cb-lang .cb-lb'), 'English');
	await page.click('.cb-lang .cb-lb');
	const list = await page.evaluate(() => {
		const ul = document.querySelector('.cb-lb-list');
		const r = ul.getBoundingClientRect(), t = document.querySelector('.cb-lang .cb-lb').getBoundingClientRect();
		return {
			labels: [...ul.children].map((li) => li.textContent),
			selected: [...ul.querySelectorAll('[aria-selected="true"]')].map((li) => li.textContent),
			expanded: document.querySelector('.cb-lang .cb-lb').getAttribute('aria-expanded'),
			focus: document.activeElement === ul,
			opensUp: r.bottom <= t.top, inView: r.top >= 0 && r.bottom <= innerHeight,
			bg: getComputedStyle(ul).backgroundColor
		};
	});
	assert.deepEqual(list.labels, ['Auto', 'English', 'Deutsch', 'Español', 'Français', 'Italiano', '日本語', '한국어',
		'Português do Brasil', 'Русский', 'Türkçe', 'Tiếng Việt', '简体中文', '繁體中文']);
	assert.deepEqual(list.selected, ['English']);
	assert.equal(list.expanded, 'true');
	assert.ok(list.focus, 'the list takes focus');
	assert.ok(list.opensUp && list.inView, 'opens above the footer trigger, inside the window');
	await Promise.all([page.waitForURL(/lang=zh-Hant/), page.click('.cb-lb-list li:has-text("繁體中文")')]);
	await page.waitForSelector('.cb-dash');
	assert.equal(await page.textContent('.cb-card.cb-traffic h3'), await page.evaluate(() => window.Carbon.I18N['Live Traffic']));
	assert.equal(await page.textContent('.cb-lang .cb-lb'), '繁體中文');
	await context.close();
});

test('language listbox: keyboard, type-ahead and dismissal', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en');
	await page.waitForSelector('.cb-lang .cb-lb');
	await page.focus('.cb-lang .cb-lb');
	await page.keyboard.press('ArrowDown');
	const activeText = () => page.evaluate(() => document.querySelector('.cb-lb-list li.active').textContent);
	assert.equal(await activeText(), 'English', 'opens on the current language');
	assert.equal(await page.evaluate(() => document.querySelector('.cb-lb-list').getAttribute('aria-activedescendant') === document.querySelector('.cb-lb-list li.active').id), true);
	await page.keyboard.press('End');
	assert.equal(await activeText(), '繁體中文');
	await page.waitForTimeout(150);
	assert.notEqual(await page.$('.cb-lb-list'), null, 'scrolling inside the list keeps it open');
	await page.keyboard.press('Home');
	assert.equal(await activeText(), 'Auto');
	await page.keyboard.type('fr');
	assert.equal(await activeText(), 'Français', 'type-ahead');
	await page.keyboard.press('Escape');
	assert.equal(await page.$('.cb-lb-list'), null, 'Escape closes');
	assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cb-lb')), true, 'focus returns to the trigger');
	assert.equal(new URL(page.url()).searchParams.get('lang'), 'en', 'nothing chosen yet');
	await page.click('.cb-lang .cb-lb');
	await page.mouse.click(700, 400);
	assert.equal(await page.$('.cb-lb-list'), null, 'an outside click closes');
	await page.focus('.cb-lang .cb-lb');
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	await Promise.all([page.waitForURL(/lang=de/), page.keyboard.press('Enter')]);
	await context.close();
});

test('language listbox opens beside the collapsed rail and returns focus to it', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en', { storage: { 'carbon.collapsed': '1' } });
	await page.waitForSelector('.cb-lang-mini');
	await page.click('.cb-lang-mini');
	const r = await page.evaluate(() => {
		const ul = document.querySelector('.cb-lb-list').getBoundingClientRect();
		return { left: ul.left, rail: document.getElementById('cb-sidebar').getBoundingClientRect().right, bottom: ul.bottom, h: innerHeight };
	});
	assert.ok(r.left >= r.rail, 'beside the rail');
	assert.ok(r.bottom <= r.h, 'inside the window');
	await page.keyboard.press('Escape');
	assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cb-lang-mini')), true);
	await page.click('.cb-lang-mini');
	await page.click('.cb-lang-mini');
	assert.equal(await page.$('.cb-lb-list'), null, 'the rail button toggles');
	await context.close();
});

test('segmented controls follow the radio pattern', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en');
	await page.waitForSelector('#cb-appearance .cb-seg-btn');
	await page.focus('#cb-appearance .cb-seg-btn[aria-checked="true"]');
	await page.keyboard.press('ArrowRight');           // auto | light | dark: light → dark
	assert.equal(await page.getAttribute('html', 'data-appearance'), 'dark');
	assert.deepEqual(await page.$$eval('#cb-appearance .cb-seg-btn', (b) => b.map((x) => x.tabIndex)), [-1, -1, 0]);
	assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-checked')), 'true');
	await context.close();
});

test('collapsed rail: keyboard opens and leaves the sub-menu, touch taps toggle it', async () => {
	const storage = { 'carbon.collapsed': '1', 'carbon.mode': 'pro' };
	let { page, context } = await open('/src/preview/index.html?lang=en', { storage });
	await page.waitForSelector('.cb-nav-head');
	await page.focus('.cb-nav-head');
	await page.keyboard.press('Enter');
	assert.equal(await page.evaluate(() => document.activeElement.closest('.cb-fly') !== null), true, 'focus moved into the flyout');
	await page.keyboard.press('Escape');
	assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cb-nav-head')), true);
	assert.equal(await page.$eval('.cb-fly', (f) => f.classList.contains('show')), false);
	await context.close();

	({ page, context } = await open('/src/preview/index.html?lang=en', { storage, touch: true }));
	await page.waitForSelector('.cb-nav-head');
	const before = page.url();
	await page.tap('.cb-nav-head');
	assert.equal(await page.$eval('.cb-fly', (f) => f.classList.contains('show')), true, 'tap shows the sub-menu');
	assert.equal(page.url(), before, 'tap does not navigate');
	await page.tap('.cb-hero');
	assert.equal(await page.$eval('.cb-fly', (f) => f.classList.contains('show')), false, 'tapping elsewhere closes it');
	await context.close();
});

test('phone drawer traps the page behind it and restores focus', async () => {
	const { page, context } = await open('/src/preview/index.html?lang=en', { width: 390, height: 844 });
	await page.waitForSelector('.cb-nav a');
	assert.equal(await page.$eval('#cb-sidebar', (e) => e.hasAttribute('inert')), true);
	await page.click('#cb-burger');
	assert.equal(await page.getAttribute('#cb-burger', 'aria-expanded'), 'true');
	assert.equal(await page.$eval('.cb-main', (e) => e.hasAttribute('inert')), true);
	assert.equal(await page.evaluate(() => document.activeElement.closest('#cb-sidebar') !== null), true);
	await page.keyboard.press('Escape');
	assert.equal(await page.evaluate(() => document.activeElement.id), 'cb-burger');
	assert.equal(await page.$eval('.cb-main', (e) => e.hasAttribute('inert')), false);
	await context.close();
});

async function styleSnapshot(url, width) {
	const { page, context, errors } = await open(url, { width, height: 900 });
	if (url.includes('index.html')) await dashboardReady(page);
	else await page.waitForSelector('.cb-login-card');
	await page.waitForTimeout(300);
	const props = ['display', 'position', 'color', 'background-color', 'background-image', 'font-size', 'font-weight', 'line-height',
		'padding-top', 'padding-left', 'margin-top', 'margin-left', 'border-top-width', 'border-top-color', 'border-top-left-radius',
		'gap', 'opacity', 'visibility', 'box-shadow', 'backdrop-filter', 'grid-template-columns', 'flex-direction', 'transform', 'text-decoration-line'];
	const snapshot = await page.evaluate((list) => [...document.querySelectorAll('body *:not(svg *)')]
		.filter((el) => !el.closest('.cb-chart, .cb-spark, .cb-ring'))
		.map((el) => { const cs = getComputedStyle(el); return el.tagName + '.' + el.className + ' ' + list.map((p) => cs.getPropertyValue(p)).join('|'); }), props);
	await context.close();
	return { snapshot, errors };
}

for (const [name, url, width] of [['overview', 'preview/index.html?lang=en', 1440], ['overview phone', 'preview/index.html?lang=en', 390], ['login', 'preview/login.html?lang=en', 1280]]) {
	test(`minified build computes the same styles: ${name}`, async () => {
		const src = await styleSnapshot('/src/' + url, width);
		const min = await styleSnapshot('/min/' + url, width);
		assert.deepEqual(min.errors, []);
		assert.equal(min.snapshot.length, src.snapshot.length);
		const diff = src.snapshot.map((line, i) => line === min.snapshot[i] ? null : line + '\n  ≠ ' + min.snapshot[i]).filter(Boolean);
		assert.deepEqual(diff.slice(0, 5), []);
	});
}
