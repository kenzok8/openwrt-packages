'use strict';
'require view';
'require rpc';
'require ui';
'require vantage.fwglance as fwglance';

/* Network -> Firewall -> Overview (luci-app-vantage): what the firewall
   lets in from the internet, which zone reaches which, what is switched
   off, and the risky cases, read from uci `firewall`. Read-only: every
   item links to the LuCI page that changes it. The menu entry is gated by
   luci-app-firewall's own ACL group, which already lets its holder read
   and change this config; the app grants nothing for it. It shows what
   the config says: ports UPnP opens at run time and rules in custom rule
   files are not in it, and the page says so. All DOM is built with E()
   and text nodes. */

/* Both reject on a ubus error (permission denied, not found, ...) rather
   than resolve an `expect` default: an empty config would read as an
   access point, an empty interface list as a router whose uplinks are all
   zoned. load() checks the shape of what they return. */
var callUciGet = rpc.declare({ object: 'uci', method: 'get', params: [ 'config' ], reject: true });
/* which interface holds the default route, to find an uplink zone that
   does not masquerade: LuCI's luci-base-network-status group grants it
   (also the app's read group); without it the page falls back to
   masquerading and naming */
var callIfDump = rpc.declare({ object: 'network.interface', method: 'dump', reject: true });

function isObject(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }

/* the dashboard's sheet, versioned as LuCI versions its scripts (see overview.js) */
var cssPromise = null;
function loadCss() {
	if (cssPromise) return cssPromise;
	cssPromise = fetch(L.resource('vantage/app.css') + '?v=' + L.env.resource_version).then(function(r) { return r.ok ? r.text() : ''; }).then(function(text) {
		if (!text || !('adoptedStyleSheets' in document) || typeof CSSStyleSheet !== 'function') return;
		var sheet = new CSSStyleSheet();
		sheet.replaceSync(text);
		document.adoptedStyleSheets = document.adoptedStyleSheets.concat([ sheet ]);
	}).catch(function() {});
	return cssPromise;
}

var SVGNS = 'http://www.w3.org/2000/svg';
var ICONS = {
	globe: [ 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z', 'M3.4 9.2h17.2M3.4 14.8h17.2', 'M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9Z' ],
	zones: [ 'M4 5.5h6.5v6.5H4zM13.5 5.5H20v6.5h-6.5zM8.75 15.5h6.5V22h-6.5z', 'M7.25 12v1.75h9.5V12M12 13.75v1.75' ],
	off: [ 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z', 'M6 6l12 12' ],
	warn: [ 'M10.3 4.6 3 17.5A2 2 0 0 0 4.7 20.5h14.6A2 2 0 0 0 21 17.5L13.7 4.6a2 2 0 0 0-3.4 0Z', 'M12 9.5v4.5', 'M12 17h.01' ],
	err: [ 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z', 'M9 9l6 6M15 9l-6 6' ],
	chevron: [ 'M9.5 6l6 6-6 6' ],
	info: [ 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z', 'M12 11v5.5', 'M12 7.8h.01' ],
	arrow: [ 'M5 12h13.5', 'M13 6.5l5.5 5.5-5.5 5.5' ]
};

function icon(name) {
	var s = document.createElementNS(SVGNS, 'svg');
	s.setAttribute('class', 'vt-ico');
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('aria-hidden', 'true');
	s.setAttribute('focusable', 'false');
	ICONS[name].forEach(function(d) {
		var p = document.createElementNS(SVGNS, 'path');
		p.setAttribute('d', d);
		s.appendChild(p);
	});
	return s;
}

function page(tab) { return L.url('admin', 'network', 'firewall', tab); }

/* is admin/services/upnp in the menu tree (luci-app-upnp installed)? */
function hasUpnp(tree) {
	var n = tree;
	[ 'admin', 'services', 'upnp' ].forEach(function(k) { n = n && n.children ? n.children[k] : null; });
	return !!n;
}

/* "TCP, UDP 27015-27030", "IPv6 ICMPv6 echo-request", "IPv4 all protocols":
   the address family when the item has one only */
function what(item) {
	var fam = item.family ? 'IPv' + item.family + ' ' : '';
	if (item.proto[0] === 'all') return fam + _('all protocols');
	var l4 = item.proto.filter(function(p) { return p === 'tcp' || p === 'udp'; });
	var parts = [];
	if (l4.length) {
		var ports = item.portText ? ' ' + item.portText : '';
		if (item.portsExcept) ports += ' ' + (item.portText ? _('except %s') : _('all ports except %s')).format(item.portsExcept);
		parts.push(l4.map(function(p) { return p.toUpperCase(); }).join(', ') + ports);
	}
	item.proto.forEach(function(p) {
		if (l4.indexOf(p) < 0) parts.push(p === 'ipv6-icmp' ? 'ICMPv6' : p.toUpperCase());
	});
	var icmp = item.icmp && item.icmp.length ? ' ' + item.icmp.join(', ') : '';
	return fam + parts.join(', ') + icmp;
}

function from(item) {
	var f = item.from;
	if (!f.anywhere) return _('from %s', 'vantage').format(f.only.join(', '));
	return f.except.length ? _('from anywhere except %s').format(f.except.join(', ')) : _('from anywhere');
}

/* where a port forward sends the traffic: the router's own port, or a host
   and port ("[2001:db8::10]:443") */
function target(i) {
	if (i.local) return (i.hostPort && i.hostPort !== i.portText) ? _('router port %s').format(i.hostPort) : _('this router');
	var host = (i.hostPort && /:/.test(i.host)) ? '[' + i.host + ']' : (i.host || '');
	return host + (i.hostPort ? ':' + i.hostPort : '');
}

function zoneName(z) { return z === '*' ? _('any zone', 'vantage') : z; }

function named(item) {
	if (item.name) return item.name;
	return item.kind === 'redirect' ? _('Unnamed port forward') : _('Unnamed rule', 'vantage');
}

/* a zone's input policy: neutral, whatever it is, except an internet
   zone that accepts */
function polBadge(p, risky) {
	return E('span', { 'class': 'vt-fg-pol' + (risky ? ' is-risk' : '') }, [ p === 'ACCEPT' ? _('accept', 'vantage') : p === 'DROP' ? _('drop', 'vantage') : _('reject', 'vantage') ]);
}

/* the admin ports a warning names (fwglance ADMIN_PORTS), by service */
function adminServices(ports) {
	var names = { 22: _('SSH (port 22)'), 23: _('Telnet (port 23)'), 80: _('HTTP (port 80)'), 443: _('HTTPS (port 443)') };
	return (ports || []).map(function(p) { return names[p] || String(p); }).join(', ');
}

/* a setup fwglance does not follow (its complex) */
function complexWhy(c) {
	if (c.why === 'subnet') return _('the covered subnets of zone %s').format(c.name);
	if (c.why === 'shared') return _('zones %s and %s if they share a device').format(c.name, c.other);
	return _('the set in %s').format(c.name || _('an unnamed rule'));
}

/* why fw4 skips a section (fwglance's item.bad) */
function ignoredWhy(i) {
	if (i.bad === 'fw4_compatible') return _('ignored: not marked as compatible with firewall4');
	if (i.bad === 'src-any') return _('ignored: a port forward needs one source zone, not any zone');
	if (i.bad === 'family') return _('ignored: its address families conflict');
	if (i.bad === 'src' && !i.src) return _('ignored: no source zone');
	if ((i.bad === 'src' || i.bad === 'dest') && i[i.bad] && i[i.bad] !== '*')
		return _('ignored: zone %s does not exist or is switched off').format(i[i.bad]);
	return _('ignored: option %s has a value firewall4 refuses').format(i.bad);
}

/* N_() with English's rule where no catalogue has the string (as
   vantage.fmt's, which this view doesn't load) */
var tr = {
	N_: function(n, singular, plural, ctx) {
		var t = N_(n, singular, plural, ctx);
		if (n !== 1 && t === singular) return plural;
		if (n === 1 && t === plural) return singular;
		return t;
	}
};

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		/* a failed read is an error, not an empty config (which would read
		   as an access point); a failed interface dump is no dump (null),
		   which leaves the uplinks unknown, never an empty list */
		return Promise.all([ loadCss(), L.resolveDefault(callUciGet('firewall'), null), L.resolveDefault(ui.menu.load(), null),
			L.resolveDefault(callIfDump(), null) ]).then(function(r) {
			var values = isObject(r[1]) && isObject(r[1].values) ? r[1].values : null;
			var dump = isObject(r[3]) && Array.isArray(r[3]['interface']) ? r[3]['interface'] : null;
			if (!values) return { error: true };
			var fw = fwglance.analyse(values, dump);
			fw.upnp = hasUpnp(r[2]);
			return fw;
		});
	},

	render: function(fw) {
		if (fw.error)
			return E('div', { 'class': 'vt-app vt-fg' }, [ E('div', { 'class': 'vt-body' }, [
				this.head('err', _('Could not read the firewall configuration'),
					_('This page cannot tell what is open. Reload it; if that does not help, check the firewall pages.'))
			]) ]);
		return E('div', { 'class': 'vt-app vt-fg' }, [
			E('div', { 'class': 'vt-body' }, [
				this.renderHead(fw),
				fw.warnings.length ? E('div', { 'class': 'vt-fg-warns', 'role': 'list', 'aria-label': _('Warnings', 'vantage') }, fw.warnings.map(this.renderWarning)) : '',
				/* a setup it does not follow: what it would warn about, as
				   cautions to check */
				fw.unconfirmed.length ? E('div', { 'class': 'vt-fg-warns', 'role': 'list', 'aria-label': _('Settings to check') }, fw.unconfirmed.map(function(w) {
					var c = {};
					for (var k in w) c[k] = w[k];
					c.level = 'warn';
					return this.renderWarning(c);
				}, this)) : '',
				E('div', { 'class': 'vt-fg-grid' }, [
					(fw.routed && !fw.complex.length) ? this.renderOpen(fw) : '',
					this.renderZones(fw),
					(fw.off.length || fw.ignored.length) ? this.renderOff(fw) : ''
				])
			])
		]);
	},

	head: function(level, head, sub) {
		return E('header', { 'class': 'vt-head' }, [
			E('span', { 'class': 'vt-orb vt-orb-' + (level === 'info' ? 'ok' : level) }, [ E('span', { 'class': 'vt-orb-core' }) ]),
			E('div', { 'class': 'vt-head-text' }, [
				E('h2', { 'class': 'vt-headline' }, [ head ]),
				E('p', { 'class': 'vt-subline' }, [ sub ])
			])
		]);
	},

	renderHead: function(fw) {
		var head, sub, n = fw.open.length + fw.forwards.length;
		var facing = fw.internet.concat(fw.outside.map(function(o) { return o.family ? _('%s (IPv%d)').format(o.name, o.family) : o.name; })).join(', ');
		if (fw.complex.length) {
			head = _('This setup is beyond what this overview checks');
			sub = _('What is open depends on how firewall4 handles %s, which this page does not follow. Check the firewall pages.').format(fw.complex.map(complexWhy).filter(function(t, i, a) { return a.indexOf(t) === i; }).join('; '));
			if (fw.unconfirmed.length)
				sub += ' ' + _('The settings below apply if traffic reaches them as configured.');
		}
		else if (!fw.routed) {
			head = _('No internet-facing zone found');
			sub = _('No zone masquerades, holds the uplink or is called wan, so this page cannot tell which side faces the internet. On an access point that is expected; on a router, check the zones below.');
		}
		else if (fw.warnings.length) {
			head = fw.warnings.length === 1 ? _('1 thing needs attention') : _('%d things need attention').format(fw.warnings.length);
			sub = _('Internet-facing: %s').format(facing);
		}
		else if (n) {
			head = _('Open from the internet: %d').format(n);
			sub = _('%d on this router, %d into your network').format(fw.open.length, fw.forwards.length);
		}
		else {
			head = _('Nothing is open in your firewall rules');
			sub = fw.standard.length ? tr.N_(fw.standard.length, 'Only standard housekeeping (ping, DHCP renewals and the like): %d rule', 'Only standard housekeeping (ping, DHCP renewals and the like): %d rules').format(fw.standard.length) : _('Internet-facing: %s').format(facing);
		}
		return this.head(fw.level, head, sub);
	},

	renderWarning: function(w) {
		var title, reason, tab = 'zones';
		if (w.code === 'input-accept') {
			title = _('%s accepts every connection').format(w.zone);
			reason = _('Anything on the internet can reach the router itself. Set this zone\'s Input to reject.');
		}
		else if (w.code === 'forward-into') {
			title = _('%s is forwarded into %s').format(w.zone === '*' ? _('Any zone') : w.zone, zoneName(w.dest));
			reason = _('Anything on the internet can reach that network. Remove the forwarding unless you mean it.');
		}
		else if (w.code === 'default-forward') {
			title = _('Forwarding is accepted by default');
			reason = _('Traffic from the internet that no forwarding covers still reaches your other networks. Set Forward to reject in General Settings.');
		}
		else if (w.code === 'outside-input') {
			title = _('%s is in no zone and accepts every connection').format(w.family ? _('%s (IPv%d)').format(w.iface, w.family) : w.iface);
			reason = _('The default Input policy applies there and accepts, so anything on the internet can reach the router itself. Add it to the wan zone or set Input to reject in General Settings.');
		}
		else if (w.code === 'uplinks-unknown') {
			title = _('The uplinks could not be checked');
			reason = _('The interface list could not be read, and the default Input policy accepts: an uplink in no zone would be open. Set Input to reject in General Settings.');
		}
		else if (w.code === 'defaults-invalid') {
			title = _('The firewall cannot load these settings');
			reason = _('Option %s in General Settings has a value firewall4 refuses, so it loads no new rules: what is open is unknown.').format(w.option);
		}
		else if (w.code === 'rule-into') {
			title = _('%s lets the internet into %s').format(w.name || _('Unnamed rule', 'vantage'), zoneName(w.dest));
			reason = _('It accepts every port from any address, like a zone forwarding. Limit it to the ports and addresses you need.');
			tab = 'rules';
		}
		else if (w.code === 'admin-unsure') {
			title = _('%s may open the router\'s admin').format(w.name || w.ports);
			reason = _('It forwards %s from any address on the internet to %s. The interface list could not be read, so this page cannot tell whether that is the router itself.').format(adminServices(w.admin), w.host);
			tab = 'forwards';
		}
		else {
			title = _('Router admin open: %s').format(w.name || w.ports);
			reason = _('The firewall lets any address on the internet reach %s. Limit the rule to the addresses you use.').format(adminServices(w.admin));
			tab = w.kind === 'redirect' ? 'forwards' : 'rules';
		}
		return E('a', { 'class': 'vt-chip vt-chip-' + w.level, 'role': 'listitem', 'href': page(tab) }, [
			E('span', { 'class': 'vt-chip-ico' }, [ icon(w.level === 'err' ? 'err' : 'warn') ]),
			E('span', { 'class': 'vt-chip-main' }, [
				E('span', { 'class': 'vt-chip-title' }, [ title ]),
				E('span', { 'class': 'vt-chip-reason' }, [ reason ])
			])
		]);
	},

	tile: function(ic, title, link, linkText, body) {
		return E('section', { 'class': 'vt-tile vt-fg-tile', 'aria-label': title }, [
			E('header', { 'class': 'vt-tile-head' }, [
				E('h3', { 'class': 'vt-tile-title' }, [ icon(ic), E('span', {}, [ title ]) ]),
				E('a', { 'class': 'vt-link', 'href': link }, [ linkText, icon('chevron') ])
			])
		].concat(body));
	},

	row: function(href, main, sub, side) {
		return E('a', { 'class': 'vt-fg-row', 'href': href }, [
			E('span', { 'class': 'vt-fg-row-main' }, [
				E('span', { 'class': 'vt-fg-row-name' }, [ main ]),
				E('span', { 'class': 'vt-fg-row-sub' }, sub)
			]),
			side || ''
		]);
	},

	renderOpen: function(fw) {
		var self = this, body = [];
		var group = function(title, items) {
			body.push(E('h4', { 'class': 'vt-fg-group' }, [ title ]));
			body.push(E('div', { 'class': 'vt-fg-rows' }, items));
		};
		var to = function(text) {
			return E('span', { 'class': 'vt-fg-to' }, [ icon('arrow'), E('span', { 'class': 'vt-mono' }, [ text ]) ]);
		};
		var item = function(i) {
			var redirect = i.kind === 'redirect';
			return self.row(page(redirect ? 'forwards' : 'rules'), named(i),
				[ what(i), ' · ', E('span', { 'class': i.from.anywhere ? 'vt-fg-anywhere' : '' }, [ from(i) ]) ],
				redirect ? to(target(i)) : i.dest ? to(zoneName(i.dest)) : null);
		};
		if (fw.open.length) group(_('On this router'), fw.open.map(item));
		if (fw.forwards.length) group(_('Into your network'), fw.forwards.map(item));
		if (!fw.open.length && !fw.forwards.length)
			body.push(E('p', { 'class': 'vt-empty-inline' }, [ fw.warnings.length
				? _('No rule or port forward opens anything; the warnings above say what does.')
				: _('Nothing is open in your firewall rules.') ]));
		if (fw.standard.length)
			body.push(E('details', { 'class': 'vt-fg-std' }, [
				E('summary', {}, [ tr.N_(fw.standard.length, 'Standard housekeeping: %d rule', 'Standard housekeeping: %d rules').format(fw.standard.length) ]),
				E('p', { 'class': 'vt-hint' }, [ _('Ping and other control messages, multicast, DHCP renewals and IPsec passed on to your network: what every router lets in.') ]),
				E('div', { 'class': 'vt-fg-rows' }, fw.standard.map(function(i) {
					return self.row(page('rules'), named(i), [ what(i) ]);
				}))
			]));
		/* what the config cannot show */
		if (fw.upnp)
			body.push(E('a', { 'class': 'vt-fg-note', 'href': L.url('admin', 'services', 'upnp') }, [ icon('info'),
				E('span', {}, [ _('UPnP is installed: devices on your network can open ports on their own while it runs, and those are not listed here.') ]) ]));
		if (fw.includes.length)
			body.push(E('p', { 'class': 'vt-fg-note' }, [ icon('info'),
				E('span', {}, [ _('Custom rule files are configured (%s); rules in them are not listed here.').format(fw.includes.map(function(i) { return i.path || '?'; }).join(', ')) ]) ]));
		/* otherwise still say what this page cannot see: UPnP without its
		   LuCI app, and nftables files the firewall picks up on its own */
		if (!fw.upnp && !fw.includes.length)
			body.push(E('p', { 'class': 'vt-hint vt-fg-foot' }, [ _('From the firewall configuration. Ports opened by UPnP or by custom rule files are not shown.') ]));
		return this.tile('globe', _('Open from the internet'), page('rules'), _('Traffic Rules', 'vantage'), body);
	},

	renderZones: function(fw) {
		var fallback = fw.defaults.forward === 'ACCEPT';
		/* where a zone forwards: its forwardings, and with an accepting
		   default policy every other zone */
		var dests = function(to, risky) {
			var chips = to.map(function(d) { return E('span', { 'class': 'vt-fg-dest' + (risky ? ' is-risk' : '') }, [ zoneName(d) ]); });
			if (fallback) chips.push(E('span', { 'class': 'vt-fg-dest' + (risky ? ' is-risk' : '') }, [ _('any zone (default policy)') ]));
			return chips.length ? E('span', { 'class': 'vt-fg-dests' }, chips) : E('span', { 'class': 'vt-hint' }, [ _('forwards nowhere') ]);
		};
		var zone = function(name, internet, input, to, hint) {
			return E('div', { 'class': 'vt-fg-zone' + (internet ? ' is-internet' : '') }, [
				E('div', { 'class': 'vt-fg-zone-head' }, [
					E('span', { 'class': 'vt-fg-zone-name' }, [ name ]),
					internet ? E('span', { 'class': 'vt-fg-tag' }, [ _('internet') ]) : '',
					E('span', { 'class': 'vt-fg-zone-in' }, [ _('Input', 'vantage'), ' ', polBadge(input, internet && input === 'ACCEPT') ])
				]),
				E('div', { 'class': 'vt-fg-zone-to' }, [ icon('arrow'), dests(to, internet) ]),
				hint ? E('div', { 'class': 'vt-hint vt-fg-nets' }, [ hint ]) : ''
			]);
		};
		var rows = fw.zones.map(function(z) {
			return zone(z.name, z.internet, z.input, z.to, z.networks.length ? _('Networks: %s').format(z.networks.join(', ')) : '');
		}).concat(fw.outside.map(function(o) {
			return zone(o.family ? _('%s (IPv%d)').format(o.name, o.family) : o.name, true, fw.defaults.input, fw.anyTo,
				o.family ? _('This address family is in no zone: the default policies apply.') : _('In no zone: the default policies apply.'));
		}));
		if (!rows.length) rows = [ E('p', { 'class': 'vt-empty-inline' }, [ _('No zones are configured.') ]) ];
		return this.tile('zones', _('Zones'), page('zones'), _('General Settings'), [ E('div', { 'class': 'vt-fg-zones' }, rows) ]);
	},

	renderOff: function(fw) {
		var self = this;
		var rows = fw.off.concat(fw.ignored).map(function(i) {
			/* under "Not in effect", what is merely off says so too */
			var why = i.bad ? [ ' · ', ignoredWhy(i) ] : fw.ignored.length ? [ ' · ', _('switched off') ] : [];
			if (i.kind === 'forwarding')
				return self.row(page('zones'), _('Forwarding %s to %s').format(i.src || '?', i.dest || '?'), [ _('zone forwarding') ].concat(why));
			if (i.kind === 'zone')
				return self.row(page('zones'), _('Zone %s').format(i.name || '?'), [ _('zone', 'vantage') ].concat(why));
			if (i.kind === 'include')
				return self.row(page('custom'), i.path || '?', [ _('custom rule file') ].concat(why));
			return self.row(page(i.kind === 'redirect' ? 'forwards' : 'rules'), named(i),
				[ i.kind === 'redirect' ? _('port forward', 'vantage') : _('traffic rule'), ' · ', what(i) ].concat(why));
		});
		return this.tile('off', fw.ignored.length ? _('Not in effect') : _('Switched off'), page('rules'), _('Traffic Rules', 'vantage'), [
			E('div', { 'class': 'vt-fg-rows' }, rows)
		]);
	}
});
