'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('htdocs/luci-static/resources/menu-carbon.js', 'utf8');

function fixture({ stamp, memory = false, fail = false } = {}) {
	const oldMenu = { title: 'Carbon Update' };
	const newMenu = { title: 'Carbon Theme Settings' };
	const data = { menu: oldMenu, 'carbon-menu-version': stamp, tab: { selected: 3 }, auth: 'unchanged' };
	let requests = 0, rendered;
	const session = {
		getLocalData: key => data[key],
		setLocalData: (key, value) => { data[key] = value; }
	};
	// Same two cache layers as LuCI ui.menu: an instance value and session data.
	const menu = {
		menu: memory ? oldMenu : null,
		flushCache() { session.setLocalData('menu', null); },
		load() {
			if (this.menu == null) this.menu = session.getLocalData('menu');
			if (!this.menu) {
				requests++;
				if (fail) return Promise.reject(new Error('offline'));
				this.menu = newMenu;
				session.setLocalData('menu', newMenu);
			}
			return Promise.resolve(this.menu);
		}
	};
	const subject = vm.runInNewContext('(function() {\n' + source + '\n})()', {
		baseclass: { extend: value => value }, ui: { menu }, session,
		rpc: { declare: () => () => {} }, fs: {},
		window: { Carbon: { version: '1.1.2' } },
		document: { documentElement: { getAttribute: () => 'zh' } }
	});
	subject.render = tree => { rendered = tree; };
	return { subject, data, oldMenu, newMenu, get rendered() { return rendered; }, get requests() { return requests; } };
}

test('old session menu refreshes without clearing login or selected tabs', async () => {
	const f = fixture();
	await f.subject.__init__();
	assert.equal(f.rendered, f.newMenu);
	assert.equal(f.data.auth, 'unchanged');
	assert.deepEqual(f.data.tab, { selected: 3 });
	assert.equal(f.requests, 1);
});

test('theme upgrade also invalidates a menu already loaded in memory', async () => {
	const f = fixture({ stamp: '1.1.1', memory: true });
	await f.subject.__init__();
	assert.equal(f.rendered, f.newMenu);
	assert.equal(f.data['carbon-menu-version'], '1.1.2');
});

test('normal navigation in the same version keeps the menu cache', async () => {
	const f = fixture({ stamp: '1.1.2', memory: true });
	await f.subject.__init__();
	assert.equal(f.rendered, f.oldMenu);
	assert.equal(f.requests, 0);
});

test('failed menu refresh does not mark the new version as loaded', async () => {
	const f = fixture({ stamp: '1.1.1', fail: true });
	await assert.rejects(() => f.subject.__init__(), /offline/);
	assert.equal(f.data['carbon-menu-version'], '1.1.1');
});
