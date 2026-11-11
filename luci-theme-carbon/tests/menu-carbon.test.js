'use strict';

// LuCI glue: poll gating under the dashboard and the language list/switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('htdocs/luci-static/resources/menu-carbon.js', 'utf8');

function load({ uci = {}, lang = 'en' } = {}) {
	const calls = [], indicators = [];
	const poll = {
		running: true,
		active() { return this.running; },
		start() { calls.push('start'); this.running = true; },
		stop() { calls.push('stop'); this.running = false; }
	};
	const writes = [];
	const declare = ({ object, method }) => (...args) => {
		if (object === 'uci' && method === 'get') return Promise.resolve((uci[args[0]] || {})[args[1]] || {});
		if (object === 'uci' && method === 'set') { writes.push(['set', ...args]); return Promise.resolve(0); }
		if (object === 'uci' && method === 'commit') { writes.push(['commit', ...args]); return Promise.resolve(0); }
		return Promise.resolve({});
	};
	const listeners = {};
	const context = {
		baseclass: { extend: (v) => v }, session: {}, fs: {}, poll,
		ui: { menu: {}, hideIndicator: (id) => indicators.push(id) },
		rpc: { declare },
		L: { resolveDefault: (p, d) => Promise.resolve(p).catch(() => d) },
		window: { Carbon: { version: 'test' }, setTimeout: (fn) => fn() },
		E: () => ({}),
		document: {
			getElementById: (id) => id === 'maincontent' ? { insertBefore() {} } : null,
			documentElement: { getAttribute: () => lang },
			addEventListener: (name, fn) => { listeners[name] = fn; }
		}
	};
	const subject = vm.runInNewContext('(function() {\n' + source + '\n})()', context);
	return { subject, poll, calls, indicators, writes, listeners, context };
}

test('collapsed details pause LuCI polling and hide the paused badge; expanding resumes', () => {
	const f = load();
	f.subject.gatePoll(false);
	assert.deepEqual(f.calls, ['stop']);
	assert.deepEqual(f.indicators, ['poll-status']);
	f.subject.gatePoll(false);
	assert.deepEqual(f.calls, ['stop'], 'no repeated stop');
	f.subject.gatePoll(true);
	assert.deepEqual(f.calls, ['stop', 'start']);
});

test('a poll started later by the status view is stopped again while collapsed', () => {
	const f = load();
	let toggle;
	f.context.window.Carbon = {
		Dashboard: { mount() {} },
		mode: { get: () => 'simple' },
		detailsToggle: (host, open, onToggle) => { toggle = onToggle; onToggle(false); }
	};
	f.subject.mountDashboard('admin', {});
	assert.deepEqual(f.calls, ['stop']);
	f.poll.running = true;              // status/index.js calls poll.add() after our mount
	f.listeners['poll-start']();
	assert.deepEqual(f.calls, ['stop', 'stop']);
	toggle(true);
	f.listeners['poll-start']();
	assert.deepEqual(f.calls, ['stop', 'stop', 'start'], 'expanded details keep LuCI polling');
});

test('language list offers English plus installed catalogues with native names', async () => {
	const f = load({ uci: { luci: {
		languages: { '.name': 'languages', '.type': 'internal', zh_cn: '简体中文 (Chinese Simplified)', zh_tw: '繁體中文 (Chinese Traditional)', de: 'Deutsch (German)', 'bad key': 'x' },
		main: { lang: 'auto' }
	} } });
	const info = await f.subject.language.load();
	assert.deepEqual(JSON.parse(JSON.stringify(info.options.map((o) => [o.code, o.label, o.short]))), [
		['en', 'English', 'EN'], ['de', 'Deutsch', 'DE'], ['zh_cn', '简体中文', '简'], ['zh_tw', '繁體中文', '繁']
	]);
	assert.equal(info.selected, 'auto');
});

test('a single Chinese catalogue is labelled 中; unknown saved languages fall back to auto', async () => {
	const f = load({ uci: { luci: { languages: { zh_cn: '中文 (Chinese)' }, main: { lang: 'fr' } } } });
	const info = await f.subject.language.load();
	assert.equal(info.options[1].short, '中');
	assert.equal(info.selected, 'auto');
});

test('switching language writes luci.main.lang only for installed languages', async () => {
	const f = load({ uci: { luci: { languages: { zh_cn: '简体中文 (Chinese Simplified)' }, main: { lang: 'en' } } } });
	await f.subject.language.set('zh_cn');
	assert.deepEqual(JSON.parse(JSON.stringify(f.writes)), [['set', 'luci', 'main', { lang: 'zh_cn' }], ['commit', 'luci']]);
	await assert.rejects(() => f.subject.language.set('ru'), /not installed/);
	await f.subject.language.set('auto');
	assert.equal(f.writes.length, 4);
});
