'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(process.env.ARGON_GRAPH_SOURCE || path.join(__dirname, '../htdocs/luci-static/resources/argon-graphs.js'), 'utf8');

function fixture() {
 const state = { dirty: false, flushes: 0, graphs: [], frames: [] };
 const read = () => { if (state.dirty) state.flushes++; state.dirty = false; };
 function graph(left) {
  const svg = { isConnected: true, attrs: {}, width: 200,
   hasAttribute: name => name in svg.attrs,
   setAttribute(name, value) { svg.attrs[name] = value; state.dirty = true; },
   get clientHeight() { read(); return 100; },
   getBoundingClientRect() { read(); return { left, right: left + svg.width, width: svg.width }; }
  };
  svg.texts = Array.from({ length: 20 }, (_, i) => {
   const x = i * 500 / 19;
   const text = { getAttribute: () => x, style: new Proxy({}, { set(obj, key, value) { state.dirty = true; obj[key] = value; return true; } }),
    getBoundingClientRect() { read(); const values = [...(text.style.transform || '').matchAll(/\(([-\d.]+)/g)].map(m => +m[1]);
     const ratio = svg.width / 500, start = left + (x * (values[1] || 1) + (values[0] || 0)) * ratio;
     return { left: start, right: start + 24 };
    }
   };return text;
  });
  svg.querySelectorAll = selector => selector === 'text' ? svg.texts : [{ points: { numberOfItems: 2, getItem: i => ({ x: i * 500 }) } }];
  return svg;
 }
 state.graphs = [graph(0), graph(250)];
 const view = { querySelectorAll: () => state.graphs };
 const api = new Function('baseclass','document','window','ResizeObserver','MutationObserver','requestAnimationFrame',source)(
  { extend: x => x }, { querySelector: () => view }, { ResizeObserver: true },
  function(callback) { state.resize = callback; this.observe = () => {}; }, function() { this.observe = () => {}; }, fn => state.frames.push(fn)
 );
 api.__init__();state.run = () => { while (state.frames.length) state.frames.shift()(); };return state;
}

test('chart labels batch layout reads and remain inside resized plots', () => {
 const state = fixture();state.run();
 assert.ok(state.flushes <= 2, `Expected at most two layout flushes, got ${state.flushes}`);
 for (const svg of state.graphs) {
  assert.equal(svg.attrs.viewBox,'0 0 500 100');
  for (const text of svg.texts) { const label = text.getBoundingClientRect(),plot = svg.getBoundingClientRect();assert.ok(label.left >= plot.left + 3.9 && label.right <= plot.right - 3.9); }
 }
 state.graphs[0].width = 150;state.resize();state.run();
 for (const text of state.graphs[0].texts) assert.ok(text.getBoundingClientRect().right <= 146.1);
});

test('detached plots stop receiving updates', () => {
 const state = fixture();state.run();const removed = state.graphs[0];removed.isConnected = false;state.graphs = state.graphs.slice(1);
 const previous = removed.texts[0].style.transform;removed.width = 50;state.resize();state.run();assert.equal(removed.texts[0].style.transform,previous);
});
