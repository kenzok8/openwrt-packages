'use strict';
'require baseclass';
'require vantage.fmt as fmt';

/* Client naming. An access point that is not the DHCP server knows almost
   nothing about its stations: no hostnames, often not even an address, and
   most phones use randomised ("private") MAC addresses. This module turns
   whatever is available into one human label plus the source it came
   from, in a fixed order of trust:

     alias   the user's own name (uci vantage, section type client)
     dns     reverse DNS of the station's address (network.rrdns)
     dhcp    a hostname in LuCI's host hints (DHCP lease on routers);
             keyed by the station's own MAC
     mdns    mDNS host announcement (umdns hosts). Unauthenticated, and
             umdns does not say who sent it, so any host on the LAN can
             claim any address: used only below DNS and DHCP, and only
             when uncontested (one name for the address, one station for
             the name; see mdnsMap and mdnsForStations)
     wps     the device name the station sends in its WPS element
     vendor  manufacturer from the OUI of a globally unique MAC
     private "Private device" for a locally administered MAC
     mac     "Unknown device" as the last resort

   Pure functions; names are untrusted and only ever rendered as text. */

var NAME_MAX = 48;
/* client sections read from /etc/config/vantage; the rpcd plugin refuses
   to store more */
var ALIAS_MAX = 512;
/* quiet sections (#110: a station whose weak signal stays out of the
   warnings), likewise */
var QUIET_MAX = 512;

/* C0 (incl. tab, CR, LF), DEL and C1 controls */
var CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/* a high surrogate not followed by a low one, or a low one not preceded
   by a high one */
var LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/;
/* space characters that collapse to one U+0020 (controls are rejected
   before this applies) */
var SPACES = /[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/g;

var SOURCES = {
	alias: _('Alias', 'vantage'), dns: _('DNS'), mdns: _('mDNS'), dhcp: _('DHCP'), wps: _('WPS'),
	vendor: _('Vendor'), 'private': _('Private'), mac: _('MAC')
};

/* device icons the user can pick; also guessed from names */
var ICONS = [ 'phone', 'laptop', 'tablet', 'desktop', 'tv', 'speaker', 'printer', 'camera', 'console', 'watch', 'iot', 'router', 'device' ];

var GUESS = [
	[ /\b(print|printer|envy|officejet|deskjet|laserjet|pixma|ecotank|mfc-|hl-|brother|epson|canon)/i, 'printer' ],
	[ /\b(iphone|pixel|galaxy|android|phone|redmi|oneplus|xperia|moto)/i, 'phone' ],
	[ /\b(ipad|tablet|tab\b|kindle|fire hd)/i, 'tablet' ],
	[ /\b(macbook|laptop|notebook|thinkpad|surface|chromebook|xps|zenbook|ideapad)/i, 'laptop' ],
	[ /\b(imac|desktop|workstation|\bpc\b|mac mini|nuc)/i, 'desktop' ],
	[ /\b(tv|bravia|roku|chromecast|fire ?tv|shield|apple ?tv|webos|tizen)/i, 'tv' ],
	[ /\b(echo|sonos|homepod|speaker|nest mini|google home)/i, 'speaker' ],
	[ /\b(cam|camera|doorbell|ring|arlo|wyze|eufy)/i, 'camera' ],
	[ /\b(playstation|ps[345]|xbox|nintendo|switch|steam ?deck)/i, 'console' ],
	[ /\b(watch)/i, 'watch' ],
	[ /\b(esp[-_]?\d|shelly|tasmota|sonoff|tuya|hue|plug|bulb|thermostat|sensor)/i, 'iot' ],
	[ /\b(router|access point|\bap\b|openwrt|fritz|repeater|mesh)/i, 'router' ]
];

function str(v) { return typeof v === 'string' ? v : ''; }

return baseclass.extend({
	NAME_MAX: NAME_MAX,
	ALIAS_MAX: ALIAS_MAX,
	QUIET_MAX: QUIET_MAX,
	SOURCES: SOURCES,
	ICONS: ICONS,

	/* '02-00-5E-00-53-0F' / '0200.5e00.530f' / '02005e00530f' ->
	   '02:00:5e:00:53:0f' (one separator throughout), else null */
	normMac: function(mac) {
		var hex = str(mac).trim().toLowerCase();
		if (/^[0-9a-f]{2}([:-])(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}$/.test(hex)) return hex.replace(/-/g, ':');
		if (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/.test(hex) || /^[0-9a-f]{12}$/.test(hex)) {
			hex = hex.replace(/\./g, '');
			return hex.match(/../g).join(':');
		}
		return null;
	},

	/* locally administered (U/L bit set): randomised / private address */
	isPrivateMac: function(mac) {
		var m = this.normMac(mac);
		return !!m && (parseInt(m.slice(0, 2), 16) & 2) === 2;
	},

	/* group bit set: not a station address */
	isMulticastMac: function(mac) {
		var m = this.normMac(mac);
		return !!m && (parseInt(m.slice(0, 2), 16) & 1) === 1;
	},

	/* 'AA:BB:CC' key for the vendor table, or null for private/multicast */
	ouiKey: function(mac) {
		var m = this.normMac(mac);
		if (!m || this.isPrivateMac(m) || this.isMulticastMac(m)) return null;
		return m.slice(0, 8).toUpperCase();
	},

	/* hostapd client signature "wifi4|probe:...,wps:Model_Name|assoc:..."
	   -> 'Model Name' (hostapd replaces spaces with '_') */
	wpsName: function(signature) {
		var m = str(signature).match(/(?:^|[|,:])wps:([^|,]{1,64})/);
		if (!m) return null;
		var name = m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
		return /[A-Za-z0-9]/.test(name) ? fmt.safeText(name, NAME_MAX) : null;
	},

	/* 'phone.lan.' -> 'phone'; keeps names that are not below a local
	   search domain as they are */
	cleanHostname: function(name) {
		var n = str(name).trim().replace(/\.$/, '');
		if (!n || /^[\d.]+$/.test(n) || /:/.test(n)) return null;   /* an address, not a name */
		n = n.replace(/\.(lan|local|home|localdomain|home\.arpa|internal|fritz\.box|station)$/i, '');
		return n ? fmt.safeText(n, NAME_MAX) : null;
	},

	/* User alias from the inspector. Rejected: anything that is not a
	   string, control characters (C0 including tab and newline, DEL, C1),
	   invisible/bidi/format characters (fmt.safeText's set) and unpaired
	   surrogates; these are checked before any normalisation so nothing
	   is silently turned into a space. Then runs of spaces (U+0020 and the
	   Unicode space separators) collapse to one space, the ends are
	   trimmed, and at most NAME_MAX code points are allowed.
	   -> { ok, value } or { ok: false, error } ; '' clears. */
	validateAlias: function(name) {
		if (name == null) name = '';
		if (typeof name !== 'string') return { ok: false, error: _('Name must be text') };
		if (name.length > NAME_MAX * 8) return { ok: false, error: _('Name is longer than %d characters').format(NAME_MAX) };
		if (CONTROL.test(name) || LONE_SURROGATE.test(name) || fmt.safeText(name, name.length + 2) !== name)
			return { ok: false, error: _('Name contains invisible or control characters') };
		var s = name.replace(SPACES, ' ').trim();
		if (!s) return { ok: true, value: '' };
		if (Array.from(s).length > NAME_MAX) return { ok: false, error: _('Name is longer than %d characters').format(NAME_MAX) };
		return { ok: true, value: s };
	},

	/* The uci change that saves a station name, re-validating everything
	   whatever the form did: the MAC must normalise to a unicast station
	   address, the name must pass validateAlias, an icon outside ICONS is
	   dropped, and an existing section id must be a plain uci identifier.
	   existing: the aliasMap entry for this MAC, or null.
	   -> { ok: true, op: 'none' | 'add' | 'set' | 'delete', sid, values }
	    | { ok: false, error } */
	aliasOp: function(existing, mac, name, icon) {
		var m = this.normMac(mac);
		if (!m || this.isMulticastMac(m)) return { ok: false, error: _('Not a station MAC address') };
		var v = this.validateAlias(name);
		if (!v.ok) return v;
		var sid = null;
		if (existing) {
			sid = typeof existing.sid === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(existing.sid) ? existing.sid : null;
			if (!sid) return { ok: false, error: _('The stored name has an invalid section id') };
		}
		var ic = this.validIcon(icon);
		if (!v.value) return sid ? { ok: true, op: 'delete', sid: sid } : { ok: true, op: 'none' };
		if (sid) return { ok: true, op: 'set', sid: sid, values: { name: v.value, icon: ic || '' } };
		var values = { mac: m, name: v.value };
		if (ic) values.icon = ic;
		return { ok: true, op: 'add', values: values };
	},

	validIcon: function(icon) { return ICONS.indexOf(icon) >= 0 ? icon : null; },

	guessIcon: function(name) {
		var n = str(name);
		for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(n)) return GUESS[i][1];
		return null;
	},

	/* uci vantage -> { 'aa:bb:..': { sid, name, icon } }; invalid MACs and
	   empty names are skipped, the first section for a MAC wins, sections
	   past ALIAS_MAX are ignored */
	aliasMap: function(sections) {
		var out = Object.create(null), self = this, n = 0;
		(Array.isArray(sections) ? sections : []).forEach(function(s) {
			if (!s || s['.type'] !== 'client' || ++n > ALIAS_MAX) return;
			var mac = self.normMac(s.mac), v = self.validateAlias(s.name);
			if (!mac || out[mac] || !v.ok || !v.value) return;
			out[mac] = { sid: str(s['.name']), name: v.value, icon: self.validIcon(s.icon) };
		});
		return out;
	},

	/* quiet sections of /etc/config/vantage -> { mac: true }, the stations
	   whose weak signal the dashboard leaves out of its warnings; past
	   QUIET_MAX are ignored */
	quietSet: function(sections) {
		var out = Object.create(null), self = this, n = 0;
		(Array.isArray(sections) ? sections : []).forEach(function(s) {
			if (!s || s['.type'] !== 'quiet' || ++n > QUIET_MAX) return;
			var mac = self.normMac(s.mac);
			if (mac) out[mac] = true;
		});
		return out;
	},

	/* umdns hosts reply { 'name.local': { ipv4: '...', ipv6: '...' } }
	   -> { ip: name }. An address claimed by two different names is left
	   out: umdns caches unsolicited answers from anyone, so a second claim
	   is either a conflict or a spoof, and neither names the station. */
	mdnsMap: function(hosts) {
		var out = Object.create(null), bad = Object.create(null), self = this;
		if (!hosts || typeof hosts !== 'object') return out;
		Object.keys(hosts).forEach(function(host) {
			var h = hosts[host], name = self.cleanHostname(host);
			if (!name || !h || typeof h !== 'object') return;
			[ 'ipv4', 'ipv6' ].forEach(function(k) {
				var v = h[k];
				(Array.isArray(v) ? v : [ v ]).forEach(function(ip) {
					if (typeof ip !== 'string' || !ip || bad[ip]) return;
					if (!out[ip]) out[ip] = name;
					else if (out[ip] !== name) { delete out[ip]; bad[ip] = true; }
				});
			});
		});
		return out;
	},

	/* The part of an mdnsMap that may name these stations
	   ([ { mac, ips } ]): an address that belongs to more than one station
	   names none of them, and a name that would land on more than one
	   station is dropped for all of them, so one announcement cannot label
	   a second device. -> { ip: name } */
	mdnsForStations: function(map, stations) {
		var owners = Object.create(null), byName = Object.create(null), out = Object.create(null), self = this;
		if (!map) return out;
		(Array.isArray(stations) ? stations : []).forEach(function(s) {
			var mac = s && self.normMac(s.mac);
			if (!mac) return;
			(Array.isArray(s.ips) ? s.ips : []).forEach(function(ip) {
				if (typeof ip !== 'string') return;
				var o = owners[ip] || (owners[ip] = []);
				if (o.indexOf(mac) < 0) o.push(mac);
			});
		});
		Object.keys(owners).forEach(function(ip) {
			if (owners[ip].length !== 1 || !Object.prototype.hasOwnProperty.call(map, ip)) return;
			var name = map[ip], macs = byName[name] || (byName[name] = []);
			if (macs.indexOf(owners[ip][0]) < 0) macs.push(owners[ip][0]);
		});
		Object.keys(owners).forEach(function(ip) {
			if (owners[ip].length === 1 && Object.prototype.hasOwnProperty.call(map, ip) && byName[map[ip]].length === 1) out[ip] = map[ip];
		});
		return out;
	},

	/* Resolve the display name of one station.
	   s: { mac, alias: { name, icon }, ips: [..], rdns: { ip: name },
	        mdns: { ip: name }, hint: { name }, wps, vendor }
	   -> { name, plain, source, sourceLabel, icon, secondary, isPrivate }
	   Without a name (vendor, private, mac) name is the one-line label,
	   which carries the MAC's last two octets ("Private device 53:0F"),
	   and plain the same without them, for where the MAC sits beside
	   it; otherwise both are the name. */
	resolve: function(s) {
		s = s || {};
		var self = this, mac = this.normMac(s.mac) || str(s.mac);
		var ips = Array.isArray(s.ips) ? s.ips.filter(function(ip) { return typeof ip === 'string' && ip; }) : [];
		var priv = this.isPrivateMac(mac), name = null, source = null;

		function fromIps(map) {
			if (!map) return null;
			for (var i = 0; i < ips.length; i++) {
				var n = Object.prototype.hasOwnProperty.call(map, ips[i]) ? self.cleanHostname(map[ips[i]]) : null;
				if (n) return n;
			}
			return null;
		}

		var alias = s.alias && this.validateAlias(s.alias.name);
		if (alias && alias.ok && alias.value) { name = alias.value; source = 'alias'; }
		if (!name && (name = fromIps(s.rdns))) source = 'dns';
		if (!name && s.hint && (name = this.cleanHostname(s.hint.name))) source = 'dhcp';
		if (!name && (name = fromIps(s.mdns))) source = 'mdns';
		if (!name && s.wps && (name = fmt.safeText(str(s.wps).trim(), NAME_MAX) || null)) source = 'wps';

		var plain = name, tail = fmt.macTail(mac);
		if (!name) {
			if (priv) { plain = _('Private device'); source = 'private'; }
			else if (s.vendor) { plain = _('%s device').format(fmt.safeText(s.vendor, 32)); source = 'vendor'; }
			else { plain = _('Unknown device', 'vantage'); source = 'mac'; }
			name = tail ? plain + ' ' + tail : plain;
		}

		var icon = (s.alias && this.validIcon(s.alias.icon)) || this.guessIcon(source === 'vendor' ? s.vendor : name) || 'device';
		return {
			name: name,
			plain: plain,
			source: source,
			sourceLabel: SOURCES[source],
			icon: icon,
			/* second line: the address when there is one, else the MAC */
			secondary: ips.length ? ips[0] : fmt.mac(mac),
			isPrivate: priv
		};
	}
});
