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
/* a line's other interfaces add their addresses and DNS to it (wan6's
   IPv6 on wan's line) */
function absorb(x, g) {
	function more(list, add) { add.forEach(function(v) { if (list.indexOf(v) < 0) list.push(v); }); }
	g.members.slice(1).forEach(function(i) {
		more(x.ipv4, cidrs(i['ipv4-address']));
		more(x.ipv6, cidrs(i['ipv6-address']));
		more(x.dns, arr(i['dns-server']).filter(function(v) { return typeof v === 'string'; }));
	});
	x.metric = g.metric;
	x.ifaces = g.members.map(function(i) { return i.interface; });
	return x;
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

	/* system.info root/tmp (KiB) -> bytes { total, used, free, usedPct } */
	mount: function(s, label) {
		s = obj(s);
		var total = num(s.total) * 1024;
		if (!(total > 0)) return null;
		var used = Math.min(Math.max(num(s.used) * 1024, 0), total);
		var free = finite(s.avail) ? Math.min(num(s.avail) * 1024, total - used) : total - used;
		return { label: label, total: total, used: used, free: free, usedPct: used / total * 100 };
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

	/* Rates for a set of counters { key: { rx, tx } } captured at `at`.
	   Returns { next, rates }; next holds only keys present now, so the
	   state cannot grow with every station that ever associated. */
	rates: function(prevMap, counters, at) {
		var next = Object.create(null), rates = Object.create(null), self = this;
		Object.keys(obj(counters)).forEach(function(k) {
			var c = counters[k];
			if (!c) return;
			var p = own(prevMap, k) ? prevMap[k] : null;
			var cur = { at: at, rx: num(c.rx), tx: num(c.tx) };
			var r = self.counterRate(p, cur);
			if (r.state === 'ok') rates[k] = { rx: r.rx, tx: r.tx };
			next[k] = r.state === 'skip' ? p : cur;
		});
		return { next: next, rates: rates };
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
	   until it comes up. On a bridge, `viaOf(next hop)` names the port
	   the bridge learned that gateway on; without it a bridge with
	   several wired ports keeps its own counters.
	   -> [ line, ... ] as resolveUplink's, without main */
	extraUplinks: function(ifaces, devs, wirelessNames, main, viaOf, kernel) {
		var self = this;
		if (!main) return [];
		devs = obj(devs);
		return groupLines(ifaces, devs, kernel).filter(function(g) {
			return g.l3.indexOf(main.l3dev) < 0 && !g.members.some(function(i) { return i.interface === main.iface; });
		}).map(function(g) {
			var r = defRoute(g.r.i), hop = r && r.nexthop;
			return absorb(self.line(g.r.i, devs, wirelessNames, hop && typeof viaOf === 'function' ? viaOf(hop) : null, true), g);
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
			var known = typeof via === 'string' && wired.indexOf(via) >= 0 ? via : null;
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
			ipv4: cidrs(pick['ipv4-address']),
			ipv6: cidrs(pick['ipv6-address']),
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

	/* ------------------------------------------------------------ model */

	/* raw: { board, info, ifaces, devs, wifi, iwinfo: { ifname: info },
	          assoc: { ifname: [ station ] }, hapd: { ifname: { clients } },
	          hapdStatus: { ifname: status }, hints, aliases, rdns, mdns,
	          fdb: [ luci.vantage wired host ] (-> wiredHosts),
	          routes: [ luci.vantage routes route ] or null,
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
		var everyone = [];
		ssids.forEach(function(ss) {
			if (ss.ifname) arr(assoc[ss.ifname]).forEach(function(s) {
				var mac = s && names.normMac(s.mac);
				if (mac) everyone.push({ mac: mac, ips: self.hintAddrs(hintOf(mac), ssidSubnets(ss)) });
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
		/* a gateway, by the address the host hints give it; on a bridge
		   with several ports a line is the port it was learned on */
		function macOf(addr) {
			var found = null;
			if (addr) Object.keys(hints).forEach(function(k) {
				var mac = names.normMac(k);
				if (mac && arr(obj(hints[k]).ipaddrs).concat(arr(obj(hints[k]).ip6addrs)).indexOf(addr) >= 0) found = mac;
			});
			return found;
		}
		var gwMac = uplink ? macOf(uplink.gateway) : null;
		if (uplink && gwMac && fdb[gwMac] && uplink.port !== fdb[gwMac].port) {
			var via = this.resolveUplink(raw.ifaces, devs, wlNames, fdb[gwMac].port, kernel);
			if (via && via.port === fdb[gwMac].port) uplink = via;
		}
		var uplinks = uplink ? ownConduits([ uplink ].concat(this.extraUplinks(raw.ifaces, devs, wlNames, uplink, function(hop) {
			var mac = macOf(hop);
			return mac && fdb[mac] ? fdb[mac].port : null;
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

		var mem = this.memory(info.memory);
		var release = obj(board.release);
		return {
			device: {
				model: this.deviceModel(board) || _('OpenWrt device'),
				hostname: fmt.safeText(board.hostname || '', 64) || null,
				firmware: release.description || [ release.distribution, release.version ].filter(Boolean).join(' ') || null,
				version: release.version || null,
				target: release.target || null,
				kernel: board.kernel || null,
				system: board.system || null,
				uptime: finite(info.uptime) ? info.uptime : null,
				localtime: finite(info.localtime) ? info.localtime : null,
				load: arr(info.load).slice(0, 3).map(num),
				memory: mem,
				swap: this.swap(info.swap),
				storage: [ this.mount(info.root, _('Root (overlay)')), this.mount(info.tmp, _('Temporary (RAM)')) ].filter(Boolean)
			},
			uplink: uplink,
			/* the main line first, then up to MAX_LINES others to the
			   internet; networks leaves out only these */
			uplinks: uplinks,
			networks: this.networks(raw.ifaces, uplinks),
			radios: radios,
			ssids: ssids,
			clients: clients,
			wiredHosts: wired
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
