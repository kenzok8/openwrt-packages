'use strict';

// Unit tests for the DOM-independent parts of carbon.js: formatting, i18n,
// version detection, device merging, ARP parsing and IPv6 uplink detection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('htdocs/luci-static/carbon/carbon.js', 'utf8');
const brands = fs.readFileSync('htdocs/luci-static/carbon/brands.js', 'utf8');

function load({ lang = 'en', src = '/luci-static/carbon/carbon.js?v=1.2.3-r4', catalogue = null, luciTr = null } = {}) {
	const classes = new Set();
	const element = () => ({
		setAttribute() {}, getAttribute: () => null, classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
		addEventListener() {}, appendChild() {}, style: { setProperty() {} }
	});
	const window = {
		localStorage: { getItem: () => null, setItem() {} },
		matchMedia: () => ({ matches: false, addEventListener() {} }),
		addEventListener() {},
		atob: (b64) => Buffer.from(b64, 'base64').toString('latin1'),
		Carbon: catalogue ? { I18N: catalogue } : undefined
	};
	if (luciTr) window._ = luciTr;
	const document = {
		currentScript: { src },
		documentElement: {
			getAttribute: (name) => name === 'lang' ? lang : null,
			setAttribute() {},
			classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) }
		},
		querySelector: () => null,
		getElementById: () => null,
		createElement: element,
		addEventListener() {}
	};
	const context = { window, document, navigator: { language: lang }, Intl, Map, WeakSet, setTimeout, clearTimeout, console };
	vm.runInNewContext(source, context);
	return window.Carbon;
}

test('version comes from the ?v= parameter the theme header adds', () => {
	assert.equal(load().version, '1.2.3-r4');
	assert.equal(load({ src: '/luci-static/carbon/carbon.js' }).version, 'dev');
	assert.equal(load({ src: '/x/carbon.js?v=<script>' }).version, 'dev');
});

test('bundled catalogue first, then LuCI catalogues, then English; placeholders fill in order', () => {
	const C = load({ lang: 'zh-cn', catalogue: { 'Show all %d devices': '显示全部 %d 台设备' }, luciTr: (s) => s === 'Memory' ? '内存(LuCI)' : s });
	assert.equal(C.t('Show all %d devices', 12), '显示全部 12 台设备');
	assert.equal(C.t('Memory'), '内存(LuCI)');
	assert.equal(C.t('Unknown string %s', 'x'), 'Unknown string x');
	assert.equal(C.locale, 'zh-CN');
	assert.equal(load({ lang: 'zh_Hant' }).locale, 'zh-TW');
	assert.equal(load({ lang: 'en', luciTr: () => 'wrong' }).t('Memory'), 'Memory');
});

test('placeholders are filled once, literally', () => {
	const C = load();
	assert.equal(C.t('%s and %s', '$& %s', 'b'), '$& %s and b');
	assert.equal(C.t('only %d', 1, 2), 'only 1');
	assert.equal(C.t('%s %s', 'a'), 'a %s');
});

test('durations use translatable patterns', () => {
	const en = load();
	assert.equal(en.fmt.duration(3 * 86400 + 5 * 3600), '3d 5h');
	assert.equal(en.fmt.duration(2 * 3600 + 7 * 60), '2h 7m');
	assert.equal(en.fmt.duration(30), '<1 min');
	const zh = load({ lang: 'zh-cn', catalogue: { '%dd %dh': '%d 天 %d 小时' } });
	assert.equal(zh.fmt.duration(86400 + 3600), '1 天 1 小时');
});

test('byte formatting', () => {
	const C = load();
	assert.deepEqual(Array.from(C.fmt.bytes(1536, true)), ['1.5', 'KB/s']);
	assert.equal(C.fmt.bytesStr(0), '0 B');
	assert.equal(C.fmt.pair(149 * 1048576, 428 * 1048576), '149 / 428 MB');
	assert.deepEqual(Array.from(C.fmt.bytes(null)), ['—', '']);
});

test('language matching maps LuCI codes to the installed catalogue', () => {
	const C = load();
	const options = [{ code: 'en' }, { code: 'zh_cn' }, { code: 'zh_tw' }, { code: 'pt_br' }];
	assert.equal(C.matchLanguage(options, 'zh-Hans').code, 'zh_cn');
	assert.equal(C.matchLanguage(options, 'zh_Hant').code, 'zh_tw');
	assert.equal(C.matchLanguage(options, 'pt-BR').code, 'pt_br');
	assert.equal(C.matchLanguage(options, 'de').code, 'en');
});

test('ARP parsing keeps complete LAN entries only', () => {
	const C = load();
	const arp = [
		'IP address       HW type     Flags       HW address            Mask     Device',
		'192.168.1.5      0x1         0x2         00:11:32:aa:bb:cc     *        br-lan',
		'192.168.1.9      0x1         0x0         00:00:00:00:00:00     *        br-lan',
		'192.168.1.7      0x1         0x6         AA:BB:CC:00:11:22     *        br-lan',
		'100.64.0.1       0x1         0x2         00:00:5e:00:01:01     *        pppoe-wan'
	].join('\n');
	assert.deepEqual(Array.from(C.parseArp(arp, ['br-lan']), (n) => n.ip), ['192.168.1.5', '192.168.1.7']);
	assert.equal(C.parseArp(arp, null).length, 3);
	assert.equal(C.parseArp(arp, ['br-lan'])[1].mac, 'aa:bb:cc:00:11:22');
});

test('LAN devices exclude non-static uplinks but keep a dumb AP\'s static LAN', () => {
	const C = load();
	const ifs = [
		{ interface: 'lan', up: true, proto: 'static', device: 'br-lan', l3_device: 'br-lan', route: [{ target: '0.0.0.0', mask: 0 }] },
		{ interface: 'wan', up: true, proto: 'pppoe', device: 'eth1', l3_device: 'pppoe-wan', route: [{ target: '0.0.0.0', mask: 0 }] },
		{ interface: 'guest', up: false, proto: 'static', device: 'br-guest' },
		{ interface: 'loopback', up: true, proto: 'static', device: 'lo' }
	];
	assert.deepEqual(Array.from(C.lanDevices(ifs)), ['br-lan']);
	assert.equal(C.lanDevices(null), null);
});

test('traffic picker lists interfaces plus physical ports such as an xPON uplink', () => {
	const C = load();
	/* xPON router: internet and IPTV are PPPoE sessions on VLANs of pon0 */
	const ifs = [
		{ interface: 'lan', up: true, device: 'br-lan', l3_device: 'br-lan' },
		{ interface: 'wan', up: true, device: 'pon0.41', l3_device: 'pppoe-wan' },
		{ interface: 'wan6', up: true, device: 'pppoe-wan', l3_device: 'pppoe-wan' },
		{ interface: 'IPTV', up: true, device: 'pon0mac0.42', l3_device: 'pppoe-IPTV' },
		{ interface: 'guest', up: false, device: 'br-guest' },
		{ interface: 'loopback', up: true, device: 'lo', l3_device: 'lo' }
	];
	const dev = (up, extra) => Object.assign({ flags: { up: up } }, extra);
	const netdevs = {
		lo: dev(true, { flags: { up: true, loopback: true } }), 'br-lan': dev(true), 'pppoe-wan': dev(true), 'pppoe-IPTV': dev(true),
		pon0: dev(true), 'pon0.41': dev(true), pon0mac0: dev(true), 'pon0mac0.42': dev(true), omci0: dev(true),
		lan1: dev(true), lan10: dev(true), lan2: dev(false), eth0: { up: true }, sit0: dev(false), ifb0: dev(true), gre0: dev(true)
	};
	const plain = (x) => JSON.parse(JSON.stringify(x));
	const src = plain(C.trafficSources(ifs, netdevs));
	assert.deepEqual(src.ifaces.map((g) => [g.dev, g.alt, g.names.join('/')]),
		[['br-lan', 'br-lan', 'LAN'], ['pppoe-wan', 'pon0.41', 'WAN/WAN6'], ['pppoe-IPTV', 'pon0mac0.42', 'IPTV']]);
	assert.deepEqual(src.devices.map((d) => d.dev), ['eth0', 'lan1', 'lan10', 'omci0', 'pon0', 'pon0.41', 'pon0mac0', 'pon0mac0.42']);
	/* no device list (old provider, failed call): interfaces only */
	assert.deepEqual(plain(C.trafficSources(ifs, null).devices), []);
	assert.deepEqual(plain(C.trafficSources(null, netdevs).ifaces), []);
});

test('devices merge leases, Wi-Fi stations, ARP and host hints by MAC', () => {
	const C = load();
	const list = C.mergeDevices({
		leases: [
			{ hostname: 'phone', ipaddr: '192.168.1.23', macaddr: 'A6:83:E7:2C:91:0F', expires: 3600 },
			{ hostname: 'laptop', ipaddr: '192.168.1.3', macaddr: 'f0:ee:7a:91:aa:12', expires: false }
		],
		leases6: [{ hostname: 'laptop', ip6addrs: ['fd00::3/128'] }],
		stations: [{ ifname: 'phy1-ap0', mac: 'a6:83:e7:2c:91:0f', signal: -48 }, { ifname: 'phy0-ap0', mac: '11:22:33:44:55:66', signal: 0 }],
		arp: [{ ip: '192.168.1.5', mac: '00:11:32:aa:bb:cc' }, { ip: '192.168.1.3', mac: 'f0:ee:7a:91:aa:12' }],
		hints: { '00:11:32:AA:BB:CC': { name: 'nas', ipaddrs: ['192.168.1.5'] } },
		bands: { 'phy1-ap0': '5 GHz', 'phy0-ap0': '2.4 GHz' }
	});
	const by = Object.fromEntries(list.map((d) => [d.macaddr, d]));
	assert.equal(list.length, 4);
	assert.deepEqual(Array.from(list, (d) => d.ipaddr), ['192.168.1.3', '192.168.1.5', '192.168.1.23', '']);
	assert.deepEqual({ ...by['a6:83:e7:2c:91:0f'].wifi }, { band: '5 GHz', signal: -48 });
	assert.equal(by['f0:ee:7a:91:aa:12'].ip6addr, 'fd00::3');
	assert.equal(by['f0:ee:7a:91:aa:12'].active, true);
	assert.equal(by['00:11:32:aa:bb:cc'].hostname, 'nas');
	assert.equal(by['00:11:32:aa:bb:cc'].lease, false);
	assert.equal(by['11:22:33:44:55:66'].wifi.signal, null);
	assert.deepEqual(Array.from(C.mergeDevices({ leases: [{ macaddr: 'bad' }] })), []);
});

test('IPv6 uplink address ignores link-local and needs a default route', () => {
	const C = load();
	assert.equal(C.wanIPv6([{ interface: 'lan', up: true, 'ipv6-address': [{ address: 'fd00::1', mask: 60 }], route: [] }]), null);
	const v6 = C.wanIPv6([{ interface: 'wan6', up: true, route: [{ target: '::', mask: 0 }],
		'ipv6-address': [{ address: 'fe80::1', mask: 64 }, { address: '240e:3a1::1', mask: 64 }] }]);
	assert.deepEqual({ ...v6 }, { address: '240e:3a1::1', mask: 64, iface: 'wan6' });
	const pd = C.wanIPv6([{ interface: 'wan6', up: true, route: [{ target: '::', mask: 0 }], 'ipv6-prefix': [{ address: '2001:db8:1::', mask: 56 }] }]);
	assert.equal(pd.address, '2001:db8:1::');
});

test('brand identification by hostname, OUI and randomised MAC', () => {
	const C = load();
	vm.runInNewContext(brands, { window: { Carbon: C } });
	assert.ok(C.BRAND_DATA);
	assert.equal(C.identify('iPhone-15', '').brand.n, 'Apple');
	assert.equal(C.identify('', 'f0:ee:7a:66:0b:3e').brand.n, 'Apple');
	assert.equal(C.identify('', 'de:ad:be:ef:12:34').priv, true);
	assert.equal(C.identify('', 'de:ad:be:ef:12:34').brand, null);
});

test('Docker uses the whale icon and its pages get their own icons', () => {
	const C = load();
	assert.equal(C.pageIcon('dockerman'), 'docker');
	assert.equal(C.pageIcon('docker'), 'docker');
	assert.deepEqual(['config', 'overview', 'containers', 'images', 'networks', 'volumes', 'events'].map((n) => C.pageIcon(n, 'docker')),
		['sliders', 'gauge', 'box', 'layers', 'nodes', 'disk', 'pulse']);
	/* the same names elsewhere keep the general rules */
	assert.equal(C.pageIcon('overview', 'status'), 'gauge');
	assert.equal(C.pageIcon('images', 'services'), 'dot');
	assert.equal(C.pageIcon('podman-containers'), 'box');
	assert.match(C.icon('docker'), /<rect /);
	assert.notEqual(C.icon('nodes'), C.icon('nonexistent'));
});
