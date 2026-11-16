'use strict';
'require baseclass';
'require fs';
'require rpc';

/* Read-only adapter for OpenWrt's optional nlbwmon collector. Never starts a
 * service, flushes counters, commits a database or changes its configuration. */
const callConfig = rpc.declare({ object: 'uci', method: 'get', params: ['config'], expect: { values: {} } });
let config = null, configAt = 0;

function interval(values) {
	const sections = Object.values(values || {}).filter((s) => s && s['.type'] === 'nlbwmon');
	if (sections.length !== 1) return null;
	// 30 seconds is the upstream default when the option is omitted.
	const m = /^(\d+)([smhdw]?)$/.exec(String(sections[0].refresh_interval == null ? '30s' : sections[0].refresh_interval));
	if (!m) return null;
	const seconds = Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 })[m[2]];
	return seconds > 0 && seconds <= 2147483 ? Math.max(5, seconds) : null;
}

return baseclass.extend({
	async read() {
		const now = Date.now();
		if (!config || now - configAt >= 300000) {
			config = await callConfig('nlbwmon');
			configAt = now;
		}
		const seconds = interval(config);
		if (seconds == null) return null;
		// Fixed command: device addresses and user input never become arguments.
		const data = await fs.exec_direct('/usr/sbin/nlbw', ['-c', 'json', '-g', 'mac', '-n'], 'json');
		return { interval: seconds, columns: data && data.columns, data: data && data.data };
	}
});
