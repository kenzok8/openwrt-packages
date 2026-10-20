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
		const node = Object.assign(new EventTarget(), {
			tag, attrs, children,
			value: attrs?.value || '', disabled: !!attrs?.disabled,
			classList: { add() {} },
			setAttribute(key, value) { this.attrs[key] = value; },
			appendChild(child) { this.children.push(child); },
			querySelector() { return this.children.find(child => child.tag === 'input'); }
		});
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
			const section = { map: this, option: (type, name, title) => {
				const option = {
					map: this, name, title, choices: {},
					value(key, label) { this.choices[key] = label; },
					depends(key, value) { this.dependency = [key, value]; },
					cbid(section) { return 'cbid.argon.' + section + '.' + name; },
					triggerValidation() { state.events.push('validate-' + name); },
					super(method, args) {
						assert.equal(method, 'renderWidget');
						if (typeof type === 'object') {
							const input = E('input', { type: 'text', value: args[2] ?? this.default, disabled: this.map.readonly }, []);
							input.addEventListener('change', () => state.events.push('change-' + name));
							return E('div', {}, [input]);
						}
						return { value: args[2], disabled: this.map.readonly };
					}
				};
				if (type === form.ListValue)
					Object.setPrototypeOf(option, form.ListValue.prototype);
				if (typeof type === 'object')
					Object.assign(option, type);
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
	const form = { Map, TypedSection() {}, TableSection() {}, Button() {}, Value() {}, ListValue: function() {} };
	form.Value.extend = properties => properties;
	form.ListValue.prototype.renderWidget = function(section, index, value) {
		return { value, disabled: this.map.readonly, choices: Object.keys(this.choices), isConnected: true };
	};
	form.ListValue.prototype.cfgvalue = function(section, value) {
		if (arguments.length === 2)
			this.loadedValue = value;
		return this.loadedValue ?? state.settings?.[this.name];
	};
	const rpc = { declare(spec) { return () => {
		if (state[spec.method + 'Error'])
			return Promise.reject(state[spec.method + 'Error']);
		return Promise.resolve(spec.method === 'avail' ? { avail: 100 } : { result: state[spec.method + 'Result'] || 0 });
	} } };
	const fileApi = {
		list() { return state.listError ? Promise.reject(state.listError) : Promise.resolve(state.files || [{ name: 'background.jpg', type: 'file', size: 10, mtime: 0 }]); },
		remove(filename) { state.cleanups.push(filename); return Promise.resolve(); }
	};
	const L = { dom: { callClassMethod(node, method, value) { assert.equal(method, 'setValue'); node.value = value; } }, bind: (fn, context) => fn.bind(context), resolveDefault: (promise, value) => Promise.resolve(promise).catch(() => value), resource: name => '/luci-static/resources/' + name };
	state.window = new EventTarget();
	state.view = new Function('form', 'fs', 'rpc', 'uci', 'ui', 'view', 'L', 'E', '_', 'cbi_update_table', 'location', 'document', 'branding', 'window', 'updates', source)(
		form, fileApi, rpc, { load: () => Promise.resolve(), get: (config, section, key) => state.settings?.[key] }, ui, { extend: value => value }, L, E,
		value => value, (table, rows) => { state.rows = rows; }, { reload() { state.reloads++; } },
		{ getElementById: id => state.nodes[id] },
		{ load: () => Promise.resolve({ result: 0 }), render: () => E('div', {}, []) }, state.window,
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
		assert.deepEqual(node.children[0].choices, ['classic', 'centered']);
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


test('integrated defaults keep local wallpapers and expose a masked Unsplash key', async () => {
 const state = fixture();
 await state.render();
 assert.equal(state.button('online_wallpaper').default, 'none');
 assert.equal(state.button('use_api_key').password, true);
 assert.deepEqual(state.button('use_api_key').dependency, ['online_wallpaper', 'unsplash']);
 for (const name of ['blur', 'blur_dark'])
  assert.equal(state.button(name).datatype, 'and(ufloat,range(0,100))');
});

test('read-only settings reject save, upload and delete handlers', async () => {
 const state = fixture({ readonly: true });
 await state.render();
 await state.button('_save').onclick();
 await state.button('_upload_bg').onclick({ target: {} });
 await state.rows[0][3].attrs.click();
 assert.deepEqual(state.events, []);
 assert.deepEqual(state.cleanups, []);
 assert.equal(state.reloads, 0);
});

test('dark appearance selectors default to automatic/shared and retain hidden custom values', async () => {
	for (const settings of [{}, { dark_primary: '#abc', blur: '5', blur_dark: '20' },
		{ dark_primary: '#abc', dark_primary_mode: 'auto', dark_glass_mode: 'inherit', blur_dark: '20' }]) {
		const state = fixture({ settings });
		await state.render();
		assert.equal(state.button('dark_primary_mode').cfgvalue('global'), settings.dark_primary_mode || (settings.dark_primary ? 'custom' : 'auto'));
		assert.equal(state.button('dark_glass_mode').cfgvalue('global'), settings.dark_glass_mode || (settings.blur_dark ? 'custom' : 'inherit'));
		for (const [name, selector] of [['dark_primary', 'dark_primary_mode'], ['blur_dark', 'dark_glass_mode'], ['transparency_dark', 'dark_glass_mode']]) {
			assert.deepEqual(state.button(name).dependency, [selector, 'custom']);
			assert.equal(state.button(name).retain, true);
		}
	}
});


test('background list excludes instructions, directories, and unsupported files', async () => {
 const files = [{ name: 'README.md', type: 'file' }, { name: 'folder.jpg', type: 'directory' },
  { name: 'script.html', type: 'file' }, { name: 'link.jpg', type: 'symlink' },
  { name: '背景.JPG', type: 'file' }, { name: 'video.webm', type: 'file' }];
 const state = fixture({ files });
 const data = await state.view.load();
 assert.deepEqual(data[2].map(file => file.name), ['背景.JPG', 'video.webm']);
});

test('both primary color fields synchronize the picker and preserve typed HEX values', async () => {
	const state = fixture();
	await state.render();
	for (const name of ['primary', 'dark_primary']) {
		const option = state.button(name);
		const node = option.renderWidget('global', 0, '#aBc');
		const [input, picker] = node.children;
		assert.equal(input.value, '#aBc');
		assert.equal(picker.value, '#aabbcc');
		assert.equal(picker.attrs['aria-label'], option.title);
		for (const value of ['#123456', '#ABC', '#000000', '#FFFFFF']) {
			input.value = value;
			input.dispatchEvent(new Event('input'));
			assert.equal(option.validate('global', value), true);
			assert.equal(input.value, value);
			assert.equal(picker.value, value.length === 4 ? '#aabbcc' : value.toLowerCase());
		}
		for (const value of ['', 'red', '#12', '#gggggg', '#12345678']) {
			input.value = value;
			input.dispatchEvent(new Event('input'));
			assert.notEqual(option.validate('global', value), true);
			assert.equal(input.value, value);
			assert.equal(picker.value, '#ffffff');
		}
		picker.value = '#13579b';
		picker.dispatchEvent(new Event('input'));
		assert.equal(input.value, '#13579b');
		assert.deepEqual(state.events.slice(-2), ['change-' + name, 'validate-' + name]);
		picker.value = '#2468ac';
		picker.dispatchEvent(new Event('change'));
		assert.equal(input.value, '#2468ac');
		const initial = option.renderWidget('global', 0, undefined).children;
		assert.equal(initial[0].value, option.default);
		assert.equal(initial[1].value, option.default);
	}
});

test('read-only color pickers remain disabled and cannot change the saved field', async () => {
	const state = fixture({ readonly: true });
	await state.render();
	for (const name of ['primary', 'dark_primary']) {
		const [input, picker] = state.button(name).renderWidget('global', 0, '#abc').children;
		assert.equal(input.disabled, true);
		assert.equal(picker.disabled, true);
		picker.value = '#123456';
		picker.dispatchEvent(new Event('input'));
		picker.dispatchEvent(new Event('change'));
		assert.equal(input.value, '#abc');
	}
	assert.deepEqual(state.events, []);
});

test('header mode changes synchronize the form without replacing other unsaved settings', async () => {
 const state = fixture({ settings: { mode: 'normal', primary: '#123456' } });
 await state.render();
 const option = state.button('mode');
 option.cfgvalue('global', 'light');
 assert.equal(option.cfgvalue('global'), 'light');
 const widget = option.renderWidget('global', 0, option.cfgvalue('global'));
 for (const mode of ['dark', 'light', 'normal']) {
  state.window.dispatchEvent(new CustomEvent('argon-appearance-saved', { detail: { mode } }));
  assert.equal(widget.value, mode);
  assert.equal(option.cfgvalue('global'), mode);
  assert.equal(state.settings.primary, '#123456');
  assert.deepEqual(state.events, []);
 }
 widget.isConnected = false;
 state.window.dispatchEvent(new CustomEvent('argon-appearance-saved', { detail: { mode: 'dark' } }));
 assert.equal(widget.value, 'normal');
});
