'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/argon/branding.js'), 'utf8');
const image = 'image-' + 'a'.repeat(64) + '.png';

function fixture(options = {}) {
	const state = { notifications: [], uploads: [], calls: [], cleanups: [], buttons: [], images: [], ...options };
	let config = { result: 0, favicon: '', logo: '' };
	const E = (tag, attrs, children) => {
		const node = { tag, attrs, children, ...attrs, appendChild(child) { this.children.push(child); } };
		if (tag === 'button') state.buttons.push(node);
		if (tag === 'img') state.images.push(node);
		return node;
	};
	const rpc = { declare: spec => async (...args) => {
		assert.equal(spec.raise, true);
		state.calls.push([spec.method, ...args]);
		if (state.rpcError) throw new Error('permission denied');
		if (state.result) return { result: state.result };
		if (spec.method !== 'get') {
			for (const kind of (args[0] === 'both' ? ['favicon', 'logo'] : [args[0]]))
				config[kind] = spec.method === 'set' ? image : '';
		}
		return { ...config };
	} };
	const api = new Function('baseclass', 'fs', 'rpc', 'ui', 'L', 'E', '_', 'crypto', source)(
		{ extend: obj => obj }, { remove: async file => { state.cleanups.push(file); } }, rpc,
		{ uploadFile: async file => {
			state.uploads.push(file);
			if (state.uploadError) throw new Error('cancelled');
			await state.pending;
		}, addNotification: (title, node) => state.notifications.push(node.children) },
		{ resource: value => '/luci-static/resources/' + value, resolveDefault: promise => promise.catch(() => {}) },
		E, value => value, webcrypto
	);
	state.render = async () => api.render({ readonly: state.readonly }, await api.load());
	state.click = index => state.buttons[index].click();
	return state;
}

test('branding can be set independently, shared, and restored without reloading the form', async () => {
	const state = fixture();
	await state.render();
	assert.equal(state.buttons[1].disabled, true);
	await state.click(0);
	assert.ok(state.images[0].src.endsWith(image));
	assert.ok(state.images[1].src.endsWith('argon.svg'));
	assert.equal(state.buttons[1].disabled, false);
	await state.click(2);
	await state.click(1);
	assert.ok(state.images[0].src.endsWith('favicon-32x32.png'));
	assert.ok(state.images[1].src.endsWith(image));
	await state.click(4);
	assert.ok(state.images.every(node => node.src.endsWith(image)));
	assert.equal(state.notifications.length, 0);
	assert.equal(new Set(state.uploads).size, 3);
	assert.deepEqual(state.cleanups, state.uploads);
	for (const file of state.uploads) assert.match(file, /^\/tmp\/argon_branding_[0-9a-f]{32}\.png$/);
});

test('failed uploads and RPC operations keep the previews and restore the controls', async () => {
	for (const options of [{ uploadError: true }, { result: 2 }, { result: 3 }, { result: 1 }, { rpcError: true }]) {
		const state = fixture();
		await state.render();
		Object.assign(state, options);
		await state.click(0);
		assert.ok(state.images[0].src.endsWith('favicon-32x32.png'));
		assert.equal(state.notifications.length, 1);
		assert.equal(state.buttons[0].disabled, false);
		assert.deepEqual(state.cleanups, state.uploads);
		if (options.uploadError) assert.equal(state.calls.length, 1);
	}
});

test('read-only and unavailable backends never allow mutations', async () => {
	for (const options of [{ readonly: true }, { rpcError: true }]) {
		const state = fixture(options);
		await state.render();
		assert.ok(state.buttons.every(button => button.disabled));
		for (let i = 0; i < state.buttons.length; i++) await state.click(i);
		assert.deepEqual(state.calls, [['get']]);
		assert.equal(state.uploads.length, 0);
	}
});

test('pending uploads prevent overlapping updates and leave controls usable afterwards', async () => {
	let finish;
	const state = fixture({ pending: new Promise(resolve => { finish = resolve; }) });
	await state.render();
	const upload = state.click(4);
	await Promise.resolve();
	assert.ok(state.buttons.every(button => button.disabled));
	await state.click(0);
	assert.equal(state.uploads.length, 1);
	finish();
	await upload;
	assert.ok(state.buttons.every(button => !button.disabled));
});
