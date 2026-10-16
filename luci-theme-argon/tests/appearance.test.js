'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/argon-appearance.js'), 'utf8');

function fixture(options = {}) {
 const state = { persisted: 'normal', writable: true, calls: [], notifications: [], saved: [], frames: new Map(), ...options };
 class Node extends EventTarget {
  constructor(tag, attrs = {}, children = []) { super(); this.tag = tag; this.attrs = attrs; Object.assign(this, attrs); if (attrs.disabled != null) this.disabled = true; this.children = (Array.isArray(children) ? children : [children]).filter(Boolean); this.dataset = {}; this.classList = { add() {}, remove() {} }; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  contains(node) { return node === this || this.children.some(c => c?.contains?.(node)); }
  focus() { state.focus = this; document.activeElement = this; }
 }
 const root = new Node('div', { hidden: true }), html = new Node('html'); html.dataset.argonMode = 'normal';
 const document = Object.assign(new EventTarget(), { documentElement: html, getElementById: () => root, querySelectorAll: () => [] });
 const window = Object.assign(new EventTarget(), { matchMedia: () => state.preference });
 state.preference = Object.assign(new EventTarget(), { matches: false });
 window.addEventListener('argon-appearance-saved', e => state.saved.push(e.detail.mode));
 const rpc = { declare: spec => async (...args) => {
  assert.equal(spec.raise, true); state.calls.push([spec.method, ...args]);
  if (spec.method === 'access') return state.writable;
  if (spec.method === 'get') { if (state.getError) throw Error('offline'); return { result: 0, mode: state.persisted }; }
  await state.pending;
  if (state.setError) throw Error('offline');
  if (state.result) return { result: state.result };
  state.persisted = args[0];
  if (state.lostReply) throw Error('lost reply');
  return { result: 0, mode: state.persisted };
 } };
 const api = new Function('baseclass', 'rpc', 'ui', 'document', 'window', 'E', '_', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', source)(
  { extend: x => x }, rpc, { addNotification: (title, node) => state.notifications.push(node) }, document, window,
  (tag, attrs, children) => new Node(tag, attrs, children), x => x,
  () => ({ getPropertyValue: () => '#123456' }), fn => { const id = (state.frameId || 0) + 1; state.frameId = id; state.frames.set(id, fn); return id; }, id => state.frames.delete(id)
 );
 Object.assign(state, { api, root, html, window, document });
 state.start = () => api.__init__();
 return state;
}

test('theme shortcut updates immediately, commits one mode, and announces saved state', async () => {
 let finish; const state = fixture({ pending: new Promise(r => { finish = r; }) });
 await state.start(); state.api.open(true);
 assert.equal(state.root.hidden, false);
 assert.ok(state.api.radios.every(r => !r.disabled));
 assert.equal(state.focus.checked, true);
 const task = state.api.saveMode('dark');
 assert.equal(state.html.dataset.argonMode, 'dark');
 assert.equal(state.api.panel.hidden, true);
 assert.ok(state.api.radios.every(r => r.disabled));
 assert.equal(state.focus, state.api.trigger);
 await state.api.saveMode('light');
 assert.equal(state.calls.filter(c => c[0] === 'set').length, 1);
 finish(); await task;
 assert.equal(state.persisted, 'dark'); assert.deepEqual(state.saved, ['dark']);
 assert.ok(state.api.radios.every(r => !r.disabled));
 assert.equal(state.api.message.textContent, 'Theme mode saved.');
});

test('failed writes reconcile stored state and restore usable controls', async () => {
 for (const options of [{ result: 1 }, { setError: true }, { setError: true, getErrorAfterStart: true }]) {
  const state = fixture(options); await state.start(); state.getError = !!options.getErrorAfterStart;
  await state.api.saveMode('dark');
  assert.equal(state.html.dataset.argonMode, 'normal'); assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].attrs.role, 'alert'); assert.equal(state.api.busy, false);
  assert.ok(state.api.radios.every(r => !r.disabled)); assert.deepEqual(state.saved, []);
 }
 const lost = fixture({ lostReply: true }); await lost.start(); await lost.api.saveMode('dark');
 assert.equal(lost.html.dataset.argonMode, 'dark'); assert.equal(lost.notifications.length, 0); assert.deepEqual(lost.saved, ['dark']);
});

test('read-only, unavailable, invalid, and repeated mode changes never write', async () => {
 const readonly = fixture({ writable: false }); await readonly.start(); await readonly.api.saveMode('dark');
 assert.ok(readonly.api.radios.every(r => r.disabled)); assert.equal(readonly.calls.filter(c => c[0] === 'set').length, 0);
 const offline = fixture({ getError: true }); await offline.start(); assert.equal(offline.root.hidden, true);
 const state = fixture(); await state.start(); await state.api.saveMode('bogus'); await state.api.saveMode('normal');
 assert.equal(state.calls.filter(c => c[0] === 'set').length, 0);
});

test('Escape and outside focus close the panel, while system changes never write', async () => {
 const state = fixture(); await state.start(); state.api.open(true);
 const escape = new Event('keydown', { cancelable: true }); escape.key = 'Escape'; state.root.dispatchEvent(escape);
 assert.equal(state.api.panel.hidden, true); assert.equal(state.focus, state.api.trigger); assert.equal(escape.defaultPrevented, true);
 state.api.open(true); const blur = new Event('focusout'); blur.relatedTarget = {}; state.root.dispatchEvent(blur);
 assert.equal(state.api.panel.hidden, true);
 state.preference.matches = true; state.preference.dispatchEvent(new Event('change'));
 assert.equal(state.html.dataset.argonMode, 'normal'); assert.equal(state.calls.filter(c => c[0] === 'set').length, 0);
});

test('holding an option keeps choices open until native label activation completes', async () => {
 const state = fixture(); await state.start(); state.api.open(true);
 const blur = new Event('focusout'); blur.relatedTarget = null; state.root.dispatchEvent(blur);
 state.document.activeElement = {};
 for (const frame of state.frames.values()) frame(); state.frames.clear();
 assert.equal(state.api.panel.hidden, false);
 state.api.radios[0].focus();
 assert.equal(state.api.panel.hidden, false);
 state.window.dispatchEvent(new Event('blur'));
 assert.equal(state.api.panel.hidden, true);
});
