'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/argon-config.js'), 'utf8');
String.prototype.format = function(...values) {
	let index = 0;
	return String(this).replace(/%s/g, () => String(values[index++]));
};
String.format = format => format;

function fixture(options = {}) {
	const state = { notifications: [], reloads: 0, cleanups: [], events: [], nodes: {}, ...options };
	const E = (tag, attrs, children) => {
		const node = { tag, attrs, children };
		if (attrs && attrs.id)
			state.nodes[attrs.id] = node;
		return node;
	};
	const ui = {
		changes: { apply() { state.events.push('apply'); } },
		addNotification(title, node) { state.notifications.push(node.attrs); },
		createHandlerFn(context, fn) { return fn.bind(context); },
		uploadFile() {
			return state.uploadError ? Promise.reject(state.uploadError) : Promise.resolve({ name: '背景.jpg' });
		}
	};
	class Map {
		constructor() {
			state.map = this;
			this.readonly = state.readonly;
			this.sections = [];
			this.options = [];
		}
		section() {
			const section = { map: this, option: (type, name) => {
				const option = {
					map: this, name, choices: {},
					value(key, label) { this.choices[key] = label; },
					cbid(section) { return 'cbid.argon.' + section + '.' + name; },
					super(method, args) {
						assert.equal(method, 'renderWidget');
						return { value: args[2], disabled: this.map.readonly };
					}
				};
				this.options.push(option);
				return option;
			} };
			this.sections.push(section);
			return section;
		}
		save() {
			state.events.push('save-start');
			return (state.saveTask || Promise.resolve()).then(() => state.events.push('save-complete'));
		}
		render() { return this.sections.map(section => section.render ? section.render() : null); }
	}
	const form = { Map, TypedSection() {}, TableSection() {}, Button() {}, Value() {}, ListValue() {} };
	const rpc = { declare(spec) { return () => {
		if (state[spec.method + 'Error'])
			return Promise.reject(state[spec.method + 'Error']);
		return Promise.resolve(spec.method === 'avail' ? { avail: 100 } : { result: state[spec.method + 'Result'] || 0 });
	} } };
	const fileApi = {
		list() { return state.listError ? Promise.reject(state.listError) : Promise.resolve([{ name: 'background.jpg', size: 10, mtime: 0 }]); },
		remove(filename) { state.cleanups.push(filename); return Promise.resolve(); }
	};
	const L = { bind: (fn, context) => fn.bind(context), resolveDefault: (promise, value) => Promise.resolve(promise).catch(() => value), resource: name => '/luci-static/resources/' + name };
	state.view = new Function('form', 'fs', 'rpc', 'uci', 'ui', 'view', 'L', 'E', '_', 'cbi_update_table', 'location', 'document', 'branding', source)(
		form, fileApi, rpc, { load: () => Promise.resolve() }, ui, { extend: value => value }, L, E,
		value => value, (table, rows) => { state.rows = rows; }, { reload() { state.reloads++; } },
		{ getElementById: id => state.nodes[id] },
		{ load: () => Promise.resolve({ result: 0 }), render: () => E('div', {}, []) }
	);
	state.render = async () => state.view.render(await state.view.load());
	state.button = name => state.map.options.find(option => option.name === name);
	return state;
}

test('apply starts only after saving finishes', async () => {
	let finish;
	const state = fixture({ saveTask: new Promise(resolve => { finish = resolve; }) });
	await state.render();
	const task = state.button('_save').onclick();
	assert.deepEqual(state.events, ['save-start']);
	finish();
	await task;
	assert.deepEqual(state.events, ['save-start', 'save-complete', 'apply']);
});

test('login style selector previews supported values and falls back for old configs', async () => {
	const state = fixture({ readonly: true });
	await state.render();
	const option = state.button('login_style');
	assert.deepEqual(Object.keys(option.choices), ['classic', 'centered']);
	assert.equal(option.default, 'classic');
	assert.equal(option.rmempty, false);
	for (const value of [undefined, '', 'classic', 'centered', '../invalid']) {
		const style = value === 'centered' ? 'centered' : 'classic';
		const node = option.renderWidget('global', 0, value);
		assert.equal(node.children[0].value, style);
		assert.equal(node.children[0].disabled, true);
		assert.equal(node.children[1].attrs.src, '/luci-static/resources/argon-config/login-' + style + '.svg');
		assert.equal(node.children[1].attrs.alt, option.choices[style]);
		assert.ok(fs.existsSync(path.join(__dirname, '../htdocs/luci-static/resources/argon-config/login-' + style + '.svg')));
	}
	const preview = state.nodes[option.cbid('global') + '-preview'];
	for (const style of ['centered', 'classic']) {
		option.onchange(null, 'global', style);
		assert.equal(preview.src, '/luci-static/resources/argon-config/login-' + style + '.svg');
		assert.equal(preview.alt, option.choices[style]);
	}
});

test('failed saves are reported and never applied', async () => {
	const state = fixture({ saveTask: Promise.reject(new Error('validation failed')) });
	await state.render();
	await state.button('_save').onclick();
	assert.deepEqual(state.events, ['save-start']);
	assert.deepEqual(state.notifications, ['validation failed']);
});

test('failed background and space reads still render the settings', async () => {
	const state = fixture({ listError: new Error('missing directory'), availError: new Error('RPC unavailable') });
	const data = await state.view.load();
	assert.deepEqual(data[1], { avail: 0 });
	assert.deepEqual(data[2], []);
	assert.doesNotThrow(() => state.view.render(data));
	assert.equal(state.notifications.length, 2);
});

test('successful deletion reloads; failed RPC results and transport errors are reported', async () => {
	for (const options of [{}, { removeResult: 1 }, { removeError: new Error('permission denied') }]) {
		const state = fixture(options);
		await state.render();
		await state.rows[0][3].attrs.click();
		const success = !options.removeResult && !options.removeError;
		assert.equal(state.reloads, success ? 1 : 0);
		assert.equal(state.notifications.length, success ? 0 : 1);
	}
});

test('read-only sessions cannot click the delete button', async () => {
	const state = fixture({ readonly: true });
	await state.render();
	assert.equal(state.rows[0][3].attrs.disabled, true);
});

test('failed finalization cleans an uploaded temporary file and reports the error', async () => {
	for (const options of [{ renameResult: 255 }, { renameError: new Error('permission denied') }]) {
		const state = fixture(options);
		await state.render();
		await state.button('_upload_bg').onclick({ target: {} });
		assert.equal(state.reloads, 0);
		assert.equal(state.notifications.length, 1);
		assert.deepEqual(state.cleanups, ['/tmp/argon_background.tmp']);
	}
});

test('successful upload reloads; cancellation does not remove another upload', async () => {
	for (const options of [{}, { uploadError: new Error('cancelled') }]) {
		const state = fixture(options);
		await state.render();
		await state.button('_upload_bg').onclick({ target: {} });
		assert.equal(state.reloads, options.uploadError ? 0 : 1);
		assert.deepEqual(state.cleanups, []);
	}
});
