'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/argon-compat.js'), 'utf8');

function fixture(nativeHas) {
 const groups = [], sections = [], observers = [];
 let scans = 0;
 const root = { nodeType: 1, matches: () => false, querySelectorAll: selector => { scans++; return selector === '.control-group' ? groups : sections; } };
 const api = new Function('baseclass', 'CSS', 'document', 'MutationObserver', source)(
  { extend: value => value }, { supports: () => nativeHas }, { body: root },
  function(callback) { this.observe = (node, options) => observers.push({ node, options, callback }); }
 );
 return { groups, sections, observers, root, scans: () => scans, start: () => api.__init__(), update: records => observers[0].callback(records) };
}
function node(kind) {
 const classes = new Set();
 return { nodeType: 1, matches: selector => kind === 'group' ? selector === '.control-group' : selector !== '.control-group', querySelectorAll: () => [], classes, classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } };
}

test('browsers with native relational selectors install no compatibility observer', () => {
 const state = fixture(true);
 state.start();
 assert.equal(state.observers.length, 0);
});

test('legacy controls and dropdown sections update after native renders and removals', () => {
 const state = fixture(false);
 state.start();
 assert.equal(state.observers.length, 1);
 assert.deepEqual(state.observers[0].options, { childList: true, subtree: true });
 const joined = node('group'), plain = node('group'), table = node('section');
 joined.firstElementChild = { matches: selector => selector === 'input', nextElementSibling: { matches: selector => selector === '.cbi-button' } };
 plain.firstElementChild = { matches: () => false };
 let dropdown = {};
 table.querySelector = () => dropdown;
 state.groups.push(joined, plain); state.sections.push(table); state.update([{ target: state.root, addedNodes: [joined, plain, table], removedNodes: [] }]);
 assert.equal(joined.classes.has('argon-joined-control'), true);
 assert.equal(plain.classes.size, 0);
 assert.equal(table.classes.has('argon-dropdown-section'), true);
 joined.firstElementChild.nextElementSibling = null; dropdown = null; state.update([
  { target: joined, addedNodes: [], removedNodes: [{ nodeType: 1 }] },
  { target: table, addedNodes: [], removedNodes: [{ nodeType: 1 }] }
 ]);
 assert.equal(joined.classes.size, 0);
 assert.equal(table.classes.size, 0);
});

test('counter text updates do not scan the document or unrelated controls', () => {
 const state = fixture(false); state.start(); const scans = state.scans();
 state.update([{ target: state.root, addedNodes: [{ nodeType: 3 }], removedNodes: [{ nodeType: 3 }] }]);
 assert.equal(state.scans(), scans);
});
