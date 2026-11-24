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
			attributes: {}, listeners: {}, style: {}, disabled: false, focused: false,
			classList: {
				add: name => classes.add(name),
				remove: name => classes.delete(name),
				contains: name => classes.has(name),
				toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
			},
			removeAttribute(name) { delete this.attributes[name]; },
			setAttribute(name, value) { this.attributes[name] = value; },
			addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
			click() { for (const handler of this.listeners.click || []) handler({ currentTarget: this }); },
			focus() { document.activeElement = this; this.focused = true; }
		};
	}

	const button = element(), sidebar = element(), mask = element(), content = element();
	const close = element(), header = element(), mobile = element();
	mobile.matches = true;
	sidebar.contains = node => node === close;
	const firstLink = element();
	sidebar.querySelector = () => firstLink;
	const nodes = { '.sidebar-close': close, '.showSide': button, '#mainmenu': sidebar, '.darkMask': mask, '.main-right': content };
	const document = {
		body: element(),
		listeners: {},
		querySelectorAll: () => [header],
		querySelector: selector => nodes[selector] || null,
		addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
	};
	let finishLoad;
	const loaded = new Promise(resolve => { finishLoad = resolve; });
	const menu = new Function('baseclass', 'ui', 'L', 'document', 'window', source)(
		{ extend: object => object },
		{
			menu: { load: () => loaded },
			createHandlerFn() { throw new Error('Synchronous navigation must not disable its controls'); }
		},
		{
			bind: (fn, context) => fn.bind(context),
			env: { dispatchpath: ['admin', 'status', 'overview'] }
		},
		document, { matchMedia: () => mobile }
	);
	let mainRenders = 0, tabRenders = 0;
	menu.renderModeMenu = () => { mainRenders++; };
	menu.renderTabMenu = () => { tabRenders++; };
	return { menu, button, close, firstLink, header, mobile, sidebar, mask, content, document, loaded, finishLoad,
		mainRenders: () => mainRenders, tabRenders: () => tabRenders };
}

function assertOpen(f, open) {
	for (const node of [f.button, f.sidebar, f.mask, f.content])
		assert.equal(node.classList.contains('active'), open);
	assert.equal(f.button.attributes['aria-expanded'], String(open));
	assert.equal(f.button.disabled, false);
	assert.equal(f.sidebar.inert, f.mobile.matches && !open);
	assert.equal(!!f.header.inert, open);
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
		handler({ key: 'Escape', preventDefault() {} });
	assertOpen(f, false);
	assert.equal(f.button.focused, true);
});

test('resizing an open drawer releases the page and restores desktop navigation', () => {
	const f = fixture();
	f.menu.__init__();
	assertOpen(f, false);
	f.button.click();
	assert.equal(f.document.activeElement, f.close);
	assert.equal(f.sidebar.attributes['aria-modal'], 'true');
	f.mobile.matches = false;
	f.mobile.listeners.change[0]();
	assertOpen(f, false);
	assert.equal(f.sidebar.attributes['aria-modal'], undefined);
});

test('a LuCI modal takes focus and releases the drawer before Escape', () => {
	const f = fixture();
	f.menu.__init__();
	f.button.click();
	f.document.body.classList.add('modal-overlay-active');
	f.document.activeElement = { closest: selector => selector === '#modal_overlay' };
	f.document.listeners.focusin[0]({ target: f.document.activeElement });
	assertOpen(f, false);
	f.document.listeners.keydown[0]({ key: 'Escape', preventDefault: () => assert.fail('Escape belongs to LuCI') });
	assert.notEqual(f.document.activeElement, f.button);
});

test('widening a closed drawer transfers focus from the mobile trigger to desktop navigation', () => {
	const f = fixture();
	f.menu.__init__();
	f.button.focus();
	f.mobile.matches = false;
	f.mobile.listeners.change[0]();
	assert.equal(f.document.activeElement, f.firstLink);
});
