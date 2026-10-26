'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/menu-argon.js'), 'utf8');

function fixture() {
	function element() {
		const classes = new Set();
		return {
			attributes: {}, listeners: {}, disabled: false, focused: false,
			classList: {
				add: name => classes.add(name),
				remove: name => classes.delete(name),
				contains: name => classes.has(name)
			},
			setAttribute(name, value) { this.attributes[name] = value; },
			addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
			click() { for (const handler of this.listeners.click || []) handler({ currentTarget: this }); },
			focus() { this.focused = true; }
		};
	}

	const button = element(), sidebar = element(), mask = element(), content = element();
	const nodes = { '.showSide': button, '#mainmenu': sidebar, '.darkMask': mask, '.main-right': content };
	const document = {
		listeners: {},
		querySelector: selector => nodes[selector] || null,
		addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
	};
	let finishLoad;
	const loaded = new Promise(resolve => { finishLoad = resolve; });
	const menu = new Function('baseclass', 'ui', 'L', 'document', source)(
		{ extend: object => object },
		{
			menu: { load: () => loaded },
			createHandlerFn() { throw new Error('Synchronous navigation must not disable its controls'); }
		},
		{
			bind: (fn, context) => fn.bind(context),
			env: { dispatchpath: ['admin', 'status', 'overview'] }
		},
		document
	);
	let mainRenders = 0, tabRenders = 0;
	menu.renderModeMenu = () => { mainRenders++; };
	menu.renderTabMenu = () => { tabRenders++; };
	return { menu, button, sidebar, mask, content, document, loaded, finishLoad,
		mainRenders: () => mainRenders, tabRenders: () => tabRenders };
}

function assertOpen(f, open) {
	for (const node of [f.button, f.sidebar, f.mask, f.content])
		assert.equal(node.classList.contains('active'), open);
	assert.equal(f.button.attributes['aria-expanded'], String(open));
	assert.equal(f.button.disabled, false);
}

test('the first sidebar tap is preserved while menu data is still loading', async () => {
	const f = fixture();
	f.menu.__init__();
	f.button.click();
	assertOpen(f, true);
	assert.equal(f.mainRenders(), 0);

	f.finishLoad({ children: { admin: { children: { status: {} } } } });
	await f.loaded;
	assert.equal(f.mainRenders(), 1);
	assertOpen(f, true);
	f.mask.click();
	assertOpen(f, false);
});

test('cached menus missing the current route do not abort navigation rendering', () => {
	for (const tree of [
		{ children: { admin: { children: { status: {} } } } },
		{ children: { admin: { children: {} } } },
		{}
	]) {
		const f = fixture();
		f.menu.__init__();
		assert.doesNotThrow(() => f.menu.render(tree));
		assert.equal(f.mainRenders(), 1);
		assert.equal(f.tabRenders(), 0);
		f.button.click();
		assertOpen(f, true);
	}
});

test('rendering tabs again does not duplicate sidebar events, and Escape restores focus', async () => {
	const f = fixture();
	const tree = { children: { admin: { children: { status: { children: { overview: {} } } } } } };
	f.menu.__init__();
	f.finishLoad(tree);
	await f.loaded;
	f.menu.render(tree);
	assert.equal(f.tabRenders(), 2);
	assert.equal(f.button.listeners.click.length, 1);
	assert.equal(f.mask.listeners.click.length, 1);
	f.button.click();
	assertOpen(f, true);
	for (const handler of f.document.listeners.keydown)
		handler({ key: 'Escape' });
	assertOpen(f, false);
	assert.equal(f.button.focused, true);
});
