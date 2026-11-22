'use strict';
'require baseclass';
'require vantage.fmt as fmt';
'require vantage.wifi as wifi';
'require vantage.names as names';

/* Turns raw ubus replies into one normalised model of the device, its
   uplink, radios, SSIDs and stations, plus the counter/rate arithmetic.
   Pure functions: the view owns all state and passes it in. */

/* interface names that are wireless even when netifd reports no devtype
   (it does not on ipq53xx/ath12k: phy2g-ap0, phy6g-ap0, ...) */
var WIRELESS_NAME = /^(wlan\d|phy[0-9a-z]*-|ath\d|wl\d|ra\d|rai\d|rax\d|mld\d)/;

/* above any real link: a rate this high means a bad sample, not traffic */
var MAX_BPS = 400e9;
/* netifd protocols that tunnel IPv4 over an IPv6 uplink */
var SOFTWIRE = /^(dslite|map|464xlat)$/;

function num(v) { v = +v; return isFinite(v) ? v : 0; }
function finite(v) { return typeof v === 'number' && isFinite(v); }
function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function arr(v) { return Array.isArray(v) ? v : []; }

/* ------------------------------------------------------ default routes */

/* lines to the internet the path and the chart show beside the main one;
   any further one stays a network */
var MAX_LINES = 4;

/* the paired access points (vantage.collector report), cut to the
   collector's own caps: the page never trusts a reply to be smaller */
var MAX_APS = 16, MAX_AP_SSIDS = 16, MAX_AP_STATIONS = 256, MAX_REMOTE_STATIONS = 1024, MAX_AP_WIRED = 128;
var AP_ID = /^[0-9a-f]{16}$/;
/* luci.vantage.pair's rule for the name given at pairing */
var AP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
var AP_STATES = [ 'ok', 'waiting', 'offline', 'error' ];
/* why the last fetch failed: an offline one could not be reached, the
   others answered something that is no report */
var AP_OFFLINE = [ 'unreachable', 'timeout' ];
var AP_ERRORS = [ 'hostkey', 'denied', 'invalid', 'missing' ].concat(AP_OFFLINE);
var AP_BANDS = [ '2g', '5g', '6g', '60g' ];
/* an interface or port name, as the collector takes one (a netdev's) */
var AP_IFNAME = /^[A-Za-z0-9_.-]{1,15}$/;

/* per-device traffic (luci.vantage.traffic hosts): the plugin's own cap */
var MAX_TRAFFIC_HOSTS = 512;

/* a switch chip's own counters (luci.vantage.ports counters): the
   plugin's own cap, and what its answer says */
var MAX_SWITCH_PORTS = 32;
var SWITCH_STATES = [ 'ok', 'none', 'no-ethtool' ];

/* WireGuard (luci.wireguard getWgInstances, LuCI's own), cut to what a
   tile can hold: the page never trusts a reply to be smaller */
var MAX_WG_IFACES = 8, MAX_WG_PEERS = 128, MAX_WG_ALLOWED = 8;
/* a public key: 32 bytes in base64 */
var WG_KEY = /^[A-Za-z0-9+/]{43}=$/;
/* a peer's endpoint as wg prints it, 192.0.2.1:51820 or [2001:db8::1]:51820 */
var WG_ENDPOINT = /^[0-9A-Za-z.:%\[\]_-]{3,80}$/;
var WG_CIDR = /^[0-9A-Fa-f.:]{2,45}[/]\d{1,3}$/;
/* WireGuard makes a new handshake two minutes after the last while
   traffic flows (Rekey-After-Time, 120 s) and uses no session key older
   than three (Reject-After-Time, 180 s): up to that age a peer is there
   now, past it nothing has passed since */
var WG_RECENT_S = 180;

/* Provider tiles (#129): what another package's provider may hand the
   dashboard (model.tile), version 1 of the contract. Caps and forms the
   page holds every answer to, whatever the provider did */
var TILE_V = 1, MAX_TILE_ITEMS = 8;
var TILE_LEVELS = [ 'ok', 'warn', 'err', 'off' ];
var TILE_UNITS = [ '', '%', 'ms', 's', 'dBm', 'dB', 'MHz', 'B', 'bit/s' ];
/* the dashboard's own icons a provider may name; any other is the first */
var TILE_ICONS = [ 'pulse', 'globe', 'signal', 'port', 'lock', 'cpu', 'memory', 'disk', 'router', 'wifi', 'users' ];
/* a LuCI page as its menu path: admin and one to four more steps */
var TILE_PAGE = /^admin(\/[A-Za-z0-9_-]{1,32}){1,4}$/;
var TILE_EVERY_MIN = 5, TILE_EVERY_MAX = 300;
/* |value| below this: a counter of bytes or events, never a float's noise */
var TILE_NUM_MAX = 1e15;
/* a text with something to see, after fmt.safeText (whose U+FFFD
   counts): a letter, digit, punctuation mark or symbol, but not the
   Braille blank (U+2800, a symbol that shows nothing). Spaces (Z),
   control, format and private-use characters (C) and combining marks (M)
   alone do not count */
var TILE_VISIBLE = /[^\p{Z}\p{C}\p{M}\u2800]/u;

/* the Ethernet ports the Ports tile lists at most: a 48-port switch with
   its uplinks fits */
var MAX_PORTS = 64;
/* a VLAN on a device, as netifd names one: eth1.10 */
var VLAN_DEV = /^(.+)\.\d{1,4}$/;

/* netifd protocols, and kernel device types, of tunnels that ride over
   another line: a full-tunnel VPN is not a second way out. PPTP and L2TP
   are left out: some ISPs give their access through them. */
var TUNNEL = /^(wireguard|openvpn|openconnect|openfortivpn|vpnc|sstp|gre|gretap|grev6|grev6tap|vti|vtiv6|xfrm|ipip|6in4|6to4|6rd|vxlan|vxlan6)$/;
var TUNNEL_DEV = /^(wireguard|tun|tap|ipip|ip6tnl|sit|gre|gretap|ip6gre|ip6gretap|vti|vti6|xfrm|vxlan)$/;
/* IPv6 carried over the IPv4 line: part of that line, not a way out or a VPN */
var IPV6_OVER = /^(6in4|6rd|6to4)$/;

/* netifd lists a route's metric only when the route sets one; the
   interface's metric applies otherwise. The kernel stores an IPv6
   metric of 0 as 1024. */
function metric(i, r) {
	var m = r.metric != null ? +r.metric : +i.metric;
	m = isFinite(m) ? m : 0;
	return r.target === '::' && m === 0 ? 1024 : m;
}
/* a default in another table (policy routing: a VPN's own table) is
   not the one ordinary traffic takes */
function mainTable(i, r) {
	var t = r.table != null ? r.table : i[r.target === '::' ? 'ip6table' : 'ip4table'];
	return t == null || t === '' || t === 'main' || +t === 254;
}
/* the interface's best default route in the main table, IPv4 first */
function defRoute(i) {
	return arr(i.route).filter(function(r) {
		return r && +r.mask === 0 && (r.target === '0.0.0.0' || r.target === '::') && mainTable(i, r);
	}).sort(function(a, b) {
		return (a.target === '::') - (b.target === '::') || metric(i, a) - metric(i, b);
	})[0] || null;
}
function wanRank(i) {
	return /^wan$/.test(i.interface) ? 0 : /^wan6$/.test(i.interface) ? 1 : /wan/i.test(i.interface) ? 2 : 3;
}
function upIfaces(ifaces) {
	return arr(ifaces).filter(function(i) {
		return i && i.up && i.interface !== 'loopback' && (i.l3_device || i.device);
	});
}
function isTunnel(i, devs) {
	var d = devs[i.l3_device || i.device];
	return TUNNEL.test(i.proto || '') || !!(d && (TUNNEL_DEV.test(d.devtype || '') || d.type === 'tunnel'));
}
/* the interfaces with a default route, the line first: real lines
   before tunnels (a full-tunnel VPN rides over a line, see ridingTunnel),
   IPv4 before IPv6 (a softwire's IPv4 route among the IPv4 ones), then
   the lowest metric, on a tie the one the kernel says it takes (`kernel`,
   as ridingTunnel's; netifd replaces routes of equal metric, so that is
   the last one added), then wan/wan6/*wan*, then the order netifd lists
   them */
function rankRouted(up, devs, kernel) {
	var taken = {};
	arr(kernel).forEach(function(x) { if (x && typeof x.dev === 'string') taken[x.family === 6 ? 1 : 0] = x.dev; });
	return up.map(function(i, n) {
		var r = defRoute(i);
		/* a softwire's device is a tunnel's (ip6tnl), but it carries the line's IPv4, not a VPN */
		var sw = SOFTWIRE.test(i.proto || '');
		var family = r && r.target === '::' ? 1 : 0;
		return r ? { i: i, tunnel: !sw && isTunnel(i, devs), softwire: sw, family: family,
			metric: metric(i, r), taken: taken[family] === (i.l3_device || i.device) ? 0 : 1, wan: wanRank(i), n: n } : null;
	}).filter(Boolean).sort(function(a, b) {
		return a.tunnel - b.tunnel || a.family - b.family || a.metric - b.metric || a.taken - b.taken || a.wan - b.wan || a.n - b.n;
	});
}
/* A full-tunnel VPN over the line: the tunnel holding the default route
   that ordinary traffic takes, IPv4's whenever there is one, else IPv6's
   (an IPv4 VPN over an IPv6-only line rides it too). `kernel` is the
   kernel's own answer (luci.vantage routes: [ { family, dev, metric } ],
   the route it takes to the internet, at most one a family), which
   decides: of two routes with the same metric the kernel keeps the one
   added last, which netifd's list cannot tell, and a VPN daemon may add
   its own (OpenVPN's tun0) that netifd never lists. Over several next
   hops (dev null), no tunnel. Without it, only a tunnel whose metric is
   below that family's best line's, or the family's only default.
   -> { i, metric } of the tunnel, or null */
function ridingTunnel(ifaces, ranked, devs, kernel) {
	if (Array.isArray(kernel)) {
		var pick = function(fam) { return kernel.filter(function(x) { return x && x.family === fam && finite(x.metric); })[0]; };
		var k = pick(4) || pick(6);
		if (!k || typeof k.dev !== 'string') return null;
		var i = upIfaces(ifaces).filter(function(x) {
			return (x.l3_device || x.device) === k.dev && !SOFTWIRE.test(x.proto || '') && isTunnel(x, devs);
		})[0];
		return i ? { i: i, metric: k.metric } : null;
	}
	var fam = ranked.some(function(r) { return r.family === 0; }) ? 0 : 1;
	var of = ranked.filter(function(r) { return r.family === fam; });
	var t = of.filter(function(r) { return r.tunnel; })[0], line = of.filter(function(r) { return !r.tunnel; })[0];
	return t && (!line || t.metric < line.metric) ? { i: t.i, metric: t.metric } : null;
}

/* The lines to the internet, the main one first: { r, members, metric }
   with the interfaces each is made of. A softwire (DS-Lite, MAP-E,
   464XLAT) that wins carries IPv4 over the IPv6 line, so that line is
   the main one, at the softwire's metric; it is never a line of its own,
   nor a tunnel unless nothing else has a default. One line per L3
   device: wan6 on wan's device (or an @wan alias) is part of wan's, and
   so is an IPv6 interface on the device a PPPoE line runs over (its
   counters hold the PPP session's). Two IPv4 lines that only share a
   parent device (two PPPoE sessions on eth0) stay two. The main line
   carries the full-tunnel VPN over it, if any (tunnel; ridingTunnel). */
function groupLines(ifaces, devs, kernel) {
	var ranked = rankRouted(upIfaces(ifaces), devs, kernel), main = ranked[0], groups = [];
	if (!main) return groups;
	var at = main.metric, rider = main.tunnel ? null : ridingTunnel(ifaces, ranked, devs, kernel);
	if (main.softwire)
		main = ranked.filter(function(r) { return !r.tunnel && !r.softwire && r.family === 1; })[0] || main;
	/* l3: the members' L3 devices; dev4: the devices their IPv4 runs over */
	function add(g, r) {
		g.members.push(r.i);
		g.l3.push(r.i.l3_device || r.i.device);
		if (r.family === 0 && typeof r.i.device === 'string') g.dev4.push(r.i.device);
	}
	function start(r, m) {
		var g = { r: r, members: [], metric: m, l3: [], dev4: [] };
		add(g, r);
		groups.push(g);
	}
	start(main, at);
	groups[0].tunnel = rider;
	ranked.forEach(function(r) {
		if (r === main || r.softwire || r.tunnel) return;
		var l3 = r.i.l3_device || r.i.device;
		var g = groups.filter(function(x) { return x.l3.indexOf(l3) >= 0 || (r.family === 1 && x.dev4.indexOf(l3) >= 0); })[0];
		if (g) add(g, r);
		else start(r, r.metric);
	});
	/* with several lines there's no telling which one it rides */
	if (groups.length === 1)
		ranked.forEach(function(r) { if (r !== main && r.tunnel && r.family === 1 && IPV6_OVER.test(r.i.proto || '')) add(groups[0], r); });
	return groups;
}
function cidrs(list) {
	return arr(list).map(function(a) { return a && a.address ? a.address + '/' + a.mask : null; }).filter(Boolean);
}
/* the speeds (Mbit/s) in one of netifd's lists of link modes
   ("1000baseT-F", "2500baseX-F") */
function modeSpeeds(list) {
	var out = [];
	arr(list).forEach(function(m) {
		var x = typeof m === 'string' ? /^(\d{1,7})base/.exec(m) : null;
		if (x && +x[1] > 0 && out.indexOf(+x[1]) < 0) out.push(+x[1]);
	});
	return out;
}
/* the fastest link a port and the port at the other end both offer
   (network.device status: link-supported, link-partner-advertising), in
   Mbit/s. null where either list is missing or empty, which is netifd's
   "not known" (no autonegotiation, a driver without ethtool), or where
   they share no speed */
function bestLink(d) {
	var ours = modeSpeeds(obj(d)['link-supported']), theirs = modeSpeeds(obj(d)['link-partner-advertising']);
	var both = ours.filter(function(s) { return theirs.indexOf(s) >= 0; });
	return both.length ? Math.max.apply(null, both) : null;
}
/* a line's other interfaces add their addresses and DNS to it (wan6's
   IPv6 on wan's line) */
function absorb(x, g) {
	function more(list, add) { add.forEach(function(v) { if (list.indexOf(v) < 0) list.push(v); }); }
	g.members.slice(1).forEach(function(i) {
		more(x.ipv4, cidrs(i['ipv4-address']));
		more(x.ipv6, cidrs(i['ipv6-address']));
		more(x.prefix6, prefixes(i['ipv6-prefix']));
		more(x.dns, arr(i['dns-server']).filter(function(v) { return typeof v === 'string'; }));
	});
	x.metric = g.metric;
	x.ifaces = g.members.map(function(i) { return i.interface; });
	return x;
}
/* the IPv6 prefixes delegated to an interface (netifd's ipv6-prefix), as
   text, each once; only what reads as one: hex groups and colons, a
   whole prefix length. A line has its own and its other interfaces'
   (wan6's on wan's line: absorb) */
function prefixes(list) {
	var out = [];
	arr(list).forEach(function(p) {
		p = obj(p);
		if (typeof p.address !== 'string' || p.address.length > 39 || p.address.indexOf(':') < 0 || !/^[0-9a-f:]+$/i.test(p.address)) return;
		if (!finite(p.mask) || p.mask % 1 || p.mask < 1 || p.mask > 128) return;
		if (out.indexOf(p.address + '/' + p.mask) < 0) out.push(p.address + '/' + p.mask);
	});
	return out;
}
/* Two lines on DSA ports of one switch: the conduit carries both (and
   the other ports), so each keeps its own port's counters. */
function ownConduits(lines) {
	var shared = lines.map(function(x, k) {
		return x.statsDev !== x.dev && lines.some(function(y, j) { return j !== k && (y.statsDev === x.statsDev || y.dev === x.statsDev); });
	});
	lines.forEach(function(x, k) { if (shared[k]) { x.statsDev = x.dev; x.stats = x.ownStats; } });
	return lines;
}

return baseclass.extend({
	/* the highest rate a sample may carry; above it a counter was reset */
	MAX_BPS: MAX_BPS,

	/* ------------------------------------------------------------- CPU */

	/* /proc/stat -> { all: { idle, total }, cores: [ { idle, total } ] } */
	parseStat: function(text) {
		var out = { all: null, cores: [] };
		String(text || '').split('\n').forEach(function(line) {
			var m = line.match(/^cpu(\d*)\s+([\d\s]+)$/);
			if (!m) return;
			var f = m[2].trim().split(/\s+/).map(num);
			/* user nice system idle iowait irq softirq steal */
			var idle = f[3] + (f[4] || 0), total = 0;
			for (var i = 0; i < Math.min(f.length, 8); i++) total += f[i];
			if (m[1] === '') out.all = { idle: idle, total: total };
			else out.cores[+m[1]] = { idle: idle, total: total };
		});
		out.cores = out.cores.filter(Boolean);
		return out.all ? out : null;
	},

	cpuPercent: function(prev, cur) {
		if (!prev || !cur) return null;
		var dt = cur.total - prev.total, di = cur.idle - prev.idle;
		if (!(dt > 0)) return null;
		return Math.max(0, Math.min(100, (1 - di / dt) * 100));
	},

	/* { pct, cores: [ pct, ... ] } between two parseStat() results; null
	   for samples under a second apart (100 ticks a core), which would read
	   a burst, such as the router building the page, as the load */
	cpuUsage: function(prev, cur) {
		if (!prev || !cur) return null;
		if (cur.all.total - prev.all.total < 100 * Math.max(1, cur.cores.length)) return null;
		var self = this, pct = this.cpuPercent(prev.all, cur.all);
		if (pct == null) return null;
		return { pct: pct, cores: cur.cores.map(function(c, i) { return self.cpuPercent(prev.cores[i], c); }) };
	},

	/* luci.vantage thermal zones [ { zone, type, temp } ] (temp in
	   millidegrees) -> [ { name, celsius } ], the hottest first; an
	   implausible reading is left out */
	temps: function(zones) {
		return arr(zones).map(function(z) {
			var c = z && typeof z.temp === 'number' && isFinite(z.temp) ? z.temp / 1000 : NaN;
			if (!(c >= -40 && c <= 150)) return null;
			var name = typeof z.type === 'string' && z.type ? z.type : typeof z.zone === 'string' ? z.zone : '';
			return { name: fmt.safeText(name, 32), celsius: c };
		}).filter(Boolean).sort(function(a, b) { return b.celsius - a.celsius; });
	},

	/* ---------------------------------------------------------- memory */

	/* One bar, three segments that add up to total:
	     In use               total - available
	     Cache (reclaimable)  available - free   (page cache, buffers)
	     Free                 free
	   'available' is the kernel's estimate (MemAvailable); without it
	   free + buffered + cached stands in. */
	memory: function(m) {
		m = obj(m);
		var total = num(m.total);
		if (!(total > 0)) return null;
		var free = Math.min(Math.max(num(m.free), 0), total);
		var avail = finite(m.available) ? m.available : free + num(m.buffered) + num(m.cached);
		avail = Math.min(Math.max(avail, free), total);
		var used = total - avail, cache = avail - free;
		return {
			total: total, available: avail, used: used, cache: cache, free: free,
			availPct: avail / total * 100, usedPct: used / total * 100,
			segments: [
				{ key: 'used', label: _('In use', 'vantage'), bytes: used, pct: used / total * 100 },
				{ key: 'cache', label: _('Cache (reclaimable)'), bytes: cache, pct: cache / total * 100 },
				{ key: 'free', label: _('Free', 'vantage'), bytes: free, pct: free / total * 100 }
			]
		};
	},

	/* system.info swap -> { total, used, free, usedPct } or null when none */
	swap: function(s) {
		s = obj(s);
		var total = num(s.total), free = Math.min(Math.max(num(s.free), 0), total);
		if (!(total > 0)) return null;
		return { total: total, free: free, used: total - free, usedPct: (total - free) / total * 100 };
	},

	/* system.info root/tmp (KiB) -> bytes { key, label, total, used, free,
	   usedPct }; key says which of the two it is ('root', 'tmp'), for a
	   reader that wants one of them: the list has no fixed first entry */
	mount: function(s, label, key) {
		s = obj(s);
		var total = num(s.total) * 1024;
		if (!(total > 0)) return null;
		var used = Math.min(Math.max(num(s.used) * 1024, 0), total);
		var free = finite(s.avail) ? Math.min(num(s.avail) * 1024, total - used) : total - used;
		return { key: key || null, label: label, total: total, used: used, free: free, usedPct: used / total * 100 };
	},

	/* ---------------------------------------------------------- counters */

	/* Rate between two byte-counter samples { at: ms, rx, tx }.
	   'first': no previous sample; 'skip': under 1 s apart (keep prev as
	   the base); 'reset': a counter went backwards or the rate is not
	   physical (restart from cur); 'ok': rx/tx in bit/s. */
	counterRate: function(prev, cur) {
		if (!prev || !cur || !finite(prev.at) || !finite(cur.at)) return { state: 'first' };
		var dt = (cur.at - prev.at) / 1000;
		if (!(dt >= 1)) return { state: 'skip' };
		var rx = (num(cur.rx) - num(prev.rx)) * 8 / dt, tx = (num(cur.tx) - num(prev.tx)) * 8 / dt;
		if (!(rx >= 0 && tx >= 0 && rx <= MAX_BPS && tx <= MAX_BPS)) return { state: 'reset' };
		return { state: 'ok', rx: rx, tx: tx, dt: dt };
	},

	/* Capture time for one poll's counters. The browser clock is precise
	   but only says when the reply arrived; system.info localtime (whole
	   seconds) says which sample the device served. Same localtime as
	   last poll: the same snapshot again (-> dt 0, the rate is skipped).
	   The two clocks disagree by more than 2 s (a delayed reply, a
	   replayed or skipped sample): trust the device's spacing.
	   prev/next: { at: ms, local: s } */
	sampleClock: function(prev, now, local) {
		if (!finite(local)) return { at: now, local: null };
		if (!prev || !finite(prev.at) || !finite(prev.local)) return { at: now, local: local };
		var dLocal = (local - prev.local) * 1000, dClient = now - prev.at;
		if (dLocal === 0) return { at: prev.at, local: local };
		if (dLocal < 0 || Math.abs(dLocal - dClient) > 2000) return { at: prev.at + Math.max(dLocal, 0) || now, local: local };
		return { at: now, local: local };
	},

	/* Rates for a set of counters { key: { rx, tx, src, at } } captured at
	   `at`. Returns { next, rates }; next holds only keys present now, so
	   the state cannot grow with every station that ever associated. src
	   names where a key's counters come from (a switch port's: its chip,
	   'switch', or the kernel, none): a rate is only ever of two readings
	   of one source, so a key whose source changed starts over. A key with
	   its own at was read then, on its source's clock (a switch port's:
	   the device's monotonic clock), and is rated by it, never by when
	   the reply came in; that clock going back (the device started again)
	   starts the key over */
	rates: function(prevMap, counters, at) {
		var next = Object.create(null), rates = Object.create(null), self = this;
		Object.keys(obj(counters)).forEach(function(k) {
			var c = counters[k];
			if (!c) return;
			var p = own(prevMap, k) ? prevMap[k] : null;
			var cur = { at: finite(c.at) ? c.at : at, rx: num(c.rx), tx: num(c.tx), src: c.src || null };
			var r = p && (p.src !== cur.src || (finite(c.at) && cur.at < p.at)) ? { state: 'first' } : self.counterRate(p, cur);
			if (r.state === 'ok') rates[k] = { rx: r.rx, tx: r.tx };
			next[k] = r.state === 'skip' ? p : cur;
		});
		return { next: next, rates: rates };
	},

	/* luci.vantage.traffic hosts (luci-app-vantage-traffic, #110), checked
	   and cut to the plugin's own cap: { at, every, acct, partial, hw,
	   zeroed, counters: { mac: { rx, tx, at } } }, bytes from and to each
	   host since the plugin began counting it, or null. at is when the
	   plugin read its table (ms on the router's monotonic clock): the
	   rates come from two reads, whoever asked for them. Each counter
	   carries it, so that rates() starts a host over where that clock
	   went back (the router started again) */
	trafficHosts: function(reply) {
		var r = obj(reply), counters = Object.create(null);
		if (!finite(r.at) || !Array.isArray(r.hosts)) return null;
		r.hosts.slice(0, MAX_TRAFFIC_HOSTS).forEach(function(h) {
			h = obj(h);
			var mac = typeof h.mac === 'string' ? names.normMac(h.mac) : null;
			if (mac && !own(counters, mac) && finite(h.rx) && finite(h.tx) && h.rx >= 0 && h.tx >= 0) counters[mac] = { rx: h.rx, tx: h.tx, at: r.at };
		});
		var n = function(v) { return finite(v) && v > 0 ? Math.floor(v) : 0; };
		return {
			at: r.at, every: finite(r.every) && r.every >= 1000 ? r.every : 5000,
			acct: r.acct === true ? true : r.acct === false ? false : null,
			partial: r.partial === 'entries' || r.partial === 'time' ? r.partial : false,
			hw: n(r.hw), zeroed: n(r.zeroed), counters: counters
		};
	},

	/* luci.vantage.ports counters (#156): the byte counters a DSA switch
	   chip keeps for its ports, which count what it forwards from one
	   port to another too (the kernel's count what passes the CPU), as
	   the plugin read them with ethtool. Checked and cut to the plugin's
	   own cap: { state, counters: { port: { rx, tx, at } }, none } or
	   null; at: when the port was read, ms on the device's monotonic
	   clock, which its rate goes by (a port without it is not counted).
	   none: the answer says there is nothing to ask for (no DSA port, no
	   ethtool, or every port read with names the plugin does not know:
	   one driver, which says the same at every call). 'busy' (another
	   call was reading) is null too: no answer this time, never none */
	switchCounters: function(reply) {
		var r = obj(reply), ports = obj(r.ports), counters = Object.create(null), read = 0, unknown = 0;
		if (r.v !== 1 || SWITCH_STATES.indexOf(r.state) < 0) return null;
		Object.keys(ports).slice(0, MAX_SWITCH_PORTS).forEach(function(n) {
			var p = obj(ports[n]);
			if (!AP_IFNAME.test(n)) return;
			if (p.error === 'unknown' || p.error === 'failed') { read++; if (p.error === 'unknown') unknown++; return; }
			if (finite(p.rx_bytes) && finite(p.tx_bytes) && p.rx_bytes >= 0 && p.tx_bytes >= 0 && finite(p.at) && p.at >= 0) { read++; counters[n] = { rx: p.rx_bytes, tx: p.tx_bytes, at: p.at }; }
		});
		return { state: r.state, counters: counters, none: r.state !== 'ok' || (read > 0 && unknown === read) };
	},

	/* ------------------------------------------------------------ uplink */

	isWireless: function(name, dev, known) {
		if (known && known.indexOf(name) >= 0) return true;
		if (dev && (dev.devtype === 'wlan' || dev.wireless === true)) return true;
		return WIRELESS_NAME.test(String(name || ''));
	},

	parseSpeed: function(s) {
		var m = String(s == null ? '' : s).match(/^(\d+)([FH])?/);
		if (!m || +m[1] <= 0) return null;
		return { mbps: +m[1], duplex: m[2] === 'H' ? 'half' : (m[2] === 'F' ? 'full' : null) };
	},

	/* The switch ports behind a port that is a VLAN on a swconfig switch
	   (eth1.1): `map` is luci.vantage wired's switches, `states` LuCI's
	   getSwconfigPortState replies by switch name. { name, vlan, ports:
	   [ { num, label, link, speed } ], up } or null; link and speed stay
	   null while the switch has not answered. */
	switchOf: function(map, states, port) {
		var sw = typeof port === 'string' && own(map, port) ? obj(map[port]) : null;
		if (!sw || typeof sw.name !== 'string' || !/^[A-Za-z0-9_.-]{1,32}$/.test(sw.name) || !finite(sw.vlan)) return null;
		var state = own(states, sw.name) ? states[sw.name] : null, byNum = Object.create(null);
		arr(state).slice(0, 64).forEach(function(p) { p = obj(p); if (finite(p.port)) byNum[p.port] = p; });
		var known = Array.isArray(state) && state.length > 0, up = 0;
		var ports = arr(sw.ports).slice(0, 64).map(obj).filter(function(p) { return finite(p.num) && p.num >= 0 && p.num < 64; }).map(function(p) {
			var s = byNum[p.num], role = typeof p.role === 'string' && /^[a-z0-9]{1,16}$/.test(p.role) ? p.role.toUpperCase() : null;
			var link = known ? !!(s && s.link === true) : null;
			if (link) up++;
			return {
				num: p.num,
				/* "LAN 2" where board.json numbers the ports by role, else
				   swconfig's own number: four "LAN" would tell them apart */
				label: role && finite(p.index) ? role + ' ' + p.index : _('Port %d').format(p.num),
				link: link,
				speed: link && finite(s.speed) && s.speed > 0 ? { mbps: s.speed, duplex: s.duplex === true ? 'full' : s.duplex === false ? 'half' : null } : null
			};
		});
		return { name: sw.name, vlan: sw.vlan, ports: ports, up: known ? up : null };
	},

	speedLabel: function(sp) {
		if (!sp) return fmt.DASH;
		var v = sp.mbps >= 1000 ? _('%s Gbit/s').format(sp.mbps / 1000) : _('%s Mbit/s').format(sp.mbps);
		return v + (sp.duplex === 'full' ? ' · ' + _('full duplex') : sp.duplex === 'half' ? ' · ' + _('half duplex') : '');
	},

	/* lines beside the main one that the model lists (m.uplinks) */
	MAX_LINES: MAX_LINES,

	/* Pick the interface carrying traffic in/out of this device, and the
	   physical device its counters live on. Prefer interfaces with a default
	   route in the main table, as the kernel picks among them (groupLines):
	   real lines before tunnels, IPv4 before IPv6, then the lowest metric
	   (multi-WAN: the backup uplink has the higher one), with
	   wan/wan6/*wan* priority only on a tie. A softwire (DS-Lite, MAP-E,
	   464XLAT) carries IPv4 over the IPv6 uplink: the uplink shown is
	   the line, not the tunnel. Fall back to WAN names, then
	   the first up interface. A bridge, or a VLAN on one (br-lan.10), is
	   followed to its wired member (wireless members skipped): the port
	   given as `via` (where the bridge learned the gateway), else one with
	   a link, netifd 'ethernet' preferred. `port` is the member known to lead to the
	   gateway: `via`, or the bridge's only wired member; null when it has
	   several and the gateway's port is unknown. DSA with hardware
	   offload uses the conduit's counters. `kernel`: the kernel's
	   default routes (luci.vantage routes), or null; with a full-tunnel
	   VPN over the line, `tunnel` names it (ridingTunnel). */
	resolveUplink: function(ifaces, devs, wirelessNames, via, kernel) {
		devs = obj(devs);
		var g = groupLines(ifaces, devs, kernel)[0], up = upIfaces(ifaces);
		if (g) {
			var x = absorb(this.line(g.r.i, devs, wirelessNames, via), g), t = g.tunnel && g.tunnel.i;
			x.tunnel = t ? { iface: t.interface, proto: t.proto && t.proto !== 'none' ? t.proto : null, dev: t.l3_device || t.device, metric: g.tunnel.metric } : null;
			return x;
		}
		function named(re) { return up.filter(function(i) { return re.test(i.interface); })[0]; }
		/* An AP may retain an up, unmanaged WAN port without any routes. */
		var pick = named(/^wan$/) || named(/^wan6$/) || named(/wan/i) || up[0];
		return pick ? this.line(pick, devs, wirelessNames, via) : null;
	},

	/* The other lines to the internet beside `main` (resolveUplink's):
	   every other up interface with a default route in the main table
	   (failover by metric, mwan3), in the kernel's order, as groupLines
	   makes them: a softwire or a tunnel (WireGuard, OpenVPN, GRE, ...)
	   rides over another line and is not one of its own; 6rd, 6in4 or
	   6to4 IPv6 is part of the line when there is only one; a
	   default in another table (policy routing) is not ordinary
	   traffic's. A WAN that is down has no route: it stays a network
	   until it comes up. On a bridge, `viaOf(next hop, the line's
	   device)` names the port the bridge learned that gateway on; without
	   it a bridge with several wired ports keeps its own counters.
	   -> [ line, ... ] as resolveUplink's, without main */
	extraUplinks: function(ifaces, devs, wirelessNames, main, viaOf, kernel) {
		var self = this;
		if (!main) return [];
		devs = obj(devs);
		return groupLines(ifaces, devs, kernel).filter(function(g) {
			return g.l3.indexOf(main.l3dev) < 0 && !g.members.some(function(i) { return i.interface === main.iface; });
		}).map(function(g) {
			var r = defRoute(g.r.i), hop = r && r.nexthop;
			return absorb(self.line(g.r.i, devs, wirelessNames, hop && typeof viaOf === 'function' ? viaOf(hop, g.r.i.l3_device || g.r.i.device) : null, true), g);
		});
	},

	/* one line: the interface, the device its counters live on (see
	   resolveUplink), its addresses and its default route. `own`: on a
	   bridge with several wired ports and the gateway's port unknown,
	   the bridge's (or its VLAN's) own counters, not a guessed port's. */
	line: function(pick, devs, wirelessNames, via, own) {
		var self = this;
		devs = obj(devs);
		var l3 = pick.l3_device || pick.device, dev = l3, d = devs[dev], port = dev;
		var isBridge = function(x) { return !!x && (x.type === 'bridge' || x.devtype === 'bridge') && Array.isArray(x['bridge-members']); };
		var vlanOf = /^(.+)\.\d{1,4}$/.exec(dev);
		var br = isBridge(d) ? d : (vlanOf && isBridge(devs[vlanOf[1]])) ? devs[vlanOf[1]] : null;
		if (br) {
			var members = br['bridge-members'];
			var wired = members.filter(function(m) { return !self.isWireless(m, devs[m], wirelessNames); });
			var eth = wired.filter(function(m) { return devs[m] && devs[m].devtype === 'ethernet'; });
			var lit = function(m) { return devs[m] && devs[m].carrier === true; };
			/* a Wi-Fi member only as build() passes it: this device's own
			   client, mesh or WDS link that the gateway is heard on */
			var known = typeof via === 'string' && members.indexOf(via) >= 0 ? via : null;
			if (!known && own && wired.length > 1) port = null;
			else {
				var next = known || eth.filter(lit)[0] || wired.filter(lit)[0] || eth[0] || wired[0] || members[0];
				if (next) { dev = next; d = devs[dev] || null; }
				port = known || (wired.length === 1 ? wired[0] : null);
			}
		}

		/* PPPoE: flow offloading takes downloads past the session's own
		   counters, and the port under it counts everything (#92). Lines
		   that share the port go back to their own (ownConduits). */
		var under = pick.proto === 'pppoe' && typeof pick.device === 'string' && pick.device !== l3 && devs[pick.device] ? pick.device : null;
		var counted = under ? devs[under] : d, statsDev = under || dev;
		if (!under && d && d.devtype === 'dsa' && d['hw-tc-offload'] && d.conduit && devs[d.conduit])
			statsDev = d.conduit;

		var route = defRoute(pick), hop = route && route.nexthop;
		return {
			iface: pick.interface,
			l3dev: l3,
			dev: dev,
			port: port,
			statsDev: statsDev,
			isWan: /wan/i.test(pick.interface),
			proto: pick.proto || null,
			uptime: finite(pick.uptime) ? pick.uptime : null,
			up: !!pick.up,
			carrier: d ? d.carrier !== false : null,
			speed: d ? this.parseSpeed(d.speed) : null,
			/* what the link could be at best (bestLink), or null */
			linkMax: bestLink(d),
			ipv4: cidrs(pick['ipv4-address']),
			ipv6: cidrs(pick['ipv6-address']),
			prefix6: prefixes(pick['ipv6-prefix']),
			gateway: hop && hop !== '0.0.0.0' && hop !== '::' ? hop : null,
			/* a tunnel's default route has no next hop: routed, without a gateway address */
			defaultRoute: !!route,
			metric: route ? metric(pick, route) : null,
			dns: arr(pick['dns-server']).filter(function(s) { return typeof s === 'string'; }),
			/* the interfaces the line is made of (wan, wan6) */
			ifaces: [ pick.interface ],
			stats: counted && counted.statistics ? counted.statistics : null,
			ownStats: d && d.statistics ? d.statistics : null
		};
	},

	/* A router's line to the internet whose address is not its own on
	   the internet: 'private' (RFC 1918: a router in front of this one,
	   or the provider, translates too: double NAT) or 'shared' (RFC
	   6598, 100.64/10: the provider's own NAT), else null. Only a line
	   through a WAN interface: an access point's uplink is its LAN,
	   private as it should be. And only when every IPv4 address of the
	   line is one of the two: a modem's management address beside a
	   public one is no NAT. Any other block (documentation addresses
	   too) is none. */
	lineNat: function(x) {
		var self = this;
		var kinds = x && x.isWan ? arr(x.ipv4).map(function(a) {
			var o = self.parseIPv4(String(a).split('/')[0]);
			if (!o) return null;
			if (o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168)) return 'private';
			return o[0] === 100 && o[1] >= 64 && o[1] <= 127 ? 'shared' : null;
		}) : [];
		return kinds.length && kinds.every(Boolean) ? kinds[0] : null;
	},

	/* The device's other networks (lan, guest, a VPN, ...): every
	   interface except loopback and the uplinks shown (a line or a list
	   of them, with the interfaces each is made of; wan6 shares wan's
	   device) and the full-tunnel VPN drawn on the main one. One entry
	   per device, by interface name.
	   -> [ { name, proto, dev, up, ipv4 } ] */
	networks: function(ifaces, uplinks) {
		var seen = Object.create(null);
		uplinks = arr(Array.isArray(uplinks) ? uplinks : [ uplinks ]).filter(Boolean);
		return arr(ifaces).filter(function(i) {
			return i && typeof i.interface === 'string' && i.interface !== 'loopback';
		}).sort(function(a, b) {
			return a.interface < b.interface ? -1 : a.interface > b.interface ? 1 : 0;
		}).map(function(i) {
			var dev = i.l3_device || i.device;
			var a4 = arr(i['ipv4-address']).filter(function(a) { return a && a.address; })[0];
			return {
				name: fmt.safeText(i.interface, 32),
				proto: typeof i.proto === 'string' ? fmt.safeText(i.proto, 24) : null,
				dev: typeof dev === 'string' && dev ? dev : null,
				up: !!i.up,
				ipv4: a4 ? a4.address + '/' + a4.mask : null
			};
		}).filter(function(n) {
			if (uplinks.some(function(u) {
				return n.name === u.iface || arr(u.ifaces).indexOf(n.name) >= 0 || (n.dev && n.dev === u.l3dev) ||
					!!(u.tunnel && (n.name === u.tunnel.iface || (n.dev && n.dev === u.tunnel.dev)));
			})) return false;
			if (n.dev && seen[n.dev]) return false;
			if (n.dev) seen[n.dev] = true;
			return true;
		});
	},

	/* The device tree model is sometimes the SoC reference design
	   ("Qualcomm Technologies, Inc. IPQ5332/RDP442/..."); board_name
	   ("zyxel,nwa50be") names the actual product then. */
	deviceModel: function(board) {
		board = obj(board);
		var model = String(board.model || ''), m = String(board.board_name || '').match(/^([^,]+),(.+)$/);
		if (m && (!model || /Qualcomm Technologies|\bRDP\d|reference board|\bEVB\b|\bRFB\b/i.test(model)))
			return m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ' + m[2].toUpperCase();
		return model || board.board_name || null;
	},

	/* system board's release.builddate -> seconds since 1970, or null.
	   procd passes on the image's OPENWRT_BUILD_DATE, the build's
	   SOURCE_DATE_EPOCH as text; a custom build may put anything there
	   (a revision, a date in words), which is no date here. Plausible:
	   whole seconds from 2020 (no firmware this runs on is older) to
	   2100 */
	buildDate: function(v) {
		var n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{9,10}$/.test(v) ? +v : NaN;
		return n >= 1577836800 && n < 4102444800 && n % 1 === 0 ? n : null;
	},

	/* ------------------------------------------------ address filtering */

	parseIPv4: function(s) {
		var m = typeof s === 'string' ? s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/) : null;
		if (!m) return null;
		var out = [];
		for (var i = 1; i <= 4; i++) {
			if (m[i].length > 1 && m[i].charAt(0) === '0') return null;
			if (+m[i] > 255) return null;
			out.push(+m[i]);
		}
		return out;
	},

	/* an IPv6 address -> its eight groups, the same for every spelling
	   of it (::, leading zeros, case), or null; one with an IPv4 tail
	   or a zone is none here */
	parseIPv6: function(s) {
		var parts = typeof s === 'string' ? s.split('::') : [];
		if (parts.length < 1 || parts.length > 2) return null;
		var head = parts[0] ? parts[0].split(':') : [], tail = parts[1] ? parts[1].split(':') : [];
		var gap = 8 - head.length - tail.length, out = [];
		if (parts.length > 1 ? gap < 1 : gap !== 0) return null;
		for (; gap > 0; gap--) head.push('0');
		head = head.concat(tail);
		for (var i = 0; i < 8; i++) {
			if (!/^[0-9a-f]{1,4}$/i.test(head[i])) return null;
			out.push(parseInt(head[i], 16));
		}
		return out;
	},

	ipv4InSubnet: function(ip, net, mask) {
		var a = this.parseIPv4(ip), b = this.parseIPv4(net);
		mask = +mask;
		if (!a || !b || !(mask >= 0 && mask <= 32)) return false;
		for (var i = 0; i < 4; i++) {
			var bits = Math.max(0, Math.min(8, mask - i * 8));
			if (!bits) break;
			var m = (0xff << (8 - bits)) & 0xff;
			if ((a[i] & m) !== (b[i] & m)) return false;
		}
		return true;
	},

	/* host-hint IPv4 addresses inside one of the given subnets
	   ([ 'a.b.c.d/nn', ... ]); hints are keyed by MAC only, so a hint may
	   name any address. IPv6 link-local and global addresses are kept, at
	   most 8 addresses in all: a device cannot fill the page or the
	   reverse DNS queue with addresses. */
	hintAddrs: function(hint, subnets) {
		var self = this, out = [], MAX = 8;
		hint = obj(hint);
		arr(hint.ipaddrs).forEach(function(ip) {
			if (typeof ip !== 'string' || out.indexOf(ip) >= 0 || out.length >= MAX) return;
			if (!subnets.length || subnets.some(function(s) { var p = s.split('/'); return +p[1] >= 8 && self.ipv4InSubnet(ip, p[0], p[1]); }))
				out.push(ip);
		});
		arr(hint.ip6addrs).forEach(function(ip) {
			if (typeof ip === 'string' && /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45 && out.indexOf(ip) < 0 && out.length < MAX) out.push(ip);
		});
		return out;
	},

	/* luci.vantage survey [ { mhz, noise } ] -> the noise floor (dBm) on
	   the channel at mhz, or null. A signed byte, as nl80211 carries it;
	   rpcd's iwinfo survey (1.0.19) gave some drivers' as an unsigned one
	   (ath12k: 146 for -110 dBm); 0 when the driver has none */
	surveyNoise: function(entries, mhz) {
		if (!mhz) return null;
		var e = arr(entries).filter(function(x) { return x && num(x.mhz) === mhz; })[0];
		var v = e ? num(e.noise) : 0;
		if (!v || v % 1) return null;
		if (v > 127 && v < 256) v -= 256;
		return v < 0 && v >= -128 ? v : null;
	},

	/* --------------------------------------------- paired access points */

	/* vantage.collector report -> the paired access points, checked again
	   here (types, ranges, MACs, caps), whatever the collector did:
	   [ { id, name, addr, state, error, age, info: { name, model, uptime }
	   or null, mac, nodes: [ { id, ifname, ssid, bssid, freq, channel,
	   band, clients } ], sta: [ { mac, node, signal, rxRate, txRate, rx,
	   tx, connected } ], hosts: [ { mac, port, speed, rx, tx } ], clients,
	   wired, rate } ]. `name` and `mac` are the pairing's; what the access
	   point calls itself is in info. Only one in state ok has nodes,
	   stations (sta) and hosts: what it reports, which build() gives or
	   refuses it, counting what it gave in clients, wired and rate (0 and
	   null here); build() adds parent ({ id, name, port } of the access
	   point it is plugged into, or null) and depth, and lists each under
	   its parent. No reply (a failed call, nothing paired): [] */
	collectorAps: function(reply) {
		var self = this, out = [], ids = Object.create(null), total = 0;
		function unicast(v) {
			var m = names.normMac(v);
			return m && !names.isMulticastMac(m) && m !== '00:00:00:00:00:00' ? m : null;
		}
		function bps(v) { return finite(v) && v >= 0 && v <= MAX_BPS ? v : null; }
		function kbit(v) { return finite(v) && v > 0 && v <= MAX_BPS / 1000 ? v : null; }
		function addr(v) {
			if (typeof v !== 'string') return null;
			if (self.parseIPv4(v)) return v;
			return v.length <= 39 && v.indexOf(':') >= 0 && /^[0-9a-f:]+$/i.test(v) ? v : null;
		}
		/* a station's link as its access point saw it */
		function phyOf(p) {
			if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
			function int(v, lo, hi) { return finite(v) && v % 1 === 0 && v >= lo && v <= hi ? v : null; }
			return { mhz: int(p.mhz, 1, 640), mcs: int(p.mcs, 0, 31), nss: int(p.nss, 1, 16),
				ht: p.ht === true, vht: p.vht === true, he: p.he === true, eht: p.eht === true, short_gi: p.sgi === true };
		}
		arr(obj(reply).aps).slice(0, MAX_APS).forEach(function(x) {
			x = obj(x);
			if (typeof x.id !== 'string' || !AP_ID.test(x.id) || ids[x.id]) return;
			ids[x.id] = true;
			var state = AP_STATES.indexOf(x.state) >= 0 ? x.state : 'error';
			var rep = x.report && typeof x.report === 'object' && !Array.isArray(x.report) ? x.report : null;
			/* ok without a report says nothing: as the collector's 'invalid' */
			if (state === 'ok' && !rep) state = 'error';
			var a = {
				id: x.id,
				name: typeof x.name === 'string' && AP_NAME.test(x.name) ? x.name : x.id,
				addr: addr(x.addr),
				state: state,
				/* ok may carry the last fetch's error: its report still stands */
				error: state === 'error' ? (AP_ERRORS.indexOf(x.error) >= 0 ? x.error : 'invalid')
					: state === 'offline' && AP_OFFLINE.indexOf(x.error) >= 0 ? x.error : null,
				age: finite(x.age) && x.age >= 0 ? x.age : null,
				info: rep ? {
					name: fmt.safeText(typeof rep.name === 'string' ? rep.name : '', 63) || null,
					model: fmt.safeText(typeof rep.model === 'string' ? rep.model : '', 64) || null,
					uptime: finite(rep.uptime) && rep.uptime >= 0 ? rep.uptime : null
				} : null,
				mac: rep ? unicast(rep.mac) : null,
				nodes: [], sta: [], hosts: [], clients: 0, wired: 0, rate: null
			};
			if (state === 'ok') {
				var nodeOf = Object.create(null), seen = Object.create(null);
				arr(rep.ssids).slice(0, MAX_AP_SSIDS).forEach(function(s) {
					s = obj(s);
					if (typeof s.ifname !== 'string' || !AP_IFNAME.test(s.ifname) || nodeOf[s.ifname]) return;
					var freq = finite(s.freq) && s.freq > 0 && s.freq < 100000 ? s.freq : null;
					var n = {
						id: s.ifname, ifname: s.ifname,
						ssid: fmt.safeText(typeof s.ssid === 'string' ? s.ssid : '', 32),
						bssid: unicast(s.bssid), freq: freq,
						channel: finite(s.channel) && s.channel > 0 && s.channel < 256 && s.channel % 1 === 0 ? s.channel : null,
						band: AP_BANDS.indexOf(s.band) >= 0 ? s.band : wifi.bandKey(null, freq),
						clients: 0
					};
					nodeOf[n.id] = n;
					a.nodes.push(n);
				});
				arr(rep.stations).slice(0, MAX_AP_STATIONS).forEach(function(s) {
					s = obj(s);
					var mac = unicast(s.mac), n = typeof s.ifname === 'string' && own(nodeOf, s.ifname) ? nodeOf[s.ifname] : null;
					if (!mac || !n || seen[mac] || total >= MAX_REMOTE_STATIONS) return;
					seen[mac] = true;
					total++;
					a.sta.push({
						mac: mac, node: n.id,
						signal: finite(s.signal) && s.signal >= -120 && s.signal <= -1 ? s.signal : null,
						rxRate: kbit(s.rxRate), txRate: kbit(s.txRate),
						rx: bps(s.rx), tx: bps(s.tx),
						connected: finite(s.connected) && s.connected >= 0 ? s.connected : null,
						rxPhy: phyOf(s.rxPhy), txPhy: phyOf(s.txPhy)
					});
				});
				seen = Object.create(null);
				arr(rep.wired).slice(0, MAX_AP_WIRED).forEach(function(w) {
					w = obj(w);
					var mac = unicast(w.mac);
					if (!mac || seen[mac] || typeof w.port !== 'string' || !AP_IFNAME.test(w.port)) return;
					seen[mac] = true;
					a.hosts.push({ mac: mac, port: w.port, speed: finite(w.speed) && w.speed > 0 && w.speed <= 4e6 ? w.speed : null, rx: bps(w.rx), tx: bps(w.tx) });
				});
			}
			out.push(a);
		});
		return out;
	},

	/* -------------------------------------------------------- WireGuard */

	/* luci.wireguard getWgInstances ({ wg0: { name, listen_port, peers:
	   [ { name, public_key, endpoint, allowed_ips, latest_handshake,
	   transfer_rx, transfer_tx, persistent_keepalive } ] } }, as `wg show
	   all dump` prints them: numbers as text, "(none)" and "off" for
	   nothing; no private or preshared key) -> the tunnels by name, at
	   most 8 with 128 peers each, checked here (types, ranges, caps)
	   whatever the plugin did: [ { name, port, peers: [ { id, key, name,
	   label, endpoint, allowed: [ cidr ], handshake, age, state, rx, tx,
	   keepalive } ] } ]. id is the peer's public key, to tell peers apart
	   and never to show; key is the one to show, shortened as LuCI
	   shortens it; name is its description in the configuration ('' for
	   none) and label that or the key. handshake is the time of the last
	   one (epoch seconds, 0 for none) and age the whole seconds since, by
	   `now` (epoch seconds; a handshake ahead of it is 0 old): state is
	   'never', 'recent' up to WG_RECENT_S and 'stale' past it. rx and tx
	   are the bytes received from the peer and sent to it (null when not
	   a count). The peers of a tunnel: those with a recent handshake
	   first, by label (not by its second: each makes a new one every two
	   minutes, and the rows would change places as they do), then the
	   others by their last one, the latest first, then those without, by
	   label. No reply: [] */
	WG_RECENT_S: WG_RECENT_S,
	wireguard: function(reply, now) {
		var out = [];
		function count(v, max) {
			if (typeof v === 'string' && /^\d{1,16}$/.test(v)) v = +v;
			return finite(v) && v >= 0 && v <= max && v % 1 === 0 ? v : null;
		}
		reply = obj(reply);
		/* a handshake cannot lie ahead: where this browser's clock is
		   behind the router's, the newest one is now */
		Object.keys(reply).forEach(function(ifname) {
			arr(obj(reply[ifname]).peers).forEach(function(p) {
				var hs = count(obj(p).latest_handshake, 0xffffffff);
				if (hs && finite(now) && hs > now) now = hs;
			});
		});
		Object.keys(reply).sort().forEach(function(ifname) {
			var x = obj(reply[ifname]), seen = Object.create(null), peers = [];
			/* a tunnel is an interface's name with its list of peers */
			if (!AP_IFNAME.test(ifname) || !Array.isArray(x.peers) || out.length >= MAX_WG_IFACES) return;
			x.peers.slice(0, MAX_WG_PEERS).forEach(function(p) {
				p = obj(p);
				var id = typeof p.public_key === 'string' && WG_KEY.test(p.public_key) ? p.public_key : null;
				if (!id || seen[id]) return;
				seen[id] = true;
				var key = id.slice(0, 5) + '…' + id.slice(-6);
				var name = fmt.safeText(typeof p.name === 'string' ? p.name.trim() : '', 48);
				var hs = count(p.latest_handshake, 0xffffffff) || 0;
				var age = hs && finite(now) ? Math.max(0, Math.floor(now - hs)) : null;
				peers.push({
					id: id, key: key, name: name, label: name || key,
					endpoint: typeof p.endpoint === 'string' && WG_ENDPOINT.test(p.endpoint) ? p.endpoint : null,
					allowed: arr(p.allowed_ips).filter(function(a) { return typeof a === 'string' && WG_CIDR.test(a); }).slice(0, MAX_WG_ALLOWED),
					handshake: hs, age: age,
					state: !hs ? 'never' : age != null && age <= WG_RECENT_S ? 'recent' : 'stale',
					rx: count(p.transfer_rx, Number.MAX_SAFE_INTEGER), tx: count(p.transfer_tx, Number.MAX_SAFE_INTEGER),
					keepalive: count(p.persistent_keepalive, 65535) || null
				});
			});
			peers.sort(function(a, b) {
				var ra = a.state === 'recent', rb = b.state === 'recent', la = a.label.toLowerCase(), lb = b.label.toLowerCase();
				return rb - ra || (ra ? 0 : b.handshake - a.handshake) || (la < lb ? -1 : la > lb ? 1 : 0) || (a.id < b.id ? -1 : 1);
			});
			out.push({ name: ifname, port: count(x.listen_port, 65535) || null, peers: peers });
		});
		return out;
	},

	/* --------------------------------------------------- provider tiles */

	/* A provider's answer (vantage.tile.<id> status, another package's)
	   in the form of contract version 1, or null. The answer:
	     { v: 1, title, icon?, state?, note?, every?, page?, items: [ item ] }
	     title  its name, 1-32 characters: an English text, looked up in
	            LuCI's catalogues as the dashboard's own are
	     icon   one of TILE_ICONS, the dashboard's own drawings
	     state  'ok', 'warn', 'err' or 'off': the dot by its name. Never a
	            health check, never the page title's mark
	     note   one line under the name, up to 64 characters, looked up
	            as the title is
	     every  how often its data changes, 5-300 s: it is asked no more
	            often than that (default: with every slow poll)
	     page   a LuCI page by its menu path ('admin/network/dhcp'),
	            linked where this login's menu has it
	     items  at most 8 (more are left out), each
	            { label, value | text, unit?, rate?, max?, level?, trend? }:
	            label  1-32 characters, looked up as the title is; one
	                   item a label (a second one is left out)
	            value  a number the dashboard writes out by its unit:
	                   '' (a count), '%', 'ms', 's' (a duration), 'dBm',
	                   'dB', 'MHz', 'B' (bytes) or 'bit/s'
	            rate   true: value is a counter, shown as its rate between
	                   two answers ('' a second; 'B' as traffic, in the
	                   speed unit picked)
	            max    above 0: a meter, value of max (not with rate)
	            text   instead of a value: up to 48 characters, as it is
	            level  'ok', 'warn', 'err' or 'off': the value's colour
	            trend  true: the page keeps its values and draws them
	   A key it does not know is left out, so a later version can add
	   one; an item not of this form is left out, and an answer without
	   v 1 and a title is none. Text is made safe and cut to its length
	   (fmt.safeText), and one with nothing to see is none (TILE_VISIBLE).
	   -> { title, icon, state, note, every, page: [ step ] | null, items:
	   [ { label, value, text, unit, rate, max, level, trend } ] }; value
	   is null for a text, text null for a value */
	TILE_ICONS: TILE_ICONS,
	tile: function(reply) {
		function str(v, max) {
			if (typeof v !== 'string') return null;
			v = fmt.safeText(v.trim(), max);
			return v && TILE_VISIBLE.test(v) ? v : null;
		}
		function level(v) { return TILE_LEVELS.indexOf(v) >= 0 ? v : null; }
		function value(v) { return finite(v) && Math.abs(v) < TILE_NUM_MAX ? v : null; }
		if (!reply || typeof reply !== 'object' || Array.isArray(reply) || reply.v !== TILE_V) return null;
		var title = str(reply.title, 32);
		if (!title) return null;
		var every = finite(reply.every) && reply.every % 1 === 0 && reply.every >= TILE_EVERY_MIN && reply.every <= TILE_EVERY_MAX ? reply.every : null;
		var page = typeof reply.page === 'string' && TILE_PAGE.test(reply.page) ? reply.page.split('/') : null;
		var seen = Object.create(null), items = [];
		arr(reply.items).slice(0, MAX_TILE_ITEMS * 4).forEach(function(x) {
			if (items.length >= MAX_TILE_ITEMS || !x || typeof x !== 'object' || Array.isArray(x)) return;
			var label = str(x.label, 32), v = value(x.value), t = v == null ? str(x.text, 48) : null;
			var unit = x.unit == null ? '' : x.unit, rate = x.rate === true;
			if (!label || seen[label.toLowerCase()] || (v == null && t == null) || TILE_UNITS.indexOf(unit) < 0) return;
			/* a counter's rate is of a count or of bytes, and never below zero */
			if (rate && (v == null || v < 0 || (unit !== '' && unit !== 'B'))) return;
			seen[label.toLowerCase()] = true;
			var max = !rate && v != null && finite(x.max) && x.max > 0 && x.max < TILE_NUM_MAX ? x.max : null;
			items.push({ label: label, value: v, text: t, unit: v == null ? '' : unit, rate: rate, max: max, level: level(x.level), trend: v != null && x.trend === true });
		});
		return {
			title: title, icon: TILE_ICONS.indexOf(reply.icon) >= 0 ? reply.icon : TILE_ICONS[0], state: level(reply.state),
			note: str(reply.note, 64), every: every, page: page, items: items
		};
	},

	/* ------------------------------------------------------------ ports */

	/* The device's Ethernet ports, for the Ports tile, from what the
	   dashboard reads anyway: no call and no grant of their own. `devs`
	   is network.device status. A port is
	   - a switch's port under DSA (devtype dsa);
	   - an Ethernet adapter of its own (devtype ethernet: netifd's word
	     for an Ethernet device the kernel gives no other type, so never
	     a bridge, a VLAN, a bond, a tunnel or a WireGuard device) whose
	     driver names a link mode it supports: a veth pair, a tap and a
	     virtual machine's paravirtual adapter name none, and nothing
	     else here tells those from a port. Never a wireless one
	     (isWireless), a conduit (the CPU's side of a DSA switch, which
	     its ports name) or the CPU's side of a swconfig switch;
	   - a swconfig switch's port, as luci.vantage wired maps them by
	     VLAN device (`switches`) with the links LuCI reports (`states`,
	     see switchOf): each once, whatever VLANs it is in.
	   netifd lists the devices the configuration uses: a port that no
	   interface and no bridge names is not among them.
	   `hosts` are the wired hosts (build's), counted on the port they
	   were learned on; `lines` the lines to the internet (build's
	   uplinks), each marking the port it leaves through: its known port,
	   or the port under its VLAN or its PPPoE session, never a bridge
	   member that was only guessed. A swconfig VLAN's hosts and line are
	   one switch port's only where the VLAN has one port, or one with a
	   link.
	   -> [ { id, name, kind: 'dsa' | 'eth' | 'switch', dev, link, speed,
	          counters, hosts, lines: [ interface ], sw } ] in name order,
	   the swconfig ports last, MAX_PORTS at most. id: the device's name,
	   or '<switch> <number>' (no device has a space in its name); dev:
	   the device whose hosts are this port's, or null; link: true, false
	   or null (a switch that has not answered); counters: { rxErrors,
	   txErrors, rxDropped, txDropped, collisions } since boot, null for
	   a swconfig port (it has none here); hosts: null where they cannot
	   be told apart by port; sw: { name, num } of a swconfig port */
	MAX_PORTS: MAX_PORTS,
	ports: function(devs, switches, states, wirelessNames, hosts, lines) {
		var self = this, out = [], byDev = Object.create(null), byVlan = Object.create(null), bySw = Object.create(null);
		var conduit = Object.create(null), cpu = Object.create(null), only = Object.create(null);
		devs = obj(devs);
		switches = obj(switches);
		function under(n) { for (var m = VLAN_DEV.exec(n); m; m = VLAN_DEV.exec(n)) n = m[1]; return n; }
		function count(v) { return finite(v) && v > 0 ? v : 0; }
		function parts(n) { return String(n).match(/\d+|\D+/g) || []; }
		/* lan2 before lan10 */
		function natural(a, b) {
			var x = parts(a), y = parts(b);
			for (var i = 0; i < x.length && i < y.length; i++) {
				if (x[i] === y[i]) continue;
				if (/^\d/.test(x[i]) && /^\d/.test(y[i]) && +x[i] !== +y[i]) return +x[i] - +y[i];
				return x[i] < y[i] ? -1 : 1;
			}
			return x.length - y.length;
		}
		Object.keys(devs).forEach(function(n) { var c = obj(devs[n]).conduit; if (typeof c === 'string') conduit[c] = true; });
		Object.keys(switches).forEach(function(n) { cpu[n] = cpu[under(n)] = true; });

		Object.keys(devs).forEach(function(n) {
			var d = obj(devs[n]);
			/* a device on another (a macvlan, which the kernel gives no
			   type of its own and its parent's link modes) is no port */
			if (typeof d.parent === 'string') return;
			if (d.devtype !== 'dsa' && !(d.devtype === 'ethernet' && arr(d['link-supported']).length && !conduit[n] && !cpu[n])) return;
			if (self.isWireless(n, d, wirelessNames)) return;
			var s = obj(d.statistics), link = d.carrier === true ? true : d.carrier === false ? false : null;
			out.push(byDev[n] = {
				id: n, name: fmt.safeText(n, 32), kind: d.devtype === 'dsa' ? 'dsa' : 'eth', dev: n,
				link: link, speed: link ? self.parseSpeed(d.speed) : null,
				counters: { rxErrors: count(s.rx_errors), txErrors: count(s.tx_errors), rxDropped: count(s.rx_dropped), txDropped: count(s.tx_dropped), collisions: count(s.collisions) },
				hosts: 0, lines: [], sw: null
			});
		});

		Object.keys(switches).sort().forEach(function(dev) {
			var sw = self.switchOf(switches, states, dev);
			if (!sw) return;
			var lit = sw.ports.filter(function(p) { return p.link; });
			var one = sw.ports.length === 1 ? sw.ports[0] : lit.length === 1 ? lit[0] : null;
			sw.ports.forEach(function(p) {
				var id = sw.name + ' ' + p.num, e = bySw[id];
				if (!e) out.push(e = bySw[id] = { id: id, name: p.label, kind: 'switch', dev: null, link: p.link, speed: p.speed, counters: null, hosts: null, lines: [], sw: { name: sw.name, num: p.num } });
				/* a port tagged in several VLANs is the one port of each:
				   its hosts are the first's, a line on any leaves through it */
				if (p === one) only[dev] = e;
				if (p === one && !e.dev) { e.dev = dev; e.hosts = 0; byVlan[dev] = e; }
			});
		});

		arr(hosts).forEach(function(h) {
			var e = h && !h.ap && typeof h.port === 'string' ? byDev[h.port] || byVlan[h.port] : null;
			if (e) e.hosts++;
		});
		arr(lines).forEach(function(x) {
			/* without a default route it is no line out: the network the
			   uplink falls back to while every line is down */
			if (!x || typeof x.iface !== 'string' || x.defaultRoute === false) return;
			/* a line that is not on a bridge: the device under its PPPoE session too */
			var names = [ x.port ].concat(x.port && x.port === x.l3dev ? [ x.statsDev ] : []), e = null, name = fmt.safeText(x.iface, 32);
			function at(n) { return typeof n === 'string' ? byDev[n] || only[n] || byDev[under(n)] || null : null; }
			/* the device itself, or the one a macvlan or a named VLAN is on */
			names.forEach(function(n) { if (!e && typeof n === 'string') e = at(n) || at(obj(devs[n]).parent); });
			if (e && e.lines.indexOf(name) < 0) e.lines.push(name);
		});

		return out.sort(function(a, b) {
			return (a.sw ? 1 : 0) - (b.sw ? 1 : 0) || (a.sw ? natural(a.sw.name, b.sw.name) || natural(a.name, b.name) || a.sw.num - b.sw.num : natural(a.id, b.id));
		}).slice(0, MAX_PORTS);
	},

	/* ------------------------------------------------------------ model */

	/* raw: { board, info, ifaces, devs, wifi, iwinfo: { ifname: info },
	          assoc: { ifname: [ station ] }, hapd: { ifname: { clients } },
	          hapdStatus: { ifname: status }, hints, aliases, rdns, mdns,
	          fdb: [ luci.vantage wired host ] (-> wiredHosts),
	          routes: [ luci.vantage routes route ] or null,
	          collector: vantage.collector report or null,
	          vendor: fn(mac) -> name|null } */
	build: function(raw) {
		raw = raw || {};
		var self = this, board = obj(raw.board), info = obj(raw.info), devs = obj(raw.devs), hints = obj(raw.hints);
		var wifiDevs = obj(raw.wifi), iw = obj(raw.iwinfo), assoc = obj(raw.assoc), hapd = obj(raw.hapd), hstat = obj(raw.hapdStatus);

		var radios = [], ssids = [], clients = [], wlNames = [];

		Object.keys(wifiDevs).sort().forEach(function(rname) {
			var r = obj(wifiDevs[rname]), cfg = obj(r.config), rIw = obj(r.iwinfo);
			var ifs = arr(r.interfaces).filter(function(i) { return i && typeof i === 'object'; });
			var firstIf = ifs.filter(function(i) { return i.ifname && own(iw, i.ifname); })[0];
			var info0 = firstIf ? obj(iw[firstIf.ifname]) : {};
			var band = wifi.bandKey(cfg.band, info0.frequency || rIw.frequency);
			/* a radio read from the config (luci.vantage wireless without
			   netifd: vendor drivers such as mtkwifi) has no run state, and
			   its driver may report less than it runs: mtkwifi's iwinfo
			   stops at HE with EHT configured. Elsewhere iwinfo wins. */
			var fromCfg = r.source === 'config', cfgHt = wifi.htmode(cfg.htmode);
			var htmode = fromCfg && cfgHt.std === 'EHT' ? cfg.htmode : (info0.htmode || cfg.htmode || null);
			var ht = wifi.htmode(htmode);
			var chan = num(info0.channel || rIw.channel || cfg.channel) || null;
			var live = ifs.some(function(i) { return typeof i.ifname === 'string' && own(iw, i.ifname) && num(obj(iw[i.ifname]).channel) > 0; });
			/* the noise floor every poll from the survey, on the channel
			   hostapd says the radio is on (iwinfo info's may be 30 s old) */
			var svIf = ifs.filter(function(i) { return i.ifname && raw.survey && own(raw.survey, i.ifname); })[0];
			var stIf = ifs.filter(function(i) { return i.ifname && own(hstat, i.ifname) && num(obj(hstat[i.ifname]).freq) > 0; })[0];
			var svNoise = svIf ? self.surveyNoise(raw.survey[svIf.ifname], num(stIf ? obj(hstat[stIf.ifname]).freq : 0) || num(info0.frequency || rIw.frequency)) : null;
			var noiseRaw = svNoise != null ? svNoise : (finite(info0.noise) ? info0.noise : (finite(rIw.noise) ? rIw.noise : null));
			var radio = {
				id: rname,
				band: band,
				bandLabel: wifi.bandLabel(band),
				up: r.up === true || (fromCfg && live),
				disabled: r.disabled === true || cfg.disabled === true || cfg.disabled === '1',
				pending: r.pending === true,
				channel: chan,
				auto: cfg.channel === 'auto',
				centre: num(info0.center_chan1) || null,
				freq: num(info0.frequency || rIw.frequency) || null,
				width: ht.width,
				std: ht.std,
				gen: wifi.genName(ht.std, band),
				htmode: htmode,
				txpower: finite(info0.txpower) ? info0.txpower : (finite(rIw.txpower) ? rIw.txpower : null),
				txpowerCfg: cfg.txpower != null && isFinite(+cfg.txpower) ? +cfg.txpower : null,
				noise: wifi.noise(noiseRaw),
				noiseRaw: noiseRaw,
				country: cfg.country || rIw.country || null,
				hwmodes: arr(rIw.hwmodes || info0.hwmodes).join('/'),
				airtime: null,
				ifnames: [],
				ssids: [],
				clients: 0,
				legacy: 0
			};
			radio.spectrum = wifi.spectrum(band, chan, radio.centre, radio.width);

			ifs.forEach(function(i) {
				var ic = obj(i.config), ifname = typeof i.ifname === 'string' ? i.ifname : null;
				/* luci.vantage wireless has no iwinfo part: the view's
				   iwinfo info replies stand in for it, and for a network
				   without one (the view asks once a radio), hostapd's
				   get_status gives the same BSSID and SSID */
				var iiw = obj(i.iwinfo || (ifname && own(iw, ifname) ? iw[ifname] : null));
				if (ifname) { radio.ifnames.push(ifname); wlNames.push(ifname); }
				var st = ifname ? obj(hstat[ifname]) : {};
				var stText = function(v) { return typeof v === 'string' ? v : ''; };
				var air = obj(st.airtime);
				if (num(air.time) > 0 || num(air.utilization) > 0)
					radio.airtime = Math.max(radio.airtime || 0, Math.min(100, num(air.utilization) / 2.55));
				var ss = {
					id: ifname || (rname + ':' + (i.section || ssids.length)),
					ifname: ifname,
					section: typeof i.section === 'string' ? i.section : null,
					radio: rname,
					band: band,
					ssid: fmt.safeText(ic.ssid || iiw.ssid || stText(st.ssid) || '', 32),
					mode: ic.mode || 'ap',
					hidden: ic.hidden === true || ic.hidden === '1',
					security: wifi.security(ic.encryption),
					pmf: +ic.ieee80211w || 0,
					networks: arr(ic.network),
					bssid: fmt.mac(iiw.bssid || stText(st.bssid) || ic.macaddr || ''),
					up: radio.up && !!ifname && (!devs[ifname] || devs[ifname].up !== false),
					clients: 0
				};
				radio.ssids.push(ss.id);
				ssids.push(ss);
			});
			radios.push(radio);
		});

		var kernel = Array.isArray(raw.routes) ? raw.routes : null;
		var uplink = this.resolveUplink(raw.ifaces, devs, wlNames, null, kernel);
		var subnets = uplink ? uplink.ipv4 : [];
		/* a station's addresses are in its network's subnets (the SSID's
		   network, 'lan'), not the uplink's: on a router the uplink is the
		   WAN, and its subnet would leave a station only its IPv6 ones */
		var netSubnets = Object.create(null);
		arr(raw.ifaces).forEach(function(i) {
			if (i && typeof i.interface === 'string' && !netSubnets[i.interface])
				netSubnets[i.interface] = arr(i['ipv4-address']).map(function(a) { return a && a.address ? a.address + '/' + a.mask : null; }).filter(Boolean);
		});
		function ssidSubnets(ss) {
			var out = [];
			arr(ss.networks).forEach(function(n) { arr(netSubnets[n]).forEach(function(s) { if (out.indexOf(s) < 0) out.push(s); }); });
			return out.length ? out : subnets;
		}

		function hintOf(mac) { return obj(hints[mac.toUpperCase()] || hints[mac]); }

		/* mDNS names only where they are unambiguous across all stations */
		var everyone = [], apSta = Object.create(null);
		ssids.forEach(function(ss) {
			if (ss.ifname) arr(assoc[ss.ifname]).forEach(function(s) {
				var mac = s && names.normMac(s.mac);
				if (!mac) return;
				everyone.push({ mac: mac, ips: self.hintAddrs(hintOf(mac), ssidSubnets(ss)) });
				/* a station of an access point interface: one host using
				   this device. The far end of a client or mesh interface
				   is no such station */
				if (ss.mode !== 'sta' && ss.mode !== 'mesh') apSta[mac] = true;
			});
		});
		/* wired hosts: what the bridges learned on ports that are not
		   Wi-Fi, once per MAC (the entry heard last, a learned one before
		   a static one), stations left out */
		var staMacs = Object.create(null), fdb = Object.create(null), wiredMacs = [];
		everyone.forEach(function(e) { staMacs[e.mac] = true; });
		arr(raw.fdb).forEach(function(h) {
			var mac = h && names.normMac(h.mac);
			if (!mac || staMacs[mac] || typeof h.port !== 'string' || self.isWireless(h.port, devs[h.port], wlNames)) return;
			var seen = finite(h.seen) && h.seen >= 0 ? h.seen : null, prev = fdb[mac];
			if (prev && (seen == null || (prev.seen != null && prev.seen <= seen))) return;
			if (!prev) wiredMacs.push(mac);
			fdb[mac] = { port: h.port, bridge: typeof h.bridge === 'string' ? h.bridge : null, vlan: finite(h.vlan) ? h.vlan : null, seen: seen };
		});
		/* the MACs the host hints give an address, each once. An IPv6
		   address by its value: it has many spellings (a pairing keeps the
		   one it was given, the hints have their own). Text with a colon
		   that is no IPv6 address equals nothing. One index a build, for
		   every access point and line that asks */
		function addrKey(x) {
			var g = self.parseIPv6(x);
			return g ? g.join(':') : typeof x === 'string' && x.indexOf(':') < 0 ? x.toLowerCase() : null;
		}
		var heldBy = Object.create(null);
		Object.keys(hints).forEach(function(k) {
			var h = obj(hints[k]), m = names.normMac(k);
			if (m) arr(h.ipaddrs).concat(arr(h.ip6addrs)).forEach(function(x) {
				var key = addrKey(x);
				if (key == null) return;
				if (!heldBy[key]) heldBy[key] = [];
				if (heldBy[key].indexOf(m) < 0) heldBy[key].push(m);
			});
		});
		function holders(addr) {
			var key = addrKey(addr);
			return key != null && heldBy[key] ? heldBy[key].slice() : [];
		}
		/* a gateway, by the address the host hints give it; on a bridge
		   with several ports a line is the port it was learned on. Any
		   device can have the hints list an address under its MAC (one ARP
		   request does it), so among several holders of a line's next hop
		   the bridges' entries decide: every one luci.vantage wired gave
		   for a host, not the one kept (fdb), since a router's MAC is on
		   every bridge of a wire that carries its VLANs. A holder heard on
		   the line (l3: its device) goes before one heard on no bridge,
		   and that one before one heard only elsewhere. Two of one kind:
		   none, unknown rather than the wrong one. A station of an access
		   point interface is never the gateway unless it is heard over a
		   link of its own (wifiLink, below), nor is a host heard only in
		   other VLANs of the line's own bridge, nor one heard only
		   elsewhere where the far end has no MAC (PPP, a modem, a tunnel).
		   A lone holder heard elsewhere is believed otherwise, as before:
		   the bridges of a wire's other VLANs hear the real gateway like
		   that */
		var l3devs = Object.create(null);
		arr(raw.ifaces).forEach(function(i) { var d = i && (i.l3_device || i.device); if (typeof d === 'string') l3devs[d] = true; });
		function rowsOf(mac) {
			return arr(raw.fdb).filter(function(h) { return h && names.normMac(h.mac) === mac && typeof h.port === 'string' && typeof h.bridge === 'string'; });
		}
		/* the bridge of a line, and its VLAN there: br-lan.10 is VLAN 10
		   of br-lan, br-lan the bridge itself */
		function lineOf(l3) {
			var v = /^(.+)\.(\d{1,4})$/.exec(l3 || '');
			return v ? { bridge: v[1], vid: +v[2] } : { bridge: l3, vid: null };
		}
		/* an entry is on a line that is its bridge, unless its VLAN is
		   another network's device there (br-lan.20); and on a line that
		   is a VLAN of its bridge when it is in that VLAN or names none */
		function onLine(h, l3) {
			var at = lineOf(l3);
			if (h.bridge === l3) return !(finite(h.vlan) && l3devs[l3 + '.' + h.vlan]);
			return at.vid != null && h.bridge === at.bridge && (!finite(h.vlan) || h.vlan === at.vid);
		}
		function noMac(l3) {
			var d = obj(devs[l3]);
			return /^(ppp|pppoe-|pppoa-|pptp-|l2tp-|wwan)/.test(l3 || '') || /^(ppp|wwan)$/.test(d.devtype || '') || TUNNEL_DEV.test(d.devtype || '') || d.type === 'tunnel';
		}
		function macOf(addr, l3) {
			var here = [], quiet = [], off = [], bridge = lineOf(l3).bridge;
			holders(addr).forEach(function(mac) {
				var rows = rowsOf(mac);
				if (apSta[mac] && !rows.some(function(h) { return wifiLink(h.port); })) return;
				if (!l3 || !rows.length) quiet.push(mac);
				else if (rows.some(function(h) { return onLine(h, l3); })) here.push(mac);
				else if (!rows.every(function(h) { return h.bridge === bridge && finite(h.vlan); })) off.push(mac);
			});
			var of = here.length ? here : quiet.length ? quiet : noMac(l3) ? [] : off;
			return of.length === 1 ? of[0] : null;
		}
		/* the wired port a line's gateway is on: of its entry on the line
		   heard last, not of the one kept, which another bridge of the
		   wire may have heard later; of the kept one when none is on the
		   line */
		function linePort(mac, l3) {
			var best = null;
			rowsOf(mac).forEach(function(h) {
				if (!l3 || !onLine(h, l3) || self.isWireless(h.port, devs[h.port], wlNames)) return;
				var seen = finite(h.seen) && h.seen >= 0 ? h.seen : null;
				if (!best || (seen != null && (best.seen == null || seen < best.seen))) best = { port: h.port, seen: seen };
			});
			return best ? best.port : fdb[mac] ? fdb[mac].port : null;
		}
		var gwMac = uplink ? macOf(uplink.gateway, uplink.l3dev) : null;
		/* a gateway heard on no wired port but over a Wi-Fi link this
		   device bridges other hosts through: its own client or mesh
		   interface, or a WDS station's of one of its access point
		   interfaces (<ifname>.staN, which hostapd makes only for a
		   4-address station where WDS is enabled). That link is the way
		   out. Never a plain access point interface: a station there is
		   one host, so a gateway's MAC on it is a station using it, not
		   the way to the gateway. The entry heard last */
		function wifiLink(port) {
			var wds = typeof port === 'string' ? /^(.+)\.sta\d+$/.exec(port) : null;
			if (wds) return wlNames.indexOf(wds[1]) >= 0;
			return ssids.some(function(s) { return s.ifname === port && (s.mode === 'sta' || s.mode === 'mesh'); });
		}
		var gwPort = gwMac ? linePort(gwMac, uplink.l3dev) : null, gwLink = null;
		if (gwMac && !gwPort) arr(raw.fdb).forEach(function(h) {
			if (!h || names.normMac(h.mac) !== gwMac || !wifiLink(h.port)) return;
			var seen = finite(h.seen) && h.seen >= 0 ? h.seen : null;
			if (!gwLink || (seen != null && (gwLink.seen == null || seen < gwLink.seen))) gwLink = { port: h.port, seen: seen };
		});
		if (gwLink) gwPort = gwLink.port;
		if (uplink && gwPort && uplink.port !== gwPort) {
			var via = this.resolveUplink(raw.ifaces, devs, wlNames, gwPort, kernel);
			if (via && via.port === gwPort) uplink = via;
		}
		var uplinks = uplink ? ownConduits([ uplink ].concat(this.extraUplinks(raw.ifaces, devs, wlNames, uplink, function(hop, l3) {
			var mac = macOf(hop, l3);
			return mac ? linePort(mac, l3) : null;
		}, kernel).slice(0, MAX_LINES))) : [];
		/* the network on each bridge (or bridge VLAN: br-lan.10), and its
		   IPv4 subnets for the hosts' addresses */
		var lans = Object.create(null);
		arr(raw.ifaces).forEach(function(i) {
			var d = i && (i.l3_device || i.device);
			if (typeof d === 'string' && i.interface && !lans[d])
				lans[d] = { name: String(i.interface), ipv4: arr(i['ipv4-address']).map(function(a) { return a && a.address ? a.address + '/' + a.mask : null; }).filter(Boolean) };
		});
		function lanOf(h) { return h.bridge ? (h.vlan != null && lans[h.bridge + '.' + h.vlan]) || lans[h.bridge] || null : null; }
		function wiredSubnets(mac) { var l = lanOf(fdb[mac]); return l && l.ipv4.length ? l.ipv4 : subnets; }
		wiredMacs.forEach(function(mac) { everyone.push({ mac: mac, ips: self.hintAddrs(hintOf(mac), wiredSubnets(mac)) }); });
		/* The entries the paired access points' reports add (below) are
		   parties to the mDNS names too: every MAC they list that this
		   device does not list itself, with the addresses who() gives
		   it. Left out, an address the hints give one of them and one
		   entry here would name both. */
		var aps = this.collectorAps(raw.collector), ownMacs = Object.create(null);
		Object.keys(devs).forEach(function(n) { var m = names.normMac(obj(devs[n]).macaddr); if (m) ownMacs[m] = true; });
		ssids.forEach(function(s) { var m = names.normMac(s.bssid); if (m) ownMacs[m] = true; });
		/* Their addresses are this device's host hints on its own networks:
		   every one but the lines to the internet; a line's too where its
		   clients are on it (an access point's uplink: a bridge) or one
		   of the access points itself is */
		var lineNames = Object.create(null), localSubnets = [];
		function local(list) { list.forEach(function(x) { if (localSubnets.indexOf(x) < 0) localSubnets.push(x); }); }
		uplinks.forEach(function(u) {
			[ u.iface ].concat(arr(u.ifaces), u.tunnel ? [ u.tunnel.iface ] : []).forEach(function(n) { lineNames[n] = true; });
		});
		Object.keys(netSubnets).forEach(function(n) {
			if (n === 'loopback') return;
			if (!lineNames[n]) local(netSubnets[n]);
			else local(netSubnets[n].filter(function(x) {
				var p = x.split('/');
				return aps.some(function(a) { return self.ipv4InSubnet(a.addr, p[0], p[1]); });
			}));
		});
		if (uplink && uplink.dev !== uplink.l3dev) local(subnets);
		if (!localSubnets.length) localSubnets = subnets;
		aps.forEach(function(a) {
			a.sta.concat(a.hosts).forEach(function(x) {
				if (!staMacs[x.mac] && !fdb[x.mac] && !ownMacs[x.mac] && x.mac !== gwMac) everyone.push({ mac: x.mac, ips: self.hintAddrs(hintOf(x.mac), localSubnets) });
			});
		});
		var mdns = names.mdnsForStations(raw.mdns, everyone);

		ssids.forEach(function(ss) {
			if (!ss.ifname) return;
			var hc = obj(obj(hapd[ss.ifname]).clients);
			var hmap = Object.create(null);
			Object.keys(hc).forEach(function(k) { var m = names.normMac(k); if (m) hmap[m] = obj(hc[k]); });
			arr(assoc[ss.ifname]).forEach(function(s) {
				var mac = s && names.normMac(s.mac);
				if (!mac) return;
				var h = hmap[mac] || {}, rx = obj(s.rx), tx = obj(s.tx);
				var hint = hintOf(mac);
				var ips = self.hintAddrs(hint, ssidSubnets(ss));
				var std = wifi.clientStd(rx, tx, h);
				var alias = raw.aliases && raw.aliases[mac];
				var nm = names.resolve({
					mac: mac, alias: alias, ips: ips, rdns: raw.rdns, mdns: mdns,
					hint: hint, wps: names.wpsName(h.signature),
					vendor: typeof raw.vendor === 'function' ? raw.vendor(names.ouiKey(mac)) : null
				});
				var radio = radios.filter(function(r) { return r.id === ss.radio; })[0];
				var c = {
					mac: mac,
					macLabel: fmt.mac(mac),
					name: nm.name,
					plainName: nm.plain,
					nameSource: nm.source,
					nameSourceLabel: nm.sourceLabel,
					icon: nm.icon,
					secondary: nm.secondary,
					isPrivate: nm.isPrivate,
					alias: alias ? alias.name : null,
					aliasSid: alias ? alias.sid : null,
					vendor: nm.source === 'vendor' ? (typeof raw.vendor === 'function' ? raw.vendor(names.ouiKey(mac)) : null) : null,
					wps: names.wpsName(h.signature),
					ips: ips,
					ifname: ss.ifname,
					ssid: ss.ssid,
					ssidId: ss.id,
					radio: ss.radio,
					band: ss.band,
					bandLabel: wifi.bandLabel(ss.band),
					signal: finite(s.signal) && s.signal < 0 ? s.signal : null,
					signalAvg: finite(s.signal_avg) && s.signal_avg < 0 ? s.signal_avg : null,
					noise: wifi.noise(s.noise),
					std: std,
					gen: wifi.genName(std, ss.band),
					rx: wifi.phy(rx),
					tx: wifi.phy(tx),
					rxBytes: num(rx.bytes), txBytes: num(tx.bytes),
					rxPackets: num(rx.packets), txPackets: num(tx.packets),
					txRetries: num(tx.retries), txFailed: num(tx.failed),
					connected: finite(s.connected_time) ? s.connected_time : null,
					inactive: finite(s.inactive) ? s.inactive : null,
					authorized: s.authorized !== false,
					mfp: !!(s.mfp || h.mfp),
					wmm: !!(s.wme || h.wmm),
					caps: { ht: !!h.ht, vht: !!h.vht, he: !!h.he, eht: !!h.eht, mbo: !!h.mbo, rrm: arr(h.rrm).some(function(v) { return +v > 0; }) }
				};
				c.level = wifi.signal(c.signal);
				c.legacyOnRadio = !!(radio && radio.std && wifi.genRank(c.gen) >= 0 && wifi.genRank(c.gen) < wifi.genRank(wifi.genName(radio.std, radio.band)) &&
					wifi.genRank(c.gen) <= 4 && wifi.genRank(wifi.genName(radio.std, radio.band)) >= 6);
				if (radio) { radio.clients++; if (c.legacyOnRadio) radio.legacy++; }
				ss.clients++;
				clients.push(c);
			});
		});

		/* A host alone on its port has the port's link and traffic to
		   itself; hosts sharing one (behind a switch or another access
		   point) only share the port's. The gateway is found by the
		   address the host hints give it (above). */
		var perPort = Object.create(null);
		wiredMacs.forEach(function(mac) { var p = fdb[mac].port; perPort[p] = (perPort[p] || 0) + 1; });
		var wired = wiredMacs.map(function(mac) {
			var h = fdb[mac], d = devs[h.port], hint = hintOf(mac), ips = self.hintAddrs(hint, wiredSubnets(mac));
			/* behind a switch VLAN the port's own link is the CPU's: the
			   host's is a switch port's, known when only one has a link */
			var sw = self.switchOf(raw.switches, raw.switchState, h.port);
			var lit = sw && sw.up === 1 ? sw.ports.filter(function(p) { return p.link; })[0] : null;
			var alias = raw.aliases && raw.aliases[mac];
			var vendor = typeof raw.vendor === 'function' ? raw.vendor(names.ouiKey(mac)) : null;
			var nm = names.resolve({ mac: mac, alias: alias, ips: ips, rdns: raw.rdns, mdns: mdns, hint: hint, wps: null, vendor: vendor });
			return {
				mac: mac,
				macLabel: fmt.mac(mac),
				name: nm.name,
				plainName: nm.plain,
				nameSource: nm.source,
				nameSourceLabel: nm.sourceLabel,
				icon: nm.icon,
				secondary: nm.secondary,
				isPrivate: nm.isPrivate,
				alias: alias ? alias.name : null,
				aliasSid: alias ? alias.sid : null,
				vendor: nm.source === 'vendor' ? vendor : null,
				ips: ips,
				port: h.port,
				bridge: h.bridge,
				network: lanOf(h) ? lanOf(h).name : null,
				vlan: h.vlan,
				seen: h.seen,
				peers: perPort[h.port],
				shared: perPort[h.port] > 1,
				speed: sw ? (lit ? lit.speed : null) : d ? self.parseSpeed(d.speed) : null,
				carrier: sw && sw.up != null ? sw.up > 0 : d ? d.carrier !== false : null,
				switch: sw,
				switchPort: lit ? lit.label : null,
				gateway: mac === gwMac
			};
		});

		/* The paired access points. What they report adds entries, marked
		   `ap`; a MAC this device lists itself (a station, a wired host,
		   one of its own, the gateway's) keeps this device's entry, and a
		   remote entry is never the gateway. Two exceptions, both only for
		   a wired host this device hears on the very port it hears an
		   access point's own MAC on, and never the gateway or this device:
		   - one the access point reports as its station becomes that
		     station, out of the wired hosts (a router's view of the Wi-Fi
		     clients of its wired access points);
		   - one it reports as its wired host gets a note (`behind`).
		   A station of this device is never moved. portOf, the port of an
		   access point: its MAC (the pairing's) unique among them, not the
		   gateway's, not one of this device's, learned on a wired port,
		   and the one this device's host hints give its address, where
		   they give that address at all. */
		var listed = Object.create(null), localHost = Object.create(null);
		[ clients, wired ].forEach(function(l) { l.forEach(function(c) { listed[c.mac] = true; }); });
		Object.keys(ownMacs).forEach(function(m) { listed[m] = true; });
		if (gwMac) listed[gwMac] = true;
		/* nor any other holder of the gateway's address: while two hold
		   it, either may be the gateway */
		if (uplink && uplink.gateway) holders(uplink.gateway).forEach(function(m) { listed[m] = true; });
		var macCount = Object.create(null), portOf = Object.create(null), heardAt = Object.create(null);
		aps.forEach(function(a) { if (a.mac) macCount[a.mac] = (macCount[a.mac] || 0) + 1; });
		/* an address held by another MAC, as far as this device knows */
		function elsewhere(addr, mac) {
			var at = holders(addr);
			return at.length > 0 && at.indexOf(mac) < 0;
		}
		aps.forEach(function(a) {
			if (a.mac && macCount[a.mac] === 1 && !ownMacs[a.mac] && a.mac !== gwMac && fdb[a.mac] && !elsewhere(a.addr, a.mac)) portOf[a.id] = fdb[a.mac].port;
		});
		/* the wired hosts an access point may claim: not the gateway or this
		   device. While the uplink has a next hop whose MAC is unknown (no
		   host hint gives it one, or two that may both be it: macOf), any
		   MAC the bridge the uplink leaves through has learned may be the
		   gateway's: no host with one is an access point's to claim,
		   whichever of its entries is the one listed (a router's MAC is on
		   every bridge of a wire that carries its VLANs, and the entry heard
		   last is the one kept). That bridge is the uplink's device itself
		   or, for a VLAN on one (br-lan.10), the name before the suffix, as
		   line() reads it */
		var gwL3 = uplink && uplink.gateway && !gwMac ? String(uplink.l3dev || '') : null, gwBridge = gwL3 ? gwL3.replace(/\.\d{1,4}$/, '') : null;
		var maybeGw = Object.create(null);
		if (gwL3) arr(raw.fdb).forEach(function(h) {
			var mac = h && names.normMac(h.mac);
			if (mac && (h.bridge === gwL3 || h.bridge === gwBridge)) maybeGw[mac] = true;
		});
		wired.forEach(function(h) {
			localHost[h.mac] = h;
			if (!h.gateway && !ownMacs[h.mac] && !maybeGw[h.mac]) heardAt[h.mac] = h.port;
		});
		function behind(a, mac) { return !!portOf[a.id] && heardAt[mac] === portOf[a.id] && mac !== a.mac; }
		/* ips: the addresses a host moved from the wired list had there */
		function who(mac, ips) {
			var alias = raw.aliases && raw.aliases[mac], hint = hintOf(mac);
			var vendor = typeof raw.vendor === 'function' ? raw.vendor(names.ouiKey(mac)) : null;
			ips = ips || self.hintAddrs(hint, localSubnets);
			var nm = names.resolve({ mac: mac, alias: alias, ips: ips, rdns: raw.rdns, mdns: mdns, hint: hint, wps: null, vendor: vendor });
			return { mac: mac, macLabel: fmt.mac(mac), name: nm.name, plainName: nm.plain, nameSource: nm.source, nameSourceLabel: nm.sourceLabel,
				icon: nm.icon, secondary: nm.secondary, isPrivate: nm.isPrivate, alias: alias ? alias.name : null, aliasSid: alias ? alias.sid : null,
				vendor: nm.source === 'vendor' ? vendor : null, ips: ips };
		}
		function link(kbit) {
			return kbit ? { rate: kbit, mhz: null, std: null, mcs: null, nss: null, label: fmt.phyRate(kbit), detail: '' } : null;
		}
		/* bit/s as the access point counts them, rx from the device */
		function traffic(x) { return x.rx != null && x.tx != null ? { rx: x.rx, tx: x.tx } : null; }
		/* a station two of them list: the one that hears it best, of those
		   it may belong to (a wired host here: behind them). The others
		   stay named on the entry (ap.also), so none is taken unseen */
		var remote = Object.create(null), remoteMacs = [], rivals = Object.create(null);
		function rival(mac, a) {
			var l = rivals[mac] || (rivals[mac] = []);
			if (!l.some(function(x) { return x.id === a.id; })) l.push({ id: a.id, name: a.name });
			return l;
		}
		aps.forEach(function(a) {
			a.sta.forEach(function(s) {
				var prev = remote[s.mac];
				if (listed[s.mac] && !behind(a, s.mac)) return;
				if (prev && !(s.signal != null && (prev.s.signal == null || s.signal > prev.s.signal))) { rival(s.mac, a); return; }
				if (prev) rival(s.mac, prev.a); else remoteMacs.push(s.mac);
				remote[s.mac] = { a: a, s: s };
			});
		});
		var heard = wired.length;
		wired = wired.filter(function(h) { return !remote[h.mac]; });
		/* a port a host moved away from: who is left on it */
		if (wired.length !== heard) {
			var left = Object.create(null);
			wired.forEach(function(h) { left[h.port] = (left[h.port] || 0) + 1; });
			wired.forEach(function(h) { h.peers = left[h.port]; h.shared = left[h.port] > 1; });
		}
		remoteMacs.forEach(function(mac) {
			var a = remote[mac].a, s = remote[mac].s, n = a.nodes.filter(function(x) { return x.id === s.node; })[0];
			var c = who(mac, localHost[mac] ? localHost[mac].ips : null);
			c.wps = null;
			c.ap = { id: a.id, name: a.name, addr: a.addr, node: n.id, bssid: n.bssid, freq: n.freq, channel: n.channel, rate: traffic(s) };
			if (rivals[mac]) c.ap.also = rivals[mac];
			remote[mac].c = c;
			c.ifname = null; c.ssid = n.ssid; c.ssidId = null; c.radio = null;
			c.band = n.band; c.bandLabel = wifi.bandLabel(n.band);
			c.signal = s.signal; c.signalAvg = null; c.noise = null; c.std = null; c.gen = null;
			c.rx = link(s.rxRate); c.tx = link(s.txRate);
			/* the standard and width where the access point says them */
			if (s.rxPhy || s.txPhy) {
				var rp = s.rxPhy ? Object.assign({ rate: s.rxRate }, s.rxPhy) : null, tp = s.txPhy ? Object.assign({ rate: s.txRate }, s.txPhy) : null;
				c.std = wifi.clientStd(rp, tp, null);
				c.gen = wifi.genName(c.std, n.band);
				if (rp && s.rxRate) c.rx = wifi.phy(rp);
				if (tp && s.txRate) c.tx = wifi.phy(tp);
			}
			c.rxBytes = null; c.txBytes = null; c.rxPackets = 0; c.txPackets = 0; c.txRetries = 0; c.txFailed = 0;
			c.connected = s.connected; c.inactive = null; c.authorized = true; c.mfp = false; c.wmm = false; c.caps = {};
			c.level = wifi.signal(c.signal);
			c.legacyOnRadio = false;
			clients.push(c);
		});
		/* wired hosts: the first access point to list one has it; another
		   that lists it, or lists a station as its wired host, stays named
		   too, unless this device hears the MAC elsewhere */
		var taken = Object.create(null);
		aps.forEach(function(a) {
			a.hosts.forEach(function(w) {
				var won = remote[w.mac] ? remote[w.mac].c : taken[w.mac];
				if (won) { if (won.ap.id !== a.id && (!listed[w.mac] || behind(a, w.mac))) won.ap.also = rival(w.mac, a); return; }
				if (listed[w.mac]) return;
				var h = who(w.mac), speed = w.speed ? { mbps: w.speed, duplex: null } : null;
				/* on no port of this device */
				h.port = ''; h.bridge = null; h.network = null; h.vlan = null; h.seen = null; h.peers = 1; h.shared = false;
				h.speed = speed; h.carrier = null; h.switch = null; h.switchPort = null; h.gateway = false;
				h.ap = { id: a.id, name: a.name, addr: a.addr, port: w.port, speed: speed, rate: traffic(w) };
				taken[w.mac] = h;
				wired.push(h);
			});
		});
		/* a host behind one, as its wired host: a note, nothing else. Of
		   those it is heard behind, the first to list it has the note and
		   the others stay named (behind.also) */
		wired.forEach(function(h) {
			if (h.ap) return;
			aps.forEach(function(a) {
				var w = behind(a, h.mac) ? a.hosts.filter(function(x) { return x.mac === h.mac; })[0] : null;
				if (!w) return;
				if (h.behind) { h.behind.also = rival(h.mac, a); return; }
				h.behind = { id: a.id, name: a.name, addr: a.addr, port: w.port, speed: w.speed ? { mbps: w.speed, duplex: null } : null, rate: traffic(w) };
			});
		});
		/* the access points themselves, by MAC, where this device hears
		   them (portOf): the path names the port's host by its pairing
		   name; the host's entry is unchanged */
		var apHosts = Object.create(null);
		aps.forEach(function(a) {
			if (portOf[a.id] && a.mac) apHosts[a.mac] = { id: a.id, name: a.name, port: portOf[a.id] };
		});
		/* An access point plugged into another paired one is listed under
		   it (parent, depth). This device must hear both MACs on one port
		   of its own, and the other must list this one's among its wired
		   hosts: a claim alone moves no access point of another port. Of
		   several that list it (a chain), the nearest: the one all the
		   others list too. None for two that list each other, where no
		   one is nearest, or in a ring: a branch of this device, as
		   before. Then in that order, each under its parent */
		var lists = Object.create(null), apOf = Object.create(null);
		aps.forEach(function(a) {
			var l = lists[a.id] = Object.create(null);
			apOf[a.id] = a;
			a.hosts.forEach(function(w) { l[w.mac] = w; });
		});
		function over(a, b) {
			return a !== b && !!portOf[a.id] && portOf[a.id] === portOf[b.id] && !!lists[a.id][b.mac] && !lists[b.id][a.mac];
		}
		aps.forEach(function(b) {
			var by = aps.filter(function(a) { return over(a, b); });
			var near = by.filter(function(a) { return by.every(function(x) { return x === a || over(x, a); }); });
			b.parent = near.length === 1 ? { id: near[0].id, name: near[0].name, port: lists[near[0].id][b.mac].port } : null;
			b.depth = 0;
		});
		aps.filter(function(a) {
			for (var p = a.parent && apOf[a.parent.id], n = 0; p && n < aps.length; p = p.parent && apOf[p.parent.id], n++) if (p === a) return true;
			return false;
		}).forEach(function(a) { a.parent = null; });
		var tree = [];
		(function under(id, depth) {
			aps.forEach(function(a) {
				if ((a.parent ? a.parent.id : null) !== id) return;
				a.depth = depth;
				tree.push(a);
				under(a.id, depth + 1);
			});
		})(null, 0);
		aps.length = 0;
		tree.forEach(function(a) { aps.push(a); });

		/* Each access point's counts and traffic are what it was given
		   above, as the lists show it, never what it reports: a MAC it
		   claims that stayed this device's, or went to another, is none
		   of its own. Its report goes no further. */
		var given = Object.create(null);
		aps.forEach(function(a) {
			given[a.id] = { a: a, nodes: Object.create(null) };
			a.nodes.forEach(function(n) { given[a.id].nodes[n.id] = n; });
			delete a.sta;
			delete a.hosts;
		});
		function give(x, sta) {
			var g = given[x.id], a = g.a;
			if (sta) { a.clients++; g.nodes[x.node].clients++; } else a.wired++;
			if (x.rate) a.rate = { rx: (a.rate ? a.rate.rx : 0) + x.rate.rx, tx: (a.rate ? a.rate.tx : 0) + x.rate.tx };
		}
		clients.forEach(function(c) { if (c.ap) give(c.ap, true); });
		wired.forEach(function(h) { if (h.ap || h.behind) give(h.ap || h.behind, false); });

		/* The named devices (raw.aliases) in neither list: not connected
		   now, as far as this device can tell (a wired host is listed
		   while a bridge remembers it). As many as there may be names at
		   most, by name. Each shows its MAC under the name; its address
		   is what the host hints still give (a lease that has not run
		   out), and its vendor is looked up whatever the name, for its
		   details */
		var here = Object.create(null);
		[ clients, wired ].forEach(function(l) { l.forEach(function(c) { here[c.mac] = true; }); });
		var offline = Object.keys(obj(raw.aliases)).filter(function(mac) {
			return names.normMac(mac) === mac && !here[mac] && !ownMacs[mac];
		}).slice(0, names.ALIAS_MAX).map(function(mac) {
			var c = who(mac);
			c.offline = true;
			c.secondary = c.macLabel;
			c.vendor = typeof raw.vendor === 'function' ? raw.vendor(names.ouiKey(mac)) : null;
			return c;
		}).filter(function(c) { return c.nameSource === 'alias'; }).sort(function(a, b) {
			var x = a.name.toLowerCase(), y = b.name.toLowerCase();
			return x < y ? -1 : x > y ? 1 : a.mac < b.mac ? -1 : 1;
		});

		var mem = this.memory(info.memory);
		var release = obj(board.release);
		return {
			device: {
				model: this.deviceModel(board) || _('OpenWrt device'),
				hostname: fmt.safeText(board.hostname || '', 64) || null,
				firmware: release.description || [ release.distribution, release.version ].filter(Boolean).join(' ') || null,
				built: this.buildDate(release.builddate),
				version: release.version || null,
				target: release.target || null,
				kernel: board.kernel || null,
				system: board.system || null,
				uptime: finite(info.uptime) ? info.uptime : null,
				localtime: finite(info.localtime) ? info.localtime : null,
				load: arr(info.load).slice(0, 3).map(num),
				memory: mem,
				swap: this.swap(info.swap),
				storage: [ this.mount(info.root, _('Root (overlay)'), 'root'), this.mount(info.tmp, _('Temporary (RAM)'), 'tmp') ].filter(Boolean)
			},
			uplink: uplink,
			/* the main line first, then up to MAX_LINES others to the
			   internet; networks leaves out only these */
			uplinks: uplinks,
			networks: this.networks(raw.ifaces, uplinks),
			radios: radios,
			ssids: ssids,
			clients: clients,
			wiredHosts: wired,
			/* the named devices in neither list */
			offline: offline,
			/* its Ethernet ports (ports): the Ports tile's */
			ports: this.ports(devs, raw.switches, raw.switchState, wlNames, wired, uplinks),
			/* the paired access points (collectorAps), [] without any */
			accessPoints: aps,
			apHosts: apHosts
		};
	},

	/* SSIDs with the same name and security across radios -> one entry
	   { key, ssid, security, bands: [..], ids: [..], clients } */
	groupSsids: function(ssids) {
		var out = [], idx = Object.create(null);
		arr(ssids).forEach(function(s) {
			var k = s.ssid + '\u0000' + s.security.short;
			if (!idx[k]) { idx[k] = { key: k, ssid: s.ssid, security: s.security, pmf: s.pmf, hidden: s.hidden, bands: [], ids: [], radios: [], clients: 0, up: false }; out.push(idx[k]); }
			var g = idx[k];
			if (s.band && g.bands.indexOf(s.band) < 0) g.bands.push(s.band);
			if (g.radios.indexOf(s.radio) < 0) g.radios.push(s.radio);
			g.ids.push(s.id);
			g.clients += s.clients;
			g.up = g.up || s.up;
		});
		return out;
	}
});
