'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/argon/updates.js'), 'utf8');
String.prototype.format = function(value) { return this.replace('%s', value); };

function fixture(options = {}) {
	const state = { nodes: [], calls: [], args: [], watchers: new Set(), ...options };
	const E = (tag, attrs = {}, children = []) => {
		const node = { tag, attrs, children, isConnected: true, ...attrs, setAttribute(key, value) { this.attrs[key] = value; } };
		state.nodes.push(node);
		return node;
	};
	const rpc = { declare: spec => async (...args) => {
		assert.equal(spec.object, 'luci.argon_update');
		assert.equal(spec.raise, true);
		state.calls.push(spec.method);
		state.args.push(args);
		if (state[spec.method + 'Error']) throw new Error('network unavailable');
		if (spec.method === 'check') { await state.pending; return state.check; }
		if (spec.method === 'start') { await state.startPending; return state.start; }
		if (spec.method === 'status') return state.progress;
		return state.initial || { result: 0, current_version: '3.0.0-r1', package_manager: 'apk' };
	} };
	const ui = { showModal(title, children) { state.modal = { title, children }; }, hideModal() { state.modal = null; } };
	const poll = { add(fn) { state.watchers.add(fn); }, remove(fn) { state.watchers.delete(fn); } };
	state.api = new Function('baseclass', 'rpc', 'ui', 'poll', 'window', 'E', '_', source)(
		{ extend: v => v }, rpc, ui, poll, { location: { reload() { state.reloaded = true; } } }, E, v => v);
	state.render = async () => state.api.render(await state.api.load(), { readonly: !!state.readonly });
	state.find = (tag, value) => state.nodes.find(n => n.tag === tag && (n.textContent || n.children) === value);
	state.installButton = () => state.nodes.find(n => n.tag === 'button' && n.children === 'Update now');
	state.confirm = () => state.nodes.filter(n => n.tag === 'button' && n.children === 'Update now').at(-1).click();
	state.tick = () => Promise.all(Array.from(state.watchers, fn => fn()));
	state.button = () => state.nodes.find(n => n.tag === 'button');
	state.status = () => state.nodes.find(n => n.role === 'status').children[1].textContent;
	return state;
}
function checked(current, latest = '3.0.0-r2', manager = 'apk') {
	return { result: 0, can_upgrade: true, upgrade: { phase: 'idle', active: false }, current_version: current, package_manager: manager, tag: 'v' + latest.match(/^[0-9]+(?:\.[0-9]+)*/)[0],
		apk: manager === 'apk' ? 'luci-theme-argon-' + latest + '.apk' : '',
		ipk: manager === 'opkg' ? 'luci-theme-argon_' + latest + '_all.ipk' : '',
		notes: '## Changes\n\n- Fixed layout.', checked_at: 1792468800 };
}

test('loading the settings reads local state without a remote check; checks are explicit', async () => {
	const f = fixture({ check: checked('3.0.0-r1') });
	await f.render();
	assert.deepEqual(f.calls, ['get']);
	assert.equal(f.status(), 'Not checked yet.');
	assert.equal(f.find('a', 'Download package').hidden, true);
	await f.button().click();
	assert.deepEqual(f.calls, ['get', 'check']);
	assert.equal(f.status(), 'Update available.');
	assert.match(f.find('a', 'Download package').href, /v3\.0\.0\/luci-theme-argon-3\.0\.0-r2\.apk$/);
	assert.equal(f.nodes.find(n => n.tag === 'details').open, true);
});

test('package revisions, numeric versions, prereleases and locally newer builds compare correctly', async () => {
	for (const [current, latest, manager, expected] of [
		['3.0.0-r1', '3.0.0-r2', 'apk', 'Update available.'],
		['3.0.0', '3.0.0-2', 'opkg', 'Update available.'],
		['3.0.0-2', '3.0.0-2', 'opkg', 'Your theme is up to date.'],
		['3.0.0-r2', '3.0.0-r2', 'apk', 'Your theme is up to date.'],
		['3.0.0-r20261015', '3.0.0-r2', 'apk', 'The installed version is newer than the latest stable release.'],
		['3.0.0-r20261015', '3.0.1-r1', 'apk', 'Update available.'],
		['3.9.0-r1', '3.10.0-r1', 'apk', 'Update available.'],
		['3.0.0_rc1-r2', '3.0.0-r1', 'apk', 'Update available.'],
		['3.0.0~beta1-2', '3.0.0', 'opkg', 'Update available.'],
		['unknown', '3.0.0-r2', 'apk', 'Unable to compare this version. View the release for details.']
	]) {
		const f = fixture({ initial: checked(current, latest, manager) });
		await f.render();
		assert.equal(f.status(), expected, `${current} / ${latest}`);
	}
});

test('unmatched packages and unknown managers cannot produce an up-to-date claim or download link', async () => {
	for (const patch of [{ apk: 'luci-theme-argon-4.0.0-r2.apk' }, { apk: '../../unsafe.apk' }, { package_manager: 'unknown' }, { apk: '' }]) {
		const f = fixture({ initial: { ...checked('3.0.0-r2'), ...patch } });
		await f.render();
		assert.equal(f.find('a', 'Download package').hidden, true);
		assert.equal(f.status(), 'Unable to compare this version. View the release for details.');
	}
});

test('repeated clicks share a check and restore the button after transport or backend failure', async () => {
	for (const patch of [{ checkError: true }, { check: { result: 1 } }, { check: { result: 0, tag: 'not-a-version' } }]) {
		let finish;
		const f = fixture({ ...patch, pending: new Promise(resolve => { finish = resolve; }) });
		await f.render();
		const first = f.button().click();
		assert.equal(f.button().disabled, true);
		await f.button().click();
		assert.deepEqual(f.calls, ['get', 'check']);
		finish(); await first;
		assert.equal(f.button().disabled, false);
		assert.match(f.status(), /^Unable to check for updates/);
	}
});

test('failed checks preserve cached notes, versions and release links', async () => {
	const f = fixture({ initial: checked('3.0.0-r1'), checkError: true });
	await f.render();
	const link = f.find('a', 'View release').href;
	const notes = f.nodes.find(n => n.tag === 'pre').textContent;
	await f.button().click();
	assert.equal(f.find('a', 'View release').href, link);
	assert.equal(f.nodes.find(n => n.tag === 'pre').textContent, notes);
	assert.match(f.status(), /^Unable to check for updates/);
});

test('release notes remain text, are bounded, and have an explicit empty state', async () => {
	for (const text of ['<img src=x onerror=alert(1)>\n<script>alert(1)</script>', '', '文'.repeat(40000)]) {
		const f = fixture({ initial: { ...checked('3.0.0-r2'), notes: text } });
		await f.render();
		const notes = f.nodes.find(n => n.tag === 'pre');
		assert.equal(notes.innerHTML, undefined);
		assert.equal(notes.textContent, text ? text.slice(0,32768) + (text.length > 32768 ? '\n…' : '') : 'No release notes were published.');
	}
});

test('a failed local state load can recover through a manual check', async () => {
	const f = fixture({ getError: true, check: checked('3.0.0-r1') });
	await f.render();
	assert.match(f.status(), /^Unable to check for updates/);
	await f.button().click();
	assert.equal(f.status(), 'Update available.');
});


test('installation is offered only for an upgrade with backend verification and write access', async () => {
	for (const [patch, readonly, visible] of [
		[{}, false, true], [{ can_upgrade: false }, false, false], [{ current_version: '3.0.0-r2' }, false, false],
		[{ current_version: '3.0.0-r20261015' }, false, false], [{ apk: '' }, false, false], [{}, true, false]
	]) {
		const f = fixture({ initial: { ...checked('3.0.0-r1'), ...patch }, readonly });
		await f.render();
		assert.equal(f.installButton().hidden, !visible);
		if (!visible) { f.installButton().click(); assert.equal(f.modal, undefined); }
	}
});

test('confirmation names the version and cancellation never starts installation', async () => {
	const f = fixture({ initial: checked('3.0.0-r1') });
	await f.render();
	f.installButton().click();
	assert.equal(f.modal.title, 'Update Argon to 3.0.0-r2?');
	assert.equal(f.button().disabled, true);
	await f.button().click();
	f.find('button', 'Cancel').click();
	assert.equal(f.modal, null);
	assert.equal(f.installButton().disabled, false);
	assert.deepEqual(f.calls, ['get']);
});

test('confirmed upgrade runs once, polls phases, records plain logs and offers a reload', async () => {
	const f = fixture({ initial: checked('3.0.0-r1'), start: { result: 0, upgrade: { phase: 'starting', active: true } } });
	await f.render(); f.installButton().click(); await f.confirm();
	assert.deepEqual(f.calls, ['get', 'start']);
	assert.deepEqual(f.args.at(-1), ['v3.0.0', 'luci-theme-argon-3.0.0-r2.apk']);
	assert.equal(f.watchers.size, 1);
	assert.equal(f.button().disabled, true);
	f.installButton().click();
	await f.button().click();
	assert.deepEqual(f.calls, ['get', 'start']);
	for (const [phase, text] of [['downloading', 'Downloading the update...'], ['verifying', 'Verifying the package...'], ['installing', 'Installing the update. Please wait...']]) {
		f.progress = { result: 0, current_version: '3.0.0-r1', upgrade: { phase, active: true } };
		await f.tick(); assert.equal(f.status(), text);
	}
	const upgrade = { phase: 'complete', active: false, log: '<script>bad()</script>Installed' };
	f.progress = { result: 0, current_version: '3.0.0-r2', upgrade };
	f.initial = { ...checked('3.0.0-r2'), can_upgrade: false, upgrade };
	await f.tick();
	assert.equal(f.watchers.size, 0);
	assert.equal(f.installButton().hidden, true);
	assert.match(f.status(), /^Update installed/);
	const log = f.nodes.filter(n => n.tag === 'pre').at(-1);
	assert.equal(log.textContent, upgrade.log);
	assert.equal(log.innerHTML, undefined);
	const reload = f.find('button', 'Reload page');
	assert.equal(reload.hidden, false);
	reload.click(); assert.equal(f.reloaded, true);
});

test('page reload resumes monitoring; connection failures keep installation disabled until status recovers', async () => {
	const f = fixture({ initial: { ...checked('3.0.0-r1'), upgrade: { phase: 'installing', active: true } }, statusError: true });
	await f.render(); assert.equal(f.watchers.size, 1);
	await f.tick(); assert.match(f.status(), /^Unable to read update progress/);
	assert.equal(f.installButton().disabled, true);
	f.statusError = false;
	const upgrade = { phase: 'failed', active: false, error: 'install', log: 'database locked' };
	f.initial = { ...checked('3.0.0-r1'), upgrade };
	f.progress = { result: 0, current_version: '3.0.0-r1', upgrade };
	await f.tick();
	assert.equal(f.watchers.size, 0);
	assert.equal(f.installButton().disabled, false);
	assert.match(f.status(), /^Installation failed/);
});

test('a lost start response cannot trigger a duplicate installation and stale metadata requires another check', async () => {
	const f = fixture({ initial: checked('3.0.0-r1'), startError: true });
	await f.render(); f.installButton().click(); await f.confirm();
	assert.equal(f.watchers.size, 1);
	assert.match(f.status(), /^Unable to read update progress/);
	f.installButton().click(); assert.equal(f.calls.filter(m => m === 'start').length, 1);
	for (const result of [3, 5]) {
		const stale = fixture({ initial: checked('3.0.0-r1'), start: { result } });
		await stale.render(); stale.installButton().click(); await stale.confirm();
		assert.equal(stale.watchers.size, 0);
		assert.equal(stale.installButton().hidden, true);
		assert.match(stale.status(), /Check for updates again/);
	}
});

test('monitoring stops when its card is removed', async () => {
	const f = fixture({ initial: { ...checked('3.0.0-r1'), upgrade: { phase: 'installing', active: true } } });
	await f.render();
	f.progress = { result: 0, current_version: '3.0.0-r1', upgrade: { phase: 'installing', active: true } };
	await f.tick();
	f.nodes.find(n => n.attrs.class === 'argon-update-content').isConnected = false;
	await f.tick();
	assert.equal(f.watchers.size, 0);
	assert.deepEqual(f.calls, ['get', 'status']);
});


test('an early idle poll cannot finish monitoring before the start response arrives', async () => {
	let accept;
	const f = fixture({ initial: checked('3.0.0-r1'), startPending: new Promise(resolve => { accept = resolve; }),
		start: { result: 0, upgrade: { phase: 'starting', active: true } },
		progress: { result: 0, current_version: '3.0.0-r1', upgrade: { phase: 'idle', active: false } } });
	await f.render(); f.installButton().click(); const starting = f.confirm();
	await f.tick();
	assert.equal(f.watchers.size, 1);
	assert.equal(f.installButton().disabled, true);
	accept(); await starting;
	assert.equal(f.watchers.size, 1);
	assert.equal(f.calls.filter(m => m === 'start').length, 1);
	assert.equal(f.status(), 'Preparing the update...');
});

test('a resumed job waits for its card to mount before polling', async () => {
	const f = fixture({ initial: { ...checked('3.0.0-r1'), upgrade: { phase: 'installing', active: true } },
		progress: { result: 0, current_version: '3.0.0-r1', upgrade: { phase: 'installing', active: true } } });
	await f.render();
	const content = f.nodes.find(n => n.attrs.class === 'argon-update-content');
	content.isConnected = false; await f.tick();
	assert.equal(f.watchers.size, 1);
	assert.deepEqual(f.calls, ['get']);
	content.isConnected = true; await f.tick();
	assert.deepEqual(f.calls, ['get', 'status']);
});

test('monitoring follows a new job started while the previous terminal status was being read', async () => {
	const f = fixture({ initial: { ...checked('3.0.0-r1'), upgrade: { phase: 'installing', active: true } },
		progress: { result: 0, current_version: '3.0.0-r1', upgrade: { phase: 'failed', active: false, error: 'install' } } });
	await f.render();
	f.initial = { ...checked('3.0.0-r1'), upgrade: { phase: 'downloading', active: true } };
	await f.tick();
	assert.equal(f.watchers.size, 1);
	assert.equal(f.installButton().disabled, true);
	assert.equal(f.status(), 'Downloading the update...');
});


test('historical successful installs render as up to date after reloading, without pending update actions', async () => {
	for (const manager of ['apk', 'opkg']) {
		const current = manager === 'apk' ? '3.0.0-r2' : '3.0.0-2';
		const initial = { ...checked(current, current, manager), can_upgrade: false,
			upgrade: { phase: 'complete', active: false, version: current, log: 'Installed' } };
		const f = fixture({ initial, check: initial });
		await f.render();
		assert.equal(f.status(), 'Your theme is up to date.');
		assert.equal(f.find('button', 'Reload page').hidden, true);
		assert.equal(f.installButton().hidden, true);
		assert.equal(f.find('a', 'Download package').hidden, true);
		assert.equal(f.nodes.find(n => n.role === 'status').attrs['data-state'], 'current');
		assert.equal(f.nodes.find(n => n.attrs.class === 'argon-update-status-icon').hidden, false);
		assert.ok(f.nodes.filter(n => n.tag === 'details').every(n => !n.open));
		await f.button().click();
		assert.equal(f.status(), 'Your theme is up to date.');
		assert.ok(f.nodes.filter(n => n.tag === 'details').every(n => !n.open));
		assert.equal(f.find('button', 'Reload page').hidden, true);
	}
});

test('a previous completed job cannot conceal a newly available release', async () => {
	const f = fixture({ initial: { ...checked('3.0.0-r2', '3.0.0-r3'),
		upgrade: { phase: 'complete', active: false, version: '3.0.0-r2' } } });
	await f.render();
	assert.equal(f.status(), 'Update available.');
	assert.equal(f.installButton().hidden, false);
	assert.equal(f.find('button', 'Reload page').hidden, true);
	assert.equal(f.find('a', 'Download package').hidden, false);
});

test('completion collapses notes once and requires a reload for a job observed in this document', async () => {
	const current = '3.0.0-r2';
	const f = fixture({ initial: { ...checked(current),
		upgrade: { phase: 'installing', active: true, version: current } } });
	await f.render();
	const details = f.nodes.filter(n => n.tag === 'details');
	details.forEach(n => { n.open = true; });
	const upgrade = { phase: 'complete', active: false, version: current, log: 'Installed' };
	f.initial = { ...checked(current), can_upgrade: false, upgrade };
	f.progress = { result: 0, current_version: current, upgrade };
	await f.tick();
	assert.match(f.status(), /^Update installed/);
	assert.equal(f.find('button', 'Reload page').hidden, false);
	assert.ok(details.every(n => !n.open));
	assert.equal(f.find('a', 'Download package').hidden, true);
});

test('recovering a failed local read does not treat a historical installation as a new one', async () => {
	const f = fixture({ getError: true, check: { ...checked('3.0.0-r2'), can_upgrade: false,
		upgrade: { phase: 'complete', active: false, version: '3.0.0-r2' } } });
	await f.render(); await f.button().click();
	assert.equal(f.status(), 'Your theme is up to date.');
	assert.equal(f.find('button', 'Reload page').hidden, true);
});

test('failed refreshes remove the success icon while preserving the last checked versions', async () => {
	const f = fixture({ initial: checked('3.0.0-r2'), checkError: true });
	await f.render();
	const icon = f.nodes.find(n => n.attrs.class === 'argon-update-status-icon');
	assert.equal(icon.hidden, false);
	await f.button().click();
	assert.match(f.status(), /^Unable to check for updates/);
	assert.equal(icon.hidden, true);
	assert.equal(f.nodes.find(n => n.role === 'status').attrs['data-state'], 'error');
});
