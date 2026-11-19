'use strict';
'require baseclass';
'require fs';
'require rpc';

/* Only query the configured read-only collector. Existing installations use nlbwmon. */
const callConfig = rpc.declare({ object: 'uci', method: 'get', params: ['config'], expect: { values: {} } });
let config = null, configAt = 0;

function interval(values) {
	const sections = Object.values(values || {}).filter((s) => s && s['.type'] === 'nlbwmon');
	if (sections.length !== 1) return null;
	const m = /^(\d+)([smhdw]?)$/.exec(String(sections[0].refresh_interval == null ? '30s' : sections[0].refresh_interval));
	if (!m) return null;
	const seconds = Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 })[m[2]];
	return seconds > 0 && seconds <= 2147483 ? Math.max(5, seconds) : null;
}

async function nlbwSample() {
	const now = Date.now();
	if (!config || now - configAt >= 300000) {
		config = await callConfig('nlbwmon');
		configAt = now;
	}
	const seconds = interval(config);
	if (seconds == null) return null;
	const result = await fs.exec_direct('/usr/sbin/nlbw', ['-c', 'json', '-g', 'mac', '-n'], 'json');
	return { source: 'nlbwmon', interval: seconds, columns: result && result.columns, data: result && result.data };
}

async function nftSample() {
	// Query only named counters, not the potentially large ruleset or sets.
	const result = await fs.exec_direct('/usr/sbin/nft', ['-j', 'list', 'counters', 'table', 'inet', 'carbon_acct'], 'json');
	if (!result || !Array.isArray(result.nftables)) return null;
	const devices = new Map();
	for (const entry of result.nftables) {
		const c = entry && entry.counter;
		if (!c || c.family !== 'inet' || c.table !== 'carbon_acct') continue;
		const m = /^carbon_(down|up)_([0-9a-f]{12})$/.exec(c.name || '');
		if (!m || m[2] === '000000000000') continue;
		const mac = m[2].match(/../g).join(':');
		const d = devices.get(mac) || {};
		// A bad device must not suppress other devices' valid counters.
		if (!Number.isSafeInteger(c.bytes) || c.bytes < 0 || d[m[1]] != null) d.invalid = true;
		d[m[1]] = c;
		devices.set(mac, d);
	}
	const data = [];
	devices.forEach((d, mac) => {
		if (d.invalid || !d.down || !d.up) return;
		// Object recreation invalidates only this device's baseline.
		const identity = JSON.stringify([d.down.handle ?? null, d.up.handle ?? null]);
		data.push([mac, d.down.bytes, d.up.bytes, identity]);
	});
	if (!data.length) return null;
	return { source: 'nftables', interval: 5, columns: ['mac', 'rx_bytes', 'tx_bytes', 'identity'], data };
}

return baseclass.extend({
	read(source) {
		return source === 'nftables' ? nftSample() : nlbwSample();
	}
});
