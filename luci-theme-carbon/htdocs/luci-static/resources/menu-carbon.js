'use strict';
'require baseclass';
'require ui';
'require session';
'require rpc';
'require fs';
'require poll';
'require carbon.traffic as traffic';

/*
 * Carbon — LuCI glue.
 * Reads LuCI's menu tree, renders the sidebar / tab bar and mounts the
 * dashboard on Status → Overview. Everything visual lives in carbon.js.
 * All calls below are read-only, except the interface language switch.
 */

const callBoard = rpc.declare({ object: 'system', method: 'board', expect: { '': {} } });
const callInfo = rpc.declare({ object: 'system', method: 'info', expect: { '': {} } });
const callIfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { 'interface': [] } });
const callDevice = rpc.declare({ object: 'network.device', method: 'status', params: [ 'name' ], expect: { '': {} } });
const callNetDevs = rpc.declare({ object: 'luci-rpc', method: 'getNetworkDevices', expect: { '': {} } });
const callLeases = rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases', expect: { '': {} } });
const callWireless = rpc.declare({ object: 'network.wireless', method: 'status', expect: { '': {} } });
const callHostHints = rpc.declare({ object: 'luci-rpc', method: 'getHostHints', expect: { '': {} } });
const callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });
const callUciGet = rpc.declare({ object: 'uci', method: 'get', params: [ 'config', 'section' ], expect: { values: {} } });
const callUciSet = rpc.declare({ object: 'uci', method: 'set', params: [ 'config', 'section', 'values' ] });
const callUciCommit = rpc.declare({ object: 'uci', method: 'commit', params: [ 'config' ] });
const callSetDashboard = rpc.declare({
	object: 'luci.carbon_update', method: 'set_dashboard',
	params: [ 'action', 'hero', 'sections', 'monitor', 'tiles', 'details' ],
	expect: { '': {} }, raise: true
});
const callSetSimpleMenu = rpc.declare({
	object: 'luci.carbon_update', method: 'set_simple_menu',
	params: [ 'action', 'common', 'system' ],
	expect: { '': {} }, raise: true
});

const mapRpcError = (err) => {
	const msg = String(err && (err.message || err.code || err) || '');
	if (/denied|forbidden|403|-32002|ubus code 6/i.test(msg)) {
		const denied = new Error('denied');
		denied.code = 'denied';
		throw denied;
	}
	throw err;
};

/*
 * Interface language: lists the installed LuCI catalogues (luci.languages)
 * and writes luci.main.lang — exactly what System → System → Language does —
 * then the page reloads. English is built in; "auto" follows the browser.
 */
const nativeName = (label, code) => String(label || code).replace(/\s*\(.*\)\s*$/, '') || code;
const shortName = (code, zhCount) => {
	if (/^zh/i.test(code))
		return zhCount > 1 ? (/hant|tw|hk|mo/i.test(code) ? '繁' : '简') : '中';
	return code.slice(0, 2).toUpperCase();
};
const language = {
	current: document.documentElement.getAttribute('lang') || 'en',
	load: () => Promise.all([
		callUciGet('luci', 'languages').catch(() => ({})),
		callUciGet('luci', 'main').catch(() => ({}))
	]).then(([langs, main]) => {
		const codes = Object.keys(langs || {}).filter((k) => k.charAt(0) !== '.' && k !== 'en' && /^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})?$/.test(k)).sort();
		const zhCount = codes.filter((k) => /^zh/i.test(k)).length;
		const options = [{ code: 'en', label: 'English', short: 'EN' }].concat(codes.map((k) => ({
			code: k, label: nativeName(langs[k], k), short: shortName(k, zhCount)
		})));
		const lang = main && main.lang;
		return { options: options, selected: (lang && (lang === 'auto' || options.some((o) => o.code === lang))) ? lang : 'auto' };
	}),
	set: (code) => language.load().then((info) => {
		if (code !== 'auto' && !info.options.some((o) => o.code === code))
			throw new Error('Language not installed: ' + code);

		return callUciSet('luci', 'main', { lang: code });
	}).then((rc) => {
		if (typeof rc === 'number' && rc !== 0)
			throw new Error('uci set failed: ' + rc);

		return callUciCommit('luci');
	}).then((rc) => {
		if (typeof rc === 'number' && rc !== 0)
			throw new Error('uci commit failed: ' + rc);
	})
};

/* system.info mixes sysinfo() and /proc/meminfo, which can describe different
 * memory limits under LXC/lxcfs. Keep all memory fields in the proc view. */
function readMemoryInfo(text) {
	if (typeof text !== 'string') return null;
	const values = {};
	text.split('\n').forEach((line) => {
		const match = line.match(/^(MemTotal|MemFree|MemAvailable|Buffers|Cached|Shmem|SwapTotal|SwapFree):\s+(\d+)\s+kB\s*$/);
		if (!match) return;
		const bytes = Number(match[2]) * 1024;
		if (Number.isSafeInteger(bytes)) values[match[1]] = bytes;
	});
	if (!(values.MemTotal > 0) || values.MemFree == null) return null;
	const memory = {
		total: values.MemTotal,
		free: values.MemFree,
		buffered: values.Buffers || 0,
		cached: values.Cached || 0,
		shared: values.Shmem || 0
	};
	/* Leave available absent on older kernels so the dashboard uses
	 * free + buffered + cached, rather than treating cache as used. */
	if (values.MemAvailable != null) memory.available = values.MemAvailable;
	const result = { memory: memory };
	if (values.SwapTotal != null && values.SwapFree != null)
		result.swap = { total: values.SwapTotal, free: values.SwapFree };
	return result;
}

const provider = {
	board: () => callBoard().then((r) => (r && r.hostname) ? r : null),
	info: () => Promise.all([
		callInfo(),
		fs.read('/proc/meminfo').catch(() => null)
	]).then(([r, text]) => {
		if (!r || !(r.memory || r.uptime != null)) return null;
		const meminfo = readMemoryInfo(text);
		return meminfo ? Object.assign({}, r, meminfo) : r;
	}),
	cpuStat: () => fs.read('/proc/stat'),
	interfaces: () => callIfaces().then((r) => (Array.isArray(r) && r.length) ? r : null),
	devStats: (dev, alt) => callDevice(dev).then((r) => {
		if (r && r.statistics && r.statistics.rx_bytes != null)
			return r.statistics;

		return callNetDevs().then((all) => {
			const d = (all && (all[dev] || (alt && all[alt]))) || null;
			return (d && d.stats) ? d.stats : null;
		});
	}),
	netDevices: () => callNetDevs().then((r) => (r && typeof r === 'object' && Object.keys(r).length) ? r : null),
	leases: () => callLeases().then((r) => (r && Array.isArray(r.dhcp_leases)) ? r : null),
	wireless: () => callWireless(),
	hostHints: () => callHostHints(),
	/* associated Wi‑Fi stations of the given AP interfaces */
	stations: (ifnames) => Promise.all((ifnames || []).map((dev) => callAssoc(dev)
		.then((list) => Array.isArray(list) ? list.map((st) => Object.assign({ ifname: dev }, st)) : null)
		.catch(() => null))).then((lists) => {
		/* every call refused (e.g. a session from before an upgrade): unknown, not "none" */
		if (lists.length && lists.every((l) => l === null)) return null;
		return [].concat.apply([], lists.filter(Boolean));
	}),
	neighbors: () => fs.read('/proc/net/arp'),
	deviceTraffic: () => traffic.read(document.querySelector('.cb-app')?.dataset.trafficSource === 'nftables' ? 'nftables' : 'nlbwmon'),
	conntrack: () => Promise.all([
		fs.read('/proc/sys/net/netfilter/nf_conntrack_count'),
		fs.read('/proc/sys/net/netfilter/nf_conntrack_max').catch(() => null)
	]),
	temperatures: () => (sensors || (sensors = findSensors())).then((list) => Promise.all(list.map((s) =>
		fs.read(s.path).then((v) => ({ name: s.name, value: parseInt(v, 10) })).catch(() => null)
	))).then((r) => r.filter((x) => x && x.value > -40000 && x.value < 200000))
};

/*
 * Temperature sensors: every thermal zone plus the first input of each hwmon
 * device (CPU, SoC, Wi‑Fi chips, x86 coretemp …). Discovered once per page.
 * Sessions from before an upgrade may only be allowed to read zone 0.
 * rpcd (since 2026-07) re-checks the ACL against the symlink target, so the
 * ACL lists both the /sys/class/… links and their /sys/devices/… targets.
 * Deduplicate thermal→hwmon virtual bridges, trailing "-thermal" variants,
 * firmware drivers (scpi_sensors / scmi_sensors) that also register a CPU/SoC
 * thermal zone, and x86_pkg_temp when coretemp is available.
 */
let sensors = null;
const listEntries = (dir, pattern) => L.resolveDefault(fs.list(dir), []).then((entries) =>
	(entries || []).filter((e) => e && pattern.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
const listNames = (dir, pattern) => listEntries(dir, pattern).then((entries) => entries.map((e) => e.name));
const readName = (path, fallback) => L.resolveDefault(fs.read(path), '').then((v) => String(v || '').trim() || fallback);
const sensorKey = (name) => {
	const raw = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
	return raw.replace(/thermal$/, '') || raw;
};
const isThermalBridge = (target) => /(?:^|\/)virtual\/thermal(?:\/|$)/.test(String(target || ''));
const isCpuThermalZone = (name) => /^(cpu|soc|aml|cluster|big|little|core|pkg|sys|die|tsens|thermalzone)/.test(sensorKey(name));
const isFirmwareSensor = (name) => /^sc[pm]isensors$/.test(sensorKey(name));
function findSensors() {
	const thermal = listNames('/sys/class/thermal', /^thermal_zone\d+$/).then((zones) => Promise.all(zones.slice(0, 8).map((z) =>
		readName('/sys/class/thermal/' + z + '/type', z).then((name) => ({ name: name, path: '/sys/class/thermal/' + z + '/temp' })))));
	const hwmon = listEntries('/sys/class/hwmon', /^hwmon\d+$/).then((devs) => Promise.all(devs.slice(0, 8).map((d) =>
		listNames('/sys/class/hwmon/' + d.name, /^temp\d+_input$/).then((inputs) => inputs.length ? readName('/sys/class/hwmon/' + d.name + '/name', d.name)
			.then((name) => ({ name: name, path: '/sys/class/hwmon/' + d.name + '/' + inputs[0], target: d.target || '' })) : null))));
	return Promise.all([thermal, hwmon]).then((r) => {
		const zones = r[0].filter(Boolean);
		const mons = r[1].filter(Boolean);
		const hasCoretemp = mons.some((s) => sensorKey(s.name) === 'coretemp');
		const keptZones = hasCoretemp ? zones.filter((s) => sensorKey(s.name) !== 'x86pkgtemp') : zones;
		const hasCpuZone = keptZones.some((s) => isCpuThermalZone(s.name));
		const keptMons = mons.filter((s) => {
			if (zones.length && isThermalBridge(s.target)) return false;
			if (hasCoretemp && sensorKey(s.name) === 'x86pkgtemp') return false;
			if (hasCpuZone && isFirmwareSensor(s.name)) return false;
			return true;
		});
		const seen = {}, list = [];
		keptZones.concat(keptMons).forEach((s) => {
			const key = sensorKey(s.name);
			if (!seen[key]) { seen[key] = true; list.push({ name: s.name, path: s.path }); }
		});
		return list.length ? list : [{ name: '', path: '/sys/class/thermal/thermal_zone0/temp' }];
	});
}

return baseclass.extend({
	language: language,

	__init__() {
		const version = window.Carbon && window.Carbon.version;
		if (version && session.getLocalData('carbon-menu-version') !== version) {
			ui.menu.flushCache();
			// LuCI's flushCache clears session data only. Its instance may already
			// hold the old tree when the theme menu is instantiated.
			ui.menu.menu = null;
		}
		return ui.menu.load().then((tree) => {
			this.render(tree);
			if (version) session.setLocalData('carbon-menu-version', version);
		});
	},

	render(tree) {
		const C = window.Carbon;
		const roots = ui.menu.getChildren(tree);
		const reqRoot = L.env.requestpath.length ? L.env.requestpath[0] : null;
		const root = roots.filter((c) => c.name === reqRoot)[0] || roots[0];

		if (!C || !root)
			return;

		const categories = ui.menu.getChildren(root).map((cat) => ({
			name: cat.name,
			title: _(cat.title),
			path: root.name + '/' + cat.name,
			url: L.url(root.name, cat.name),
			children: ui.menu.getChildren(cat).map((ch) => ({
				name: ch.name,
				title: C.t(_(ch.title)),
				path: root.name + '/' + cat.name + '/' + ch.name,
				url: L.url(root.name, cat.name, ch.name)
			}))
		}));

		const known = {};
		categories.forEach((c) => {
			known[c.path] = c;
			c.children.forEach((ch) => { known[ch.path] = ch; });
		});

		const app = document.querySelector('.cb-app');

		C.initShell({
			logoutUrl: known[root.name + '/logout'] ? L.url(root.name, 'logout') : null,
			language: this.language
		});

		C.renderNav({
			root: root.name,
			categories: categories,
			activePath: L.env.dispatchpath,
			url: (p) => L.url(p),
			simpleMenuAttr: (app && app.dataset && app.dataset.simpleMenu) || '',
			saveSimpleMenu: (cfg) => {
				const s = C.simpleMenu.serialize(cfg);
				return callSetSimpleMenu('set', s.common, s.system).then((res) => {
					if (res && res.error) {
						const err = new Error(res.error);
						err.code = res.error;
						throw err;
					}
					if (app && app.dataset)
						app.dataset.simpleMenu = C.simpleMenu.encodeAttr(cfg);
					return res;
				}, mapRpcError);
			},
			resetSimpleMenu: () => callSetSimpleMenu('reset', '', '').then((res) => {
				if (res && res.error) {
					const err = new Error(res.error);
					err.code = res.error;
					throw err;
				}
				if (app && app.dataset)
					delete app.dataset.simpleMenu;
				return res;
			}, mapRpcError)
		});

		/* toolbar title: Category › Page */
		const dp = L.env.dispatchpath;
		const cat = known[dp.slice(0, 2).join('/')];
		const page = known[dp.slice(0, 3).join('/')];
		C.setTitle([cat && cat.title, page && page.title]);

		/* third level and below → segmented tab bar */
		if (dp.length >= 3) {
			let node = tree, url = '';
			for (let i = 0; i < 3 && node; i++) {
				node = node.children[dp[i]];
				url = url + (url ? '/' : '') + dp[i];
			}
			if (node)
				this.renderTabMenu(node, url);
		}

		if (dp.join('/') === root.name + '/status/overview')
			this.mountDashboard(root.name, known);
	},

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach((child) => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			const className = 'tabmenu-item-%s %s'.format(child.name, isActive ? 'active' : '');

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name), 'aria-current': isActive ? 'page' : null }, [ _(child.title) ])
			]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0 || !container)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	mountDashboard(rootName, known) {
		const C = window.Carbon;
		const main = document.getElementById('maincontent');
		const view = document.getElementById('view');

		if (!main)
			return;

		const link = (p) => known[rootName + '/' + p] ? L.url(rootName, p) : null;
		const app = document.querySelector('.cb-app');
		const host = E('div', { 'id': 'cb-dashboard' });

		main.insertBefore(host, (view && view.parentNode === main) ? view : null);

		C.Dashboard.mount(host, provider, {
			urls: {
				network: link('network/network'),
				wireless: link('network/wireless'),
				devices: link('network/dhcp')
			},
			dashboardAttr: (app && app.dataset && app.dataset.dashboard) || '',
			saveLayout: (layout) => {
				const s = C.dashboardLayout.serialize(layout);
				return callSetDashboard('set', s.hero, s.sections, s.monitor, s.tiles, s.details).then((res) => {
					if (res && res.error) {
						const err = new Error(res.error);
						err.code = res.error;
						throw err;
					}
					if (app && app.dataset)
						app.dataset.dashboard = C.dashboardLayout.encodeAttr(layout);
					return res;
				}, mapRpcError);
			},
			resetLayout: () => callSetDashboard('reset', '', '', '', '', '').then((res) => {
				if (res && res.error) {
					const err = new Error(res.error);
					err.code = res.error;
					throw err;
				}
				if (app && app.dataset)
					delete app.dataset.dashboard;
				return res;
			}, mapRpcError)
		});

		/* LuCI's own status widgets stay below the dashboard. While they are
		   collapsed, pause LuCI's poll loop so the router is not queried twice. */
		document.addEventListener('poll-start', () => {
			if (!this.detailsOpen)
				window.setTimeout(() => this.gatePoll(this.detailsOpen), 0);
		});
		C.detailsToggle(host, C.mode.get() === 'pro', (open) => this.gatePoll(open));
	},

	gatePoll(open) {
		this.detailsOpen = !!open;
		if (open) {
			if (!poll.active())
				poll.start();
		}
		else if (poll.active()) {
			poll.stop();
			/* our dashboard keeps updating, so a "Paused" badge would mislead */
			if (typeof ui.hideIndicator === 'function')
				ui.hideIndicator('poll-status');
		}
	}
});
