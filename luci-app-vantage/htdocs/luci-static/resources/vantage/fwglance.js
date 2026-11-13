'use strict';
'require baseclass';

/* Firewall at a glance: what a firewall configuration (uci `firewall`, as
   `uci get` returns it) lets in from the internet, read the way fw4
   (firewall4 as OpenWrt 25.12 ships it, /usr/share/ucode/fw4.uc) reads
   it. Pure functions over the config and the interface dump; the view
   renders the result. What fw4 does that this follows:
   - options parse like fw4's parse_options: booleans are 1/on/true/yes
     and 0/off/false/no, policies and targets match by prefix in any case
     ('acc' is accept, an empty value the first choice), and a value fw4
     cannot parse makes it skip the whole section;
   - a switched-off or skipped zone does not exist: rules naming it are
     skipped, and its networks, like an uplink no zone holds or the
     family a zone leaves out, meet the `defaults` policies;
   - zones match devices: networks on one device (a modem's wan and
     wan_4, wan and wan6) are one, whichever of them a zone names;
   - zone policies fall back to `defaults`, whose own fallback is DROP; a
     zone's forward policy only covers traffic back out of the same zone,
     so traffic into another zone without a forwarding or rule meets
     defaults.forward;
   - a forwarding or rule from '*' applies to every zone, the internet's
     included;
   - protocols: unset is tcp and udp; 'tcpudp', 6, 17, 1 and 58 are
     spelled out; 'all' matches everything; fw4 drops a leading '!'; ports
     only apply to tcp and udp;
   - an ipset limits who connects only when it matches the source
     address;
   - a rule without a target does nothing; a redirect whose target is not
     snat is a DNAT, to the router itself without dest_ip, else for each
     family to the first dest_ip address of that family (masked to the
     prefix given), and is skipped from '*' or without a source zone;
   - a script include needs fw4_compatible (default on, except for
     /etc/firewall.user).
   A zone faces the internet when it masquerades (masq or masq6), holds an
   uplink (an interface with the default route and a public IPv4 address:
   a router with public addresses routes without NAT), or by OpenWrt's
   naming is called wan or wan6 or holds the wan or wan6 network.
   Some setups depend on what fw4 does at run time in ways this does not
   follow: a zone with covered subnets (it takes some source addresses,
   on any device when it names none), several zones that can take
   traffic on an internet device (the first in config order wins; device
   names compare as patterns, and a device need not be in the dump), and
   internet rules or port forwards that use a set this config does not
   define and enable (its definition may come from a service this cannot
   see). For those it gives no verdict (complex lists why), and the
   warnings it would give are only settings to check (unconfirmed). */

/* ports whose exposure from the internet deserves a warning: the router's
   own SSH, telnet and web admin */
var ADMIN_PORTS = [ 22, 23, 80, 443 ];
/* the device fw4 puts in place of an excluded '+': none has that name */
var NEVER = '/never/';
/* control messages and multicast membership: open nothing a scanner
   could talk to */
var QUIET_PROTO = /^(icmp|ipv6-icmp|igmp)$/;
/* UDP ports a router answers as a client: DHCP (68), DHCPv6 (546) */
var CLIENT_UDP = [ 68, 546 ];
/* IPsec passed on to a host behind the router: OpenWrt's stock
   Allow-IPSec-ESP and Allow-ISAKMP are forward rules into lan. To the
   router itself they reach its own IKE responder: an opening */
var IPSEC_PROTO = /^(esp|ah)$/;
var IPSEC_UDP = [ 500, 4500 ];

var WAN = /^wan6?$/;

/* IPv4 blocks of the IANA special-purpose registry that are not globally
   reachable, plus multicast, as [ octets..., prefix length, reachable ]:
   numbers, not dotted text. The most specific block decides, so the two
   reachable anycast addresses inside 192.0.0.0/24 count as public. */
var SPECIAL4 = [
	[ 0, 0, 0, 0, 8, false ],          /* "this network" */
	[ 10, 0, 0, 0, 8, false ],         /* private */
	[ 100, 64, 0, 0, 10, false ],      /* shared (CGNAT) */
	[ 127, 0, 0, 0, 8, false ],        /* loopback */
	[ 169, 254, 0, 0, 16, false ],     /* link local */
	[ 172, 16, 0, 0, 12, false ],      /* private */
	[ 192, 0, 0, 0, 24, false ],       /* IETF protocol assignments */
	[ 192, 0, 0, 9, 32, true ],        /* PCP anycast */
	[ 192, 0, 0, 10, 32, true ],       /* TURN anycast */
	[ 192, 0, 2, 0, 24, false ],       /* documentation */
	[ 192, 88, 99, 2, 32, false ],     /* 6a44 relay anycast */
	[ 192, 168, 0, 0, 16, false ],     /* private */
	[ 198, 18, 0, 0, 15, false ],      /* benchmarking */
	[ 198, 51, 100, 0, 24, false ],    /* documentation */
	[ 203, 0, 113, 0, 24, false ],     /* documentation */
	[ 224, 0, 0, 0, 4, false ],        /* multicast */
	[ 240, 0, 0, 0, 4, false ]         /* reserved, limited broadcast */
];

function num4(o) { return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]; }

function public4(addr) {
	var o = String(addr || '').split('.');
	if (o.length !== 4 || o.some(function(x) { return !/^\d{1,3}$/.test(x) || +x > 255; })) return false;
	var n = num4(o.map(Number)), best = null;
	SPECIAL4.forEach(function(b) {
		var mask = b[4] ? (0xffffffff << (32 - b[4])) >>> 0 : 0;
		if (((n & mask) >>> 0) === ((num4(b) & mask) >>> 0) && (!best || b[4] > best[4])) best = b;
	});
	return !best || best[5];
}

/* ---- fw4's option parsers; null is a value fw4 refuses */

function lc(v) { return String(v).toLowerCase(); }

/* to_array: a uci list as it is, an option split at blanks */
function toArray(v) {
	if (Array.isArray(v)) return v.map(String);
	if (v == null) return [];
	v = String(v).trim();
	return v === '' ? [] : v.split(/[ \t]+/);
}

function invert(v) {
	var neg = false;
	v = String(v).replace(/^[ \t]*!/, function() { neg = true; return ''; }).trim();
	return v.length ? { invert: neg, val: v } : null;
}

function bool(v) {
	if (v === '1' || v === 'on' || v === 'true' || v === 'yes') return true;
	if (v === '0' || v === 'off' || v === 'false' || v === 'no') return false;
	return null;
}

function oneOf(choices) {
	return function(v) {
		v = lc(v);
		for (var i = 0; i < choices.length; i++)
			if (choices[i].substr(0, v.length) === v) return choices[i];
		return null;
	};
}

var policy = oneOf([ 'accept', 'reject', 'drop' ]);
var target = oneOf([ 'accept', 'reject', 'drop', 'notrack', 'helper', 'mark', 'dscp', 'dnat', 'snat', 'masquerade' ]);
var includeType = oneOf([ 'script', 'nftables' ]);

function family(v) {
	if (v === 'any' || v === 'all' || v === '*') return 0;
	if (v === 'inet' || v.indexOf('4') > -1) return 4;
	return v.indexOf('6') > -1 ? 6 : null;
}

function str(v) { return v; }
function identifier(v) { return /^[a-zA-Z_.][a-zA-Z0-9\/_.-]*$/.test(v) ? v : null; }
function device(v) { return invert(v); }

/* -> [ name ]: 'tcpudp' is two */
function protocol(v) {
	var p = invert(v);
	if (!p) return null;
	switch (lc(p.val)) {
	case 'all': case 'any': case '*': return [ 'all' ];
	case '1': case 'icmp': return [ 'icmp' ];
	case '58': case 'icmpv6': case 'ipv6-icmp': return [ 'ipv6-icmp' ];
	case 'tcpudp': return [ 'tcp', 'udp' ];
	case '6': return [ 'tcp' ];
	case '17': return [ 'udp' ];
	}
	return [ lc(p.val) ];
}

function port(v) {
	var p = invert(v), m = p && /^([0-9]{1,5})([-:]([0-9]{1,5}))?$/.exec(p.val);
	if (!m) return null;
	var lo = +m[1], hi = m[3] ? +m[3] : lo;
	return (lo > hi || hi > 65535) ? null : { invert: p.invert, min: lo, max: hi };
}

function mac(v) {
	var m = invert(v);
	return m && /^[0-9a-f]{1,2}([:-][0-9a-f]{1,2}){5}$/i.test(m.val) ? m : null;
}

/* a set reference: its name, then the direction of each of its fields
   ('src', 'dst' or null: the set's own) */
function setmatch(v) {
	var m = invert(v);
	if (!m) return null;
	var name = /^[^ \t]+/.exec(m.val)[0];
	var dir = m.val.slice(name.length).trim().split(/[ \t,]/).slice(0, 3).map(function(d) {
		return (d === 'dst' || d === 'dest') ? 'dst' : d === 'src' ? 'src' : null;
	});
	return { invert: m.invert, val: name, dir: dir };
}

/* an ipset's match entry -> { dir, type } */
function ipsettype(v) {
	var m = /^(src|dst|dest)_(.+)$/.exec(v);
	var t = oneOf([ 'ip', 'port', 'mac', 'net', 'set' ])(m ? m[2] : v);
	return t ? { dir: (!m || m[1] === 'src') ? 'src' : 'dst', type: t } : null;
}

/* ucode's +val: a number, NaN refused */
function int(v) {
	if (/^\s*[+-]?(inf|nan)/i.test(v)) return null;
	var n = Number(v);
	return n === n ? n : null;
}

function limit(v) {
	var l = invert(v), m = l && /^([0-9]+)(\/([a-z]+))?$/.exec(l.val);
	return m && (!m[3] || oneOf([ 'second', 'minute', 'hour', 'day' ])(m[3])) ? l : null;
}

var rejectCode = oneOf([ 'tcp-reset', 'port-unreachable', 'admin-prohibited', 'host-unreachable', 'no-route' ]);

/* conntrack helpers firewall4 defines (/usr/share/firewall4/helpers); fw4
   refuses any other name */
var HELPERS = [ 'amanda', 'ftp', 'RAS', 'Q.931', 'irc', 'netbios-ns', 'pptp', 'sane', 'sip', 'snmp', 'tftp', 'rtsp' ];
function cthelper(v) {
	var h = invert(v);
	return h && HELPERS.indexOf(h.val) >= 0 ? h : null;
}

/* inet_pton: a dotted quad without leading zeros, or IPv6 with an
   optional :: and trailing quad -> [ byte ], null when it is neither */
function ipBytes(a) {
	a = String(a);
	var q = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
	if (q) {
		q = q.slice(1);
		return q.every(function(x) { return (x === '0' || x[0] !== '0') && +x <= 255; }) ? q.map(Number) : null;
	}
	if (a.indexOf(':') < 0) return null;
	var tail = [], m = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
	if (m) {
		tail = ipBytes(m[2]);
		if (!tail) return null;
		a = /::$/.test(m[1]) ? m[1] : m[1].slice(0, -1);
	}
	var halves = a.split('::');
	if (halves.length > 2) return null;
	var groups = function(s) { return s === '' ? [] : s.split(':'); };
	var head = groups(halves[0]), rest = halves.length === 2 ? groups(halves[1]) : [];
	var need = 8 - tail.length / 2, n = head.length + rest.length;
	if (head.concat(rest).some(function(g) { return !/^[0-9a-f]{1,4}$/i.test(g); })) return null;
	if (halves.length === 2 ? n > need - 1 : n !== need) return null;
	while (halves.length === 2 && head.length + rest.length < need) head.push('0');
	var out = [];
	head.concat(rest).forEach(function(g) { var x = parseInt(g, 16); out.push(x >> 8, x & 255); });
	return out.concat(tail);
}

/* the leading one bits of a mask, -1 when they are not contiguous */
function maskBits(m) {
	var bits = 0, zero = false;
	for (var i = 0; i < m.length; i++) {
		for (var b = 7; b >= 0; b--) {
			if (m[i] & (1 << b)) { if (zero) return -1; bits++; }
			else zero = true;
		}
	}
	return bits;
}

/* the address with all but its first `bits` bits cleared */
function masked(bytes, bits) {
	return bytes.map(function(x, i) {
		var b = Math.max(0, Math.min(8, bits - 8 * i));
		return x & ((0xff << (8 - b)) & 0xff);
	});
}

function cmpBytes(a, b) {
	for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
}

/* an address, address/bits, address/mask or range -> { family, all,
   bytes, bits, nc } or { family, all, range: [ lo, hi ] } (all: the
   whole address space, as 0.0.0.0/0 or ::/0; nc: a mask that is not
   contiguous, which fw4 applies to the address); null when it is
   malformed, undefined when it is no address (a network name) */
function subnet(s) {
	var p = s.split('/'), r, a, b, bits;
	if (p.length === 2) {
		a = ipBytes(p[0]);
		if (!a) return null;
		b = ipBytes(p[1]);
		if (b) {
			if (b.length !== a.length) return null;
			bits = maskBits(b);
			return { family: a.length === 4 ? 4 : 6, all: bits === 0, nc: bits < 0,
				bytes: bits < 0 ? a.map(function(x, i) { return x & b[i]; }) : a, bits: bits };
		}
		if (!/^\d+$/.test(p[1])) return null;
		return { family: a.length === 4 ? 4 : 6, all: +p[1] === 0, bytes: a, bits: +p[1] };
	}
	if (p.length > 2) return null;
	r = s.split('-');
	if (r.length === 2 && ipBytes(r[0])) {
		a = ipBytes(r[0]);
		b = ipBytes(r[1]);
		if (!b || b.length !== a.length) return null;
		return { family: a.length === 4 ? 4 : 6, range: [ a, b ],
			all: a.every(function(x) { return x === 0; }) && b.every(function(x) { return x === 255; }) };
	}
	a = ipBytes(s);
	return a ? { family: a.length === 4 ? 4 : 6, all: false, bytes: a, bits: a.length * 8 } : undefined;
}

/* ---- the interface dump */

function isUplink(i) {
	return !!(i.up &&
		(i.route || []).some(function(r) { return r && r.target === '0.0.0.0' && +r.mask === 0; }) &&
		(i['ipv4-address'] || []).some(function(a) { return a && public4(a.address); }));
}

/* network.interface dump -> { name: { up, uplink, device, zone, addrs, ips } },
   null when there is none. As fw4 reads it: the device is l3_device, else
   device; addrs are the interface's subnets (what its name stands for in
   a rule), ips the router's own addresses on it as bytes */
function interfaces(dump) {
	if (!Array.isArray(dump)) return null;
	var out = Object.create(null);
	var list = function(v) { return (Array.isArray(v) ? v : []).filter(function(a) { return a && a.address && ipBytes(a.address); }); };
	dump.forEach(function(i) {
		if (!i || !i.interface) return;
		var dev = i.l3_device != null ? i.l3_device : i.device;
		var own = list(i['ipv4-address']).concat(list(i['ipv6-address']),
			list((Array.isArray(i['ipv6-prefix-assignment']) ? i['ipv6-prefix-assignment'] : []).map(function(p) { return p && p['local-address']; })));
		out[String(i.interface)] = {
			up: !!i.up, uplink: isUplink(i),
			device: dev ? String(dev) : null,
			zone: (i.data && i.data.zone) ? String(i.data.zone) : null,
			addrs: own.map(function(a) {
				var b = ipBytes(a.address);
				return { family: b.length === 4 ? 4 : 6, all: +a.mask === 0, bytes: b, bits: +a.mask };
			}),
			ips: own.map(function(a) { return ipBytes(a.address); })
		};
	});
	return out;
}

/* ---- ports and protocols */

function inRange(p) { return function(r) { return p >= r[0] && p <= r[1]; }; }

/* ports: null (every port) or { pos: [ [ min, max ] ], neg: [...] } */
function hasPort(ports, p) {
	return !ports || ((!ports.pos.length || ports.pos.some(inRange(p))) && !ports.neg.some(inRange(p)));
}

function portRanges(list) {
	if (!list || !list.length) return null;
	var pr = function(neg) { return list.filter(function(x) { return x.invert === neg; }).map(function(x) { return [ x.min, x.max ]; }); };
	return { pos: pr(false), neg: pr(true) };
}

function rangeText(rs) {
	return rs.map(function(r) { return r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]; }).join(', ');
}

/* every port in the ranges is one of the list */
function within(rs, list) {
	return rs.length > 0 && rs.every(function(r) {
		if (r[1] - r[0] >= list.length) return false;
		for (var x = r[0]; x <= r[1]; x++) if (list.indexOf(x) < 0) return false;
		return true;
	});
}

function lenient(fn, v) {
	return toArray(v).map(fn).filter(Boolean).reduce(function(a, x) { return a.concat(x); }, []);
}

/* fw4's infer_family over the families a section refers to -> [ 4 ], [ 6 ],
   [ 4, 6 ], or false when two of them conflict (fw4 skips it) */
function families(fam, refs, has4, has6, redirect) {
	var res = fam;
	for (var i = 0; i < refs.length; i++) {
		if (!refs[i] || refs[i] === res) continue;
		if (!res) { res = refs[i]; continue; }
		return false;
	}
	/* a redirect with neither family nor address is IPv4 (fw4 keeps fw3's
	   behaviour) */
	if (redirect && !res && !has4 && !has6) return res === 0 ? [ 4, 6 ] : [ 4 ];
	if (res == null) res = (has4 && !has6) ? 4 : (has6 && !has4) ? 6 : 0;
	return res ? [ res ] : [ 4, 6 ];
}

function famOf(addrs) {
	var f = 0;
	(addrs || []).forEach(function(a) { f |= a.family === 4 ? 1 : 2; });
	return f === 1 ? 4 : f === 2 ? 6 : f ? 0 : null;
}

return baseclass.extend({
	ADMIN_PORTS: ADMIN_PORTS,

	public4: public4,

	/* uplinks of a network.interface dump: interfaces that are up, hold the
	   IPv4 default route and a public IPv4 address. An access point's
	   default route runs to the main router over a private address and
	   does not count. -> [ interface name ] */
	uplinks: function(ifaces) {
		var ifs = interfaces(ifaces) || {};
		return Object.keys(ifs).filter(function(n) { return ifs[n].uplink; });
	},

	/* values: { section: { '.type', '.name', '.index', option: value } },
	   dump: network.interface dump, or null when it could not be read ->
	   { routed, internet: [ zone ], outside: [...], anyTo, defaults, zones, open,
	     forwards, standard, off, ignored, warnings, complex, includes, level }.
	   level is err, warn, info (open, nothing risky), ok, or unknown (no
	   internet-facing zone or uplink, or a setup this does not follow:
	   complex says why, and unconfirmed holds the warnings that apply if
	   traffic reaches them as configured; either way this cannot tell
	   what the internet reaches, and there are no warnings). Only what this config says: ports UPnP opens at run time
	   and rules in included files are not in it (includes lists those). */
	analyse: function(values, dump) {
		var secs = Object.keys(values || {}).map(function(k) { return values[k]; })
			.filter(function(s) { return s && typeof s === 'object'; })
			.sort(function(a, b) { return (a['.index'] || 0) - (b['.index'] || 0); });
		var of = function(type) { return secs.filter(function(s) { return s['.type'] === type; }); };
		var ifs = interfaces(dump);
		var ups = ifs ? Object.keys(ifs).filter(function(n) { return ifs[n].uplink; }) : [];
		var warnings = [], off = [], ignored = [];

		/* fw4's parse_options: { option: [ parser, default, list ] } ->
		   values, or { bad: option } for a value fw4 refuses */
		var parse = function(s, spec) {
			var out = {};
			for (var k in spec) {
				var fn = spec[k][0], v = s[k] != null ? s[k] : spec[k][1], r;
				if (v == null) { out[k] = null; continue; }
				if (spec[k][2]) {
					r = [];
					var items = toArray(v);
					for (var i = 0; i < items.length; i++) {
						var x = fn(items[i]);
						if (x === null) return { bad: k };
						r = r.concat(x);
					}
					out[k] = r.length ? r : null;
				}
				else {
					if (Array.isArray(v)) return { bad: k };
					r = fn(String(v));
					if (r === null) return { bad: k };
					out[k] = r;
				}
			}
			return out;
		};

		/* an invalid defaults section stops fw4 before it writes any
		   ruleset: what is loaded is then unknown */
		var dsec = of('defaults')[0] || {};
		var DEFS = { input: [ policy, 'drop' ], output: [ policy, 'drop' ], forward: [ policy, 'drop' ],
			tcp_reject_code: [ rejectCode, 'tcp-reset' ], any_reject_code: [ rejectCode, 'port-unreachable' ],
			synflood_rate: [ limit, '25/second' ], synflood_burst: [ int, '50' ], tcp_ecn: [ int ] };
		[ 'drop_invalid', 'syn_flood', 'synflood_protect', 'tcp_syncookies', 'tcp_window_scaling', 'accept_redirects',
			'accept_source_route', 'auto_helper', 'custom_chains', 'disable_ipv6', 'flow_offloading', 'flow_offloading_hw',
			'auto_includes' ].forEach(function(k) { DEFS[k] = [ bool ]; });
		var defs = parse(dsec, DEFS);
		if (defs.bad) {
			warnings.push({ level: 'warn', code: 'defaults-invalid', option: defs.bad });
			defs = { input: 'drop', output: 'drop', forward: 'drop' };
		}

		/* network: an address, or a network name with the dump's addresses
		   -> { invert, text, addrs } (addrs null: unknown, no dump) */
		var network = function(v) {
			var n = invert(v);
			if (!n) return null;
			var s = subnet(n.val);
			if (s === null) return null;
			if (s) return { invert: n.invert, text: n.val, addrs: [ s ] };
			if (!ifs) return { invert: n.invert, text: n.val, addrs: null };
			return ifs[n.val] ? { invert: n.invert, text: n.val, addrs: ifs[n.val].addrs } : null;
		};

		/* zones; a network or device entry is { net | dev, neg }. With the
		   dump a network stands for its device, as fw4 matches it, and a
		   network the dump puts in a zone (data.zone) joins that zone; a
		   network the dump does not have, or without a device, matches
		   nothing. Without it, networks compare by name. */
		var zones = [], lostNets = [];
		var internetish = function(s, nets) {
			return bool(s.masq) || bool(s.masq6) || WAN.test(String(s.name)) || nets.some(function(n) { return WAN.test(n) || ups.indexOf(n) >= 0; });
		};
		var resolve = function(e) {
			if (e.net == null || !ifs) return e;
			var i = ifs[e.net];
			return i && i.device ? { net: e.net, dev: i.device, neg: e.neg } : null;
		};
		of('zone').forEach(function(s) {
			var nets = toArray(s.network).map(invert).filter(function(e) { return e && !e.invert; }).map(function(e) { return e.val; });
			var item = { kind: 'zone', name: s.name != null ? String(s.name) : null };
			/* every option fw4 parses: a value it refuses in any of them
			   skips the zone */
			var z = bool(s.enabled) === false ? null : parse(s, {
				enabled: [ bool, '1' ], name: [ identifier ], family: [ family ],
				network: [ device, null, true ], device: [ device, null, true ], subnet: [ network, null, true ],
				input: [ policy, defs.input ], output: [ policy, defs.output ], forward: [ policy, defs.forward ],
				masq: [ bool ], masq_allow_invalid: [ bool ], masq_src: [ network, null, true ], masq_dest: [ network, null, true ],
				masq6: [ bool ], extra: [ str ], extra_src: [ str ], extra_dest: [ str ], mtu_fix: [ bool ], custom_chains: [ bool ],
				log: [ int ], log_limit: [ limit ], auto_helper: [ bool, '1' ], helper: [ cthelper, null, true ], counter: [ bool, '1' ]
			});
			if (!z || z.bad || !z.name) {
				if (!z) off.push(item);
				else { item.bad = z.bad || 'name'; ignored.push(item); }
				/* its networks fall to the default policies */
				if (internetish(s, nets)) lostNets = lostNets.concat(nets);
				return;
			}
			var ents = (z.network || []).map(function(e) { return { net: e.val, neg: e.invert }; })
				.concat(ifs ? Object.keys(ifs).filter(function(n) { return ifs[n].zone === z.name; }).map(function(n) { return { net: n, neg: false }; }) : [])
				.map(resolve)
				.concat((z.device || []).map(function(e) { return { dev: e.val, neg: e.invert }; }))
				/* fw4 skips a wildcard that is not at the end */
				.filter(function(e) { return e && !(e.dev != null && /\+./.test(e.dev)); })
				/* and makes an excluded '+' a device that never matches */
				.map(function(e) { return (e.neg && e.dev === '+') ? { dev: NEVER, neg: false } : e; });
			zones.push({
				name: z.name, family: z.family || null,
				input: z.input.toUpperCase(), output: z.output.toUpperCase(), forward: z.forward.toUpperCase(),
				masq: !!(z.masq || z.masq6),
				networks: nets,
				pos: ents.filter(function(e) { return !e.neg && e.dev !== '+'; }),
				neg: ents.filter(function(e) { return e.neg; }),
				anyDev: ents.some(function(e) { return !e.neg && e.dev === '+'; }),
				/* covered subnets: fw4 takes only those addresses into the
				   zone (of a family without one, none) */
				subnet: !!z.subnet,
				to: [], internet: false
			});
		});
		var byName = Object.create(null);
		zones.forEach(function(z) { if (!byName[z.name]) byName[z.name] = z; });

		/* traffic from network n: its name and, with the dump, its device */
		var via = function(n) { return { net: n, dev: ifs && ifs[n] ? ifs[n].device : null }; };
		var hit = function(e, t) {
			if (e.dev == null) return e.net === t.net;
			if (!t.dev) return false;
			return /\+$/.test(e.dev) ? t.dev.indexOf(e.dev.slice(0, -1)) === 0 : t.dev === e.dev;
		};
		/* does zone z take traffic t (fw4's zone match on devices: one
		   excluded is never taken; with none named, an exclusion or '+'
		   takes every other device)? */
		var takes = function(z, t) {
			if (z.neg.some(function(e) { return hit(e, t); })) return false;
			return z.pos.length ? z.pos.some(function(e) { return hit(e, t); }) : (z.neg.length > 0 || z.anyDev);
		};
		var covers = function(z, n) { return takes(z, via(n)); };
		var zoned = function(n) { return zones.some(function(z) { return covers(z, n); }); };

		zones.forEach(function(z) {
			z.internet = z.masq || WAN.test(z.name) ||
				z.networks.some(function(n) { return WAN.test(n); }) ||
				ups.some(function(u) { return covers(z, u); });
		});
		var internet = zones.filter(function(z) { return z.internet; });

		/* internet traffic no zone takes: it meets the default policies */
		var outside = [];
		var addOut = function(name, fam, zone) {
			if (!outside.some(function(o) { return o.name === name && o.family === fam; }))
				outside.push({ name: name, family: fam, zone: !!zone });
		};
		ups.forEach(function(u) { if (!zoned(u)) addOut(u, null); });
		lostNets.forEach(function(n) {
			if (ifs && !(ifs[n] && ifs[n].up)) return;
			if (!zoned(n)) addOut(n, null);
		});
		/* what a zone takes: with the dump the interfaces that are up on its
		   devices, else the networks and devices it names */
		var reach = function(z) {
			return ifs ? Object.keys(ifs).filter(function(n) { return ifs[n].up && covers(z, n); }).map(via)
				: z.pos.map(function(e) { return { net: e.net != null ? e.net : null, dev: e.dev != null ? e.dev : null }; });
		};
		/* a zone limited to one family leaves the other family of what it
		   takes to another zone, or to the default policies */
		internet.forEach(function(z) {
			if (!z.family) return;
			var other = z.family === 4 ? 6 : 4;
			var what = reach(z);
			var taken = what.length > 0 && what.every(function(t) {
				return zones.some(function(y) { return y !== z && y.family !== z.family && takes(y, t); });
			});
			if (!taken) addOut(z.name, other, true);
		});

		var routed = internet.length > 0 || outside.length > 0;
		var fromInternet = function(src) { return routed && (src === '*' || !!(byName[src] && byName[src].internet)); };
		var intoInternet = function(dest) { return dest !== '*' && !!(byName[dest] && byName[dest].internet); };
		var zoneRef = function(v) { return (v === '*' || byName[v]) ? v : null; };
		var zoneFam = function(ref) { return (ref && ref !== '*') ? byName[ref].family : null; };

		/* setups this does not follow (see the top), as { why, name, other }:
		   it gives no verdict for them */
		var complex = [];
		var addComplex = function(why, name, other) {
			if (!complex.some(function(c) { return c.why === why && ((c.name === name && c.other === (other || null)) || (c.name === other && c.other === name)); }))
				complex.push({ why: why, name: name, other: other || null });
		};
		/* covered subnets on an internet zone, or on a zone that names no
		   device and so takes those addresses on every one */
		zones.forEach(function(z) { if (z.subnet && (z.internet || !z.pos.length)) addComplex('subnet', z.name); });
		/* another zone that does or may take traffic on an internet zone's
		   devices (in a family both have); without the dump a network and a
		   device do not compare, so that may. Device names compare as
		   patterns (a '+' at the end matches any rest): do a and b share a
		   device, and does a take every device b does? */
		var stem = function(d) { return /\+$/.test(d) ? d.slice(0, -1) : null; };
		var overlaps = function(a, b) {
			var p = stem(a), q = stem(b);
			return p != null ? (q != null ? p.indexOf(q) === 0 || q.indexOf(p) === 0 : b.indexOf(p) === 0)
				: q != null ? a.indexOf(q) === 0 : a === b;
		};
		var covering = function(a, b) {
			var p = stem(a), q = stem(b);
			return p != null ? (q != null ? q : b).indexOf(p) === 0 : q == null && a === b;
		};
		/* the devices both a and b take, as a pattern (null for none) */
		var both = function(a, b) {
			if (!overlaps(a, b)) return null;
			var p = stem(a), q = stem(b);
			return p == null ? a : q == null ? b : p.length >= q.length ? a : b;
		};
		/* t is a network or device an internet zone takes, less those it
		   excludes (t.not), or { any, not }: every device but those. Does e,
		   an entry of another zone that excludes not, take some of it (as an
		   exclusion, all of it)? */
		var hit3 = function(e, t, neg, not) {
			var gone = function(d, n) {
				return (t.not || []).concat(not || []).some(function(x) { return x.dev != null ? d != null && covering(x.dev, d) : n != null && x.net === n; });
			};
			if (e.dev === NEVER || t.dev === NEVER) return false;
			if (t.any) return neg ? false : !gone(e.dev, e.net);
			if (e.dev == null ? t.net != null : t.dev != null) {
				if (e.dev == null) return e.net === t.net && (neg || !gone(null, e.net));
				if (neg) return covering(e.dev, t.dev);
				var d = both(e.dev, t.dev);
				return d != null && !gone(d, null);
			}
			return ifs ? false : null;
		};
		var takes3 = function(z, t) {
			var out = z.neg.map(function(e) { return hit3(e, t, true); });
			if (out.indexOf(true) >= 0) return false;
			var into = z.pos.length ? z.pos.map(function(e) { return hit3(e, t, false, z.neg); }) : [ z.neg.length > 0 || z.anyDev ];
			var r = into.indexOf(true) >= 0 ? true : into.indexOf(null) >= 0 ? null : false;
			return (r && out.indexOf(null) >= 0) ? null : r;
		};
		/* what an internet zone takes: its interfaces, the devices it names
		   (one may exist outside the dump, a VPN's say), and with no device
		   named, every one it does not exclude */
		var points = function(z) {
			var pts = reach(z);
			if (ifs) pts = pts.concat(z.pos.filter(function(e) { return e.net == null; }).map(function(e) { return { net: null, dev: e.dev }; }));
			if (!z.pos.length && (z.anyDev || z.neg.length)) pts.push({ any: true });
			return pts.map(function(t) { t.not = z.neg; return t; });
		};
		internet.forEach(function(z) {
			points(z).forEach(function(t) {
				zones.forEach(function(y) {
					if (y === z || (y.family && z.family && y.family !== z.family)) return;
					if (takes3(y, t) !== false) addComplex('shared', z.name, y.name);
				});
			});
		});

		/* the router's own addresses: none known without the dump */
		var own = ifs ? Object.keys(ifs).reduce(function(a, n) { return a.concat(ifs[n].ips); }, []) : null;
		/* is an address (as fw4 DNATs to it: masked to its prefix, or a
		   range) one of them? */
		var isOwn = function(x) {
			return own.some(function(b) {
				if (x.range) return b.length === x.range[0].length && cmpBytes(b, x.range[0]) >= 0 && cmpBytes(b, x.range[1]) <= 0;
				return b.length === x.bytes.length && cmpBytes(b, masked(x.bytes, x.bits)) === 0;
			});
		};

		/* ipsets fw4 loads from this config: { name: { family, match } }. A
		   set it does not define may come from a service at run time, or
		   not exist: either way it says nothing this page can rely on */
		var ipsets = Object.create(null);
		of('ipset').forEach(function(s) {
			var p = parse(s, {
				enabled: [ bool, '1' ], reload_set: [ bool ], counters: [ bool ], comment: [ str ],
				name: [ identifier ], family: [ family, '4' ], storage: [ str ], match: [ ipsettype, null, true ],
				iprange: [ str ], portrange: [ str ], netmask: [ int ], maxelem: [ int ], hashsize: [ int ],
				timeout: [ int, '-1' ], external: [ str ], entry: [ str, null, true ], loadfile: [ str ]
			});
			if (p.bad || !p.enabled || !p.name || !p.match) return;
			var types = p.match.map(function(m) { return m.type; });
			if (types.indexOf('set') >= 0 || (p.family === 0 && (types.indexOf('ip') >= 0 || types.indexOf('net') >= 0))) return;
			if (!ipsets[p.name]) ipsets[p.name] = { family: p.family, match: p.match };
		});
		/* a set limits the source when it matches the source address in
		   one of its fields: the reference's direction, else the set's.
		   A negated, unknown, destination or MAC/port-only set does not */
		var sourceSet = function(x) {
			var set = !x.invert && ipsets[x.val];
			return !!set && set.match.some(function(m, i) {
				return (m.type === 'ip' || m.type === 'net') && (x.dir[i] || m.dir) === 'src';
			});
		};
		/* a rule or port forward from the internet that uses a set this
		   config does not define and enable, read from the config as it
		   is: the set may come from a service this cannot see, and whether
		   fw4 keeps the section depends on it */
		var setless = Object.create(null), hidden = [];
		of('rule').concat(of('redirect')).forEach(function(s) {
			if (bool(s.enabled) === false || s.ipset == null || s.src == null || !fromInternet(String(s.src))) return;
			var ref = Array.isArray(s.ipset) ? null : setmatch(String(s.ipset));
			if (!ref || !ipsets[ref.val]) {
				addComplex('set', s.name != null ? String(s.name) : null);
				setless[s['.name']] = true;
			}
		});
		/* a warning about such a section is not even a setting to check */
		var warnFor = function(s, w) {
			warnings.push(w);
			if (setless[s['.name']]) hidden.push(w);
		};

		/* what a rule or redirect matches, read leniently so that a section
		   fw4 skips can still be described */
		var describe = function(kind, s) {
			var redirect = kind === 'redirect';
			var proto = lenient(protocol, s.proto != null ? s.proto : 'tcpudp');
			var any = proto.indexOf('all') >= 0;
			proto = any ? [ 'all' ] : proto.filter(function(p, i) { return proto.indexOf(p) === i; });
			var l4 = !any && proto.some(function(p) { return p === 'tcp' || p === 'udp'; });
			var ports = l4 ? portRanges(lenient(port, redirect ? s.src_dport : s.dest_port)) : null;
			/* ipset is one option, not a list: 'name dst' is one set */
			var ips = lenient(network, s.src_ip);
			var sets = (Array.isArray(s.ipset) ? s.ipset : s.ipset != null ? [ s.ipset ] : [])
				.map(function(v) { return setmatch(String(v)); }).filter(Boolean);
			var srcSets = sets.filter(sourceSet);
			var pos = ips.filter(function(a) { return !a.invert; }), neg = ips.filter(function(a) { return a.invert; });
			var addrs = ips.reduce(function(a, x) { return a.concat(x.addrs || []); }, []);
			var dips = lenient(network, s.dest_ip).reduce(function(a, x) { return a.concat(x.addrs || []); }, []);
			var sdips = redirect ? lenient(network, s.src_dip).reduce(function(a, x) { return a.concat(x.addrs || []); }, []) : [];
			var fam = s.family != null ? family(String(s.family)) : null;
			var src = s.src != null ? String(s.src) : null, dest = s.dest != null ? String(s.dest) : null;
			var refs = [ sets.length && ipsets[sets[0].val] ? ipsets[sets[0].val].family : null,
				famOf(addrs), famOf(dips), famOf(sdips), byName[src] ? byName[src].family : null, byName[dest] ? byName[dest].family : null ];
			var has = function(f) { return addrs.concat(dips, sdips).some(function(a) { return a.family === f; }); };
			var fams = [];
			var add = function(f) {
				(families(f, refs, has(4), has(6), redirect) || []).forEach(function(x) { if (fams.indexOf(x) < 0) fams.push(x); });
			};
			/* ipv6-icmp is IPv6 whatever the family says */
			if (proto.some(function(p) { return p !== 'ipv6-icmp'; })) add(fam);
			if (proto.indexOf('ipv6-icmp') >= 0) add(6);
			/* restricted when every family the section applies to has a
			   positive source list that is not the whole address space, or
			   a set matches the source address; a negated address admits
			   everyone else, and a MAC address on internet traffic is the
			   upstream router's */
			var restricted = fams.length > 0 && (srcSets.length > 0 || fams.every(function(f) {
				var mine = pos.filter(function(a) { return !a.addrs || a.addrs.some(function(x) { return x.family === f; }); });
				return mine.length > 0 && !mine.some(function(a) { return a.addrs && a.addrs.some(function(x) { return x.family === f && x.all; }); });
			}));
			var only = pos.filter(function(a) { return !(a.addrs && a.addrs.length && a.addrs.every(function(x) { return x.all; })); }).map(function(a) { return a.text; })
				.concat(srcSets.map(function(x) { return '@' + x.val; }));
			return {
				kind: kind, name: s.name != null ? String(s.name) : null, src: src, dest: dest,
				proto: proto, ports: ports, portText: ports ? rangeText(ports.pos) : '',
				portsExcept: ports ? rangeText(ports.neg) : '',
				icmp: proto.some(function(p) { return /icmp/.test(p); }) ? toArray(s.icmp_type) : [],
				from: { anywhere: !restricted, only: restricted ? only : [], except: restricted ? [] : neg.map(function(a) { return a.text; }) },
				family: fams.length === 1 ? fams[0] : null,
				families: fams
			};
		};
		/* the admin ports (ADMIN_PORTS) it opens to any address, [] for none */
		var admin = function(item, ports) {
			if (!item.from.anywhere || !(item.proto[0] === 'all' || item.proto.indexOf('tcp') >= 0)) return [];
			return ADMIN_PORTS.filter(function(p) { return hasPort(ports, p); });
		};
		/* standard housekeeping: ping and other control messages, multicast
		   membership, DHCP client replies, IPsec passed on to a host */
		var quiet = function(item) {
			if (item.proto[0] === 'all') return false;
			return item.proto.every(function(p) {
				if (QUIET_PROTO.test(p)) return true;
				if (IPSEC_PROTO.test(p)) return !!item.dest;
				if (p !== 'udp' || !item.ports) return false;
				return within(item.ports.pos, item.dest ? CLIENT_UDP.concat(IPSEC_UDP) : CLIENT_UDP);
			});
		};

		/* zones every zone forwards to (forwardings from '*') */
		var anyTo = [];
		of('forwarding').forEach(function(s) {
			var item = { kind: 'forwarding', name: null, src: s.src != null ? String(s.src) : null, dest: s.dest != null ? String(s.dest) : null };
			if (bool(s.enabled) === false) { off.push(item); return; }
			var f = parse(s, { enabled: [ bool, '1' ], family: [ family ], src: [ zoneRef ], dest: [ zoneRef ] });
			if (!f.bad && (!f.src || !f.dest)) f.bad = !f.src ? 'src' : 'dest';
			if (f.bad) { item.bad = f.bad; ignored.push(item); return; }
			if (!families(f.family, [ zoneFam(f.src), zoneFam(f.dest) ])) { item.bad = 'family'; ignored.push(item); return; }
			if (f.src === '*' && anyTo.indexOf(f.dest) < 0) anyTo.push(f.dest);
			(f.src === '*' ? zones : [ byName[f.src] ]).forEach(function(z) {
				if (z.name !== f.dest && z.to.indexOf(f.dest) < 0) z.to.push(f.dest);
			});
			if (fromInternet(f.src) && !intoInternet(f.dest))
				warnings.push({ level: 'err', code: 'forward-into', zone: f.src, dest: f.dest });
		});

		if (routed && defs.forward === 'accept') warnings.push({ level: 'err', code: 'default-forward' });
		internet.forEach(function(z) {
			if (z.input === 'ACCEPT') warnings.push({ level: 'err', code: 'input-accept', zone: z.name });
		});
		outside.forEach(function(o) {
			if (defs.input === 'accept') warnings.push({ level: 'err', code: 'outside-input', iface: o.name, family: o.family });
		});
		/* without the dump an uplink outside every zone cannot be seen */
		if (!ifs && routed && defs.input === 'accept' && !outside.length) warnings.push({ level: 'warn', code: 'uplinks-unknown' });

		var open = [], fwd = [], standard = [];
		of('rule').forEach(function(s) {
			var item = describe('rule', s);
			if (bool(s.enabled) === false) { off.push(item); return; }
			var r = parse(s, {
				enabled: [ bool, '1' ], family: [ family ], src: [ zoneRef ], dest: [ zoneRef ],
				proto: [ protocol, 'tcpudp', true ], src_ip: [ network, null, true ], src_mac: [ mac, null, true ],
				src_port: [ port, null, true ], dest_ip: [ network, null, true ], dest_port: [ port, null, true ],
				ipset: [ setmatch ], target: [ target ]
			});
			if (r.bad || !item.families.length) { item.bad = r.bad || 'family'; ignored.push(item); return; }
			if (r.target !== 'accept' || !fromInternet(r.src)) return;
			if (quiet(item)) { standard.push(item); return; }
			if (r.dest) {
				fwd.push(item);
				/* every port from any address into another zone: the same
				   as a forwarding */
				if (!intoInternet(r.dest) && item.from.anywhere && !r.dest_ip &&
					(item.proto[0] === 'all' || (item.proto.some(function(p) { return p === 'tcp' || p === 'udp'; }) && !(item.ports && item.ports.pos.length))))
					warnFor(s, { level: 'err', code: 'rule-into', name: item.name, dest: r.dest });
				return;
			}
			open.push(item);
			var a = admin(item, item.ports);
			if (a.length)
				warnFor(s, { level: 'warn', code: 'admin-open', kind: 'rule', name: item.name, ports: item.portText, admin: a });
		});

		of('redirect').forEach(function(s) {
			var item = describe('redirect', s);
			item.host = s.dest_ip != null ? String(s.dest_ip) : null;
			if (bool(s.enabled) === false) { off.push(item); return; }
			var r = parse(s, {
				enabled: [ bool, '1' ], family: [ family ], src: [ zoneRef ], dest: [ zoneRef ],
				proto: [ protocol, 'tcpudp', true ], src_ip: [ network ], src_mac: [ mac, null, true ], src_port: [ port ],
				src_dip: [ network ], src_dport: [ port ], dest_ip: [ network ], dest_port: [ port ],
				ipset: [ setmatch ], target: [ target, 'dnat' ]
			});
			/* fw4 makes every target but snat a DNAT; SNAT opens nothing */
			if (!r.bad && r.target === 'snat') return;
			if (!r.bad && !r.src) r.bad = 'src';
			if (!r.bad && r.src === '*') r.bad = 'src-any';
			if (!r.bad && r.dest_ip && (r.dest_ip.invert || (r.dest_ip.addrs || []).some(function(a) { return a.nc; }))) r.bad = 'dest_ip';
			if (r.bad || !item.families.length) { item.bad = r.bad || 'family'; ignored.push(item); return; }
			if (!fromInternet(r.src)) return;
			/* the port on the target: dest_port, or the same as outside (fw4
			   copies src_dport); null when every port is sent on */
			var l4 = item.proto.some(function(p) { return p === 'tcp' || p === 'udp'; });
			var inner = !l4 ? null : r.dest_port ? portRanges([ r.dest_port ]) : item.ports;
			item.hostPort = inner ? rangeText(inner.pos) : '';
			/* local: to the router itself (no dest_ip, or in a family it
			   applies to the first dest_ip address of that family, which is
			   the one fw4 DNATs to, is one of the router's own however it is
			   spelled); null when that cannot be told without the dump */
			var first = function(f) { return r.dest_ip.addrs.filter(function(a) { return a.family === f; })[0]; };
			item.local = !r.dest_ip ? true : (!own || !r.dest_ip.addrs) ? null
				: item.families.some(function(f) { var a = first(f); return !a || isOwn(a); });
			var a = admin(item, inner);
			if (item.local === null) {
				fwd.push(item);
				if (a.length)
					warnFor(s, { level: 'warn', code: 'admin-unsure', kind: 'redirect', name: item.name, host: item.host, ports: item.portText, admin: a });
				return;
			}
			if (!item.local) { fwd.push(item); return; }
			open.push(item);
			if (a.length)
				warnFor(s, { level: 'warn', code: 'admin-open', kind: 'redirect', name: item.name, ports: item.portText, admin: a });
		});

		/* custom rules: files the firewall config names, whose rules this
		   config does not show (the Custom Rules tab, UPnP's include) */
		var includes = [];
		of('include').forEach(function(s) {
			var path = s.path != null ? String(s.path) : null;
			var item = { kind: 'include', name: null, path: path };
			if (bool(s.enabled) === false) return;
			var inc = parse(s, {
				enabled: [ bool, '1' ], path: [ str ], type: [ includeType, 'script' ],
				fw4_compatible: [ bool, path !== '/etc/firewall.user' ? '1' : '0' ]
			});
			if (!inc.bad && !path) inc.bad = 'path';
			if (!inc.bad && inc.type === 'script' && !inc.fw4_compatible) inc.bad = 'fw4_compatible';
			if (!inc.bad && inc.type !== 'nftables' && (s.position != null || s.chain != null)) inc.bad = s.position != null ? 'position' : 'chain';
			if (inc.bad) { item.bad = inc.bad; ignored.push(item); return; }
			includes.push(item);
		});

		/* errors first */
		warnings = warnings.filter(function(w) { return w.level === 'err'; }).concat(warnings.filter(function(w) { return w.level !== 'err'; }));
		var level = (complex.length || !routed) ? 'unknown'
			: warnings.some(function(w) { return w.level === 'err'; }) ? 'err'
			: warnings.length ? 'warn' : (open.length || fwd.length) ? 'info' : 'ok';
		return {
			routed: routed, internet: internet.map(function(z) { return z.name; }), outside: outside, anyTo: anyTo,
			defaults: { input: defs.input.toUpperCase(), output: defs.output.toUpperCase(), forward: defs.forward.toUpperCase() },
			zones: zones, open: open, forwards: fwd, standard: standard, off: off, ignored: ignored,
			warnings: (routed && !complex.length) ? warnings : [], complex: complex,
			/* what a rule with a set it cannot find opens is unknown too */
			unconfirmed: (routed && complex.length) ? warnings.filter(function(w) { return hidden.indexOf(w) < 0; }) : [],
			includes: includes, level: level, interfaces: !!ifs
		};
	}
});
