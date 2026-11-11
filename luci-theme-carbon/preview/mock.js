/*
 * Carbon preview — mock LuCI menu + ubus data.
 * Lets you iterate on the theme in any browser without a router.
 */
(function () {
	'use strict';

	const ZH = /^zh/i.test(document.documentElement.lang);
	const T = (en, zh) => ZH ? zh : en;

	/* ---------------- menu tree (shape mirrors ui.menu) ---------------- */
	const MENU = [
		['status', T('Status', '状态'), [
			['overview', T('Overview', '概览')], ['syslog', T('System Log', '系统日志')]
		]],
		['system', T('System', '系统'), [
			['system', T('System', '系统')], ['admin', T('Administration', '管理权')], ['package-manager', T('Software', '软件包')],
			['flash', T('Backup / Flash Firmware', '备份与升级')], ['reboot', T('Reboot', '重启')]
		]],
		['network', T('Network', '网络'), [
			['network', T('Interfaces', '接口')], ['wireless', T('Wireless', '无线')],
			['dhcp', T('Connected Devices', '已连接设备')], ['diagnostics', T('Diagnostics', '网络诊断')]
		]]
	];

	const url = (path) => 'index.html?' + new URLSearchParams({ lang: ZH ? 'zh-Hans' : 'en', page: path });
	const defaults = { hostname: 'OpenWrt', ssid: 'Carbon-Home', channel: '6', encryption: 'psk2', enabled: true, guest: false };
	let settings = Object.assign({}, defaults);
	try { Object.assign(settings, JSON.parse(sessionStorage.getItem('carbon.demo.settings') || '{}')); } catch (e) { /* storage may be blocked */ }

	window.CarbonPreview = {
		T, url, settings,
		paths: MENU.flatMap((c) => c[2].map((ch) => 'admin/' + c[0] + '/' + ch[0])),
		save(values) {
			Object.assign(settings, values);
			try { sessionStorage.setItem('carbon.demo.settings', JSON.stringify(settings)); } catch (e) { /* in-memory demo still works */ }
		},
		model(active) {
			return {
				root: 'admin',
				activePath: active.split('/'),
				url,
				categories: MENU.map((c) => ({
					name: c[0], title: c[1], path: 'admin/' + c[0], url: url('admin/' + c[0] + '/' + c[2][0][0]),
					children: c[2].map((ch) => ({ name: ch[0], title: ch[1], path: 'admin/' + c[0] + '/' + ch[0], url: url('admin/' + c[0] + '/' + ch[0]) }))
				}))
			};
		},
		title(active) {
			const p = active.split('/');
			const c = MENU.find((m) => m[0] === p[1]);
			const ch = c && c[2].find((x) => x[0] === p[2]);
			return [c && c[1], ch && ch[1]];
		}
	};

	/* ---------------- ubus-shaped mock data ---------------- */
	const t0 = Date.now();
	const MB = 1024 * 1024;
	const rnd = (a, b) => a + Math.random() * (b - a);

	let cpu = { user: 120000, nice: 0, system: 60000, idle: 2400000, iowait: 2000, irq: 0, softirq: 9000 };
	let busy = 0.18;
	let rx = 18.6 * 1024 * MB, tx = 2.3 * 1024 * MB;
	let burst = 0, load = 0.42;

	function tickCounters() {
		const elapsed = 2;
		busy = Math.min(0.85, Math.max(0.04, busy + rnd(-0.06, 0.06)));
		const ticks = 100 * elapsed * 4;
		cpu.user += ticks * busy * 0.65;
		cpu.system += ticks * busy * 0.25;
		cpu.softirq += ticks * busy * 0.1;
		cpu.idle += ticks * (1 - busy);

		if (burst <= 0 && Math.random() < 0.12) burst = Math.round(rnd(4, 14));
		const down = burst > 0 ? rnd(4, 12.5) * MB : rnd(80, 900) * 1024;
		const up = burst > 0 ? rnd(300, 1400) * 1024 : rnd(20, 220) * 1024;
		burst--;
		rx += down * elapsed;
		tx += up * elapsed;
		load = Math.max(0.05, load + rnd(-0.08, 0.08));
	}
	// Only the overview needs live counters; other views use static fixtures.
	const requestedPage = new URLSearchParams(location.search).get('page') || location.hash.slice(1);
	if (!window.CarbonPreview.paths.includes(requestedPage) || requestedPage === 'admin/status/overview')
		setInterval(tickCounters, 2000);
	tickCounters();

	const wait = (v) => new Promise((r) => setTimeout(() => r(v), rnd(40, 160)));

	/* covers: hostname match, OUI match, private (random) MAC, chip-vendor hint, unknown */
	const LEASES = [
		['iPhone-15-Pro', '192.168.1.23', 'a6:83:e7:2c:91:0f', 38000],          /* private MAC, hostname → Apple */
		['MacBook-Air', '192.168.1.31', 'f0:ee:7a:91:aa:12', 40211],
		['', '192.168.1.42', 'f0:ee:7a:66:0b:3e', 21000],                       /* no hostname, Apple OUI */
		['Mi-TV-4S', '192.168.1.105', '28:6c:07:1a:44:9d', false],
		['HUAWEI-P60', '192.168.1.57', '58:d7:59:0c:13:71', 3600],
		['DESKTOP-7Q2K1MB', '192.168.1.20', 'e4:c7:67:12:7d:c4', 41000],
		['zhimi-airpurifier-ma4', '192.168.1.110', '8c:d0:b2:8a:2f:01', 39000],
		['Galaxy-S24', '192.168.1.66', '64:1b:2f:77:31:aa', 12000],
		['PS5-327', '192.168.1.88', 'f4:64:12:3d:c2:19', 26000],
		['', '192.168.1.143', 'de:ad:be:ef:12:34', 7000],                       /* random MAC, nothing known */
		['Echo-Dot', '192.168.1.121', '44:00:49:ab:cd:ef', 30500],
		['raspberrypi', '192.168.1.200', 'dc:a6:32:01:02:03', false],
		['', '192.168.1.150', 'd4:8a:fc:11:22:33', 30000],                      /* ESP32 by OUI */
		['OPPO-Find-X7', '192.168.1.71', '6e:11:22:33:44:55', 18000],
		['HP-LaserJet-M1136', '192.168.1.30', '00:1b:78:44:55:66', false],
		['Living-Room-TV', '192.168.1.106', '00:11:22:33:44:56', 20000]
	].map((l) => ({ hostname: l[0], ipaddr: l[1], macaddr: l[2], expires: l[3] }));

	window.CarbonPreview.provider = {
		board: () => wait({
			hostname: settings.hostname,
			model: 'Xiaomi Redmi Router AX6000',
			kernel: '6.6.73',
			release: { distribution: 'OpenWrt', version: '24.10.0', description: 'OpenWrt 24.10.0 r28427-6df0e3d02a' }
		}),
		info: () => wait({
			uptime: 273600 + Math.round((Date.now() - t0) / 1000),
			load: [load, load * 0.8, load * 0.6].map((x) => Math.round(x * 65536)),
			memory: { total: 512 * MB, free: 181 * MB, shared: 2 * MB, buffered: 9 * MB, cached: 96 * MB, available: 286 * MB + rnd(-4, 4) * MB },
			root: { total: 114688, free: 76000, used: 38688, avail: 76000 }
		}),
		cpuStat: () => wait('cpu  ' + [cpu.user, cpu.nice, cpu.system, cpu.idle, cpu.iowait, cpu.irq, cpu.softirq, 0].map(Math.round).join(' ') +
			'\ncpu0 0\ncpu1 0\ncpu2 0\ncpu3 0\nintr 0\n'),
		interfaces: () => wait([
			{ interface: 'lan', up: true, proto: 'static', device: 'br-lan', l3_device: 'br-lan', 'ipv4-address': [{ address: '192.168.1.1', mask: 24 }], route: [] },
			{ interface: 'loopback', up: true, proto: 'static', device: 'lo', l3_device: 'lo', 'ipv4-address': [{ address: '127.0.0.1', mask: 8 }], route: [] },
			{ interface: 'wan', up: true, proto: 'pppoe', device: 'wan', l3_device: 'pppoe-wan', 'ipv4-address': [{ address: '100.64.23.18', mask: 32 }], route: [{ target: '0.0.0.0', mask: 0, nexthop: '100.64.0.1' }] },
			{ interface: 'wan6', up: true, proto: 'dhcpv6', device: 'pppoe-wan', l3_device: 'pppoe-wan', 'ipv6-address': [{ address: '240e:3a1:4c2:8f0::1', mask: 64 }], route: [{ target: '::', mask: 0 }] },
			{ interface: 'guest', up: false, proto: 'static', device: 'br-guest', 'ipv4-address': [], route: [] }
		]),
		devStats: () => wait({ rx_bytes: Math.round(rx), tx_bytes: Math.round(tx) }),
		/* kernel devices (luci-rpc getNetworkDevices): physical ports show up in the traffic picker */
		netDevices: () => wait([
			['lo', true, { loopback: true }], ['eth0', true], ['wan', true], ['lan1', true], ['lan2', true], ['lan3', false], ['lan4', true],
			['br-lan', true], ['pppoe-wan', true], ['phy0-ap0', true], ['phy1-ap0', true], ['ifb0', false], ['sit0', false]
		].reduce((o, d) => (o[d[0]] = { name: d[0], up: d[1], flags: Object.assign({ up: d[1] }, d[2]), stats: { rx_bytes: 0, tx_bytes: 0 } }, o), {})),
		leases: () => wait({ dhcp_leases: LEASES, dhcp6_leases: [] }),
		wireless: () => wait({
			radio0: { up: settings.enabled, config: { band: '2g', channel: settings.channel }, interfaces: [
				{ ifname: 'phy0-ap0', config: { mode: 'ap', ssid: settings.ssid, encryption: settings.encryption, disabled: !settings.enabled } },
				{ ifname: 'phy0-ap1', config: { mode: 'ap', ssid: 'Carbon-Guest', encryption: 'psk2', disabled: !settings.guest } }
			] },
			radio1: { up: true, config: { band: '5g', channel: '149' }, interfaces: [
				{ ifname: 'phy1-ap0', config: { mode: 'ap', ssid: 'Carbon-Home-5G', encryption: 'sae-mixed' } }
			] }
		}),
		/* Wi‑Fi clients, a static-IP NAS seen only in ARP, and host hints for names */
		stations: (ifnames) => wait([
			['phy1-ap0', 'a6:83:e7:2c:91:0f', -48], ['phy1-ap0', 'f0:ee:7a:91:aa:12', -55], ['phy0-ap0', '28:6c:07:1a:44:9d', -63],
			['phy1-ap0', '58:d7:59:0c:13:71', -51], ['phy0-ap0', '8c:d0:b2:8a:2f:01', -71], ['phy1-ap0', '64:1b:2f:77:31:aa', -58],
			['phy0-ap0', 'd4:8a:fc:11:22:33', -67], ['phy1-ap0', '6e:11:22:33:44:55', -60]
		].filter((st) => ifnames.includes(st[0])).map((st) => ({ ifname: st[0], mac: st[1], signal: st[2] + Math.round(rnd(-2, 2)) }))),
		neighbors: () => wait('IP address       HW type     Flags       HW address            Mask     Device\n' + [
			['192.168.1.20', 'e4:c7:67:12:7d:c4'], ['192.168.1.5', '00:11:32:aa:bb:cc'], ['100.64.0.1', '00:00:5e:00:01:01', 'pppoe-wan']
		].map((n) => n[0].padEnd(17) + '0x1         0x2         ' + n[1] + '     *        ' + (n[2] || 'br-lan')).join('\n') + '\n'),
		hostHints: () => wait({ '00:11:32:AA:BB:CC': { name: 'DiskStation', ipaddrs: ['192.168.1.5'] } }),
		conntrack: () => wait([String(Math.round(1284 + rnd(-60, 60))), '16384']),
		temperatures: () => wait([
			{ name: 'cpu-thermal', value: Math.round(52300 + rnd(-800, 800)) },
			{ name: 'mt7986_phy1', value: Math.round(47800 + rnd(-500, 500)) }
		])
	};
})();
