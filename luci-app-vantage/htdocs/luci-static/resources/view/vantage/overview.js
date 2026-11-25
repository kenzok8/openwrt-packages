'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';
'require vantage.fmt as fmt';
'require vantage.wifi as wifi';
'require vantage.names as names';
'require vantage.model as model';
'require vantage.insight as insight';
'require vantage.series as series';
'require vantage.layout as layout';
'require vantage.wires as wires';
'require vantage.backdrop as backdrop';

/* Vantage dashboard (luci-app-vantage): a live, read-only overview of the
   device, its uplink, radios, SSIDs and stations. The only write is the
   station alias (uci vantage, own ACL). All DOM is built with E() and
   text nodes; no string is ever parsed as markup. */

var POLL_S = 5;
/* uplink traffic and CPU are sampled every FAST_S on their own: two
   small reads (/proc/stat, the uplink device's counters), where the full
   poll makes eight */
var FAST_S = 2;
/* Low-power router (#101; the Vantage theme's Appearance, data-vt-power):
   the live numbers as always, the slow parts (Wi-Fi state, the radios'
   iwinfo, client capabilities, temperatures, wired hosts) once every
   LOW_SLOW_MS, their last replies in between; nothing moves, and nothing
   stands still mid-move: no backdrop, no flow dots (applyPower) */
var LOW_SLOW_MS = 30 * 1000;
/* ... and after LOW_IDLE_MS without input (a page left open), the full
   poll every LOW_IDLE_POLL_MS and no fast lane, until the next input */
var LOW_IDLE_MS = 5 * 60 * 1000;
var LOW_IDLE_POLL_MS = 30 * 1000;
/* iwinfo info costs the router 15-22 ms an interface: asked again after
   IWINFO_MS, or at once when the interface's state moved (its radio up,
   down, pending or reconfigured in luci.vantage wireless; its channel,
   frequency, BSSID or SSID in hostapd's get_status, asked every poll).
   The noise floor, which moves, comes every poll from luci.vantage
   survey (1.5-2.5 ms a radio), its entry for the radio's channel */
var IWINFO_MS = 30 * 1000;
/* luci-rpc getHostHints reads the DHCP leases and the ARP table: asked
   again after HINTS_MS, and on each of the HINTS_HOT polls after a
   station or wired host first appears, since its lease follows its
   association by a moment; in between, its last reply */
var HINTS_MS = 30 * 1000;
var HINTS_HOT = 3;
/* One clock for everything that moves (the status circle's ring, the Live
   beat, the flow dots, the backdrop): a compositor animation makes the
   browser draw a frame on every display refresh, sixty a second, however
   slow the motion; here the pulses (CSS animations) and the dots are paused
   through the Web Animations API and stepped MOTION_MS apart, 20 frames a
   second, or at the backdrop's own rate (up to 30) while it draws. Under
   the Vantage theme the ticks go out as vantage:tick, so the theme's
   refresh dot moves on the same frames (menu-vantage.js) */
var MOTION_MS = 50;
/* the flow dots too (false: they stay compositor animations, as before) */
var STEP_DOTS = false;
var MOTION_EVENT = 'vantage:tick';
/* the pulses' animation names (app.css vt-ring, vt-ring-soft, vt-beat,
   vt-beat-soft); spelled without a class-like token for the theme's
   class scan (tests/theme-css.test.js) */
var PULSE_NAME = new RegExp('^vt' + '-(?:ring|beat)');
var WINDOW_MS = 5 * 60 * 1000;        /* throughput history shown */
var HIST_MAX = 90;
var HIST_FAST = 160;                  /* five minutes at FAST_S, and some */
var GONE_KEEP_MS = 5 * 60 * 1000;     /* disconnected stations stay listed */
var COPIED_MS = 2000;                 /* a Copy button reads "Copied" this long */
var TALKERS = 3;                      /* top talkers shown; the tile keeps room for all */
var SWITCH_MS = 30 * 1000;            /* LuCI runs swconfig for each switch's link state: at most this often */
/* how long a poll waits for the paired access points' report (the add-on's
   collector) before it goes on without this call's answer: under POLL_S,
   so a collector that does not answer costs no poll, and far above what
   an answer from its memory takes */
var COLLECTOR_WAIT_MS = 4 * 1000;
/* where no collector answers at all (the add-on installed and nothing
   paired: no such object), it is asked again only this often */
var COLLECTOR_RETRY_MS = 60 * 1000;
/* how long a poll waits for a switch chip's own counters (askSwitch):
   the plugin reads no port after its first second */
var SWITCH_WAIT_MS = 2 * 1000;
/* After a slow answer (slowWait) the next call waits ten times as long as
   that one took, SLOW_WAIT_MAX_MS at most. A call measured over
   REQUEST_MAX_MS (LuCI gives a request up after 20 s) was out while the
   computer slept or the tab was frozen: it says nothing of the router
   and makes no wait */
var REQUEST_MAX_MS = 30 * 1000;
var SLOW_WAIT_MAX_MS = 4 * 60 * 1000;
/* LuCI's WireGuard status (luci.wireguard getWgInstances) has the router
   run `wg show all dump` and, for each peer whose endpoint is configured
   by name, look that name up: inside rpcd, which answers nothing else
   meanwhile. So after an answer that took longer than WG_SLOW_MS (or no
   answer after as long) it is asked again only after ten times that,
   SLOW_WAIT_MAX_MS at most: a resolver that does not answer cannot keep
   the router busy for this tile. WG_RETRY_MS when the object went away
   under an open page */
var WG_SLOW_MS = 1000;
var WG_RETRY_MS = 60 * 1000;
/* the answers that say the call is not there for this login: no such
   object (the package is not installed) or method, or access denied */
var WG_ABSENT = /ubus code [346]\b|error -3200[02]\b/;
var WG_PEERS = 5;                     /* peers a tunnel lists before "+n more" */
/* Provider tiles (#129): tiles another package fills with data, never
   with markup or script. A provider is the ubus object vantage.tile.<id>
   (id: a-z, 1-7 letters) of that package, with one method, status, which
   takes nothing and answers what model.tile reads. No group of the
   dashboard grants it: the provider's package ships an rpcd ACL group of
   its own, and a login has the tile only where that group gives it the
   call by name. Which ones it has, the page reads once from rpcd: the
   session's own ACL (askTiles). A provider is asked with the slow part
   of the poll, in a request of its own, and the poll waits for it
   TILE_WAIT_MS at most; an answer that took over TILE_SLOW_MS makes the
   next wait ten times as long (slowWait), as LuCI's WireGuard status
   does: a provider answers inside rpcd, which answers nothing else
   meanwhile */
var TILE_OBJ = /^vantage\.tile\.[a-z]{1,7}$/;
var TILE_WAIT_MS = 2 * 1000;
var TILE_SLOW_MS = 500;
/* a provider gone under an open page is asked once a minute; its last
   answer stands that long after a call that failed */
var TILE_RETRY_MS = 60 * 1000;
var STORE_KEY = 'vantage.hist.v1';
var VERSION = '1.2.1';                /* this package's, as its Makefile has it (tests/version.test.js) */
var SVGNS = 'http://www.w3.org/2000/svg';
var HOSTAPD_OBJ = /^[A-Za-z0-9_.-]{1,64}$/;

var callBoard = rpc.declare({ object: 'system', method: 'board' });
var callInfo = rpc.declare({ object: 'system', method: 'info' });
var callRead = rpc.declare({ object: 'file', method: 'read', params: [ 'path' ], expect: { data: '' } });
var callIfDump = rpc.declare({ object: 'network.interface', method: 'dump', expect: { 'interface': [] } });
var callDevs = rpc.declare({ object: 'network.device', method: 'status', expect: { '': {} } });
var callDev = rpc.declare({ object: 'network.device', method: 'status', params: [ 'name' ], expect: { '': {} } });
/* luci.vantage is the app's own rpcd ucode plugin: network.wireless status
   without keys or RADIUS secrets, and the validated alias write */
var callWifi = rpc.declare({ object: 'luci.vantage', method: 'wireless', expect: { '': {} } });
var callThermal = rpc.declare({ object: 'luci.vantage', method: 'thermal', expect: { zones: [] } });
/* { hosts, crowded, switches }: crowded when a bridge holds too many
   entries to list; switches, the swconfig switch ports behind a port */
var callWired = rpc.declare({ object: 'luci.vantage', method: 'wired', expect: { '': {} } });
/* the route the kernel takes to the internet: which one it kept of two
   with one metric; { routes: null } when it could not be asked */
var callRoutes = rpc.declare({ object: 'luci.vantage', method: 'routes', expect: { '': {} } });
/* the paired access points as the collector service last read them;
   fails when none is paired (no object) or the ACL lacks it. In a request
   of its own (nobatch): LuCI sends the calls of one moment as one request
   and answers them together, so a collector that does not answer would
   hold back every other reply of the poll */
var callCollector = rpc.declare({ object: 'vantage.collector', method: 'report', expect: { '': {} }, nobatch: true });
/* luci-app-vantage-traffic's plugin (experimental, #110): the bytes from
   and to each host as this router's connection tracking counts them, by
   MAC, one read shared by every caller. No group of the dashboard grants
   it: the package's own does, so only a login that holds that one asks
   (canTraffic, looked up once a page). It takes no argument. In a request
   of its own (nobatch), never waited for (takeTraffic): rpcd runs the
   plugin as a process, and a read of a large table takes it a second or
   two. A failed call rejects (reject), so that one that says the plugin
   is not there (WG_ABSENT) is told from its empty answer ({}: no read
   yet); then it is asked again only TRAFFIC_RETRY_MS later */
var callTraffic = rpc.declare({ object: 'luci.vantage.traffic', method: 'hosts', expect: { '': {} }, reject: true, nobatch: true });
var TRAFFIC_RETRY_MS = 60 * 1000;
/* the byte counters a DSA switch chip keeps for its ports, which count
   what it forwards from port to port too (#156): the app's executable
   rpcd plugin, which runs ethtool once a port in a process of its own.
   It takes no argument. In a request of its own (nobatch), so that its
   runs hold back no other reply of the poll; a failed call is rejected,
   so that no object is told from an answer */
var callSwitchCounters = rpc.declare({ object: 'luci.vantage.ports', method: 'counters', expect: { '': {} }, reject: true, nobatch: true });
/* LuCI's own (luci-proto-wireguard's rpcd plugin, its status page's
   call): every WireGuard interface with its peers, without private or
   preshared keys; it takes no argument and writes nothing. No group of
   the dashboard grants it: LuCI's group for it does, so only a login
   that holds that one is answered (askWireguard). A failed call is
   rejected: {} would read as no tunnels */
var callWireguard = rpc.declare({ object: 'luci.wireguard', method: 'getWgInstances', expect: { '': {} }, reject: true });
/* LuCI's own (its switch page's): link and speed of a switch's ports, in
   result. The whole reply, and a failed call rejected: a default [] would
   read as every port down */
var callSwitchPorts = rpc.declare({ object: 'luci', method: 'getSwconfigPortState', params: [ 'switch' ], expect: { '': {} }, reject: true });
var callHints = rpc.declare({ object: 'luci-rpc', method: 'getHostHints', expect: { '': {} } });
var callIwInfo = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ], expect: { '': {} } });
var callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });
/* the channels' survey: the noise floor of the radio's own (model.js
   surveyNoise); null when the call fails. The plugin's, read through
   nl80211, not iwinfo's: rpcd's iwinfo survey crashes rpcd on every
   iwinfo backend but nl80211's (MediaTek's mtwifi in the mt798x builds,
   #124) */
var callSurvey = rpc.declare({ object: 'luci.vantage', method: 'survey', params: [ 'device' ], expect: { results: [] } });
var callRrdns = rpc.declare({ object: 'network.rrdns', method: 'lookup', params: [ 'addrs', 'timeout', 'limit' ], expect: { '': {} } });
var callMdns = rpc.declare({ object: 'umdns', method: 'hosts' });
var callUciGet = rpc.declare({ object: 'uci', method: 'get', params: [ 'config' ], expect: { values: {} } });
var callSetAlias = rpc.declare({ object: 'luci.vantage', method: 'set_alias', params: [ 'mac', 'name', 'icon' ] });
var callSetQuiet = rpc.declare({ object: 'luci.vantage', method: 'set_quiet', params: [ 'mac', 'quiet' ] });
var callAccess = rpc.declare({ object: 'session', method: 'access', params: [ 'scope', 'object', 'function' ], expect: { access: false } });
/* the session's own ACL as rpcd keeps it: session access without an
   object and a function answers all of it, { scope: { object: [ method ]
   } } (the call LuCI's dispatcher makes for every request). Read once a
   page (again only after a read that failed), for the providers this
   login may ask (tileIds), and for nothing else */
var callAcls = rpc.declare({ object: 'session', method: 'access', expect: { '': {} } });

var hostapdCalls = {};
function hostapd(ifname, method) {
	var obj = 'hostapd.' + ifname, key = obj + ' ' + method;
	if (!HOSTAPD_OBJ.test(obj)) return Promise.resolve(null);
	if (!hostapdCalls[key]) hostapdCalls[key] = rpc.declare({ object: obj, method: method, expect: { '': {} } });
	return L.resolveDefault(hostapdCalls[key](), null);
}

/* A provider's status call: its object made from an id of the session's
   ACL (tileIds) and checked again (TILE_OBJ.test(obj)), its one method, no
   parameters. A request of its own (nobatch): LuCI answers the calls of
   one request together, and a slow provider would hold back every other
   reply of the poll. A failed call is rejected: {} would be an answer */
var tileCalls = {};
function tileCall(id) {
	var obj = 'vantage.tile.' + id;
	if (!TILE_OBJ.test(obj)) return Promise.reject(new Error('not a provider'));
	if (!tileCalls[obj]) tileCalls[obj] = rpc.declare({ object: obj, method: 'status', expect: { '': {} }, reject: true, nobatch: true });
	return tileCalls[obj]();
}

/* The providers a session's ACL (session access without an object)
   lets it ask: the objects of its ubus part named vantage.tile.<id>
   exactly, granted status by name (an object glob names no provider),
   the first layout.EXTRA_MAX by id. Nothing else of the answer is read */
function tileIds(acl) {
	var ubus = acl && typeof acl === 'object' && !Array.isArray(acl) ? acl.ubus : null, out = [];
	if (!ubus || typeof ubus !== 'object' || Array.isArray(ubus)) return out;
	Object.keys(ubus).forEach(function(obj) {
		if (TILE_OBJ.test(obj) && Array.isArray(ubus[obj]) && ubus[obj].indexOf('status') >= 0) out.push(obj.slice(13));
	});
	return out.sort().slice(0, layout.EXTRA_MAX);
}

/* the wait after a call that took `took` ms, where over `slow` ms is
   slow: ten times as long, SLOW_WAIT_MAX_MS at most; none for one
   measured longer than a request can take (REQUEST_MAX_MS) */
function slowWait(took, slow) {
	return took > slow && took <= REQUEST_MAX_MS ? Math.min(10 * took, SLOW_WAIT_MAX_MS) : 0;
}

/* versioned as LuCI versions its scripts (LuCI's version and the time
   packages last changed, from its script tag): kept by the browser until
   a package changes, so the new view never meets a cached app.css */
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

function reducedMotion() {
	return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* an animation's iteration length in ms, 0 when unknown */
function pulseDuration(a) {
	var tm = a.effect && typeof a.effect.getTiming === 'function' ? a.effect.getTiming() : null;
	return tm && typeof tm.duration === 'number' && tm.duration > 0 ? tm.duration : 0;
}

/* is a the CSS animation an animation event (ev) is for: the same
   element, pseudo-element and name */
function pulseOf(a, ev) {
	var e = a && a.effect;
	return !!e && e.target === ev.target && (e.pseudoElement || '') === (ev.pseudoElement || '') && a.animationName === ev.animationName;
}

/* a paused animation dt ms on. The time is kept here (x.at), never read
   back: reading a CSS animation's currentTime makes the browser bring
   the style up to date first, once per animation. An endless one is kept
   within one iteration (the same phase, so the numbers never grow) */
function stepAnim(x, dt) {
	var t = (x.at || 0) + dt;
	if (x.dur > 0 && t >= x.dur) t -= Math.floor(t / x.dur) * x.dur;
	x.at = t;
	x.a.currentTime = t;
}

/* is the page rendered by the Vantage theme (L.env.media '/luci-static/vantage')? */
/* the media path of the Vantage theme ('/luci-static/vantage'). Not a
   literal after `return`, and no slash-star in it: LuCI's jsmin takes
   both for a division and a comment, and the minified view stops parsing */
var VANTAGE_MEDIA = /(^|[/])vantage[/]*$/;
function vantageTheme() {
	var media = L.env.media || '';
	return VANTAGE_MEDIA.test(media);
}

/* ------------------------------------------------------------- SVG kit */

var ICONS = {
	filter: [ 'M4 5.5h16l-6.2 7.3v5.2l-3.6 1.8v-7Z' ],
	globe: [ 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z', 'M3.4 9.2h17.2M3.4 14.8h17.2', 'M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9Z' ],
	ap: [ 'M4.5 15h15a1.5 1.5 0 0 1 1.5 1.5v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-1.5A1.5 1.5 0 0 1 4.5 15Z', 'M7 17.25h.01', 'M8.6 10.6a4.8 4.8 0 0 1 6.8 0', 'M6.1 8.1a8.4 8.4 0 0 1 11.8 0', 'M11.3 12.9a1 1 0 0 1 1.4 0' ],
	radio: [ 'M12 12.5v8', 'M8.5 20.5h7', 'M9.2 8.7a4 4 0 0 0 0 5.6', 'M14.8 8.7a4 4 0 0 1 0 5.6', 'M6.4 5.9a8 8 0 0 0 0 11.2', 'M17.6 5.9a8 8 0 0 1 0 11.2', 'M12 10.3a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4Z' ],
	wifi: [ 'M3.3 9.4a12.3 12.3 0 0 1 17.4 0', 'M6.3 12.4a8 8 0 0 1 11.4 0', 'M9.3 15.4a3.8 3.8 0 0 1 5.4 0', 'M12 18.6h.01' ],
	cpu: [ 'M7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6Z', 'M10 10h4v4h-4z', 'M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3' ],
	memory: [ 'M4 7.5h16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', 'M7 16.5v2.5M11 16.5v2.5M15 16.5v2.5M19 16.5v2.5', 'M6.5 10.5h3v3h-3zM10.5 10.5h3v3h-3zM14.5 10.5h3v3h-3z' ],
	disk: [ 'M4.5 6.5c0-1.4 3.4-2.5 7.5-2.5s7.5 1.1 7.5 2.5v11c0 1.4-3.4 2.5-7.5 2.5s-7.5-1.1-7.5-2.5z', 'M4.5 6.5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5', 'M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5' ],
	/* an Ethernet jack, front on */
	port: [ 'M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3v2.5h-8V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z', 'M8 9v2.5M10.67 9v2.5M13.33 9v2.5M16 9v2.5' ],
	signal: [ 'M5 19.5v-3', 'M9.5 19.5v-6.5', 'M14 19.5v-10', 'M18.5 19.5v-14' ],
	down: [ 'M12 5v14', 'M6.5 13.5 12 19l5.5-5.5' ],
	up: [ 'M12 19V5', 'M6.5 10.5 12 5l5.5 5.5' ],
	close: [ 'M6.5 6.5l11 11M17.5 6.5l-11 11' ],
	search: [ 'M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z', 'M15 15l4.5 4.5' ],
	chevron: [ 'M9.5 6l6 6-6 6' ],
	check: [ 'M5 12.5l4.5 4.5L19 7.5' ],
	warn: [ 'M10.3 4.6 3 17.5A2 2 0 0 0 4.7 20.5h14.6A2 2 0 0 0 21 17.5L13.7 4.6a2 2 0 0 0-3.4 0Z', 'M12 9.5v4.5', 'M12 17h.01' ],
	err: [ 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z', 'M9 9l6 6M15 9l-6 6' ],
	info: [ 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z', 'M12 11v5.5', 'M12 7.8h.01' ],
	pencil: [ 'M4.5 19.5h4l10-10-4-4-10 10z', 'M13 7l4 4' ],
	lock: [ 'M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' ],
	unlock: [ 'M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2' ],
	users: [ 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7Z', 'M2.5 20c.8-3.4 3.3-5.5 6.5-5.5s5.7 2.1 6.5 5.5', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14.8c1.8.8 3 2.6 3.5 5.2' ],
	pulse: [ 'M3 12h4l2.5-6 5 12 2.5-6H21' ],
	phone: [ 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3Z', 'M11 18h2' ],
	laptop: [ 'M5.5 5.5h13a1 1 0 0 1 1 1v8.5h-15V6.5a1 1 0 0 1 1-1Z', 'M2.5 18.5h19l-1.5-3.5h-16z' ],
	tablet: [ 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z', 'M11 18h2' ],
	desktop: [ 'M4.5 4.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z', 'M9 20h6', 'M12 15.5V20' ],
	tv: [ 'M4 6h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', 'M8 20.5h8' ],
	speaker: [ 'M7.5 3h9A1.5 1.5 0 0 1 18 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3Z', 'M12 7h.01', 'M12 11a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z' ],
	printer: [ 'M7 8V3.5h10V8', 'M7 16.5H4.5A1.5 1.5 0 0 1 3 15V9.5A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5V15a1.5 1.5 0 0 1-1.5 1.5H17', 'M7 13h10v7.5H7z' ],
	camera: [ 'M4.5 7.5h3l1.5-2h6l1.5 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z', 'M12 10a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4Z' ],
	console: [ 'M7.5 8h9a4.5 4.5 0 0 1 4.5 4.5v.5a3.5 3.5 0 0 1-6.3 2.1L14 14h-4l-.7 1.1A3.5 3.5 0 0 1 3 13v-.5A4.5 4.5 0 0 1 7.5 8Z', 'M7.5 10.5v3M6 12h3', 'M15.5 11.5h.01M17.5 13h.01' ],
	watch: [ 'M8.5 6h7A1.5 1.5 0 0 1 17 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-9A1.5 1.5 0 0 1 8.5 6Z', 'M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3' ],
	iot: [ 'M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z' ],
	router: [ 'M4.5 13h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z', 'M7 16h.01M10 16h.01', 'M8 13 6 6.5M16 13l2-6.5' ],
	device: [ 'M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z', 'M10 17.5h4', 'M9 7.5h6' ],
	layout: [ 'M4.5 4.5h6v7h-6zM13.5 4.5h6v4h-6zM13.5 11.5h6v8h-6zM4.5 14.5h6v5h-6z' ],
	grip: [ 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01' ],
	left: [ 'M14.5 6l-6 6 6 6' ],
	plus: [ 'M12 5.5v13M5.5 12h13' ],
	minus: [ 'M5.5 12h13' ],
	hide: [ 'M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z', 'M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z', 'M4.5 19.5l15-15' ]
};

function svgRoot(cls, viewBox) {
	var s = document.createElementNS(SVGNS, 'svg');
	s.setAttribute('class', cls);
	s.setAttribute('viewBox', viewBox);
	s.setAttribute('aria-hidden', 'true');
	s.setAttribute('focusable', 'false');
	return s;
}

function svgPath(d, cls) {
	var p = document.createElementNS(SVGNS, 'path');
	p.setAttribute('d', d);
	if (cls) p.setAttribute('class', cls);
	return p;
}

function svgRect(x, y, w, h, rx, cls) {
	var r = document.createElementNS(SVGNS, 'rect');
	r.setAttribute('x', String(x));
	r.setAttribute('y', String(y));
	r.setAttribute('width', String(w));
	r.setAttribute('height', String(h));
	r.setAttribute('rx', String(rx));
	if (cls) r.setAttribute('class', cls);
	return r;
}

function icon(name, cls) {
	var s = svgRoot('vt-ico' + (cls ? ' ' + cls : ''), '0 0 24 24');
	var list = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : ICONS.device;
	list.forEach(function(d) { s.appendChild(svgPath(d)); });
	return s;
}

/* four rising bars, `bars` of them lit, coloured by level */
function signalGlyph(sig) {
	var s = svgRoot('vt-sig vt-lvl-' + sig.level, '0 0 20 16');
	for (var i = 0; i < 4; i++)
		s.appendChild(svgRect(1 + i * 5, 12 - i * 3.5, 3.4, 3 + i * 3.5, 1, i < sig.bars ? 'vt-sig-on' : 'vt-sig-off'));
	return s;
}

/* vertical fade for area fills: the series colour (--vt-sc) at the
   chart fill opacity at the top, transparent at the baseline (flip: an
   area hanging down from its baseline). cls goes on the gradient, which
   takes --vt-sc from where it sits, not from the area using it. Returns
   the paint reference for the fill attribute. */
var gradSeq = 0;
function fadeFill(svg, flip, cls) {
	var id = 'vt-fade-' + (++gradSeq);
	var defs = document.createElementNS(SVGNS, 'defs');
	var lg = document.createElementNS(SVGNS, 'linearGradient');
	lg.setAttribute('id', id);
	if (cls) lg.setAttribute('class', cls);
	lg.setAttribute('x1', '0'); lg.setAttribute('y1', flip ? '1' : '0');
	lg.setAttribute('x2', '0'); lg.setAttribute('y2', flip ? '0' : '1');
	[ [ '0', 'vt-fade-top' ], [ '1', 'vt-fade-end' ] ].forEach(function(st) {
		var stop = document.createElementNS(SVGNS, 'stop');
		stop.setAttribute('offset', st[0]);
		stop.setAttribute('class', st[1]);
		lg.appendChild(stop);
	});
	defs.appendChild(lg);
	svg.appendChild(defs);
	return 'url(#' + id + ')';
}

/* throughput direction: the same colour in every row, the legend, the
   readouts and the tooltip ('dn' download, 'up' upload) */
function dirKey(dir) { return E('span', { 'class': 'vt-lg-key vt-k-' + dir }); }
function dirArrow(dir) { return E('span', { 'class': 'vt-arr vt-arr-' + dir }, [ dir === 'up' ? '↑' : '↓' ]); }

function pos(el, xPct, yPct) {
	el.style.left = Math.max(0, Math.min(100, xPct)).toFixed(2) + '%';
	el.style.top = Math.max(0, Math.min(100, yPct)).toFixed(2) + '%';
	return el;
}

/* Compact chart in the dashboard's chart language: the first column as a
   line over a fading area, a second column as a faint dashed line, a
   marker on the newest value, a faint top grid line and (opts.scale) the
   axis maximum with its unit. Before a minute of history the data is
   drawn from the right edge. opts: { min: axis floor, scale: fn(max),
   ceil: fn(v) rounding the maximum up (series.niceCeil unless given),
   thresh: value for a dashed reference line, threshLabel, quiet: no
   'collecting…' note before there is a line, bare: the line and its
   area only (no grid, baseline or end marker) } */
function sparkline(data, cols, vmax, cls, opts) {
	opts = opts || {};
	var W = 100, H = 26;
	var wrap = E('div', { 'class': 'vt-sk' + (cls ? ' ' + cls : '') });
	var s = svgRoot('vt-spark', '0 0 ' + W + ' ' + H);
	s.setAttribute('preserveAspectRatio', 'none');
	wrap.appendChild(s);
	if (!opts.bare) {
		s.appendChild(svgPath('M0 0H' + W, 'vt-spark-grid'));
		s.appendChild(svgPath('M0 ' + H + 'H' + W, 'vt-spark-base'));
	}
	if (!data || data.length < 2) {
		wrap.classList.add('vt-sk-empty');
		if (!opts.quiet) wrap.appendChild(E('span', { 'class': 'vt-sk-note' }, [ _('collecting…') ]));
		return wrap;
	}
	/* bare (a card's edge): whatever history there is, across the width,
	   with headroom so a steady rate doesn't run along the top */
	var t1 = data[data.length - 1][0], t0 = opts.bare ? data[0][0] : Math.min(data[0][0], t1 - 60000);
	var max = vmax > 0 ? vmax : opts.bare ? Math.max(series.max(data, cols) * 1.35, opts.min || 0)
		: (opts.ceil || series.niceCeil)(Math.max(series.max(data, cols) * 1.05, opts.min || 0));
	if (opts.thresh != null) {
		var ty = H - Math.max(0, Math.min(1, opts.thresh / max)) * H;
		s.appendChild(svgPath('M0 ' + ty.toFixed(1) + 'H' + W, 'vt-spark-thresh'));
		if (opts.threshLabel) wrap.appendChild(pos(E('span', { 'class': 'vt-sk-thresh' }, [ opts.threshLabel ]), 100, ty / H * 100));
	}
	cols.slice().reverse().forEach(function(ci) {
		var k = cols.indexOf(ci);
		var segs = series.segments(data, ci, t0, t1, max, W, H, gapMs());
		var g = document.createElementNS(SVGNS, 'g');
		g.setAttribute('class', 'vt-spark-s' + k);
		if (k === 0) {
			var area = svgPath(series.areaPath(segs, H), 'vt-spark-area');
			area.setAttribute('fill', fadeFill(s));
			g.appendChild(area);
		}
		g.appendChild(svgPath(series.linePath(segs), 'vt-spark-line'));
		s.appendChild(g);
		if (k === 0) {
			var last = segs.length ? segs[segs.length - 1] : null, pt = last && last[last.length - 1];
			if (pt && !opts.bare) wrap.appendChild(pos(E('span', { 'class': 'vt-sk-dot' }), pt[0] / W * 100, pt[1] / H * 100));
		}
	});
	if (opts.scale) wrap.appendChild(E('span', { 'class': 'vt-sk-max vt-tn' }, [ opts.scale(max) ]));
	return wrap;
}

/* a thin bar filled to pct, in the warning colours at warn and err */
function fillBar(pct, level) {
	var f = E('span', { 'class': 'vt-bar-fill' + (level === 'err' ? ' vt-bg-err' : level === 'warn' ? ' vt-bg-warn' : '') });
	setW(f, Math.max(+pct || 0, 0.8));
	return E('span', { 'class': 'vt-bar vt-chip-bar' }, [ f ]);
}

/* each health check's own icon (insight.health ids) */
var CHECK_ICONS = { uplink: 'port', cpu: 'cpu', memory: 'memory', radios: 'wifi', signal: 'signal', storage: 'disk' };

/* -------------------------------------------------------------- helpers */

/* text writes only when the text changes: an unchanged poll leaves the
   node, and its layout, alone */
function txt(el, s) { s = (s == null ? '' : String(s)); if (el.textContent !== s) el.textContent = s; return el; }
function setClass(el, c) { if (el.getAttribute('class') !== c) el.setAttribute('class', c); }
/* a line of the compact path (paintLine) puts its full name, which its
   cell may cut, above what the node's tooltip says, unless that names it */
function setTitle(el, v) {
	if (el.vtTip != null) { el.vtTitle = v; if (el.vtTip && String(v || '').indexOf(el.vtTip) < 0) v = el.vtTip + (v ? '\n' + v : ''); }
	if (el.getAttribute('title') !== v) el.setAttribute('title', v);
}
/* a line's own IPv4 address, without its prefix length */
function lineAddr(x) { return x && x.ipv4 && x.ipv4[0] ? String(x.ipv4[0]).split('/')[0] : null; }
/* the address this device has on its own network: lan's; without a
   network of that name, that of the one its SSIDs and wired hosts are on
   (a LAN by another name, beside a container bridge); else that of the
   first network that is up */
function lanAddr(nets, m) {
	var with4 = (nets || []).filter(function(n) { return n && n.ipv4; }), on = Object.create(null);
	function add(name, k) { if (typeof name === 'string') on[name] = (on[name] || 0) + k; }
	((m && m.wiredHosts) || []).forEach(function(h) { if (h) add(h.network, 1); });
	((m && m.ssids) || []).forEach(function(s) { ((s && s.networks) || []).forEach(function(n) { add(n, 1 + (s.clients > 0 ? s.clients : 0)); }); });
	var up = with4.filter(function(n) { return n.up; }), most = null;
	up.forEach(function(n) { if (on[n.name] > 0 && (!most || on[n.name] > on[most.name])) most = n; });
	var n = with4.filter(function(n) { return n.name === 'lan'; })[0] || most || up[0];
	return n ? String(n.ipv4).split('/')[0] : null;
}
/* the throughput history of a line to the internet, the main one too,
   by its interface: a failover starts the new main line's own history
   instead of continuing the old one's. ':' keeps it apart from a radio's
   (a uci section name). */
function lineKey(x) { return 'up:' + x.iface; }
function histMax(key) { return key.indexOf('up:') === 0 ? HIST_FAST : HIST_MAX; }

/* an element's own tag and attributes, or a text node's text */
function nodeSig(n) {
	if (n.nodeType !== 1) return n.nodeType + '"' + n.data;
	return '<' + n.tagName + n.getAttributeNames().map(function(a) { return ' ' + a + '=' + n.getAttribute(a); }).join('');
}

/* what a freshly built subtree would show (tags, attributes, text), so a
   poll can keep the nodes it would only rebuild identically */
function treeSig(nodes) {
	var out = [];
	(function walk(list) {
		Array.prototype.forEach.call(list, function(n) {
			if (n == null || typeof n !== 'object') return;
			out.push(nodeSig(n));
			if (n.nodeType === 1) { walk(n.childNodes); out.push('>'); }
		});
	})(nodes);
	return out.join('\n');
}

/* put freshly built nodes (Nodes only) into parent, keeping every old
   subtree that would come out the same and descending into elements whose
   own tag and attributes did not change: a poll that moves one sparkline
   replaces that sparkline, not the card around it. Old elements keep their
   listeners, so whatever a handler acts on must show in an attribute. */
function patch(parent, nodes) {
	nodes = nodes.filter(function(n) { return n != null && n !== ''; }).map(function(n) { return typeof n === 'object' ? n : document.createTextNode(String(n)); });
	var old = parent.childNodes;
	if (old.length !== nodes.length) {
		while (parent.firstChild) parent.removeChild(parent.firstChild);
		nodes.forEach(function(n) { parent.appendChild(n); });
		return;
	}
	nodes.slice().forEach(function(n, i) {
		var o = old[i];
		if (nodeSig(o) !== nodeSig(n)) parent.replaceChild(n, o);
		else if (o.nodeType === 1) patch(o, Array.prototype.slice.call(n.childNodes));
	});
}
function setW(el, pct) { var w = Math.max(0, Math.min(100, +pct || 0)).toFixed(2) + '%'; if (el.style.width !== w) el.style.width = w; }
function hueOf(mac) {
	var h = 0, s = String(mac || '');
	for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
	return h;
}

function avatar(c, small) {
	var el = E('span', { 'class': 'vt-av' + (small ? ' vt-av-sm' : '') + (c.gone || c.offline ? ' vt-av-gone' : '') }, [ icon(c.icon || 'device') ]);
	el.style.setProperty('--vt-h', hueOf(c.mac).toFixed(0));
	return el;
}

/* a client named after its address (vendor, private or MAC fallback,
   names.resolve): plainName is the name without the MAC's octets */
function madeName(c) { return !!c.plainName && c.plainName !== c.name; }

function bandBadge(band, label) {
	return E('span', { 'class': 'vt-band vt-band-' + (band || 'x') }, [ label || wifi.bandLabel(band) ]);
}

function pill(text, tone, title) {
	var el = E('span', { 'class': 'vt-pill vt-pill-' + (tone || 'muted') }, [ text ]);
	if (title) el.setAttribute('title', title);
	return el;
}

/* a pill naming a paired access point: a name up to 63 characters is cut (app.css) */
function apPill(text, title) {
	var el = pill(text, 'muted', title);
	el.classList.add('vt-pill-ap');
	return el;
}

function rateLine(down, up, cls) {
	return E('span', { 'class': 'vt-rates' + (cls ? ' ' + cls : '') }, [
		E('span', { 'class': 'vt-rate vt-rate-down', 'title': _('Download (to clients)') }, [ icon('down'), fmt.bits(down) ]),
		E('span', { 'class': 'vt-rate vt-rate-up', 'title': _('Upload (from clients)') }, [ icon('up'), fmt.bits(up) ])
	]);
}

/* a rate in few characters, so columns fit every card alike: 176, 62.2k,
   3.42M (bit/s, or B/s where the traffic reads in bytes) */
function shortBits(bps) {
	var u = [ '', 'k', 'M', 'G' ], i = 0;
	bps /= rateUnit();
	while (bps >= 1000 && i < u.length - 1) { bps /= 1000; i++; }
	return (i ? (bps >= 100 ? bps.toFixed(0) : bps >= 10 ? bps.toFixed(1) : bps.toFixed(2)) : bps.toFixed(0)) + u[i];
}

/* several rates ({ rx, tx } or null) added up; null when none is known */
function sumRates(list) {
	return list.reduce(function(out, r) { return r ? { rx: (out ? out.rx : 0) + r.rx, tx: (out ? out.tx : 0) + r.tx } : out; }, null);
}

/* a switch VLAN's ports, a line each: "LAN 2 · 2.5 Gbit/s" (model.switchOf) */
function switchLines(sw) {
	return sw.ports.map(function(p) {
		return p.label + ' · ' + (p.link === null ? fmt.DASH : !p.link ? _('down') : p.speed ? fmt.phyRate(p.speed.mbps * 1000) : _('link up'));
	});
}

function switchNote(sw) {
	return _('Switch ports of VLAN %d on %s: %s').format(sw.vlan, sw.name, switchLines(sw).join(', '));
}

function kv(label, value, mono) {
	return E('div', { 'class': 'vt-kv' }, [
		E('dt', {}, [ label ]),
		E('dd', { 'class': mono ? 'vt-mono' : '' }, [].concat(value == null || value === '' ? fmt.DASH : value))
	]);
}

/* the other paired access points that list an entry too (the model's
   ap.also and behind.also), for its details only: their names, as text */
function alsoLine(x) {
	var l = x && Array.isArray(x.also) ? x.also : [];
	return l.length ? E('small', {}, [ _('Also reported by %s').format(l.map(function(a) { return a.name; }).join(', ')) ]) : '';
}

function tileHead(ic, title, extra) {
	return E('header', { 'class': 'vt-tile-head' }, [
		E('h3', { 'class': 'vt-tile-title' }, [ icon(ic), E('span', {}, [ title ]) ]),
		E('div', { 'class': 'vt-tile-extra' }, extra || [])
	]);
}

/* LuCI's menu tree (loaded with the view): a link to a page this device
   lacks (Mount Points without block-mount) would only reach a 404. LuCI
   keeps such pages in the tree with satisfied false and hides them, as
   ui.menu.getChildren does; so every step of the path must be satisfied */
var menuTree = null;
function hasPage(page) {
	if (!menuTree) return true;
	var n = menuTree;
	for (var i = 0; n && i < page.length; i++) {
		n = n.children ? n.children[page[i]] : null;
		if (n && !n.satisfied) return false;
	}
	return !!n;
}

function pageLink(page, label) {
	if (!hasPage(page)) return '';
	return E('a', { 'class': 'vt-link', 'href': L.url.apply(L, page) }, [ E('span', {}, [ label ]), icon('chevron') ]);
}

/* A provider tile's page (model.tile: its menu path, checked steps) where
   this login's menu has it: LuCI's title of it, translated as LuCI's
   menu translates it, to name the link with; null where the menu lacks
   it, does not let this login in or was not loaded */
function menuPage(page) {
	var n = menuTree;
	for (var i = 0; n && i < page.length; i++) {
		n = n.children && Object.prototype.hasOwnProperty.call(n.children, page[i]) ? n.children[page[i]] : null;
		if (n && !n.satisfied) return null;
	}
	return n && n !== menuTree && typeof n.title === 'string' && n.title ? _(n.title) : null;
}

/* A provider tile's value as the dashboard writes it (model.tile's
   units): a number in the dashboard's own formats, a counter as its rate
   (perSec: of the counter's unit, or null before two answers), a text as
   it came */
function tileNum(v) { return Math.abs(v) >= 100 || v % 1 === 0 ? fmt.count(v) : (v < 0 ? '−' : '') + String(+Math.abs(v).toPrecision(3)); }
function tileValue(x, perSec) {
	if (x.text != null) return x.text;
	if (x.rate) return perSec == null ? fmt.DASH : x.unit === 'B' ? fmt.bits(perSec * 8) : _('%s/s').format(tileNum(perSec));
	var v = x.value;
	switch (x.unit) {
	case '%': return fmt.pct(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
	case 'ms': return _('%s ms').format(tileNum(v));
	case 's': return fmt.duration(v);
	/* the forms of fmt.dbm and fmt.mhz, with 0 a value and a fraction cut
	   to three digits: these are another package's numbers */
	case 'dBm': return tileNum(v) + ' ' + _('dBm');
	case 'dB': return _('%s dB').format(tileNum(v));
	case 'MHz': return _('%s MHz').format(tileNum(v));
	case 'B': return fmt.bytes(v);
	case 'bit/s': return fmt.bits(v);
	}
	return tileNum(v);
}
/* the page's values of an item (trend) as a bare line between their
   lowest and their highest: a provider's numbers may all be below zero
   (a level in dBm), where a sparkline's scale starts at 0. One that
   holds still: a line across the middle */
function tileTrend(hist) {
	var lo = Infinity, hi = -Infinity;
	hist.forEach(function(p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
	var span = hi - lo;
	return sparkline(hist.map(function(p) { return [ p[0], span > 0 ? p[1] - lo : 1 ]; }), [ 1 ], span > 0 ? span : 2, 'vt-spark-ext', { quiet: true, bare: true });
}
/* value of max as a thin bar, in the level's colours */
function tileMeter(x) {
	var f = E('span', { 'class': 'vt-bar-fill' + (x.level === 'err' ? ' vt-bg-err' : x.level === 'warn' ? ' vt-bg-warn' : '') });
	setW(f, x.value / x.max * 100);
	return E('span', { 'class': 'vt-bar vt-ext-bar' }, [ f ]);
}

/* LuCI's own landing pages: luci-mod-dashboard's, where the app's menu.d
   file moves it, and Status -> Overview */
var LUCI_DASHBOARD = [ 'admin', 'status', 'dashboard' ];
var LUCI_OVERVIEW = [ 'admin', 'status', 'overview' ];
/* luci-proto-wireguard's status page */
var LUCI_WIREGUARD = [ 'admin', 'status', 'wireguard' ];

/* Is luci-theme-vantage installed? A HEAD for its menu script, a static
   file from the server this view came from: no ACL, nothing new on the
   device. The menu.d depends can't tell: LuCI caches the menu tree and a
   theme switch doesn't renew it. Anything but a script (a 404, an error
   page, no answer) reads as not installed, which keeps the dashboard */
function themeInstalled() {
	return fetch(L.resource('menu-vantage.js'), { method: 'HEAD', cache: 'no-store' }).then(function(r) {
		return r.ok && /javascript/i.test(r.headers.get('Content-Type') || '');
	}).catch(function() { return false; });
}

/* a rate axis is round in the unit its labels show: 8 bits to a step
   where the traffic reads in bytes */
function rateUnit() { return fmt.speedUnits() === 'bytes' ? 8 : 1; }
function rateCeil(v) { var k = rateUnit(); return series.niceCeil(v / k) * k; }

/* axis labels: round numbers without a trailing '.0' ('15 Mbit/s') */
function bitsLabel(v) {
	var p = fmt.bitsParts(v);
	return p.u ? String(+p.v || p.v) + ' ' + p.u : p.v;
}

/* '5 min ago' / '45 s ago' for the left end of a time axis */
function spanAgo(ms) {
	var s = Math.round(ms / 1000);
	return s >= 90 ? _('%d min ago', 'vantage').format(Math.round(s / 60)) : _('%d s ago', 'vantage').format(s);
}

/* '1 min' / '40 s' of collected history */
function spanShort(ms) {
	var s = Math.max(0, Math.round(ms / 1000));
	return s >= 60 ? _('%d min', 'vantage').format(Math.floor(s / 60)) : _('%d s', 'vantage').format(s);
}

/* the history belongs to one login: the next one in this tab starts empty,
   under any theme. Vantage's login page also deletes it (login.js). */
function storeOwner() {
	return String(L.env.sessionid || '').slice(-8);
}

function readStore() {
	try {
		var v = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || 'null');
		return v && (v.sid || '') === storeOwner() ? v : null;
	} catch (e) { return null; }
}

/* the last CPU reading, { pct, cores, t } (t: when, by this browser's
   clock), kept in this browser for every tab of this router (the
   storage is the router's origin's), at most every CPU_SAVE_MS: shown
   for CPU_HOLD_MS while the dashboard's first measurement runs (#101),
   instead of a dash. heldCpu: null when it is malformed or older */
var CPU_KEY = 'vantage.cpu.v1';
var CPU_HOLD_MS = 10 * 60 * 1000;
var CPU_SAVE_MS = 10 * 1000;
/* the first reading takes two samples a second apart (model.cpuUsage):
   the second is asked this long after the first, not at the lane's
   next tick */
var CPU_FIRST_MS = 1100;
function readCpu() {
	try { return JSON.parse(window.localStorage.getItem(CPU_KEY) || 'null'); } catch (e) { return null; }
}
function writeCpu(v) {
	try { window.localStorage.setItem(CPU_KEY, JSON.stringify(v)); } catch (e) {}
}
function heldCpu(v, now) {
	var pct = function(x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x <= 100; };
	if (!v || typeof v !== 'object' || !pct(v.pct) || !Array.isArray(v.cores) || v.cores.length > 256 ||
	    !v.cores.every(function(c) { return c === null || pct(c); }) || typeof v.t !== 'number' || !(now - v.t >= 0 && now - v.t < CPU_HOLD_MS)) return null;
	return { pct: v.pct, cores: v.cores.slice(), t: v.t };
}

function writeStore(v) {
	try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) {}
}

/* "What's new", once after an upgrade: this browser keeps the dashboard's
   version as it last saw it (localStorage; a version number is nothing
   private). A first visit keeps it and shows nothing. A later one that
   finds another version kept shows one line above the head, "Vantage
   1.1.0: what's new", at every load until it is closed or its link is
   followed; either keeps this version. Nothing is asked of anyone for
   it: the link is a constant, to the changelog as tagged for this
   version, where its section is the first (the heading's own anchor has
   the release date in it). It is written out, as no URL is put together
   from parts here (check_dom_sinks.js), and so is bumped with VERSION:
   tests/view.test.js holds the two together. A version is two to four
   dotted numbers, this one and the kept one alike: anything else kept
   counts as nothing kept, and with a VERSION of another form there is
   no line. */
var NEWS_URL = 'https://github.com/anothaDev/luci-theme-vantage/blob/v1.2.1/CHANGELOG.md';
var SEEN_KEY = 'vantage.seen.v1';
var VERSION_FORM = /^\d{1,4}(\.\d{1,4}){1,3}$/;

function readSeen() {
	var v = null;
	try { v = window.localStorage.getItem(SEEN_KEY); } catch (e) { v = null; }
	return typeof v === 'string' && VERSION_FORM.test(v) ? v : null;
}

function writeSeen(v) {
	try { window.localStorage.setItem(SEEN_KEY, v); } catch (e) {}
}

/* is the line due? A first visit, or a browser that keeps nothing (no
   storage: it would be a first visit every time), only notes the version */
function newsDue() {
	if (!VERSION_FORM.test(VERSION)) return false;
	var seen = readSeen();
	if (seen === null) writeSeen(VERSION);
	return seen !== null && seen !== VERSION;
}

/* Sections that fold on narrow screens; the choice is remembered per
   browser. The radios start condensed; the network path starts open
   (since 1.0.15: v1 kept it folded, so its other
   choices carry over without that one). */
var FOLD_KEY = 'vantage.fold.v2';
var FOLD_KEY_V1 = 'vantage.fold.v1';
var FOLD_DEFAULT = { radios: true, hero: false, ssids: false, chart: false, sys: false };

function readFolds() {
	var out = Object.assign({}, FOLD_DEFAULT), v = null, old = false;
	try { v = JSON.parse(window.localStorage.getItem(FOLD_KEY) || 'null'); } catch (e) { v = null; }
	if (!v || typeof v !== 'object') {
		try { v = JSON.parse(window.localStorage.getItem(FOLD_KEY_V1) || 'null'); } catch (e) { v = null; }
		old = true;
	}
	if (v && typeof v === 'object')
		Object.keys(FOLD_DEFAULT).forEach(function(k) { if (typeof v[k] === 'boolean' && !(old && k === 'hero')) out[k] = v[k]; });
	return out;
}

function writeFolds(v) {
	try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(v)); } catch (e) {}
}

/* The client table's order, Wi-Fi and wired: by name until a header is
   clicked, and that pick is remembered per browser (#132: by live
   traffic the rows changed places at every poll). */
var SORT_KEY = 'vantage.sort.v1';
var SORT_COLS = { wifi: [ 'name', 'signal', 'ssid', 'rate', 'live', 'exp', 'time' ], wired: [ 'name', 'link', 'net', 'live', 'seen' ] };

function readSorts() {
	var out = { wifi: { key: 'name', dir: 1 }, wired: { key: 'name', dir: 1 } }, v = null;
	try { v = JSON.parse(window.localStorage.getItem(SORT_KEY) || 'null'); } catch (e) { v = null; }
	Object.keys(out).forEach(function(k) {
		var s = v && typeof v === 'object' ? v[k] : null;
		if (s && SORT_COLS[k].indexOf(s.key) >= 0 && (s.dir === 1 || s.dir === -1)) out[k] = { key: s.key, dir: s.dir };
	});
	return out;
}

function writeSorts(v) {
	try { window.localStorage.setItem(SORT_KEY, JSON.stringify(v)); } catch (e) {}
}

/* What the Vantage theme's template hands over (data-vt-look-*): under it
   the router keeps the layouts and the chart style with the Appearance */
function lookAttr(name) {
	var root = typeof document !== 'undefined' ? document.documentElement : null;
	return (root && root.getAttribute ? root.getAttribute(name) : null) || '';
}

function lookSaves() { return lookAttr('data-vt-look-save') === 'yes'; }

/* What Customize changed and the router doesn't have yet, as the options
   it's saved in. Kept across a failed save or a reload, so Done sends
   this and nothing else: a browser's earlier picks stay its own until
   someone changes them. */
var UNSAVED_KEY = 'vantage.view.unsaved';

function readUnsaved() {
	var v = null;
	try { v = JSON.parse(window.localStorage.getItem(UNSAVED_KEY) || 'null'); } catch (e) { v = null; }
	return Array.isArray(v) ? v.filter(function(k) { return /^(chart|path|layout_(wide|mid|narrow)(_wired)?)$/.test(k); }) : [];
}

function writeUnsaved(list) {
	try {
		if (list.length) window.localStorage.setItem(UNSAVED_KEY, JSON.stringify(list));
		else window.localStorage.removeItem(UNSAVED_KEY);
	} catch (e) {}
}

/* Done hands the theme what changed; true if it took it (a login that may
   save). Without it, or for any other login, it stays in this browser. */
function offerView(values, done) {
	var ev = null;
	try { ev = new CustomEvent('vantage:view-save', { detail: { values: values, done: done }, cancelable: true }); } catch (e) { ev = null; }
	return !!ev && typeof window.dispatchEvent === 'function' && !window.dispatchEvent(ev);
}

/* Tile layouts the viewer arranged, per screen class, this browser's copy
   of them and the router's; vantage.layout validates whatever comes back */
var LAYOUT_KEY = 'vantage.layout.v1';

function readLayouts() {
	var v = null;
	try { v = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (e) { v = null; }
	var out = Object.create(null);
	if (v && typeof v === 'object' && !Array.isArray(v))
		Object.keys(v).forEach(function(k) { if (/^(wide|mid|narrow)(-wired)?$/.test(k) && Array.isArray(v[k])) out[k] = v[k]; });
	/* changed here and not saved yet: this browser's stands, until Done sends it */
	var saved = layout.decode(lookAttr('data-vt-look-layout')), unsaved = readUnsaved();
	Object.keys(saved).forEach(function(k) { if (unsaved.indexOf(layout.option(k)) >= 0) delete saved[k]; });
	return layout.merge(out, saved, lookSaves());
}

/* a login that can't save follows the router: what is the router's isn't
   this browser's to keep */
function writeLayouts(v) {
	var saved = lookSaves() ? null : layout.decode(lookAttr('data-vt-look-layout')), out = {};
	Object.keys(v).forEach(function(k) {
		if (!saved || !saved[k] || layout.encode(saved[k]) !== layout.encode(v[k])) out[k] = v[k];
	});
	try {
		if (Object.keys(out).length) window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
		else window.localStorage.removeItem(LAYOUT_KEY);
	} catch (e) {}
}

/* The throughput chart style the viewer picked (series.CHART_STYLES),
   this browser's copy of it and the router's */
var CHART_KEY = 'vantage.chart.v1';

function readChartStyle() {
	var v = null;
	try { v = window.localStorage.getItem(CHART_KEY); } catch (e) { v = null; }
	return series.chartPick(lookAttr('data-vt-look-chart'), v, lookSaves() && readUnsaved().indexOf('chart') < 0);
}

function writeChartStyle(v) {
	try {
		/* the default needs no entry, unless the router has another */
		if (v === series.CHART_STYLES[0] && !lookAttr('data-vt-look-chart')) window.localStorage.removeItem(CHART_KEY);
		else window.localStorage.setItem(CHART_KEY, v);
	} catch (e) {}
}

/* The network path's form, picked under Customize beside the chart
   style (#157): full, its cards as always (the default), or compact,
   every node of its branches one line. Kept as the chart style is:
   this browser's copy of it and the router's */
var PATH_KEY = 'vantage.path.v1';
var PATH_FORMS = [ 'full', 'compact' ];

/* the pick in force, as series.chartPick decides the chart style's: the
   router's first for a login that may save there, for any other only
   where this browser has none */
function lookPick(ok, saved, mine, first) {
	if (ok.indexOf(saved) >= 0 && (first || ok.indexOf(mine) < 0)) return saved;
	return ok.indexOf(mine) >= 0 ? mine : ok[0];
}

function readPathForm() {
	var v = null;
	try { v = window.localStorage.getItem(PATH_KEY); } catch (e) { v = null; }
	return lookPick(PATH_FORMS, lookAttr('data-vt-look-path'), v, lookSaves() && readUnsaved().indexOf('path') < 0);
}

function writePathForm(v) {
	try {
		/* the default needs no entry, unless the router has another */
		if (v === PATH_FORMS[0] && !lookAttr('data-vt-look-path')) window.localStorage.removeItem(PATH_KEY);
		else window.localStorage.setItem(PATH_KEY, v);
	} catch (e) {}
}

/* The network path's backdrop the viewer picked (backdrop.STYLES). Under
   the Vantage theme its Appearance decides (saved for every browser on
   the router where the viewer may) and keeps the one in force in
   data-vt-backdrop; elsewhere this browser keeps it. */
var BACKDROP_KEY = 'vantage.backdrop.v1';

function readBackdrop() {
	var root = typeof document !== 'undefined' ? document.documentElement : null;
	var v = root && root.getAttribute ? root.getAttribute('data-vt-backdrop') : null;
	if (backdrop.STYLES.indexOf(v) >= 0) return v;
	try { v = window.localStorage.getItem(BACKDROP_KEY); } catch (e) { v = null; }
	return backdrop.STYLES.indexOf(v) >= 0 ? v : backdrop.STYLES[0];
}

/* a gap in a series: no sample for longer than this. A Low-power router
   left idle asks every LOW_IDLE_POLL_MS: its samples are no gaps */
function gapMs() { return lowPower() ? LOW_IDLE_POLL_MS * 1.75 : POLL_S * 3500; }

function lowPower() {
	var root = typeof document !== 'undefined' ? document.documentElement : null;
	return !!(root && root.getAttribute && root.getAttribute('data-vt-power') === 'low');
}

/* Motion when not in focus (#131; the Vantage theme's Appearance,
   data-vt-unfocused): things go on moving while another window has the
   focus */
function movesUnfocused() {
	var root = typeof document !== 'undefined' ? document.documentElement : null;
	return !!(root && root.getAttribute && root.getAttribute('data-vt-unfocused') === 'moving');
}

/* Speed units (the Vantage theme's Appearance, data-vt-units): what the
   dashboard reads its traffic in (fmt); bits unless picked otherwise */
function speedUnits() {
	var root = typeof document !== 'undefined' ? document.documentElement : null;
	return root && root.getAttribute && root.getAttribute('data-vt-units') === 'bytes' ? 'bytes' : 'bits';
}

function writeBackdrop(v) {
	/* the theme takes it (and cancels the event) */
	var ev = null;
	try { ev = new CustomEvent('vantage:backdrop-set', { detail: v, cancelable: true }); } catch (e) { ev = null; }
	if (ev && typeof window.dispatchEvent === 'function' && !window.dispatchEvent(ev)) return;
	try {
		if (v === backdrop.STYLES[0]) window.localStorage.removeItem(BACKDROP_KEY);
		else window.localStorage.setItem(BACKDROP_KEY, v);
	} catch (e) {}
}

/* Search: under the Vantage theme its command palette (Ctrl+K or "/")
   also finds what the dashboard knows, while this page is open. The
   palette sends SEARCH_EVENT on window when it opens and each time its
   query changes, detail { query, add }; the dashboard hands add(), there
   and then, what fits the query (searchEntries), at most SEARCH_MAX a
   kind:
     kind    'client', 'radio', 'ssid' or 'interface': the header it goes under
     title   its name, matched as a page's title is
     detail  the row's second text (an address, a channel)
     words   what else finds it and is never shown (a MAC)
     run     a function: what a click on it does here
   The palette ranks and draws them, as text, and drops what is not of
   this form (menu-vantage.js, PALETTE_EVENT). Under another theme no one
   asks. */
var SEARCH_EVENT = 'vantage:palette';
var SEARCH_MAX = 8;

/* May the palette find it? Its own two rules, loosely, so that it has
   the last word: the query's letters in this order in the title, or each
   of its words somewhere in the rest. 2 where the title holds the query
   as typed (those first, when a kind has more than SEARCH_MAX), else 1,
   and 0 for no. q: the query's words, lower case */
function searchHit(q, title, rest) {
	var t = title.toLowerCase(), letters = q.join(''), at = 0, i;
	if (!q.length) return 1;
	if (t.indexOf(q.join(' ')) >= 0) return 2;
	for (i = 0; i < letters.length; i++) {
		at = t.indexOf(letters[i], at) + 1;
		if (!at) break;
	}
	if (i === letters.length) return 1;
	rest = rest.toLowerCase();
	return q.every(function(w) { return rest.indexOf(w) >= 0; }) ? 1 : 0;
}

/* ================================================================= view */

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	/* ---------------------------------------------------------- loading */

	load: function() {
		var self = this;
		return this.stepAside().then(function() {
			return Promise.all([
				loadCss(),
				L.resolveDefault(callBoard(), {}),
				L.resolveDefault(callAccess('access-group', 'luci-app-vantage-names', 'write'), false),
				self.loadAliases(),
				L.resolveDefault(callMdns(), null),
				self.fetch(),
				/* reverse DNS is an optional grant: without it, skip it quietly */
				L.resolveDefault(callAccess('access-group', 'luci-app-vantage-rdns', 'read'), false),
				L.resolveDefault(ui.menu.load(), null),
				/* per-device traffic is a package and a group of its own: without either, no call (takeTraffic) */
				L.resolveDefault(callAccess('access-group', 'luci-app-vantage-traffic', 'read'), false)
			]);
		}).then(function(r) {
			menuTree = r[7] || null;
			return { board: r[1] || {}, canWrite: r[2] === true, mdns: r[4], raw: r[5], canRdns: r[6] === true, canTraffic: r[8] === true };
		});
	},

	/* #83: the page to open instead of the dashboard, or null to stay.
	   media is L.env.media, the theme LuCI renders with
	   ('/luci-static/argon'). Only when luci-theme-vantage is installed
	   but another theme is in use: the app installed alone works under
	   any theme. Then LuCI's own landing page, luci-mod-dashboard's or
	   Status -> Overview; a user who may see neither keeps the dashboard
	   rather than reach an access error */
	asidePage: function(media, themeHere, hasLuciDashboard, hasOverview) {
		var theme = (typeof media === 'string') ? media.replace(/\/+$/, '').replace(/^.*\//, '') : '';
		if (!theme || theme === 'vantage' || themeHere !== true) return null;
		if (hasLuciDashboard === true) return LUCI_DASHBOARD.slice();
		return hasOverview === false ? null : LUCI_OVERVIEW.slice();
	},

	/* before load() asks for anything. Under Vantage (or an unnamed theme)
	   at once; under another, once the theme's file and the menu
	   answered. Stepping aside replaces the location and never resolves,
	   so nothing of the dashboard renders or loads */
	stepAside: function() {
		var self = this, media = L.env.media;
		if (!this.asidePage(media, true, false, true)) return Promise.resolve();
		return Promise.all([ themeInstalled(), L.resolveDefault(ui.menu.load(), null) ]).then(function(r) {
			/* without a menu hasPage says yes: Status -> Overview, which every LuCI has */
			menuTree = r[1] || null;
			var to = self.asidePage(media, r[0], !!menuTree && hasPage(LUCI_DASHBOARD), hasPage(LUCI_OVERVIEW));
			if (!to) return;
			window.location.replace(L.url.apply(L, to));
			return new Promise(function() {});
		});
	},

	loadAliases: function() {
		var self = this;
		return L.resolveDefault(callUciGet('vantage'), {}).then(function(values) {
			var list = (values && typeof values === 'object') ? Object.keys(values).map(function(k) { return values[k]; }) : [];
			var of = function(t) { return list.filter(function(s) { return s && s['.type'] === t; }); };
			self.aliases = names.aliasMap(of('client').slice(0, names.ALIAS_MAX + 1));
			self.quiet = names.quietSet(of('quiet').slice(0, names.QUIET_MAX + 1));
			return self.aliases;
		});
	},

	/* The paired access points' report for a slow poll, kept in
	   this.collector with the time it came in: this call's answer only,
	   and a failed call (no such object: nothing paired; access denied; a
	   timeout) is none and shows nothing. Asked only by a login that may
	   see the access points: the add-on's own read group, looked up once
	   (collectorMay); without the add-on there is no such group, and the
	   dashboard makes no request for it at all. Where no collector
	   answers, the next call waits COLLECTOR_RETRY_MS. The call must not
	   hold up the dashboard: the promise settles when the call does or
	   after COLLECTOR_WAIT_MS, whichever is first, and the poll goes on
	   with the answer it had. The call stays out (LuCI gives it up after
	   its own timeout), no second one is made beside it and no later poll
	   waits for it; its answer, late, is the next poll's. */
	askCollector: function() {
		var self = this, now = Date.now();
		if (this.collectorCall) return Promise.resolve();
		if (this.collectorNone != null && now >= this.collectorNone && now - this.collectorNone < COLLECTOR_RETRY_MS) return Promise.resolve();
		if (!this.collectorMay) this.collectorMay = L.resolveDefault(callAccess('access-group', 'luci-app-vantage-aps-view', 'read'), false);
		var call = this.collectorCall = this.collectorMay.then(function(may) {
			if (may !== true) return { none: true };
			return callCollector().then(function(v) { return { v: v }; }, function(e) { return { none: /Object not found/.test(String(e && e.message)) }; });
		}).then(function(a) {
			self.collector = a.v && typeof a.v === 'object' && !Array.isArray(a.v) ? a.v : null;
			self.collectorAt = Date.now();
			self.collectorNone = a.none ? self.collectorAt : null;
			self.collectorCall = null;
		});
		return new Promise(function(resolve) {
			var timer = setTimeout(resolve, COLLECTOR_WAIT_MS);
			call.then(function() { clearTimeout(timer); resolve(); });
		});
	},

	/* the answer a poll shows: the last one while it is no older than two
	   slow polls. An older one (a call that stays out, a tab that was
	   hidden) says nothing of now: no access points rather than old ones
	   shown as current */
	collectorAnswer: function() {
		var limit = 2 * (lowPower() ? LOW_SLOW_MS : POLL_S * 1000) + COLLECTOR_WAIT_MS;
		return this.collector && !(Date.now() - this.collectorAt > limit) ? this.collector : null;
	},

	/* A switch chip's own byte counters for its ports (#156), checked
	   (model.switchCounters), or null. Asked every poll, in a request of
	   its own; the poll waits SWITCH_WAIT_MS for it at most, and while a
	   call is out no other is made (that poll has none). Where the first
	   answer says there is nothing to get (no DSA port, no ethtool, a
	   driver whose counters the plugin does not know), or the object is
	   not there (the answers WG_ABSENT names), the page asks no more: a
	   device without a switch starts no process for it every poll. Only
	   the first: once it has answered, any later answer is that poll's
	   and no more (rpcd's objects are gone for a moment while it reloads,
	   at every package install) */
	askSwitch: function() {
		var self = this;
		if (this.hwOff || this.hwCall) return Promise.resolve(null);
		var call = this.hwCall = callSwitchCounters().then(function(v) {
			return model.switchCounters(v);
		}, function(e) {
			if (!self.hwAnswered && WG_ABSENT.test(String(e && e.message))) self.hwOff = true;
			return null;
		}).then(function(c) {
			self.hwCall = null;
			if (c && !self.hwAnswered) {
				self.hwAnswered = true;
				if (c.none) self.hwOff = true;
			}
			return c;
		});
		return new Promise(function(resolve) {
			var timer = setTimeout(function() { resolve(null); }, SWITCH_WAIT_MS);
			call.then(function(c) { clearTimeout(timer); resolve(c); });
		});
	},

	/* LuCI's WireGuard status for a slow poll: { reply, at } (at: when it
	   came in) or null, kept in this.wgLast. Asked only by a login that
	   holds LuCI's own group for it, looked up once (wgMay): without
	   luci-proto-wireguard there is no such group, and the dashboard
	   makes no request for it at all. Where the first answer says the
	   call is not there (WG_ABSENT) it is not asked again on this page
	   (wgOff); once it has answered, an object that went away is asked
	   for again after WG_RETRY_MS. Any other failed call is none, and
	   the next slow poll asks again, unless it took long (WG_SLOW_MS):
	   until the wait is over a poll gets the last answer */
	askWireguard: function() {
		var self = this, now = Date.now(), w = this.wgWait;
		if (this.wgOff) return Promise.resolve(null);
		if (w && now >= w.from && now < w.until) return Promise.resolve(this.wgLast || null);
		if (!this.wgMay) this.wgMay = L.resolveDefault(callAccess('access-group', 'luci-proto-wireguard', 'read'), false);
		return this.wgMay.then(function(may) {
			if (may !== true) { self.wgOff = true; return null; }
			var asked = Date.now();
			return callWireguard().then(function(v) {
				return { reply: v && typeof v === 'object' && !Array.isArray(v) ? v : null };
			}, function(e) {
				return { absent: WG_ABSENT.test(String(e && e.message)) };
			}).then(function(a) {
				var at = Date.now(), took = at - asked;
				if (a.absent && !self.wgAnswered) { self.wgOff = true; return null; }
				if (a.reply) self.wgAnswered = true;
				/* one call that failed (a timeout, a busy rpcd) is not "no
				   tunnel": the last answer stands while it is under
				   WG_RETRY_MS old */
				var last = self.wgLast;
				self.wgLast = a.reply ? { reply: a.reply, at: at } : !a.absent && last && at - last.at < WG_RETRY_MS ? last : null;
				var wait = a.absent ? WG_RETRY_MS : slowWait(took, WG_SLOW_MS);
				self.wgWait = wait ? { from: at, until: at + wait } : null;
				return self.wgLast;
			});
		});
	},

	/* The provider tiles' answers for a slow poll: { id: { data, at,
	   failed } }, each model.tile's reading of the last answer (null for
	   one it cannot read; at: when it came in, 0 before one). The answer
	   itself is not kept: only what the reading holds, capped.
	   Which providers this login may ask comes from rpcd once a page
	   (session access without an object, read by tileIds): without a
	   provider package no group grants one, and none is asked. A read
	   that failed is made again at the next slow poll (a provider found
	   then gets its tile: addProvided); an answer, with providers or
	   without, is not read again. A
	   provider whose first answer says it is not there (WG_ABSENT's
	   answers: no such object, access denied) is not asked again on this
	   page and has no tile (tileState[id].off); one that went away
	   later, once a minute; one whose call failed otherwise, ever less
	   often (askTile). One whose tile the layout hides is not asked once
	   it has answered. The poll waits for them TILE_WAIT_MS at most; a
	   call that stays out is not made again beside itself and no later
	   poll waits for it: its answer, late, is the next poll's */
	askTiles: function() {
		var self = this;
		if (!this.tilesMay) this.tilesMay = callAcls().then(tileIds, function() { self.tilesMay = null; return []; });
		return this.tilesMay.then(function(ids) {
			self.tileIds = ids;
			var now = Date.now(), asks = ids.map(function(id) { return self.askTile(id, now); }).filter(Boolean);
			if (!asks.length) return null;
			return new Promise(function(resolve) {
				var timer = setTimeout(resolve, TILE_WAIT_MS);
				Promise.all(asks).then(function() { clearTimeout(timer); resolve(); });
			});
		}).then(function() { return self.tileAnswers(); });
	},

	/* one provider's call, unless it is off, out, waited for or hidden
	   (then null: nothing for the poll to wait for) */
	askTile: function(id, now) {
		var self = this, ts = this.tileState || (this.tileState = Object.create(null));
		var s = ts[id] || (ts[id] = { off: false, answered: false, last: null, failed: false, fails: 0, wait: null, call: null });
		if (s.off || s.call) return null;
		if (s.wait && now >= s.wait.from && now < s.wait.until) return null;
		if (s.answered && this.tileHidden(id)) return null;
		var asked = Date.now();
		s.call = tileCall(id).then(function(v) {
			return { reply: v && typeof v === 'object' && !Array.isArray(v) ? v : null };
		}, function(e) {
			return { absent: WG_ABSENT.test(String(e && e.message)) };
		}).then(function(a) {
			/* first: whatever follows, this provider can be asked again */
			s.call = null;
			var at = Date.now(), took = at - asked, d = a.reply ? model.tile(a.reply) : null;
			if (a.absent && !s.answered) { s.off = true; return; }
			if (a.reply) { s.answered = true; s.last = { data: d, at: at }; }
			s.failed = !a.reply;
			s.fails = a.reply || a.absent ? 0 : s.fails + 1;
			/* asked again: a minute on when it went away; ten times as late
			   as a slow answer took (slowWait); after a call that failed
			   otherwise, two polls on and twice as late after each further
			   one, SLOW_WAIT_MAX_MS at most; and never sooner than its data
			   changes (every) after this question */
			var back = s.fails ? Math.min(POLL_S * 1000 * Math.pow(2, s.fails), SLOW_WAIT_MAX_MS) : 0;
			var until = Math.max(at + (a.absent ? TILE_RETRY_MS : Math.max(slowWait(took, TILE_SLOW_MS), back)), d && d.every ? asked + d.every * 1000 : 0);
			s.wait = until > at ? { from: asked, until: until } : null;
		});
		return s.call;
	},

	/* a provider's tile hidden in the layout in use: nothing to show */
	tileHidden: function(id) {
		var l = this.lay, i = l ? layout.indexOf(l.list, 'x' + id) : -1;
		return i >= 0 && l.list[i].hide === true;
	},

	tileAnswers: function() {
		var self = this, out = Object.create(null);
		(this.tileIds || []).forEach(function(id) {
			var s = self.tileState && self.tileState[id];
			if (s && !s.off) out[id] = { data: s.last ? s.last.data : null, at: s.last ? s.last.at : 0, failed: s.failed };
		});
		return out;
	},

	/* luci-app-vantage-traffic's answer for a poll: the one that came in
	   since the last poll (undefined: none; null: a failed call). With the
	   slow part, a login that may ask (canTraffic) asks again, one call at
	   a time, and no poll waits for it: its answer is the next poll's.
	   After a call that says the plugin is not there (trafficNext), not
	   before TRAFFIC_RETRY_MS: the package removed under the page, or
	   rpcd's objects gone for a moment while it reloads at a package
	   install. That never ends the asking, first answer or later: the
	   page found the package's group, so it was there when the page
	   loaded */
	takeTraffic: function(slow) {
		var self = this, got = this.trafficGot, now = Date.now();
		this.trafficGot = undefined;
		if (slow && this.canTraffic && !this.trafficCall && !(now < this.trafficNext))
			this.trafficCall = callTraffic().then(null, function(e) { return self.trafficFailed(e); }).then(function(v) { self.trafficGot = v; self.trafficCall = null; });
		return got;
	},

	/* a failed call (takeTraffic): none, and the next a minute later
	   where it says the plugin is not there */
	trafficFailed: function(e) {
		if (WG_ABSENT.test(String(e && e.message))) this.trafficNext = Date.now() + TRAFFIC_RETRY_MS;
		return null;
	},

	/* one poll's worth of raw replies; missing pieces degrade to {} */
	fetch: function() {
		var started = Date.now(), self = this;
		/* Low-power router: the slow parts once every LOW_SLOW_MS */
		var age = started - this.slowAt;
		var slow = !lowPower() || !this.slowCache || !(age >= 0 && age < LOW_SLOW_MS);
		var kept = this.slowCache || {};
		/* the host hints: their last reply until they are due */
		var hintsAge = started - (this.hintsAt || 0);
		var hintsDue = !this.hintsCache || this.hintsHot > 0 || !(hintsAge >= 0 && hintsAge < HINTS_MS);
		/* the paired access points ride the slow part, beside the device's
		   own calls: these are made and stamped as always, and the poll's
		   end waits for that answer or its deadline (askCollector) */
		var collected = slow ? this.askCollector() : Promise.resolve();
		/* and so does LuCI's WireGuard status, for a login that may ask
		   (askWireguard): its last answer between slow polls */
		var tunnels = slow ? this.askWireguard() : Promise.resolve(this.wgLast || null);
		/* and so do the provider tiles (askTiles): their last answers between slow polls */
		var provided = slow ? this.askTiles() : Promise.resolve(this.tileAnswers());
		var traffic = this.takeTraffic(slow);
		/* and a switch chip's own counters, every poll (askSwitch) */
		var counted = this.askSwitch();
		return Promise.all([
			L.resolveDefault(callInfo(), {}),
			L.resolveDefault(callRead('/proc/stat'), ''),
			L.resolveDefault(callIfDump(), []),
			L.resolveDefault(callDevs(), {}),
			/* null when the call fails: no answer is not "no radios" (nor
			   no sensors or no wired hosts, which then read as none) */
			slow ? L.resolveDefault(callWifi(), null) : Promise.resolve(kept.wifi),
			hintsDue ? L.resolveDefault(callHints(), null) : Promise.resolve(this.hintsCache),
			slow ? L.resolveDefault(callThermal(), null) : Promise.resolve(kept.thermal),
			slow ? L.resolveDefault(callWired(), null) : Promise.resolve(kept.wired),
			/* null when the call fails (an older plugin): netifd's metrics decide */
			L.resolveDefault(callRoutes(), null)
		]).then(function(r) {
			var wifiDevs = (r[4] && typeof r[4] === 'object') ? r[4] : null;
			var wiredReply = (r[7] && typeof r[7] === 'object') ? r[7] : {};
			var ifnames = [], radioFirst = Object.create(null), surveyFor = Object.create(null);
			Object.keys(wifiDevs || {}).forEach(function(rn) {
				var ifs = (wifiDevs[rn] && Array.isArray(wifiDevs[rn].interfaces)) ? wifiDevs[rn].interfaces : [], first = true;
				/* a radio read from the config has no run state: each of
				   its interfaces' iwinfo says whether it is up (model.js) */
				var cfg = wifiDevs[rn] && wifiDevs[rn].source === 'config';
				ifs.forEach(function(i) {
					if (i && typeof i.ifname === 'string' && HOSTAPD_OBJ.test(i.ifname) && ifnames.indexOf(i.ifname) < 0) {
						ifnames.push(i.ifname);
						if (first || cfg) radioFirst[i.ifname] = true;
						if (first) surveyFor[i.ifname] = true;
						first = false;
					}
				});
			});
			/* iwinfo info (luci.vantage wireless carries configuration only):
			   a radio's first interface gives its channel, power and noise;
			   another network's BSSID and SSID come from hostapd's get_status,
			   asked anyway, once it answered with them. An interface hostapd
			   did not answer for (a client or mesh, a vendor driver) keeps
			   its own iwinfo info. Each costs the router ~15 ms. */
			var hapdKnown = self.hapdBss || {}, hapdLast = self.hapdLast || {};
			var per = [];
			/* a failed call keeps the last reply, is asked again next poll
			   and spends none of the extra tries after a new device */
			if (hintsDue && r[5] && typeof r[5] === 'object') {
				self.hintsCache = r[5];
				self.hintsAt = started;
				if (self.hintsHot > 0) self.hintsHot--;
			}
			/* the state an interface's iwinfo reading belongs to: asked
			   again when this moves, else after IWINFO_MS */
			var iwc = self.iwCache || (self.iwCache = Object.create(null)), radioOf = Object.create(null);
			Object.keys(wifiDevs || {}).forEach(function(rn) {
				((wifiDevs[rn] && wifiDevs[rn].interfaces) || []).forEach(function(i) { if (i && typeof i.ifname === 'string') radioOf[i.ifname] = rn; });
			});
			function iwKey(ifn) {
				var rd = (wifiDevs && wifiDevs[radioOf[ifn]]) || {}, c = rd.config || {}, h = hapdLast[ifn];
				var st = h && typeof h === 'object' ? [ h.channel, h.freq, h.bssid, h.ssid ].map(String).join('|') : '';
				return [ rd.up, rd.pending, rd.disabled, c.channel, c.htmode, c.txpower, c.country ].map(String).join('|') + '\n' + st;
			}
			function iwDue(ifn) {
				var e = iwc[ifn], iwAge = e ? started - e.at : -1, key = iwKey(ifn);
				/* hostapd's first status for the interface, asked after
				   the reading was taken: the reading's state, not a move */
				if (e && e.key !== key && e.key.indexOf('\n') === e.key.length - 1 && e.key === key.slice(0, e.key.length)) e.key = key;
				return !e || e.key !== key || !(iwAge >= 0 && iwAge < IWINFO_MS);
			}
			/* the link state of a switch with hosts behind it, every
			   SWITCH_MS: each answer runs swconfig on the device. Asked
			   on the side, so a slow switch holds up no poll; the answer
			   shows from the next one */
			var switches = (wiredReply.switches && typeof wiredReply.switches === 'object' && !Array.isArray(wiredReply.switches)) ? wiredReply.switches : {};
			var swState = self.swState || (self.swState = Object.create(null));
			var hostPorts = (Array.isArray(wiredReply.hosts) ? wiredReply.hosts : []).map(function(h) { return h && h.port; });
			var due = [], asked = Date.now();
			Object.keys(switches).forEach(function(dev) {
				var n = switches[dev] && switches[dev].name;
				if (typeof n === 'string' && /^[A-Za-z0-9_.-]{1,32}$/.test(n) && hostPorts.indexOf(dev) >= 0 && due.indexOf(n) < 0 &&
				    !(swState[n] && asked - swState[n].at < SWITCH_MS)) due.push(n);
			});
			due.slice(0, 4).forEach(function(n) {
				swState[n] = { at: asked, ports: swState[n] ? swState[n].ports : null };
				L.resolveDefault(callSwitchPorts(n), null).then(function(v) {
					/* no ports (an error, an unknown switch): not known, not down */
					swState[n] = { at: asked, ports: v && Array.isArray(v.result) && v.result.length ? v.result : null };
				});
			});
			/* the interfaces hostapd made for a network's VLANs (#164): iwinfo
			   lists the stations on one under it alone. Its station list
			   every poll, as the network's own, and nothing else of it
			   (1.2 ms each on a four-core access point) */
			var vlans = model.wifiVlans(wifiDevs);
			Object.keys(vlans).forEach(function(of) {
				vlans[of].forEach(function(ifn) { per.push(L.resolveDefault(callAssoc(ifn), []).then(function(v) { return [ 'assoc', ifn, v ]; })); });
			});
			ifnames.forEach(function(ifn) {
				per.push(L.resolveDefault(callAssoc(ifn), []).then(function(v) { return [ 'assoc', ifn, v ]; }));
				if (slow) per.push(hostapd(ifn, 'get_clients').then(function(v) { return [ 'hapd', ifn, v ]; }));
				per.push(hostapd(ifn, 'get_status').then(function(v) { return [ 'hapdStatus', ifn, v ]; }));
				if (slow && (radioFirst[ifn] || !hapdKnown[ifn]) && iwDue(ifn))
					per.push(L.resolveDefault(callIwInfo(ifn), {}).then(function(v) { return [ 'iwinfo', ifn, v ]; }));
				if (slow && surveyFor[ifn])
					per.push(L.resolveDefault(callSurvey(ifn), null).then(function(v) { return [ 'survey', ifn, v ]; }));
			});
			return Promise.all(per).then(function(parts) {
				var assoc = Object.create(null), hapdStatus = Object.create(null);
				var hapd = slow ? Object.create(null) : kept.hapd, iwinfo = slow ? Object.create(null) : kept.iwinfo;
				var survey = slow ? Object.create(null) : (kept.survey || Object.create(null));
				parts.forEach(function(p) {
					if (p[0] === 'assoc') assoc[p[1]] = p[2];
					else if (p[0] === 'hapd') hapd[p[1]] = p[2];
					else if (p[0] === 'hapdStatus') hapdStatus[p[1]] = p[2];
					else if (p[0] === 'survey') { if (Array.isArray(p[2])) survey[p[1]] = p[2]; }
					else {
						iwinfo[p[1]] = p[2];
						/* a failed call ({}) is asked again at the next poll */
						if (p[2] && typeof p[2] === 'object' && Object.keys(p[2]).length) iwc[p[1]] = { at: started, key: iwKey(p[1]), reply: p[2] };
						else delete iwc[p[1]];
					}
				});
				/* the readings kept for the interfaces not asked this poll;
				   one no longer asked at all (another network hostapd now
				   answers for: its BSSID and SSID are hostapd's) is dropped,
				   not shown from its first poll on */
				var wantIw = function(ifn) {
					var h = hapdStatus[ifn];
					return ifnames.indexOf(ifn) >= 0 && (radioFirst[ifn] || !(h && typeof h.bssid === 'string' && h.bssid));
				};
				Object.keys(iwc).forEach(function(ifn) { if (!wantIw(ifn)) delete iwc[ifn]; });
				if (slow) Object.keys(iwc).forEach(function(ifn) { if (!(ifn in iwinfo)) iwinfo[ifn] = iwc[ifn].reply; });
				self.hapdLast = hapdStatus;
				/* kept only when all three answered: a failure is asked again
				   at the next poll, not shown for LOW_SLOW_MS */
				if (slow && r[4] != null && r[6] != null && r[7] != null) {
					self.slowAt = started;
					self.slowCache = { wifi: r[4], thermal: r[6], wired: r[7], hapd: hapd, iwinfo: iwinfo, survey: survey };
				}
				/* a station or wired host seen for the first time: its name
				   may be in the next host hints */
				var known = self.knownMacs || (self.knownMacs = new Set()), fresh = false, first = !self.macsSeen;
				var note = function(s) { if (s && typeof s.mac === 'string' && !known.has(s.mac)) { known.add(s.mac); fresh = true; } };
				Object.keys(assoc).forEach(function(ifn) { (Array.isArray(assoc[ifn]) ? assoc[ifn] : []).forEach(note); });
				(Array.isArray(wiredReply.hosts) ? wiredReply.hosts : []).forEach(note);
				/* bounded: a flood of made-up addresses starts the set over */
				if (known.size > 4096) self.knownMacs = null;
				self.macsSeen = true;
				if (fresh && !first) self.hintsHot = HINTS_HOT;
				self.hapdBss = Object.create(null);
				Object.keys(hapdStatus).forEach(function(ifn) {
					var h = hapdStatus[ifn];
					if (h && typeof h.bssid === 'string' && h.bssid) self.hapdBss[ifn] = true;
				});
				var switchState = Object.create(null);
				Object.keys(swState).forEach(function(n) { switchState[n] = swState[n].ports; });
				var raw = { info: r[0] || {}, stat: r[1] || '', ifaces: r[2] || [], devs: r[3] || {}, wifi: wifiDevs, hints: r[5] || self.hintsCache || {}, thermal: r[6] || [],
					fdb: Array.isArray(wiredReply.hosts) ? wiredReply.hosts : [], fdbCrowded: wiredReply.crowded === true, switches: switches, switchState: switchState,
					/* no answer (an older plugin, a lookup not sent, a failed call)
					   keeps the last one: no tunnel blinking off */
					routes: r[8] && Array.isArray(r[8].routes) ? (self.kernelRoutes = r[8].routes) : (self.kernelRoutes || null),
					collector: null, wg: null, provided: null, traffic: traffic,
					assoc: assoc, hapd: hapd, hapdStatus: hapdStatus, iwinfo: iwinfo, survey: survey, at: Date.now(), started: started };
				return Promise.all([ collected, tunnels, provided, counted ]).then(function(x) { raw.collector = self.collectorAnswer(); raw.wg = x[1]; raw.provided = x[2]; raw.hw = x[3]; return raw; });
			});
		});
	},

	/* ------------------------------------------------------------ state */

	initState: function(data) {
		var stored = readStore() || {}, now = Date.now();
		/* keys come from sessionStorage: no prototype to overwrite */
		var net = Object.create(null);
		if (stored.net && typeof stored.net === 'object')
			Object.keys(stored.net).forEach(function(k) {
				/* 'uplink' (before #88) belongs to an interface nobody noted */
				if (/^[A-Za-z0-9_.:-]{1,40}$/.test(k) && k !== 'uplink') net[k] = series.valid(stored.net[k], 3, histMax(k), now, model.MAX_BPS);
			});
		var clientHist = Object.create(null);
		if (stored.clients && typeof stored.clients === 'object')
			Object.keys(stored.clients).slice(0, 64).forEach(function(k) {
				var mac = names.normMac(k);
				if (mac) clientHist[mac] = series.valid(stored.clients[k], 4, 150, now, model.MAX_BPS);
			});
		this.board = data.board || {};
		this.canWrite = data.canWrite;
		this.canTraffic = data.canTraffic === true;
		var held = heldCpu(readCpu(), now);
		this.st = {
			clock: null, stat: null, cpu: held, cores: held ? held.cores.length : null, cpuMeasured: false,
			devPrev: null, staPrev: null, devRates: Object.create(null), staRates: Object.create(null), radioRates: Object.create(null), ssidRates: Object.create(null),
			hist: { net: net, cpu: series.valid(stored.cpu, 2, HIST_FAST, now), mem: series.valid(stored.mem, 2, HIST_MAX, now) },
			clientHist: clientHist, bestStd: Object.create(null),
			presence: null, isNew: Object.create(null), gone: [], named: Object.create(null),
			rdns: Object.create(null), rdnsBusy: false, rdnsOff: !data.canRdns,
			mdns: Object.create(null), mdnsOff: true, mdnsAt: 0,
			oui: null, ouiLoading: false,
			wireless: null,
			wg: [], wgSeen: false, wgPrev: null, wgRates: Object.create(null),
			portsSeen: false,
			traffic: null, trafficRates: null, trafficPrev: null, trafficSeen: 0, trafficNew: 0, trafficAt: null,
			ext: Object.create(null),
			lastOk: 0, lastErr: null, paused: false
		};
		this.ui = { sorts: readSorts(), kind: 'wifi', filter: '', chip: 'all', drawer: null, editing: null, hover: null, wgOpen: Object.create(null) };
		this.folds = readFolds();
		this.foldEls = {};
		this.foldBtns = {};
		this.layouts = readLayouts();
		this.chartStyle = readChartStyle();
		this.pathForm = readPathForm();
		this.backdropStyle = readBackdrop();
		/* picked under the theme's Appearance (menu-vantage.js), here or
		   in another tab */
		var self = this, follow = function() { self.showBackdrop(readBackdrop()); };
		if (window.addEventListener) {
			window.addEventListener('vantage:backdrop', follow);
			window.addEventListener('storage', function(ev) { if (ev.key === BACKDROP_KEY) follow(); });
		}
		this.editing = false;
		this.drag = null;
		this.applyMdns(data.mdns);
		this.aliases = this.aliases || {};
	},

	applyMdns: function(reply) {
		/* umdns missing (NOT_FOUND / no permission) answers a number */
		if (reply && typeof reply === 'object') { this.st.mdns = names.mdnsMap(reply); this.st.mdnsOff = false; }
		else this.st.mdnsOff = true;
		this.st.mdnsAt = Date.now();
	},

	/* raw replies -> model + rates + histories */
	ingest: function(raw) {
		var st = this.st, self = this;
		var now = raw.at || Date.now();
		st.clock = model.sampleClock(st.clock, now, raw.info && raw.info.localtime);
		var at = st.clock.at;
		/* how far the device's timeline runs from the browser's: the fast
		   lane stamps its samples on the same timeline (a clock step on
		   the device moves every row of the chart together) */
		st.skew = at - Date.now();

		/* CPU, unless the fast lane samples it (refreshFast); the times
		   are kept either way, so a reading after the lane stops covers
		   the last poll, not the time since the page opened */
		var fast = this.fastLive();
		var stat = model.parseStat(raw.stat);
		if (stat) {
			var cpu = fast ? null : model.cpuUsage(st.stat, stat);
			if (cpu) { this.keepCpu(cpu, Date.now()); series.push(st.hist.cpu, [ at, cpu.pct ], WINDOW_MS, HIST_FAST); }
			st.cores = stat.cores.length || st.cores;
			if (!st.stat || stat.all.total !== st.stat.all.total) st.stat = stat;
		}
		st.temps = model.temps(raw.thermal);

		var m = model.build({
			board: this.board, info: raw.info, ifaces: raw.ifaces, devs: raw.devs, wifi: raw.wifi, iwinfo: raw.iwinfo,
			assoc: raw.assoc, hapd: raw.hapd, hapdStatus: raw.hapdStatus, hints: raw.hints, fdb: raw.fdb,
			switches: raw.switches, switchState: raw.switchState, routes: raw.routes, collector: raw.collector,
			aliases: this.aliases, rdns: st.rdns, mdns: st.mdns,
			vendor: st.oui ? function(k) { return k ? st.oui.lookup(k) : null; } : null
		});
		this.markWired(m, raw);
		this.noteTunnels(m, raw.wg, now);
		this.notePorts(m);
		this.noteTiles(m, raw.provided, now);
		if (m.device.memory) series.push(st.hist.mem, [ at, m.device.memory.usedPct ], WINDOW_MS, HIST_MAX);

		/* interface counters; a DSA port's from its switch chip where this
		   poll has them (askSwitch, #156): the kernel's count only what
		   passes the CPU. Not a line's own device, whose rate the line, the
		   chart and the fast lane take from the kernel's. A port whose
		   chip's counters stayed out has no rate for that step (model.rates):
		   none rather than one of the kernel's against the chip's. The
		   chip's are rated by when the device read them (at), not by this
		   poll's clock: they come in a request of their own, up to
		   SWITCH_WAIT_MS later, and when says nothing of when ethtool ran */
		var hw = raw.hw && raw.hw.counters, lineDevs = m.uplinks.map(function(x) { return x.statsDev; });
		var devCounters = Object.create(null);
		Object.keys(raw.devs || {}).forEach(function(n) {
			var s = raw.devs[n] && raw.devs[n].statistics, c = hw && hw[n] && lineDevs.indexOf(n) < 0 ? hw[n] : null;
			if (c) devCounters[n] = { rx: c.rx, tx: c.tx, src: 'switch', at: c.at };
			else if (s) devCounters[n] = { rx: s.rx_bytes, tx: s.tx_bytes };
		});
		var dr = model.rates(st.devPrev, devCounters, at);
		st.devPrev = dr.next;
		if (Object.keys(dr.rates).length || !Object.keys(devCounters).length) st.devRates = dr.rates;

		/* station counters */
		var staCounters = Object.create(null), local = m.clients.filter(function(c) { return !c.ap; });
		/* a paired access point's stations have no counters here */
		local.forEach(function(c) { staCounters[c.mac] = { rx: c.rxBytes, tx: c.txBytes }; });
		var sr = model.rates(st.staPrev, staCounters, at);
		st.staPrev = sr.next;
		if (Object.keys(sr.rates).length || !local.length) st.staRates = sr.rates;
		/* theirs: this poll's rates as the access point counts them */
		m.clients.forEach(function(c) { if (c.ap) { if (c.ap.rate) st.staRates[c.mac] = c.ap.rate; else delete st.staRates[c.mac]; } });

		/* A radio's and a network's traffic: their interfaces' counters,
		   and for the stations on the interface of a VLAN (#164) each
		   station's own: netifd lists such an interface, and so its
		   counters, only where netifd made it */
		var viaVlan = Object.create(null);
		local.forEach(function(c) {
			var r = c.vlanIf ? st.staRates[c.mac] : null, v = r ? viaVlan[c.ssidId] || (viaVlan[c.ssidId] = { rx: 0, tx: 0 }) : null;
			if (v) { v.rx += r.rx; v.tx += r.tx; }
		});
		function sum(list, ssids) {
			var rx = 0, tx = 0, ok = false;
			list.map(function(n) { return st.devRates[n]; }).concat(ssids.map(function(id) { return viaVlan[id]; })).forEach(function(r) {
				if (r) { rx += r.rx; tx += r.tx; ok = true; }
			});
			return ok ? { rx: rx, tx: tx } : null;
		}
		st.radioRates = Object.create(null);
		m.radios.forEach(function(r) { var v = sum(r.ifnames, r.ssids); if (v) st.radioRates[r.id] = v; });
		st.ssidRates = Object.create(null);
		m.ssids.forEach(function(s) { var v = s.ifname ? sum([ s.ifname ], [ s.id ]) : null; if (v) st.ssidRates[s.id] = v; });
		/* the uplink: the fast lane's own while it samples this uplink's
		   device; else (no uplink, a new device, the lane stopped) this poll's */
		var upFast = fast && !!m.uplink && st.fastDev === m.uplink.statsDev;
		var upRate = upFast ? st.uplinkRate : model.lineRate(m.uplink, st.devRates);
		st.uplinkRate = upRate || null;

		/* throughput history (only for ticks that produced a rate) */
		if (upRate && !upFast) this.pushNet(lineKey(m.uplink), at, upRate);
		/* the other lines to the internet: this poll's (the fast lane
		   samples the main one only) */
		this.extraLines(m).forEach(function(x) { var r = model.lineRate(x, st.devRates); if (r) self.pushNet(lineKey(x), at, r); });
		/* a line gone for longer than the chart shows leaves no history */
		var lineKeys = m.uplinks.map(lineKey);
		Object.keys(st.hist.net).forEach(function(k) {
			var h = st.hist.net[k];
			if (/^up:/.test(k) && lineKeys.indexOf(k) < 0 && !(h.length && h[h.length - 1][0] > at - WINDOW_MS)) delete st.hist.net[k];
		});
		m.radios.forEach(function(r) { if (st.radioRates[r.id]) self.pushNet(r.id, at, st.radioRates[r.id]); });

		/* per-station history */
		m.clients.forEach(function(c) {
			var h = st.clientHist[c.mac] || (st.clientHist[c.mac] = []);
			var r = st.staRates[c.mac];
			series.push(h, [ at, c.signal != null ? -c.signal : NaN, r ? r.tx : NaN, r ? r.rx : NaN ], 10 * 60 * 1000, 150);
		});

		this.noteTraffic(raw.traffic);

		/* presence: new since the page opened, recently gone */
		var p = insight.presence(st.presence, m.clients, now, GONE_KEEP_MS,
			m.accessPoints.filter(function(a) { return a.state === 'ok'; }).map(function(a) { return a.id; }));
		st.presence = p.state;
		st.isNew = p.isNew;
		st.gone = p.gone;
		this.markOffline(m, raw, now);
		Object.keys(st.clientHist).forEach(function(mac) {
			if (!p.state.firstSeen[mac]) delete st.clientHist[mac];
		});
		Object.keys(st.bestStd).forEach(function(mac) {
			if (!p.state.firstSeen[mac]) delete st.bestStd[mac];
		});

		/* per-station history is kept for the session (60 points each,
		   stations seen in the last minutes only) */
		var keepClients = {};
		Object.keys(st.clientHist).slice(0, 32).forEach(function(mac) {
			keepClients[mac] = st.clientHist[mac].slice(-60).filter(function(p) { return p.every(function(v) { return isFinite(v); }); });
		});
		writeStore({ sid: storeOwner(), net: st.hist.net, cpu: st.hist.cpu, mem: st.hist.mem, clients: keepClients });

		this.stickyGen(m);
		m.clients.forEach(function(c) { c.exp = insight.experience(c); c.firstSeen = p.state.firstSeen[c.mac]; c.isNew = !!p.isNew[c.mac]; });
		st.health = insight.health(m, { cpu: this.cpuShown(), uplinkRate: st.uplinkRate, temps: st.temps, quiet: this.quiet });
		st.summary = insight.summary(st.health);
		st.radioInsights = insight.radioInsights(m.radios, st.radioRates);
		st.talkers = this.talkers(m);
		this.m = m;
		this.lastRaw = raw;
		this.resolveMore(m);
		return m;
	},

	/* Wired-only: the wireless status answered and lists no radios. A
	   failed call proves nothing, and radios seen once keep the Wi-Fi
	   layout for the session, so one bad poll cannot reshuffle the page. */
	markWired: function(m, raw) {
		var st = this.st;
		if (raw && raw.wifi) {
			if (m.radios.length) st.wireless = true;
			else if (st.wireless !== true) st.wireless = false;
		}
		m.wired = st.wireless === false;
	},

	/* WireGuard: the tunnels of the poll's answer (wg: { reply, at } or
	   null), each handshake's age as of now by this browser's clock (as
	   LuCI's own page counts it), and each peer's rates between two
	   answers: the same answer again, between slow polls, is no sample.
	   A tunnel seen once keeps the tile for the session (m.wg), as radios
	   keep the Wi-Fi layout: an interface restarted is gone for a poll,
	   and the page is not rearranged for that */
	noteTunnels: function(m, wg, now) {
		var st = this.st, counters = Object.create(null);
		st.wg = model.wireguard(wg ? wg.reply : null, now / 1000);
		if (st.wg.length) st.wgSeen = true;
		m.wg = st.wgSeen === true;
		st.wg.forEach(function(t) {
			t.peers.forEach(function(p) { if (p.rx != null && p.tx != null) counters[t.name + ' ' + p.id] = { rx: p.rx, tx: p.tx }; });
		});
		var r = model.rates(st.wgPrev, counters, wg ? wg.at : now);
		st.wgPrev = r.next;
		if (Object.keys(r.rates).length || !Object.keys(counters).length) st.wgRates = r.rates;
	},

	/* The named devices in neither list (the model's offline), with what
	   this page still knows of each: when it was last listed since the
	   page opened (a wired host: when its bridge last heard it), and the
	   address it had then where the host hints give none now. A poll
	   (now) notes the named devices it lists; kept for the names there
	   are, so never more than those. While a bridge holds too many
	   entries to list, who is on its ports is not known, and nobody is
	   said to be offline. */
	markOffline: function(m, raw, now) {
		var aliases = this.aliases || {}, seen = this.st.named;
		if (now != null) {
			m.clients.concat(m.wiredHosts).forEach(function(c) {
				if (aliases[c.mac]) seen[c.mac] = { at: now - (typeof c.port === 'string' && c.seen > 0 ? c.seen * 1000 : 0), ip: (c.ips && c.ips[0]) || null };
			});
			Object.keys(seen).forEach(function(mac) { if (!aliases[mac]) delete seen[mac]; });
		}
		if (raw && raw.fdbCrowded) m.offline = [];
		m.offline.forEach(function(c) {
			var s = seen[c.mac];
			c.lastSeen = s ? s.at : null;
			if (s && s.ip && !c.ips.length) c.ips = [ s.ip ];
		});
	},

	/* The Ports tile exists on a device with two Ethernet ports or more
	   (model.ports; one port is on the path already, as the uplink's).
	   Two seen once keep the tile for the session (m.portsTile), as
	   radios keep the Wi-Fi layout: a poll whose device status failed
	   lists none, and the page is not rearranged for that */
	notePorts: function(m) {
		if (m.ports.length > 1) this.st.portsSeen = true;
		m.portsTile = this.st.portsSeen === true;
	},

	/* Provider tiles: the poll's answers (tiles: tileAnswers') -> the
	   tiles this page has (m.extra: their layout ids, 'x' and the
	   provider's id; not one whose first answer said it is not there)
	   and what each shows (st.ext[id]: { data, readable, state, at,
	   rates, hist }). data is model.tile's reading of the last answer,
	   readable that of the last one it could read (the tile's name, icon
	   and page stay while a later answer cannot be read); state 'wait'
	   before an answer, 'bad' for one it cannot read, 'gone' when the
	   last call failed and the last answer is TILE_RETRY_MS old (or there
	   is none), else 'ok'. A counter's rate between two answers, and a
	   trend item's values for the page: the same answer again (between
	   slow polls, or a model built again: rerender) is no sample */
	noteTiles: function(m, tiles, now) {
		var byTile = this.st.ext, ts = this.tileState;
		m.extra = [];
		Object.keys(tiles || {}).forEach(function(id) {
			/* its first answer came after the poll's (which waits 2 s at
			   most) and said it is not there: no tile (buildProvided) */
			if (ts && ts[id] && ts[id].off) return;
			var a = tiles[id], t = byTile[id] || (byTile[id] = { data: null, readable: null, state: 'wait', at: 0, prev: null, rates: Object.create(null), hist: Object.create(null) });
			m.extra.push('x' + id);
			if (a.at && a.at !== t.at) {
				t.at = a.at;
				t.data = a.data || null;
				if (t.data) t.readable = t.data;
				var counters = Object.create(null), labels = Object.create(null);
				(t.data ? t.data.items : []).forEach(function(x) {
					labels[x.label] = true;
					if (x.rate) counters[x.label] = { rx: x.value, tx: 0 };
				});
				var r = model.rates(t.prev, counters, a.at);
				t.prev = r.next;
				t.rates = r.rates;
				(t.data ? t.data.items : []).forEach(function(x) {
					var v = x.rate ? (r.rates[x.label] ? r.rates[x.label].rx / 8 : null) : x.value;
					if (x.trend && v != null) series.push(t.hist[x.label] || (t.hist[x.label] = []), [ a.at, v ], WINDOW_MS, HIST_MAX);
				});
				Object.keys(t.hist).forEach(function(k) { if (!labels[k]) delete t.hist[k]; });
			}
			t.state = !a.at ? (a.failed ? 'gone' : 'wait') : !t.data ? 'bad' : a.failed && !(now - a.at < TILE_RETRY_MS) ? 'gone' : 'ok';
		});
	},

	/* The generation shown is the best standard a station used this
	   session: single frames (management, retries) go out at legacy
	   rates and would make the badge flicker. */
	stickyGen: function(m) {
		var best = this.st.bestStd, order = [ 'legacy', 'HT', 'VHT', 'HE', 'EHT' ];
		m.clients.forEach(function(c) {
			var cur = order.indexOf(c.std), prev = order.indexOf(best[c.mac]);
			if (prev > cur) { c.std = best[c.mac]; c.gen = wifi.genName(c.std, c.band); }
			else if (cur >= 0) best[c.mac] = c.std;
		});
	},

	pushNet: function(key, at, r) {
		var h = this.st.hist.net[key] || (this.st.hist.net[key] = []);
		series.push(h, [ at, r.rx, r.tx ], WINDOW_MS, histMax(key));
	},

	/* ------------------------------------------------------- fast lane */

	/* the fast lane answered within the last three of its periods: until
	   then (or if it stops) the full poll samples CPU and the uplink */
	fastLive: function() {
		return !!(this.st.fastAt && Date.now() - this.st.fastAt < FAST_S * 3000);
	},

	/* every FAST_S: CPU from /proc/stat and the uplink device's counters,
	   with their own previous samples, so the two lanes never mix */
	/* one fast sample at a time: the lane's tick and the first reading's
	   early second sample (cpuSoon) share a call in flight, so no older
	   reply lands after a newer one */
	refreshFast: function() {
		var self = this;
		if (this.fastBusy) return this.fastBusy;
		var p = this.fastSample(), done = function() { if (self.fastBusy === p) self.fastBusy = null; };
		this.fastBusy = p;
		p.then(done, done);
		return p;
	},

	fastSample: function() {
		var self = this, st = this.st, up = this.m && this.m.uplink, dev = up && up.statsDev;
		/* the line's device, then the VLANs that come off it (model.lineVlans) */
		var devs = dev ? [ dev ].concat(up.minus || []) : [];
		if (document.hidden || !this.el || this.idle()) return Promise.resolve();
		return Promise.all([ L.resolveDefault(callRead('/proc/stat'), '') ].concat(devs.map(function(n) {
			return L.resolveDefault(callDev(n), null);
		}))).then(function(r) {
			/* rates from the browser's clock, samples on the device's timeline */
			var now = Date.now(), at = now + (st.skew || 0), changed = false;
			/* back after a pause (a hidden tab) or on another device: start
			   over, so the first reading isn't an average over the gap */
			if (!self.fastLive() || st.fastDev !== dev) { st.fastStat = null; st.fastPrev = null; }
			/* no uplink, or another device: no rate until this one has two samples */
			if (st.fastDev !== (dev || null) && st.uplinkRate) { st.uplinkRate = null; changed = true; }
			st.fastDev = dev || null;
			var stat = model.parseStat(r[0]);
			if (stat) {
				var cpu = model.cpuUsage(st.fastStat, stat);
				if (cpu) { self.keepCpu(cpu, now); series.push(st.hist.cpu, [ at, cpu.pct ], WINDOW_MS, HIST_FAST); changed = true; }
				/* no reading yet on this page: the second sample a second
				   after this one, not at the lane's next tick */
				else if (!st.cpuMeasured && !self.cpuSoon)
					self.cpuSoon = window.setTimeout(function() { self.cpuSoon = 0; self.refreshFast(); }, CPU_FIRST_MS);
				if (!st.fastStat || stat.all.total !== st.fastStat.all.total) st.fastStat = stat;
				st.cores = stat.cores.length || st.cores;
			}
			var s = r[1] && r[1].statistics, counters = Object.create(null);
			devs.forEach(function(n, i) { var c = r[1 + i] && r[1 + i].statistics; if (c) counters[n] = { rx: c.rx_bytes, tx: c.tx_bytes }; });
			var dr = model.rates(st.fastPrev, counters, now), rate = model.lineRate(up, dr.rates);
			st.fastPrev = dr.next;
			if (rate) { st.uplinkRate = rate; self.pushNet(lineKey(up), at, st.uplinkRate); changed = true; }
			/* both answered: the full poll leaves CPU and the uplink to this lane */
			if (stat && (!dev || s)) st.fastAt = now;
			if (changed) self.paintFast();
		});
	},

	/* the CPU reading to show: the last one; before the first, once the
	   first sample is in (the second follows within CPU_FIRST_MS), 0 % on
	   every core rather than a dash; null while the router has given no
	   sample at all */
	cpuShown: function() {
		var st = this.st, zero = [];
		if (st.cpu) return st.cpu;
		if (!(st.cores > 0)) return null;
		for (var i = 0; i < st.cores; i++) zero.push(0);
		return { pct: 0, cores: zero };
	},

	/* a CPU reading: shown, and kept for the next page (heldCpu) */
	keepCpu: function(cpu, now) {
		var d = now - (this.cpuSavedAt || 0);
		this.st.cpu = cpu;
		this.st.cpuMeasured = true;
		if (!(d >= 0 && d < CPU_SAVE_MS)) { this.cpuSavedAt = now; writeCpu({ pct: cpu.pct, cores: cpu.cores, t: now }); }
	},

	/* what a fast sample moves: the cards, the verdict, the path's uplink
	   wire and backdrop, the System tile's CPU, the throughput chart */
	paintFast: function() {
		var st = this.st;
		if (!this.m || !this.el || !this.el.root) return;
		st.health = insight.health(this.m, { cpu: this.cpuShown(), uplinkRate: st.uplinkRate, temps: st.temps, quiet: this.quiet });
		st.summary = insight.summary(st.health);
		this.paintHead();
		this.paintHealth();
		if (this.hero) this.updateHero();
		this.paintSystem();
		this.paintChart();
	},

	/* names beyond what one poll carries: reverse DNS once per new
	   address, mDNS every minute when present, the vendor table once;
	   for Wi-Fi clients and wired hosts alike */
	resolveMore: function(m) {
		var st = this.st, self = this;
		var ips = [], all = m.clients.concat(m.wiredHosts || []);
		/* answers are kept for the session, but only for addresses still
		   in use once there are many */
		if (Object.keys(st.rdns).length > 1024) {
			var keep = Object.create(null);
			all.forEach(function(c) { c.ips.forEach(function(ip) { if (ip in st.rdns) keep[ip] = st.rdns[ip]; }); });
			st.rdns = keep;
		}
		all.forEach(function(c) {
			c.ips.forEach(function(ip) { if (!(ip in st.rdns) && ips.indexOf(ip) < 0 && ips.length < 64) ips.push(ip); });
		});
		if (ips.length && !st.rdnsBusy && !st.rdnsOff) {
			st.rdnsBusy = true;
			ips.forEach(function(ip) { st.rdns[ip] = ''; });
			/* rpcd-mod-rrdns is optional: when the object or the grant is
			   missing the first call says so and reverse DNS stays off;
			   a timeout or a network error only skips this batch */
			callRrdns(ips, 1500, 1000).catch(function(e) {
				if (/ubus code [2-6]\b|error -320\d\d\b/.test(String(e && e.message))) st.rdnsOff = true;
				return {};
			}).then(function(res) {
				var hit = false;
				if (res && typeof res === 'object')
					Object.keys(res).forEach(function(ip) { if (typeof res[ip] === 'string' && ips.indexOf(ip) >= 0) { st.rdns[ip] = res[ip]; hit = true; } });
				if (hit) self.rerender();
			}).finally(function() { st.rdnsBusy = false; });
		}
		if (!st.mdnsOff && Date.now() - st.mdnsAt > 60000) {
			st.mdnsAt = Date.now();
			L.resolveDefault(callMdns(), null).then(function(r) { self.applyMdns(r); });
		}
		var wantVendor = all.some(function(c) { return c.nameSource === 'mac'; });
		if (wantVendor) this.loadOui();
	},

	/* the vendor table, once */
	loadOui: function() {
		var st = this.st, self = this;
		if (st.oui || st.ouiLoading) return;
		st.ouiLoading = true;
		L.require('vantage.oui').then(function(mod) { st.oui = mod; self.rerender(); }).catch(function() {});
	},

	/* rebuild the model from the last replies (names changed) */
	rerender: function() {
		if (!this.lastRaw) return;
		var st = this.st, raw = this.lastRaw;
		var m = model.build({
			board: this.board, info: raw.info, ifaces: raw.ifaces, devs: raw.devs, wifi: raw.wifi, iwinfo: raw.iwinfo,
			assoc: raw.assoc, hapd: raw.hapd, hapdStatus: raw.hapdStatus, hints: raw.hints, fdb: raw.fdb,
			switches: raw.switches, switchState: raw.switchState, routes: raw.routes, collector: raw.collector,
			aliases: this.aliases, rdns: st.rdns, mdns: st.mdns,
			vendor: st.oui ? function(k) { return k ? st.oui.lookup(k) : null; } : null
		});
		this.markWired(m, null);
		m.wg = st.wgSeen === true;
		this.markOffline(m, raw, null);
		this.notePorts(m);
		/* the provider tiles from the poll's answers again: no new sample */
		this.noteTiles(m, raw.provided, Date.now());
		this.stickyGen(m);
		m.clients.forEach(function(c) { c.exp = insight.experience(c); c.firstSeen = st.presence && st.presence.firstSeen[c.mac]; c.isNew = !!st.isNew[c.mac]; });
		st.talkers = this.talkers(m);
		st.health = insight.health(m, { cpu: this.cpuShown(), uplinkRate: st.uplinkRate, temps: st.temps, quiet: this.quiet });
		st.summary = insight.summary(st.health);
		this.m = m;
		this.paint();
	},

	refresh: function() {
		var self = this;
		if (document.hidden) { this.st.paused = true; this.paintLive(); return Promise.resolve(); }
		/* back from a hidden tab: CPU starts over, rather than read as the
		   average over the time nobody was looking */
		if (this.st.paused) { this.st.stat = null; this.st.paused = false; this.paintLive(); }
		/* one at a time; and none within 2 s of the last one's start (load()
		   has just asked for all of it, and a poll loop that starts runs what
		   it holds at once), or, idle (Low-power router), within
		   LOW_IDLE_POLL_MS; a clock stepped back counts as time gone */
		var since = Date.now() - (this.fullAt || 0);
		if (this.fetching || (since >= 0 && since < (this.idle() ? LOW_IDLE_POLL_MS : 2000))) return Promise.resolve();
		this.fullAt = Date.now();
		this.fetching = true;
		return this.fetch().then(function(raw) {
			self.ingest(raw);
			self.st.lastOk = Date.now();
			self.st.lastErr = null;
			self.paint();
		}).catch(function(err) {
			self.st.lastErr = err;
			self.paintLive();
		}).then(function() { self.fetching = false; });
	},

	/* Low-power router, and nobody has touched the page for LOW_IDLE_MS */
	idle: function() {
		return lowPower() && Date.now() - (this.inputAt || 0) > LOW_IDLE_MS;
	},

	/* input: the page is watched; back from idle, live at once (unless
	   LuCI's refresh is paused: its resume asks) */
	noteInput: function() {
		var was = this.idle();
		this.inputAt = Date.now();
		if (was && (typeof poll.active !== 'function' || poll.active())) this.refresh();
	},

	/* Low-power router switched (the theme's Appearance): the still
	   picture reduced motion has (app.css .vt-low: busy wires as a still
	   dotted line, no flow dots) and no backdrop; the pick stays for when
	   it is off */
	applyPower: function() {
		var low = lowPower();
		if (this.el && this.el.root) this.el.root.classList.toggle('vt-low', low);
		if (this.backdrop) { this.backdrop.style(low ? 'none' : this.backdropStyle); this.kickMotion(); }
		this.paintWireState();
		this.paintLive();
	},

	/* Speed units (the theme's Appearance): fmt reads them, and a page
	   that is built paints again in the unit picked (UNITS_EVENT), the
	   health cards with it: their texts are made when the data comes in */
	applyUnits: function() {
		fmt.setSpeedUnits(speedUnits());
		if (this.el && this.el.root) this.rehealth();
	},

	/* ----------------------------------------------------------- render */

	render: function(data) {
		var self = this;
		this.initState(data);
		/* before the first texts are made and the first build: the rates
		   read in the picked unit */
		this.applyUnits();
		this.ingest(data.raw);
		this.st.lastOk = Date.now();

		this.el = {};
		/* .vt-body is the size container for the layout; the drawer stays
		   outside it (a size container would trap position: fixed) */
		var root = E('div', { 'class': 'vt-app', 'id': 'vt-app' }, [
			E('div', { 'class': 'vt-body' }, [
				this.buildNews(),
				this.buildHead(),
				this.el.health = E('div', { 'class': 'vt-health', 'role': 'list', 'aria-label': _('Health checks', 'vantage') }),
				this.buildEditBar(),
				this.el.grid = E('div', { 'class': 'vt-grid vt-grid-wait' }, this.buildTiles())
			]),
			this.buildDrawer()
		]);
		this.el.root = root;
		root.classList.toggle('vt-low', lowPower());
		this.clock = { anims: [], raf: 0, timer: 0, last: 0 };
		root.addEventListener('animationstart', function(ev) { if (PULSE_NAME.test(ev.animationName || '')) self.adoptPulses(ev.target); });
		/* a pulse CSS took away (.vt-still) or ended (reduced motion
		   switched on: it turns finite, and a paused one stays "paused"):
		   dropped here, the animation the event is for, and any other
		   cancelled one; at the next step (stepMotion) when that comes
		   first */
		var dropPulses = function(ev) {
			if (!PULSE_NAME.test(ev.animationName || '') || !self.clock) return;
			self.clock.anims = self.clock.anims.filter(function(x) { return !pulseOf(x.a, ev) && x.a.playState !== 'idle'; });
		};
		root.addEventListener('animationcancel', dropPulses);
		root.addEventListener('animationend', dropPulses);
		/* wires follow the nodes' geometry: redrawn when the path or a
		   node changes size (observer callbacks run after layout, so the
		   reads there force nothing), never on a poll that moves nothing */
		if (window.ResizeObserver) this.wireRo = new ResizeObserver(function() { self.drawWires(); });

		this.paint();

		/* the fast lane first: a poll loop that starts here runs what it
		   holds at once, and load() has just asked for everything the full
		   poll would; the fast lane's first run only takes CPU's baseline,
		   after the page's own requests, so its first reading (at FAST_S)
		   is not the router building this page (#101) */
		this.inputAt = this.fullAt = Date.now();
		poll.add(L.bind(this.refreshFast, this), FAST_S);
		poll.add(L.bind(this.refresh, this), POLL_S);
		window.addEventListener('vantage:power', function() { self.applyPower(); });
		/* the theme's palette asks what fits its query */
		window.addEventListener(SEARCH_EVENT, function(ev) {
			var d = ev.detail;
			if (d && typeof d.add === 'function') d.add(self.searchEntries(d.query));
		});
		window.addEventListener('vantage:units', function() { self.applyUnits(); });
		window.addEventListener('vantage:unfocused', function() { self.paintLive(); });
		[ 'pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus' ].forEach(function(t) {
			window.addEventListener(t, function() { self.noteInput(); }, { passive: true });
		});
		this.focused = typeof document.hasFocus !== 'function' || document.hasFocus();
		window.addEventListener('blur', function() { self.focused = false; self.paintLive(); });
		window.addEventListener('focus', function() { self.focused = true; self.paintLive(); });
		document.addEventListener('visibilitychange', function() {
			/* the tab shown again: someone is looking */
			if (!document.hidden) self.inputAt = Date.now();
			if (!document.hidden && self.st.paused && poll.active()) self.refresh();
			else self.paintLive();
		});
		/* LuCI's refresh paused or resumed from its indicator; on resume
		   CPU starts over, rather than read as the average over the pause */
		document.addEventListener('poll-stop', function() { window.setTimeout(function() { self.paintLive(); }, 0); });
		document.addEventListener('poll-start', function() { self.st.stat = null; self.paintLive(); });
		document.addEventListener('keydown', L.bind(this.handleKey, this));
		window.setInterval(function() { self.paintLive(); }, 1000);
		if (window.ResizeObserver) {
			var ro = new ResizeObserver(function() { self.scheduleLayout(); });
			ro.observe(this.el.grid);
			/* and a provider's tile made later (addProvided) */
			this.tileRo = ro;
			this.tileList.forEach(function(id) {
				ro.observe(self.tiles[id]);
				/* a held min-height keeps the tile's box still while its
				   content changes: watch the content as well */
				Array.prototype.forEach.call(self.tiles[id].children, function(c) { if (!c.classList.contains('vt-ov')) ro.observe(c); });
			});
		}
		if (window.matchMedia) {
			var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
			if (motion.addEventListener) motion.addEventListener('change', function() { self.paintWireState(); });
		}
		window.addEventListener('resize', function() { self.scheduleLayout(); });
		window.addEventListener('hashchange', function() { self.openFromHash(); });
		window.requestAnimationFrame(function() { if (!self.wireRo) self.drawWires(); self.openFromHash(); });
		return root;
	},

	paint: function() {
		this.addProvided();
		this.el.root.classList.toggle('vt-wired', !!this.m.wired);
		this.paintHead();
		this.paintHealth();
		this.paintHero();
		this.paintSystem();
		this.paintChart();
		this.paintRadios();
		this.paintClients();
		this.paintTalkers();
		this.paintSsids();
		this.paintWireguard();
		this.paintPorts();
		this.paintTiles();
		this.paintDrawer();
		this.paintLive();
		if (!this.wireRo) this.scheduleWires();
		/* the tiles' ResizeObserver lays out again when a tile changes
		   size, so a poll lays out only when the tile set may change (the
		   first one, wired or not, a WireGuard tunnel or none, ports or
		   none, the provider tiles); one that changes nothing measures
		   nothing */
		var extra = (this.m.extra || []).join(' ');
		if (this.laidWired !== !!this.m.wired || this.laidWg !== !!this.m.wg || this.laidPorts !== !!this.m.portsTile || this.laidExtra !== extra) {
			this.laidWired = !!this.m.wired; this.laidWg = !!this.m.wg; this.laidPorts = !!this.m.portsTile; this.laidExtra = extra;
			this.scheduleLayout();
		}
	},

	/* ------------------------------------------------------------ folds */

	foldButton: function(key, label) {
		var self = this;
		var btn = E('button', { 'type': 'button', 'class': 'vt-fold-btn', 'aria-expanded': 'true', 'aria-label': label, 'title': label,
			'click': function() { self.toggleFold(key); } }, [ icon('chevron') ]);
		this.foldBtns[key] = btn;
		return btn;
	},

	foldable: function(key, el) {
		this.foldEls[key] = el;
		el.classList.add('vt-fold');
		this.applyFold(key);
		return el;
	},

	applyFold: function(key) {
		var folded = !!this.folds[key], el = this.foldEls[key], btn = this.foldBtns[key];
		if (el) el.classList.toggle('vt-folded', folded);
		if (btn) btn.setAttribute('aria-expanded', String(!folded));
	},

	toggleFold: function(key) {
		this.folds[key] = !this.folds[key];
		writeFolds(this.folds);
		this.applyFold(key);
		if (this.held) delete this.held[key];
		if (key === 'hero' && !this.wireRo) this.scheduleWires();
		if (key === 'chart') this.paintChart();
	},

	/* ----------------------------------------------------------- layout */

	/* the tiles in a fixed set; vantage.layout decides order and size */
	buildTiles: function() {
		var self = this;
		this.tiles = {
			hero: this.buildHero(), chart: this.buildChart(), radios: this.buildRadios(), clients: this.buildClients(),
			ports: this.buildPorts(),
			sys: this.buildSystem(), talk: this.buildTalkers(), ssids: this.buildSsids(), wg: this.buildWireguard()
		};
		this.tileNames = {
			hero: _('Network path'), chart: _('Throughput', 'vantage'), radios: _('Radios'), clients: _('Clients'),
			ports: _('Ports'),
			sys: _('System'), talk: _('Top talkers', 'vantage'), ssids: _('Wireless networks', 'vantage'), wg: _('WireGuard')
		};
		/* and one for each provider this login may ask (buildProvided) */
		this.tileList = layout.TILES.concat(this.buildProvided());
		this.ov = {};
		this.el.ghost = E('div', { 'class': 'vt-drop-ghost', 'aria-hidden': 'true' });
		return [ this.el.ghost ].concat(this.tileList.map(function(id) {
			var t = self.tiles[id];
			t.classList.add('vt-cell');
			t.appendChild(self.buildOverlay(id));
			return t;
		}));
	},

	/* the stored layout for this screen class, or the default; wg: with
	   the WireGuard tile (a tunnel was seen); ports: with the Ports tile
	   (two ports were); extra: with these provider tiles */
	layoutFor: function(tier, wired, wg, ports, extra) {
		var k = layout.key(tier, wired);
		return layout.normalize(this.layouts[k] || null, tier, wired, wg, ports, extra);
	},

	scheduleLayout: function() {
		if (this.layoutRaf || !this.el || !this.el.grid) return;
		var self = this;
		this.layoutRaf = window.requestAnimationFrame(function() { self.layoutRaf = null; self.doLayout(); });
	},

	/* measure the shown tiles at their widths, pack them, place them;
	   widths and columns come from CSS (--c, --w, --cols), only the
	   vertical positions from here */
	doLayout: function() {
		var self = this, grid = this.el.grid, tiles = this.tiles;
		var width = grid.clientWidth;
		if (!width || !this.m) return;
		var tier = layout.tier(width), cols = layout.cols(tier), wired = !!this.m.wired, wg = !!this.m.wg, ports = !!this.m.portsTile, extra = this.m.extra;
		var list = this.drag ? this.drag.list : this.layoutFor(tier, wired, wg, ports, extra);
		var gap = parseFloat(window.getComputedStyle(grid).getPropertyValue('--vt-gap')) || 14;
		var shown = list.filter(function(e) { return !e.hide; });
		var on = Object.create(null);
		shown.forEach(function(e) { on[e.id] = true; });

		/* keep what the viewer is reading in place when tiles above change */
		var sc = document.scrollingElement || document.documentElement, anchor = null, before = 0;
		if (sc.scrollTop > 0 && !this.drag) {
			for (var i = 0; i < shown.length && !anchor; i++) {
				var r0 = tiles[shown[i].id].getBoundingClientRect();
				if (r0.height && r0.bottom > 0) { anchor = tiles[shown[i].id]; before = r0.top; }
			}
		}

		grid.style.setProperty('--cols', cols.toFixed(0));
		Object.keys(tiles).forEach(function(id) { tiles[id].classList.toggle('vt-cell-off', !on[id]); });
		shown.forEach(function(e) {
			var t = tiles[e.id];
			t.style.setProperty('--c', Math.min(e.c, cols - 1).toFixed(0));
			t.style.setProperty('--w', Math.min(e.w, cols).toFixed(0));
			t.style.minHeight = '';
		});
		/* arranging: each tile's content starts below its handle bar */
		if (this.editing) {
			var bars = shown.map(function(e) { return self.ov[e.id].bar.offsetHeight; });
			shown.forEach(function(e, k) { tiles[e.id].style.setProperty('--vt-ovh', bars[k].toFixed(0) + 'px'); });
		}
		/* live content changes hold a tile's height for a while; a new
		   width or an edit shows true sizes at once */
		if (this.heldWidth !== width || this.drag) { this.held = Object.create(null); this.heldWidth = width; }
		var held = this.held, now = Date.now();
		var items = shown.map(function(e) {
			var nat = tiles[e.id].getBoundingClientRect().height;
			held[e.id] = layout.settle(held[e.id], nat, now);
			return { id: e.id, c: e.c, w: e.w, h: held[e.id].h, nat: nat };
		});
		var p = layout.pack(items, cols, gap);
		items.forEach(function(it) {
			var r = p.rects[it.id], t = tiles[it.id];
			if (r.h > it.nat + 0.5) t.style.minHeight = r.h.toFixed(1) + 'px';
			t.style.setProperty('--y', r.top.toFixed(1) + 'px');
		});
		grid.style.height = p.height.toFixed(1) + 'px';
		/* polls no longer lay out, so the end of a hold needs its own wake-up */
		var wait = layout.nextRelease(held, now);
		if (this.holdTimer) { window.clearTimeout(this.holdTimer); this.holdTimer = null; }
		if (wait != null) this.holdTimer = window.setTimeout(function() { self.holdTimer = null; self.scheduleLayout(); }, wait + 50);
		var g = this.drag && p.rects[this.drag.id], ghost = this.el.ghost;
		ghost.classList.toggle('vt-on', !!g);
		if (g) {
			ghost.style.setProperty('--c', g.c.toFixed(0));
			ghost.style.setProperty('--w', g.w.toFixed(0));
			ghost.style.setProperty('--y', g.top.toFixed(1) + 'px');
			ghost.style.height = g.h.toFixed(1) + 'px';
		}
		this.lay = { tier: tier, cols: cols, wired: wired, wg: wg, ports: ports, extra: extra, list: list, rects: p.rects, gap: gap, width: width };

		/* reading and tab order follow the layout; not while dragging,
		   moving the dragged tile would end the drag */
		if (!this.drag) {
			var want = shown.map(function(e) { return tiles[e.id]; });
			var have = Array.prototype.filter.call(grid.children, function(c) { return c.classList.contains('vt-cell') && !c.classList.contains('vt-cell-off'); });
			if (want.some(function(t, k) { return have[k] !== t; })) {
				var focus = document.activeElement;
				want.forEach(function(t) { grid.appendChild(t); });
				if (focus && focus !== document.activeElement && grid.contains(focus)) focus.focus();
			}
		}
		if (anchor) {
			var d = anchor.getBoundingClientRect().top - before;
			if (Math.abs(d) > 0.5) sc.scrollTop += d;
		}
		grid.classList.remove('vt-grid-wait');
		if (this.editing) this.paintEdit();
	},

	setLayout: function(list) {
		var l = this.lay;
		if (!l) return;
		var k = layout.key(l.tier, l.wired);
		if (layout.same(list, layout.defaults(l.tier, l.wired, l.wg, l.ports, l.extra))) this.clearLayout(k);
		else this.layouts[k] = layout.compact(this.keepAbsent(list, this.layouts[k]));
		writeLayouts(this.layouts);
		this.viewChanged(layout.option(k));
		this.held = Object.create(null);
		this.doLayout();
	},

	/* A tile that does not exist right now (no tunnel is reported, a
	   provider not answering or not installed) is in no list being
	   arranged. Where the stored layout has it, it keeps its entry,
	   hidden or not, after the tile it followed there, so that it is
	   where it was put once it is back. Provider tiles only while the
	   list has room: layout.EXTRA_MAX in all, those shown now first, so
	   a stored layout stays within the twelve tiles the theme keeps */
	keepAbsent: function(list, stored) {
		var out = list.slice(), prev = null;
		var room = layout.EXTRA_MAX - list.filter(function(e) { return layout.isExtra(e.id); }).length;
		(Array.isArray(stored) ? stored : []).forEach(function(e) {
			var at = -1, i;
			if (!e || !(layout.TILES.indexOf(e.id) >= 0 || layout.isExtra(e.id))) return;
			if (layout.isExtra(e.id) && layout.indexOf(out, e.id) < 0 && room-- <= 0) return;
			for (i = 0; i < out.length; i++) {
				if (out[i].id === e.id) { prev = e.id; return; }
				if (out[i].id === prev) at = i;
			}
			out.splice(at + 1, 0, e);
			prev = e.id;
		});
		return out;
	},

	/* back to the default. The router's layout would come back on reload
	   (for a login that can't save, or before Done), so this browser keeps
	   an empty one of its own, which normalize reads as the default. */
	clearLayout: function(k) {
		if (k in layout.decode(lookAttr('data-vt-look-layout'))) this.layouts[k] = [];
		else delete this.layouts[k];
	},

	editTile: function(id, fn, say) {
		var l = this.lay;
		if (!l) return;
		var next = fn(l.list);
		if (layout.same(next, l.list)) return;
		this.setLayout(next);
		if (say) this.announce(say);
	},

	announce: function(text) {
		var s = this.el.editSay;
		dom.content(s, []);
		window.setTimeout(function() { txt(s, text); }, 30);
	},

	/* leave: close without saving (Esc or the Customize button after a
	   failed save; Done tries again) */
	setEditing: function(on, leave) {
		if (!on && this.editing && !leave && this.saveView()) return;
		this.editing = !!on;
		this.el.root.classList.toggle('vt-editing', this.editing);
		this.el.layoutBtn.setAttribute('aria-pressed', String(this.editing));
		this.el.editBar.hidden = !this.editing;
		/* the handle bars change the tiles' heights both ways: true sizes
		   at once, nothing held from the other mode */
		this.held = Object.create(null);
		this.doLayout();
		if (this.editing) {
			this.viewFailed = false;
			this.editNote(lookAttr('data-vt-look-save') === 'relogin' ? _('Log in again to save this for every browser.') : '');
			this.el.editDone.focus();
		}
		else this.el.layoutBtn.focus();
	},

	editNote: function(text) {
		this.el.editNote.hidden = !text;
		txt(this.el.editNote, text);
	},

	/* the options of /etc/config/vantage_theme this dashboard stands for */
	viewValues: function() {
		var self = this, out = { chart: this.chartStyle, path: this.pathForm };
		[ 'wide', 'mid', 'narrow' ].forEach(function(tier) {
			[ false, true ].forEach(function(wired) {
				var k = layout.key(tier, wired);
				out[layout.option(k)] = self.layouts[k] && self.layouts[k].length ? layout.encode(self.layouts[k]) : 'default';
			});
		});
		return out;
	},

	/* this option changed under Customize, for a login that may save it */
	viewChanged: function(opt) {
		if (!lookSaves()) return;
		var list = readUnsaved();
		if (list.indexOf(opt) < 0) writeUnsaved(list.concat(opt));
	},

	/* Done: what changed goes to the theme in one write. True while that
	   runs: Customize closes when it is saved, and stays open with a note
	   if it was not, so the pick can be saved again. */
	saveView: function() {
		var self = this, now = this.viewValues(), out = {};
		if (this.viewSaving) return true;
		readUnsaved().forEach(function(k) { out[k] = now[k]; });
		if (!Object.keys(out).length) return false;
		this.viewSaving = offerView(out, function(ok) {
			self.viewSaving = false;
			self.viewFailed = !ok;
			if (!ok) { self.editNote(_('Could not save this for every browser. Try again.')); return; }
			/* anything changed since it was sent goes out on this close */
			var then = self.viewValues();
			writeUnsaved(readUnsaved().filter(function(k) { return then[k] !== out[k]; }));
			self.setEditing(false);
		});
		return this.viewSaving;
	},

	/* the throughput chart style, picked under Customize */
	buildChartPick: function() {
		var self = this, names = {
			'overlay': _('Overlaid'),
			'log': _('Overlaid, log scale'),
			'mirror': _('Mirrored'),
			'mirror-split': _('Mirrored, scale per direction'),
			'lanes': _('Separate lanes')
		};
		var pick = E('select', { 'class': 'vt-select', 'id': 'vt-chart-style', 'change': function(ev) { self.setChartStyle(ev.target.value); } },
			series.CHART_STYLES.map(function(k) { return E('option', { 'value': k }, [ names[k] ]); }));
		pick.value = this.chartStyle;
		return E('div', { 'class': 'vt-edit-field' }, [ E('label', { 'for': 'vt-chart-style' }, [ _('Throughput chart') ]), pick ]);
	},

	/* the network path's form, picked beside the chart style */
	buildPathPick: function() {
		var self = this, names = {
			'full': _('Full', 'vantage'),
			'compact': _('Compact, one line each')
		};
		var pick = E('select', { 'class': 'vt-select', 'id': 'vt-path-form', 'change': function(ev) { self.setPathForm(ev.target.value); } },
			PATH_FORMS.map(function(k) { return E('option', { 'value': k }, [ names[k] ]); }));
		pick.value = this.pathForm;
		return E('div', { 'class': 'vt-edit-field' }, [ E('label', { 'for': 'vt-path-form' }, [ _('Network path') ]), pick ]);
	},

	/* the network path's backdrop, picked under Customize; under the
	   Vantage theme it is in Appearance instead (menu-vantage.js) */
	buildBackdropPick: function() {
		if (vantageTheme()) return '';
		var self = this, names = { 'grid': _('Grid'), 'stars': _('Starfield'), 'none': _('None') };
		var pick = E('select', { 'class': 'vt-select', 'id': 'vt-backdrop-style', 'change': function(ev) { self.setBackdrop(ev.target.value); } },
			backdrop.STYLES.map(function(k) { return E('option', { 'value': k }, [ names[k] ]); }));
		pick.value = this.backdropStyle;
		this.backdropPick = pick;
		return E('div', { 'class': 'vt-edit-field' }, [ E('label', { 'for': 'vt-backdrop-style' }, [ _('Network path background') ]), pick ]);
	},

	/* picked here (Customize): saved, and shown */
	setBackdrop: function(v) {
		if (backdrop.STYLES.indexOf(v) < 0 || v === this.backdropStyle) return;
		writeBackdrop(v);
		this.showBackdrop(v);
	},

	/* picked elsewhere (the theme's Appearance, another tab): shown only,
	   never saved back */
	showBackdrop: function(v) {
		if (backdrop.STYLES.indexOf(v) < 0 || v === this.backdropStyle) return;
		this.backdropStyle = v;
		if (this.backdrop) { this.backdrop.style(lowPower() ? 'none' : v); this.kickMotion(); }
		if (this.backdropPick && this.backdropPick.value !== v) this.backdropPick.value = v;
	},

	setChartStyle: function(v) {
		if (series.CHART_STYLES.indexOf(v) < 0 || v === this.chartStyle) return;
		this.chartStyle = v;
		writeChartStyle(v);
		this.viewChanged('chart');
		this.chartHide();
		this.paintChart();
	},

	/* the path built again in the other form; its tile takes its new
	   height at once, not after the 30 s a shrinking tile is held */
	setPathForm: function(v) {
		if (PATH_FORMS.indexOf(v) < 0 || v === this.pathForm) return;
		this.pathForm = v;
		writePathForm(v);
		this.viewChanged('path');
		if (this.held) delete this.held.hero;
		if (this.m && this.hero) this.paintHero();
		if (!this.wireRo) this.scheduleWires();
	},

	buildEditBar: function() {
		var self = this, el = this.el;
		el.editHint = E('span', { 'class': 'vt-hint' });
		el.editNote = E('span', { 'class': 'vt-edit-note', 'role': 'status', 'hidden': 'hidden' });
		el.editHidden = E('div', { 'class': 'vt-edit-hidden' });
		el.editSay = E('span', { 'class': 'vt-sr', 'role': 'status', 'aria-live': 'polite' });
		el.editBar = E('div', { 'class': 'vt-editbar', 'role': 'region', 'aria-label': _('Customize the dashboard'), 'hidden': 'hidden' }, [
			E('div', { 'class': 'vt-editbar-text' }, [ E('strong', {}, [ _('Customize the dashboard') ]), el.editHint, el.editNote ]),
			el.editHidden,
			E('div', { 'class': 'vt-edit-picks' }, [ this.buildChartPick(), this.buildPathPick(), this.buildBackdropPick() ]),
			E('div', { 'class': 'vt-editbar-actions' }, [
				E('button', { 'type': 'button', 'class': 'vt-btn', 'click': function() {
					var l = self.lay;
					if (!l) return;
					self.clearLayout(layout.key(l.tier, l.wired));
					writeLayouts(self.layouts);
					self.viewChanged(layout.option(layout.key(l.tier, l.wired)));
					self.held = Object.create(null);
					self.doLayout();
					self.announce(_('Layout reset'));
				} }, [ _('Reset') ]),
				el.editDone = E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-primary', 'click': function() { self.setEditing(false); } }, [ _('Done', 'vantage') ])
			]),
			el.editSay
		]);
		return el.editBar;
	},

	/* the controls laid over a tile while arranging */
	buildOverlay: function(id) {
		var self = this, name = this.tileNames[id], o = {};
		function btn(cls, ic, label, fn) {
			return E('button', { 'type': 'button', 'class': 'vt-ov-btn ' + cls, 'aria-label': label, 'title': label, 'click': fn }, [ icon(ic) ]);
		}
		o.grip = E('button', { 'type': 'button', 'class': 'vt-ov-grip', 'aria-label': _('Move %s: drag, or use the arrow keys').format(name), 'title': _('Drag to move') }, [ icon('grip') ]);
		o.grip.addEventListener('pointerdown', function(ev) { self.dragStart(id, ev); });
		o.grip.addEventListener('keydown', function(ev) {
			var k = ev.key, act = k === 'ArrowLeft' ? o.left : k === 'ArrowRight' ? o.right : k === 'ArrowUp' ? o.up : k === 'ArrowDown' ? o.down : null;
			if (!act) return;
			ev.preventDefault();
			if (!act.disabled) act.click();
		});
		o.left = btn('vt-ov-col vt-ov-lr', 'left', _('Move %s left').format(name), function() {
			self.editTile(id, function(l) { return layout.shift(l, id, -1, self.lay.tier); }, _('%s moved left').format(name));
		});
		o.right = btn('vt-ov-col vt-ov-lr vt-ov-flip', 'left', _('Move %s right').format(name), function() {
			self.editTile(id, function(l) { return layout.shift(l, id, 1, self.lay.tier); }, _('%s moved right').format(name));
		});
		o.up = btn('', 'up', _('Move %s up').format(name), function() {
			self.editTile(id, function(l) { return layout.move(l, id, -1); }, _('%s moved up').format(name));
		});
		o.down = btn('', 'down', _('Move %s down').format(name), function() {
			self.editTile(id, function(l) { return layout.move(l, id, 1); }, _('%s moved down').format(name));
		});
		o.narrow = btn('vt-ov-col', 'minus', _('Make %s narrower').format(name), function() {
			self.editTile(id, function(l) { return layout.resize(l, id, -1, self.lay.tier); }, _('%s is narrower').format(name));
		});
		o.wide = btn('vt-ov-col', 'plus', _('Make %s wider').format(name), function() {
			self.editTile(id, function(l) { return layout.resize(l, id, 1, self.lay.tier); }, _('%s is wider').format(name));
		});
		o.size = E('span', { 'class': 'vt-ov-size vt-ov-col vt-tn' });
		o.hide = btn('vt-ov-hide', 'hide', _('Hide %s').format(name), function() {
			self.editTile(id, function(l) { return layout.setHidden(l, id, true); }, _('%s hidden').format(name));
			self.el.editDone.focus();
		});
		o.root = E('div', { 'class': 'vt-ov vt-fold-keep', 'role': 'group', 'aria-label': name }, [
			o.bar = E('div', { 'class': 'vt-ov-bar' }, [
				o.grip,
				E('span', { 'class': 'vt-ov-name' }, [ name ]),
				E('span', { 'class': 'vt-ov-btns' }, [ o.up, o.down, o.left, o.right, o.narrow, o.size, o.wide, o.hide ])
			])
		]);
		this.ov[id] = o;
		return o.root;
	},

	/* button states, sizes and the hidden-tile list for the current layout */
	paintEdit: function() {
		var self = this, l = this.lay;
		if (!l) return;
		var shown = l.list.filter(function(e) { return !e.hide; });
		var every = lookSaves();
		txt(this.el.editHint, l.tier === 'wide' ? (every ? _('Drag a tile by its handle or use its buttons. Done saves it for wide screens in every browser.') : _('Drag a tile by its handle or use its buttons. Saved in this browser for wide screens.'))
			: l.tier === 'mid' ? (every ? _('Drag a tile by its handle or use its buttons. Done saves it for medium screens in every browser.') : _('Drag a tile by its handle or use its buttons. Saved in this browser for medium screens.'))
			: every ? _('Drag a tile by its handle or use its buttons. Done saves it for narrow screens in every browser.') : _('Drag a tile by its handle or use its buttons. Saved in this browser for narrow screens.'));
		this.el.root.classList.toggle('vt-edit-1col', l.cols === 1);
		shown.forEach(function(e, i) {
			var o = self.ov[e.id];
			o.up.disabled = i === 0;
			o.down.disabled = i === shown.length - 1;
			o.left.disabled = e.c <= 0;
			o.right.disabled = e.c + e.w >= l.cols;
			o.narrow.disabled = e.w <= layout.minW(e.id, l.tier);
			o.wide.disabled = e.w >= l.cols;
			o.hide.disabled = shown.length <= 1;
			txt(o.size, e.w + '/' + l.cols);
			o.size.setAttribute('title', _('%d of %d columns').format(e.w, l.cols));
		});
		var hidden = l.list.filter(function(e) { return e.hide; });
		dom.content(this.el.editHidden, hidden.length ? [ E('span', { 'class': 'vt-label' }, [ _('Hidden', 'vantage') ]) ].concat(hidden.map(function(e) {
			var name = self.tileNames[e.id];
			return E('button', { 'type': 'button', 'class': 'vt-fchip', 'title': _('Show %s').format(name), 'click': function() {
				self.editTile(e.id, function(list) { return layout.setHidden(list, e.id, false); }, _('%s shown').format(name));
			} }, [ icon('plus'), E('span', {}, [ name ]) ]);
		})) : []);
	},

	/* dragging by the handle: the tile follows the pointer, the others
	   make room where it would land */
	dragStart: function(id, ev) {
		if (ev.button !== 0 || !this.lay || this.drag) return;
		ev.preventDefault();
		var self = this, t = this.tiles[id], grip = this.ov[id].grip, tr = t.getBoundingClientRect();
		try { grip.setPointerCapture(ev.pointerId); } catch (e) {}
		this.drag = { id: id, list: layout.copy(this.lay.list), start: layout.copy(this.lay.list), gx: ev.clientX - tr.left, gy: ev.clientY - tr.top, x: ev.clientX, y: ev.clientY, raf: null };
		t.classList.add('vt-dragging');
		this.el.root.classList.add('vt-drag-on');
		function move(e) { self.drag.x = e.clientX; self.drag.y = e.clientY; self.dragMove(); }
		function end(e) {
			grip.removeEventListener('pointermove', move);
			grip.removeEventListener('pointerup', end);
			grip.removeEventListener('pointercancel', end);
			self.dragEnd(e.type === 'pointercancel');
		}
		grip.addEventListener('pointermove', move);
		grip.addEventListener('pointerup', end);
		grip.addEventListener('pointercancel', end);
		this.dragMove();
		this.dragScroll();
	},

	dragMove: function() {
		var d = this.drag, l = this.lay;
		if (!d || !l) return;
		var t = this.tiles[d.id], gr = this.el.grid.getBoundingClientRect();
		var x = d.x - gr.left - d.gx, y = d.y - gr.top - d.gy;
		t.style.left = x.toFixed(1) + 'px';
		t.style.top = y.toFixed(1) + 'px';

		var step = (l.width + l.gap) / l.cols, me = d.list[layout.indexOf(d.list, d.id)];
		var c = Math.max(0, Math.min(l.cols - me.w, Math.round(x / step)));
		var px = d.x - gr.left, py = d.y - gr.top, target = null, after = false;
		d.list.forEach(function(e) {
			var r = l.rects[e.id];
			if (e.hide || e.id === d.id || !r) return;
			var rx = r.c * step, rw = r.w * step - l.gap;
			if (px >= rx && px <= rx + rw && py >= r.top && py <= r.top + r.h) {
				target = e.id;
				after = py > r.top + r.h / 2;
			}
		});
		var next = layout.drop(d.list, d.id, c, target, after, l.tier);
		if (!layout.same(next, d.list)) { d.list = next; this.doLayout(); }
	},

	/* scroll while the pointer rests near the top or bottom edge */
	dragScroll: function() {
		var self = this, d = this.drag;
		if (!d) return;
		var edge = 64, v = d.y < edge ? -(edge - d.y) / 4 : d.y > window.innerHeight - edge ? (d.y - window.innerHeight + edge) / 4 : 0;
		if (v) { window.scrollBy(0, Math.round(v)); this.dragMove(); }
		d.raf = window.requestAnimationFrame(function() { self.dragScroll(); });
	},

	dragEnd: function(cancel) {
		var d = this.drag;
		if (!d) return;
		if (d.raf) window.cancelAnimationFrame(d.raf);
		var t = this.tiles[d.id];
		t.classList.remove('vt-dragging');
		this.el.root.classList.remove('vt-drag-on');
		t.style.left = '';
		t.style.top = '';
		var list = cancel ? d.start : d.list;
		this.drag = null;
		if (!layout.same(list, d.start)) {
			this.setLayout(list);
			this.announce(_('%s moved').format(this.tileNames[d.id]));
		}
		else this.doLayout();
	},

	/* ------------------------------------------------------------- head */

	/* "Vantage 1.1.0: what's new" (newsDue), in the look of the details'
	   notes. Above the head, so outside the grid: the layout measures the
	   grid's width and its tiles, and closing the line moves the page up
	   as a whole. Followed counts a middle click too (a new tab). */
	buildNews: function() {
		var el = this.el;
		if (!newsDue()) return '';
		function seen() { writeSeen(VERSION); el.news.hidden = true; }
		function followed(ev) { if (ev.type === 'click' || ev.button === 1) seen(); }
		el.news = E('div', { 'class': 'vt-banner vt-banner-muted vt-news' }, [
			icon('info'),
			E('a', { 'class': 'vt-link', 'href': NEWS_URL, 'target': '_blank', 'rel': 'noopener noreferrer', 'click': followed, 'auxclick': followed }, [
				_('Vantage %s: what\'s new').format(VERSION) ]),
			E('button', { 'type': 'button', 'class': 'vt-icon-action', 'aria-label': _('Close'), 'title': _('Close'),
				'click': function() { seen(); el.layoutBtn.focus(); } }, [ icon('close') ])
		]);
		return el.news;
	},

	buildHead: function() {
		var el = this.el;
		return E('header', { 'class': 'vt-head' }, [
			el.orb = E('span', { 'class': 'vt-orb' }, [ E('span', { 'class': 'vt-orb-core' }) ]),
			E('div', { 'class': 'vt-head-text' }, [
				el.headline = E('h2', { 'class': 'vt-headline' }),
				el.subline = E('p', { 'class': 'vt-subline' })
			]),
			el.live = E('div', { 'class': 'vt-livepill', 'role': 'status', 'aria-live': 'off' }, [
				E('span', { 'class': 'vt-live-beat' }),
				el.liveText = E('span', { 'class': 'vt-live-text' })
			]),
			el.layoutBtn = E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost vt-layout-btn', 'aria-pressed': 'false',
				'title': _('Customize the dashboard'), 'click': L.bind(function() { this.setEditing(!this.editing, this.viewFailed); }, this) }, [
				icon('layout'), E('span', {}, [ _('Customize') ])
			])
		]);
	},

	/* the device and its clients; the firmware is in the System tile */
	paintHead: function() {
		/* this device's own: a paired access point's stations are on its branch */
		var s = this.st.summary, clients = this.m.clients.filter(function(c) { return !c.ap; }).length;
		this.el.orb.className = 'vt-orb vt-orb-' + s.level;
		/* the Vantage theme's refresh dot pulses fast in the same colour
		   while something needs attention (vantage.css), and its tab
		   title says how many things do (menu-vantage.js alertMark) */
		var needs = s.level === 'warn' || s.level === 'err';
		document.documentElement.setAttribute('data-vt-alert', needs ? s.level : '');
		document.documentElement.setAttribute('data-vt-alert-count', needs && s.count > 0 ? String(s.count) : '');
		txt(this.el.headline, s.headline);
		txt(this.el.subline, this.identity(this.m.device).concat(
			this.m.wired ? [] : [ clients === 1 ? _('1 client') : _('%d clients').format(clients) ]).join('  ·  '));
	},

	/* model and hostname, or the one of them that holds the other
	   ("Example AX3000", "example-ax3000"), compared in lower case on
	   letters and digits only */
	identity: function(d) {
		/* letters and digits of any script, as the theme's host chip compares them */
		var key = function(v) { return String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); };
		var a = key(d.model), b = key(d.hostname);
		if (a && b && a.indexOf(b) >= 0) return [ d.model ];
		if (a && b && b.indexOf(a) >= 0) return [ d.hostname ];
		return [ d.model, d.hostname ].filter(Boolean);
	},

	paintLive: function() {
		if (!this.el || !this.el.live) return;
		var st = this.st, state, label;
		/* LuCI's own refresh can be paused (its indicator in the header) */
		var stopped = typeof poll.active === 'function' && !poll.active();
		if (st.paused || document.hidden || stopped) { state = 'paused'; label = stopped && !document.hidden ? _('Paused') : _('Paused while hidden'); }
		else if (st.lastErr) { state = 'err'; label = _('Reconnecting…', 'vantage'); }
		else { state = 'ok'; label = _('Live') + ' · ' + fmt.ago(Date.now() - st.lastOk); }
		this.el.live.className = 'vt-livepill vt-live-' + state;
		/* the Vantage theme's refresh dot pulses fast and amber while this
		   reconnects (vantage.css) */
		document.documentElement.setAttribute('data-vt-live', state);
		/* the Vantage theme's poll indicator already says the page is
		   live, or that its refresh is paused: then this pill shows only
		   when neither */
		this.el.live.hidden = (state === 'ok' || stopped) && vantageTheme();
		this.el.live.setAttribute('title', label);
		txt(this.el.liveText, label);
		this.setMotion(state !== 'paused' && (this.focused !== false || movesUnfocused()) && !lowPower());
	},

	/* Nothing moves while the page is paused or another window has the
	   focus (the numbers still update; with Motion when not in focus on,
	   the focus stops nothing): the status circle's ring and the
	   live beat (app.css, .vt-still), the flow dots stay where they are
	   and the backdrop keeps its last frame. A moving part keeps the
	   browser drawing every frame. */
	setMotion: function(on) {
		if (this.motionOn === on) return;
		this.motionOn = on;
		if (this.el && this.el.root) this.el.root.classList.toggle('vt-still', !on);
		if (this.backdrop) this.backdrop.pause(!on);
		if (!STEP_DOTS) {
			var map = this.wireMap || {};
			Object.keys(map).forEach(function(k) { map[k].anims.forEach(function(a) { if (on) a.play(); else a.pause(); }); });
		}
		/* the dots and the pulses stand where they are: the clock stops */
		this.kickMotion();
	},

	/* ----------------------------------------------------- motion clock */

	/* a CSS pulse that just started (the status circle's ring, the Live
	   beat; animationstart bubbles from the element the pseudo-element
	   belongs to): paused, and stepped by the clock from now on. One
	   that CSS takes away (.vt-still, reduced motion) goes idle and is
	   dropped at the next step */
	adoptPulses: function(el) {
		var c = this.clock;
		if (!c || !el || typeof el.getAnimations !== 'function') return;
		el.getAnimations({ subtree: true }).forEach(function(a) {
			if (!a.effect || !PULSE_NAME.test(a.animationName || '') || a.playState !== 'running') return;
			if (c.anims.some(function(x) { return x.a === a; })) return;
			a.pause();
			c.anims.push({ a: a, dur: pulseDuration(a), at: 0 });
		});
		this.kickMotion();
	},

	/* is there anything for the clock to move? */
	motionBusy: function() {
		var c = this.clock, map = this.wireMap || {};
		if (!c || !this.motionOn) return false;
		if (c.anims.length || (this.backdrop && this.backdrop.wants())) return true;
		return STEP_DOTS && Object.keys(map).some(function(k) { return map[k].steps.length > 0; });
	},

	/* start the clock when it has work and is not running; it stops by
	   itself when the work is gone */
	kickMotion: function() {
		var self = this, c = this.clock;
		if (!c || c.raf || c.timer || !this.motionBusy()) return;
		c.last = 0;
		c.raf = window.requestAnimationFrame(function(t) { self.tickMotion(t); });
	},

	tickMotion: function(t) {
		var self = this, c = this.clock;
		c.raf = 0;
		if (!this.motionBusy()) { c.last = 0; return; }
		/* the first tick after a rest, or a frame the browser held back
		   (a hidden tab), moves nothing far */
		var dt = c.last ? Math.min(t - c.last, 4 * MOTION_MS) : 0;
		c.last = t;
		this.stepMotion(dt, t);
		var period = this.backdrop && this.backdrop.wants() ? this.backdrop.period() : MOTION_MS;
		/* the wait ends a little early, the browser's next frame is the one */
		c.timer = window.setTimeout(function() {
			c.timer = 0;
			if (!c.raf) c.raf = window.requestAnimationFrame(function(t) { self.tickMotion(t); });
		}, Math.max(0, period - 12));
	},

	/* dt ms on: the pulses, the dots at their wires' speeds, the
	   backdrop's frame; then the theme's clock (vantage:tick) */
	stepMotion: function(dt, t) {
		var c = this.clock, map = this.wireMap || {};
		/* one CSS cancelled since the last step is dropped, not stepped: a
		   time written to a cancelled animation brings it back, paused,
		   with nothing left to stop it (its animationcancel comes after) */
		c.anims = c.anims.filter(function(x) { return x.a.playState !== 'idle'; });
		c.anims.forEach(function(x) { stepAnim(x, dt); });
		if (STEP_DOTS) Object.keys(map).forEach(function(k) {
			var g = map[k], rate = wires.rate(g.speed);
			g.steps.forEach(function(x) { stepAnim(x, dt * rate); });
		});
		if (this.backdrop) this.backdrop.frame(t);
		var ev = null;
		try { ev = new CustomEvent(MOTION_EVENT, { detail: { dt: dt, t: t } }); } catch (e) { ev = null; }
		if (ev && typeof window.dispatchEvent === 'function') window.dispatchEvent(ev);
	},

	/* ----------------------------------------------------------- health */

	/* The health cards: each check with its own icon, tinted only when it
	   needs attention, its value and reason, and a small picture of the
	   last minutes or of how full it is. A change of shape (which checks,
	   a level, where one leads) rebuilds them; otherwise the text and the
	   pictures update in place, so a focused card keeps its focus. */
	paintHealth: function() {
		var self = this, checks = this.st.health;
		var shape = JSON.stringify(checks.map(function(c) { return [ c.id, c.level, !!(c.client || c.list), c.page ]; }));
		if (shape !== this.healthShape) {
			this.healthShape = shape;
			this.healthCells = checks.map(function(c) {
				var cell = {
					title: E('span', { 'class': 'vt-chip-title' }),
					value: E('span', { 'class': 'vt-chip-value vt-tn' }),
					reason: E('span', { 'class': 'vt-chip-reason' }),
					viz: E('span', { 'class': 'vt-chip-viz', 'aria-hidden': 'true' })
				};
				var body = [
					E('span', { 'class': 'vt-chip-ico' }, [ icon(CHECK_ICONS[c.id] || 'info') ]),
					/* the level in words too, for screen readers (the card says it in colour) */
					E('span', { 'class': 'vt-chip-main' }, [ E('span', { 'class': 'vt-chip-top' }, [
						c.level === 'err' || c.level === 'warn' ? E('span', { 'class': 'vt-sr' }, [ c.level === 'err' ? _('Error') : _('Warning') ]) : '',
						cell.title, cell.value ]), cell.reason, cell.viz ])
				];
				if (c.client || c.list)
					cell.el = E('button', { 'type': 'button', 'class': 'vt-chip vt-chip-' + c.level + ' vt-chip-k-' + c.id, 'role': 'listitem',
						'click': function() { self.openCheck(cell.check); } }, body);
				else {
					/* without its page (no block-mount), a check links to the status overview */
					var to = hasPage(c.page) ? c.page : [ 'admin', 'status', 'overview' ];
					cell.el = E('a', { 'class': 'vt-chip vt-chip-' + c.level + ' vt-chip-k-' + c.id, 'role': 'listitem', 'href': L.url.apply(L, to) }, body);
				}
				return cell;
			});
			dom.content(this.el.health, this.healthCells.map(function(cell) { return cell.el; }));
		}
		this.healthCells.forEach(function(cell, i) {
			var c = checks[i];
			cell.check = c;
			txt(cell.title, c.title);
			txt(cell.value, c.value);
			/* the reason in its " · " parts: a part that does not fit goes
			   whole to the next line, without its dot (app.css), so "1 Gbit/s
			   link" never breaks after its "/" or inside a word (#122) */
			var reason = c.reason == null ? '' : String(c.reason);
			if (cell.reasonText !== reason) {
				cell.reasonText = reason;
				dom.content(cell.reason, reason === '' ? [] : E('span', { 'class': 'vt-parts' },
					reason.split(' · ').map(function(p) { return E('span', { 'class': 'vt-part' }, [ p ]); })));
			}
			setTitle(cell.el, c.detail || c.reason);
			patch(cell.viz, self.checkPicture(c));
		});
	},

	/* the small picture under a health card: the last five minutes for
	   what moves (uplink traffic, CPU), how full for what fills (memory,
	   storage), each radio's airtime, and how the clients' signals spread */
	checkPicture: function(c) {
		var st = this.st, d = (this.m && this.m.device) || {};
		switch (c.id) {
		/* the download (the card says the upload) and CPU as an area along
		   the card's bottom edge; CPU scaled to at least 20 % so a quiet
		   device still shows its shape */
		case 'uplink':
			return [ sparkline((this.m && this.m.uplink && st.hist.net[lineKey(this.m.uplink)]) || [], [ 1 ], 0, 'vt-spark-up', { min: 1000, quiet: true, bare: true }) ];
		case 'cpu':
			return [ sparkline(st.hist.cpu || [], [ 1 ], 0, 'vt-spark-cpu', { min: 20, quiet: true, bare: true }) ];
		case 'memory':
			/* in use, then the reclaimable cache (part of what is available), as in the System tile */
			if (!d.memory || !d.memory.segments) return [];
			return [ E('span', { 'class': 'vt-chip-bar vt-chip-mem' + (c.level === 'ok' ? '' : ' vt-chip-mem-' + c.level) }, d.memory.segments.filter(function(g) { return g.key !== 'free'; }).map(function(g) {
				var x = E('span', { 'class': 'vt-chip-mem-' + g.key });
				setW(x, g.pct);
				return x;
			})) ];
		case 'storage':
			return (d.storage || [])[0] ? [ fillBar(d.storage[0].usedPct, c.level) ] : [];
		case 'radios':
			return this.radioPicture();
		case 'signal':
			return this.signalPicture();
		}
		return [];
	},

	/* each radio's airtime (how busy its channel is) as a short bar under
	   its band; nothing where the driver doesn't report airtime */
	radioPicture: function() {
		var radios = ((this.m && this.m.radios) || []).filter(function(r) { return !r.disabled && r.airtime != null; });
		if (!radios.length) return this.bandPicture();
		/* two radios on one band: each by its channel too */
		var perBand = {};
		radios.forEach(function(r) { perBand[r.band] = (perBand[r.band] || 0) + 1; });
		return [ E('span', { 'class': 'vt-chip-radios' }, radios.map(function(r) {
			var name = (r.bandLabel || r.id) + (perBand[r.band] > 1 && r.channel ? ' · ' + r.channel : '');
			return E('span', { 'class': 'vt-chip-radio vt-band-' + (r.band || 'x') }, [
				E('span', { 'class': 'vt-chip-radio-top' }, [ E('span', {}, [ name ]), E('b', { 'class': 'vt-tn' }, [ fmt.pct(r.airtime) ]) ]),
				/* in its band's colour; the figure says how busy */
				fillBar(r.airtime, 'ok')
			]);
		})) ];
	},

	/* without airtime: the Wi-Fi clients by band along the card's bottom
	   edge, in the bands' colours (as the other cards' lines) */
	bandPicture: function() {
		/* this device's clients: a paired access point's are on its branch */
		var clients = ((this.m && this.m.clients) || []).filter(function(c) { return !c.ap; }), by = {};
		clients.forEach(function(c) { if (c.band) by[c.band] = (by[c.band] || 0) + 1; });
		var bands = Object.keys(by).sort();
		if (!bands.length) return [];
		return [ E('span', { 'class': 'vt-chip-dist vt-chip-bands' }, bands.map(function(b) {
			var x = E('span', { 'class': 'vt-chip-band vt-band-' + b });
			setW(x, by[b] / clients.length * 100);
			return x;
		})) ];
	},

	/* the clients by signal class (wifi.signal), weakest on the right */
	signalPicture: function() {
		/* this device's clients only, as bandPicture's */
		var clients = ((this.m && this.m.clients) || []).filter(function(c) { return c.signal != null && !c.ap; });
		if (!clients.length) return [];
		var by = { 4: 0, 3: 0, 2: 0, 1: 0 };
		clients.forEach(function(c) { var b = wifi.signal(c.signal).bars; if (by[b] != null) by[b]++; });
		return [ E('span', { 'class': 'vt-chip-dist' }, [ 4, 3, 2, 1 ].filter(function(b) { return by[b]; }).map(function(b) {
			var s = E('span', { 'class': 'vt-dist-' + b });
			setW(s, by[b] / clients.length * 100);
			return s;
		})) ];
	},

	/* ------------------------------------------------------------- hero */

	buildHero: function() {
		var el = this.el;
		el.path = E('div', { 'class': 'vt-path' });
		el.wires = svgRoot('vt-wires', '0 0 10 10');
		/* the flowing dots: small elements moved with transform */
		el.flows = E('div', { 'class': 'vt-flows', 'aria-hidden': 'true' });
		el.path.appendChild(el.wires);
		el.path.appendChild(el.flows);
		this.wireMap = Object.create(null);
		this.hero = null;
		var tile = this.foldable('hero', E('section', { 'class': 'vt-tile vt-hero', 'aria-label': _('Network path') }, [
			tileHead('pulse', _('Network path'), [ this.foldButton('hero', _('Show or hide the network path')) ]),
			el.path
		]));
		/* packets or stars behind the path, moved by the uplink's rate */
		this.backdrop = backdrop.mount(tile, el.path, lowPower() ? 'none' : this.backdropStyle, { external: true, unfocused: movesUnfocused });
		return tile;
	},

	/* the nodes the path shows: rebuilt only when this changes (a radio,
	   SSID, network or wired port comes or goes); a poll updates text in
	   place */
	heroKey: function() {
		/* an SSID node by its interface, 's:' before it: never the wired node's 'w' */
		var m = this.m, aps = this.aps().map(function(a) { return a.id + (a.parent ? '<' + a.parent.id : '') + '=' + a.nodes.map(function(n) { return 's:' + n.id; }).concat(a.wired ? [ 'w' ] : []).join(','); }).join(';');
		var tail = (this.pathForm === 'compact' ? '\ncompact' : '') + '\nwired=' + this.wiredPorts().join(',') + '\nlines=' + this.extraLines().map(function(x) { return x.iface; }).join(',') + (aps ? '\naps=' + aps : '');
		if (m.wired) return 'w\n' + m.networks.filter(function(n) { return n.up; }).slice(0, 8).map(function(n) { return n.name; }).join('\n') + tail;
		return 'r\n' + m.radios.map(function(r) {
			return r.id + '=' + m.ssids.filter(function(s) { return s.radio === r.id; }).map(function(s) { return s.id; }).join(',');
		}).join('\n') + tail;
	},

	/* the paired access points, a branch each (also one at the gateway's
	   address: what it reports never makes it the gateway) */
	aps: function() {
		return (this.m && this.m.accessPoints) || [];
	},

	/* an access point's stations and wired hosts, in a few words */
	apCounts: function(a) {
		var out = [ a.clients === 1 ? _('1 client') : _('%d clients').format(a.clients) ];
		if (a.wired) out.push(a.wired === 1 ? _('1 wired') : _('%d wired').format(a.wired));
		return out.join(' · ');
	},

	/* an access point that is not reporting, in a few words for its
	   branch: why, where the collector says so */
	apState: function(a) {
		if (a.state === 'waiting') return _('Waiting for its first report');
		switch (a.error) {
		case 'unreachable': return _('Not reachable over SSH');
		case 'timeout': return _('Did not answer in time');
		case 'hostkey': return _('Host key changed: pair again');
		case 'denied': return _('Refused this device\'s key');
		case 'missing': return _('Vantage add-on not installed on it');
		}
		return a.state === 'offline' ? this.apOffline(a) : _('Sent a report that could not be read');
	},

	apOffline: function(a) {
		return a.age != null ? _('Offline · last report %s').format(fmt.ago(a.age * 1000)) : _('Offline');
	},

	/* the rest of it, for the branch's tooltip */
	apStateMore: function(a) {
		if (a.error === 'missing') return _('Vantage\'s access point add-on is not installed on it');
		return a.state === 'offline' && a.error ? this.apOffline(a) : null;
	},

	/* what the model gave the paired access points (never their raw
	   reports), sorted once a model: the stations by access point and
	   SSID node ('<id> <node>'), the wired hosts behind each by its id */
	apEntries: function() {
		var m = this.m;
		if (!this.apGiven || this.apGiven.m !== m) {
			var sta = Object.create(null), wired = Object.create(null);
			m.clients.forEach(function(c) {
				var k = c.ap ? c.ap.id + ' ' + c.ap.node : null;
				if (k) (sta[k] = sta[k] || []).push(c);
			});
			(m.wiredHosts || []).forEach(function(h) {
				var x = h.ap || h.behind;
				if (x) (wired[x.id] = wired[x.id] || []).push(h);
			});
			this.apGiven = { m: m, sta: sta, wired: wired };
		}
		return this.apGiven;
	},

	/* the lines to the internet beside the main one (failover, mwan3;
	   at most model.MAX_LINES) */
	extraLines: function(m) {
		m = m || this.m;
		return ((m && m.uplinks) || []).slice(1);
	},

	/* the ports with wired hosts downstream of this device, at most 8:
	   hosts on a line's port are the way to its gateway, not clients
	   (on a bridge with several ports whose gateway port is unknown, only
	   the gateway is left out) */
	wiredPorts: function() {
		var m = this.m, out = [], self = this;
		(m.wiredHosts || []).forEach(function(c) {
			/* a host behind a paired access point is on no port here */
			if (c.gateway || c.ap || self.linePort(c.port)) return;
			if (out.indexOf(c.port) < 0) out.push(c.port);
		});
		return out.sort().slice(0, 8);
	},

	/* the port is one a line to the internet leaves through */
	linePort: function(port, m) {
		m = m || this.m;
		return ((m && m.uplinks) || []).some(function(x) { return x.port && x.port === port; });
	},

	/* a wired host Top talkers may rank: downstream of this device, as
	   on the path (wiredPorts; the gateway and whoever else is on a
	   line's port carry the line's traffic, not their own). Not one a
	   paired access point reports: its clients, stations or wired, push
	   none of this device's out. Nor that access point itself: with its
	   stations counted as its own it is alone on its port, and the
	   port's traffic is theirs */
	talkHost: function(c, m) {
		var peer = ((m || this.m || {}).accessPoints || []).some(function(a) { return !!a.mac && a.mac === c.mac; });
		return !c.ap && !peer && !c.gateway && !this.linePort(c.port, m);
	},

	/* Top talkers: this device's stations and, by the same measure, the
	   wired hosts with traffic of their own, which is the rate the
	   Clients list shows for them (portRate: a port to themselves) */
	talkers: function(m) {
		var self = this, rates = Object.create(null);
		var hosts = (m.wiredHosts || []).filter(function(c) {
			var r = self.talkHost(c, m) ? self.portRate(c) : null;
			if (r) rates[c.mac] = r;
			return !!r;
		});
		return insight.topTalkers(m.clients, this.st.staRates, TALKERS, hosts, rates);
	},

	/* the Clients tile on its wired list, on one port's hosts, a paired
	   access point's (its id) or all */
	showWired: function(port, ap) {
		this.ui.kind = 'wired';
		this.ui.chip = ap ? 'ap:' + ap : port ? 'port:' + port : 'all';
		this.setFilter('');
		this.el.clients.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
	},

	/* a health check about clients: several open their list, unless the
	   layout hides the Clients tile; one (or a hidden list) its details */
	openCheck: function(c) {
		var tile = this.el.clients;
		if (c.list && tile && tile.getClientRects().length) this.showClients(c.list);
		else if (c.client) this.openDrawer('client', c.client);
	},

	/* a paired access point's branch: the Clients list on its stations,
	   else on the wired hosts behind it */
	showAp: function(id) {
		var wifiHere = ((this.m && this.m.clients) || []).some(function(c) { return c.ap && c.ap.id === id; });
		if (wifiHere) this.showClients('ap:' + id);
		else this.showWired(null, id);
	},

	/* the Clients tile on its Wi-Fi list, on one quick filter (weak signal) */
	showClients: function(chip) {
		this.ui.kind = 'wifi';
		this.ui.chip = chip;
		this.setFilter('');
		this.el.clients.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
	},

	paintHero: function() {
		var key = this.heroKey();
		if (!this.hero || this.hero.key !== key) this.buildHeroNodes(key);
		this.updateHero();
		this.paintWireState();
	},

	buildHeroNodes: function(key) {
		var self = this, m = this.m, path = this.el.path;
		function span(cls) { return E('span', { 'class': cls }); }
		var h = { key: key, radios: [] };

		/* everything but the wires and the dots goes */
		Array.prototype.slice.call(path.childNodes).forEach(function(c) {
			if (c !== self.el.wires && c !== self.el.flows) path.removeChild(c);
		});

		/* more than one line to the internet: each by its interface, the
		   main one (the default route the kernel takes) marked */
		var extra = this.extraLines();
		h.gwKicker = span(extra.length ? 'vt-node-name' : 'vt-node-kicker'); h.gwTitle = span('vt-node-title'); h.gwSub = span('vt-node-sub');
		h.gwTag = extra.length ? E('span', { 'class': 'vt-node-tag' }, [ _('default route') ]) : null;
		h.gw = E('button', { 'type': 'button', 'class': 'vt-node vt-node-gw', 'click': function() { self.openDrawer('uplink', ''); } }, [
			E('span', { 'class': 'vt-node-ico' }, [ icon('globe') ]),
			E('span', { 'class': 'vt-node-body' }, [
				h.gwTag ? E('span', { 'class': 'vt-node-kicker vt-node-kicker-tag' }, [ h.gwKicker, h.gwTag ]) : h.gwKicker,
				h.gwTitle, h.gwSub
			])
		]);
		h.lines = extra.map(function(x) {
			/* its rates as two items, so a narrow node wraps them rather than cut them */
			var ln = { id: x.iface, kicker: span('vt-node-name'), title: span('vt-node-title'), dn: E('span'), up: E('span') };
			ln.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-gw vt-node-line', 'click': function() { self.openDrawer('uplink', ln.id); } }, [
				E('span', { 'class': 'vt-node-ico' }, [ icon('globe') ]),
				E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-kicker' }, [ ln.kicker ]), ln.title, E('span', { 'class': 'vt-node-sub vt-node-rates vt-tn' }, [ ln.dn, ln.up ]) ])
			]);
			return ln;
		});
		h.linesEl = extra.length ? E('div', { 'class': 'vt-lines' }, h.lines.map(function(ln) { return ln.el; })) : null;
		/* paired access points: their branches and the rows at the ends
		   need the room (app.css, all under vt-path-mesh: without one the
		   path is as it was). On an access point the others are its
		   siblings, wired from the gateway, this device's node at the top */
		var mesh = this.aps().length > 0, sib = mesh && !(m.uplink && m.uplink.isWan);
		h.compact = this.pathForm === 'compact';
		setClass(path, 'vt-path' + (extra.length ? ' vt-path-lines' : '') + (mesh ? ' vt-path-mesh' : '') + (sib ? ' vt-path-sib' : '') + (h.compact ? ' vt-path-compact' : ''));

		h.dnVal = E('b'); h.dnUnit = E('small'); h.upVal = E('b'); h.upUnit = E('small'); h.linkMeta = span('vt-link-meta');
		/* a full-tunnel VPN over the line: named on the link it runs through */
		h.tunName = span('vt-link-tunnel-name'); h.tunProto = span('vt-link-tunnel-proto');
		h.tunnel = E('span', { 'class': 'vt-link-tunnel', 'hidden': '' }, [ icon('lock'), h.tunName, h.tunProto ]);
		h.link = E('div', { 'class': 'vt-link-label' }, [
			E('span', { 'class': 'vt-link-rate vt-link-down' }, [ icon('down'), h.dnVal, h.dnUnit ]),
			E('span', { 'class': 'vt-link-below' }, [
				E('span', { 'class': 'vt-link-rate vt-link-up' }, [ icon('up'), h.upVal, h.upUnit ]),
				h.linkMeta,
				h.tunnel
			])
		]);

		h.apKicker = span('vt-node-kicker'); h.apTitle = span('vt-node-title'); h.apAddr = span('vt-node-sub vt-mono'); h.apUp = span('vt-node-sub');
		h.ap = E('button', { 'type': 'button', 'class': 'vt-node vt-node-ap', 'click': function() { self.openDrawer('device', 'device'); } }, [
			E('span', { 'class': 'vt-node-ico' }, [ icon('ap') ]),
			E('span', { 'class': 'vt-node-body' }, [ h.apKicker, h.apTitle, h.apAddr, h.apUp ])
		]);

		h.branches = E('div', { 'class': 'vt-branches' });
		h.watch = [ path, h.gw, h.link, h.ap, h.branches ];
		h.lines.forEach(function(ln) { h.watch.push(ln.el); });
		if (m.wired) {
			m.networks.filter(function(n) { return n.up; }).slice(0, 8).forEach(function(n) {
				var b = { id: n.name, ssids: [], kicker: span('vt-node-kicker'), title: span('vt-node-title'), addr: span('vt-node-sub vt-mono'), sub: span('vt-node-sub vt-tn') };
				b.el = E('a', { 'class': 'vt-node vt-node-radio vt-node-net', 'href': L.url.apply(L, insight.PAGES.network) }, [
					E('span', { 'class': 'vt-node-body' }, [ b.kicker, b.title, b.addr, b.sub ])
				]);
				b.wrap = E('div', { 'class': 'vt-branch' }, [ b.el ]);
				h.radios.push(b);
			});
			if (!h.radios.length) h.branches.appendChild(E('div', { 'class': 'vt-empty-inline' }, [ _('No other interfaces are up') ]));
		}
		else {
			m.radios.forEach(function(r) {
				var b = { id: r.id, ssids: [], badge: span('vt-band'), gen: span('vt-node-gen'), title: span('vt-node-title vt-tn'), sub: span('vt-node-sub vt-tn') };
				b.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-radio', 'click': function() { self.openDrawer('radio', b.id); } }, [
					E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-kicker' }, [ b.badge, b.gen ]), b.title, b.sub ])
				]);
				var col = E('div', { 'class': 'vt-branch-ssids' });
				m.ssids.filter(function(s) { return s.radio === r.id; }).forEach(function(s) {
					var sn = { id: s.id, data: s, tone: null, ico: null, name: E('span'), dots: span('vt-dots'), count: span('vt-tn'), sig: null, rows: mesh ? span('vt-leaf-rows') : null };
					sn.title = E('span', { 'class': 'vt-node-title vt-ssid-name' }, [ sn.name ]);
					sn.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-ssid',
						'click': function() { self.filterSsid(sn.data.ssid, sn.data.band); } }, [
						E('span', { 'class': 'vt-node-body' }, [ sn.title, E('span', { 'class': 'vt-node-sub' }, [ sn.dots, sn.count ]) ].concat(sn.rows ? [ sn.rows ] : []))
					]);
					b.ssids.push(sn);
					col.appendChild(sn.el);
				});
				if (!b.ssids.length) col.appendChild(E('span', { 'class': 'vt-empty-inline' }, [ _('No SSIDs') ]));
				b.wrap = E('div', { 'class': 'vt-branch' }, [ b.el, col ]);
				h.radios.push(b);
			});
			if (!h.radios.length) h.branches.appendChild(E('div', { 'class': 'vt-empty-inline' }, [ _('No radios reported') ]));
		}
		/* wired hosts downstream: one branch beside the radios or the
		   networks, a node per port; its id is no interface's name */
		var ports = this.wiredPorts();
		if (ports.length) {
			var wb = { id: ':wired', wired: true, ssids: [], title: span('vt-node-title vt-tn'), sub: span('vt-node-sub vt-tn') };
			wb.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-radio', 'click': function() { self.showWired(null); } }, [
				E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-kicker' }, [ _('Wired') ]), wb.title, wb.sub ])
			]);
			var wcol = E('div', { 'class': 'vt-branch-ssids' });
			ports.forEach(function(p) {
				var sn = { id: 'port:' + p, port: p, name: E('span'), count: span('vt-tn'), rate: span('vt-node-sub vt-tn') };
				sn.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-ssid', 'click': function() { self.showWired(p); } }, [
					E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-title vt-ssid-name' }, [ sn.name ]), E('span', { 'class': 'vt-node-sub' }, [ sn.count ]), sn.rate ])
				]);
				wb.ssids.push(sn);
				wcol.appendChild(sn.el);
			});
			wb.wrap = E('div', { 'class': 'vt-branch' }, [ wb.el, wcol ]);
			h.radios.push(wb);
		}
		/* the paired access points: a branch each, a node per SSID and one
		   for the wired hosts behind it, each opening the Clients list on
		   that access point; one not reporting has none of them */
		this.aps().forEach(function(a) {
			var ab = { id: ':ap:' + a.id, ap: true, apId: a.id, under: a.parent ? a.parent.id : null, ssids: [], kicker: span('vt-node-kicker'), title: span('vt-node-title'), addr: span('vt-node-sub vt-mono'),
				up: span('vt-node-sub'), sub: span('vt-node-sub vt-tn'), rateEl: span('vt-node-sub vt-tn') };
			ab.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-peer', 'click': function() { self.showAp(a.id); } }, [
				E('span', { 'class': 'vt-node-ico' }, [ icon('ap') ]),
				E('span', { 'class': 'vt-node-body' }, [ ab.kicker, ab.title, ab.addr, ab.up, ab.sub, ab.rateEl ])
			]);
			var acol = E('div', { 'class': 'vt-branch-ssids' });
			a.nodes.forEach(function(n) {
				var sn = { id: 's:' + n.id, node: n.id, badge: span('vt-band'), name: E('span'), count: span('vt-tn'), rows: span('vt-leaf-rows') };
				sn.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-ssid', 'click': function() { self.showAp(a.id); } }, [
					E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-title vt-ssid-name' }, [ sn.badge, ' ', sn.name ]), E('span', { 'class': 'vt-node-sub' }, [ sn.count ]), sn.rows ])
				]);
				ab.ssids.push(sn);
				acol.appendChild(sn.el);
			});
			/* the wired hosts behind it */
			if (a.wired) {
				var wn = { id: 'w', wiredNode: true, name: E('span'), count: span('vt-tn'), rows: span('vt-leaf-rows') };
				wn.el = E('button', { 'type': 'button', 'class': 'vt-node vt-node-ssid', 'click': function() { self.showWired(null, a.id); } }, [
					E('span', { 'class': 'vt-node-body' }, [ E('span', { 'class': 'vt-node-title vt-ssid-name' }, [ wn.name ]), E('span', { 'class': 'vt-node-sub' }, [ wn.count ]), wn.rows ])
				]);
				ab.ssids.push(wn);
				acol.appendChild(wn.el);
			}
			if (!ab.ssids.length && a.state === 'ok') acol.appendChild(E('span', { 'class': 'vt-empty-inline' }, [ _('No SSIDs') ]));
			/* plugged into another: under it and further in, three steps at most */
			ab.wrap = E('div', { 'class': 'vt-branch vt-branch-peer' + (a.parent ? ' vt-branch-d' + Math.min(a.depth, 3) : '') }, [ ab.el, acol ]);
			h.radios.push(ab);
		});
		if (h.compact) this.lineNodes(h);
		/* the paired access points after this device's own branches,
		   under a label of their own */
		var firstPeer = true;
		h.radios.forEach(function(b) {
			if (b.ap && firstPeer) {
				firstPeer = false;
				h.branches.appendChild(E('div', { 'class': 'vt-branches-label' }, [ m.uplink && m.uplink.isWan ? _('Access points') : _('Other access points') ]));
			}
			h.branches.appendChild(b.wrap);
			h.watch.push(b.wrap, b.el);
			b.ssids.forEach(function(sn) { h.watch.push(sn.el); });
		});

		path.insertBefore(h.gw, this.el.wires);
		path.insertBefore(h.link, this.el.wires);
		/* after the main line's rates: on a phone they stay with it */
		if (h.linesEl) path.insertBefore(h.linesEl, this.el.wires);
		path.insertBefore(h.ap, this.el.wires);
		path.insertBefore(h.branches, this.el.wires);
		this.hero = h;
		if (this.wireRo) {
			var ro = this.wireRo;
			ro.disconnect();
			h.watch.forEach(function(el) { ro.observe(el); });
		}
	},

	/* this poll's text, classes and flow state on the nodes in place */
	updateHero: function() {
		var self = this, m = this.m, st = this.st, h = this.hero, up = m.uplink, upR = st.uplinkRate, d = m.device;
		/* a gateway the bridge hears (an access point's router) shows its
		   name once one is known beyond its vendor */
		var gwHost = (m.wiredHosts || []).filter(function(c) { return c.gateway; })[0];
		var gwName = gwHost && /^(alias|dhcp|mdns|dns)$/.test(gwHost.nameSource) ? gwHost.name : null;
		/* A line to the internet shows its own address, the one its
		   provider gave it: two lines of one provider end at the same
		   gateway and would read alike (#88). The gateway is in the
		   tooltip and the details. A device on its gateway's own network
		   (an access point: one line, not a WAN) shows the gateway as
		   before, and its own address stays on its node. */
		var own = up && (h.lines.length || up.isWan) ? lineAddr(up) : null;
		var probe = up && up.dns.length ? _('DNS %s').format(up.dns[0]) : _('Reachability not probed');
		txt(h.gwKicker, h.lines.length && up ? up.iface : up && up.isWan ? _('Internet') : _('Gateway'));
		txt(h.gwTitle, own || gwName || (up && up.gateway ? up.gateway : up && up.defaultRoute ? up.l3dev : _('No default route', 'vantage')));
		txt(h.gwSub, own ? gwName || probe : gwName ? up.gateway : probe);
		if (own && up.gateway) setTitle(h.gw, _('Gateway %s').format(up.gateway));
		else if (h.gw.getAttribute('title') != null) h.gw.removeAttribute('title');

		txt(h.dnVal, upR ? fmt.bitsParts(upR.rx).v : fmt.DASH);
		txt(h.dnUnit, upR ? fmt.bitsParts(upR.rx).u : '');
		txt(h.upVal, upR ? fmt.bitsParts(upR.tx).v : fmt.DASH);
		txt(h.upUnit, upR ? fmt.bitsParts(upR.tx).u : '');
		txt(h.linkMeta, up ? [ up.dev, up.speed ? (up.speed.mbps >= 1000 ? (up.speed.mbps / 1000) + 'G' : up.speed.mbps + 'M') + (up.speed.duplex === 'full' ? ' FD' : up.speed.duplex === 'half' ? ' HD' : '') : null ].filter(Boolean).join(' · ') : _('no uplink'));
		var tun = up && up.tunnel, tunR = tun ? st.devRates[tun.dev] : null;
		if (h.tunnel.hidden !== !tun) h.tunnel.hidden = !tun;
		txt(h.tunName, tun ? tun.iface : '');
		txt(h.tunProto, tun && tun.proto ? tun.proto : '');
		setTitle(h.tunnel, tun ? _('Traffic to the internet goes through %s, a tunnel over this line').format(tun.iface) +
			(tunR ? ' · ↓ ' + fmt.bits(tunR.rx) + ' · ↑ ' + fmt.bits(tunR.tx) : '') : '');
		if (h.gwTag) txt(h.gwTag, tun ? _('default route via %s').format(tun.iface) : _('default route'));

		txt(h.apKicker, m.wired ? _('This device') : _('This access point'));
		txt(h.apTitle, d.model);
		/* beside a line that shows its own address, this device shows the
		   one its own network reaches it at; else the uplink's, as before */
		txt(h.apAddr, (own ? lanAddr(m.networks, m) : up ? lineAddr(up) : null) || fmt.DASH);
		txt(h.apUp, d.uptime != null ? _('up %s').format(fmt.duration(d.uptime)) : '');
		h.upActive = !!(upR && upR.rx + upR.tx > 50e3);
		h.upRate = upR ? upR.rx + upR.tx : 0;
		if (this.backdrop) { this.backdrop.update({ down: upR ? upR.rx : null, up: upR ? upR.tx : null, origin: h.ap }); this.kickMotion(); }

		var lines = Object.create(null);
		this.extraLines().forEach(function(x) { lines[x.iface] = x; });
		h.lines.forEach(function(ln) {
			var x = lines[ln.id], r = x ? model.lineRate(x, st.devRates) : null;
			if (!x) return;
			var addr = lineAddr(x);
			setTitle(ln.el, [ x.iface, x.dev, x.speed ? model.speedLabel(x.speed) : null, addr && x.gateway ? _('Gateway %s').format(x.gateway) : null ].filter(Boolean).join(' · '));
			setClass(ln.el, 'vt-node vt-node-gw vt-node-line' + (x.carrier === false ? ' vt-node-off' : ''));
			txt(ln.kicker, x.iface);
			txt(ln.title, addr || x.gateway || x.l3dev);
			var p = r && !(r.rx === 0 && r.tx === 0) ? fmt.rateParts(r.rx, r.tx) : null;
			txt(ln.dn, p ? '↓ ' + p.dn : r ? _('idle') : fmt.DASH);
			txt(ln.up, p ? '↑ ' + p.up + (p.unit ? ' ' + p.unit : '') : '');
			ln.active = !!(r && r.rx + r.tx > 50e3);
			ln.rate = r ? r.rx + r.tx : 0;
		});

		if (m.wired) {
			var nets = Object.create(null);
			m.networks.forEach(function(n) { if (n.up && !nets[n.name]) nets[n.name] = n; });
			h.radios.forEach(function(b) {
				if (b.wired) { self.updateWiredBranch(b); return; }
				if (b.ap) { self.updateApBranch(b); return; }
				var n = nets[b.id];
				if (!n) return;
				var r = n.dev ? st.devRates[n.dev] : null;
				setTitle(b.el, [ n.name, n.dev, n.ipv4 ].filter(Boolean).join(' · '));
				txt(b.kicker, n.proto || _('Interface'));
				txt(b.title, n.name);
				txt(b.addr, n.ipv4 ? n.ipv4.split('/')[0] : (n.dev || fmt.DASH));
				txt(b.sub, r ? fmt.rates(r.tx, r.rx) : fmt.DASH);
				b.active = !!(r && r.rx + r.tx > 50e3);
				b.rate = r ? r.rx + r.tx : 0;
				if (h.compact) self.paintLine(b, r || null);
			});
			return;
		}

		var radios = Object.create(null), ssids = Object.create(null);
		m.radios.forEach(function(r) { radios[r.id] = r; });
		m.ssids.forEach(function(s) { ssids[s.id] = s; });
		h.radios.forEach(function(b) {
			if (b.wired) { self.updateWiredBranch(b); return; }
			if (b.ap) { self.updateApBranch(b); return; }
			var r = radios[b.id], rr = st.radioRates[b.id];
			if (!r) return;
			setClass(b.el, 'vt-node vt-node-radio' + (r.up ? '' : ' vt-node-off'));
			setClass(b.badge, 'vt-band vt-band-' + (r.band || 'x'));
			txt(b.badge, wifi.bandLabel(r.band));
			txt(b.gen, r.gen || '');
			txt(b.title, r.channel ? _('Ch %d · %d MHz').format(r.channel, r.width || 20) : _('Channel —'));
			txt(b.sub, r.disabled ? _('Disabled') : !r.up ? _('Down', 'vantage') : rr ? '↓ ' + fmt.bits(rr.tx) : fmt.DASH);
			b.active = !!(rr && rr.rx + rr.tx > 50e3);
			b.rate = rr ? rr.rx + rr.tx : 0;
			if (h.compact) self.paintLine(b, rr || null, r.disabled ? _('Disabled') : !r.up ? _('Down', 'vantage') : null);
			b.ssids.forEach(function(sn) {
				var s = ssids[sn.id];
				if (!s) return;
				sn.data = s;
				/* a lock only where the security is open or weak */
				var tone = s.security.tone === 'open' ? 'unlock' : s.security.tone === 'weak' ? 'lock' : null;
				if (sn.tone !== tone) {
					var ico = tone ? icon(tone, 'vt-ico-sm') : null;
					if (sn.ico) sn.title.removeChild(sn.ico);
					if (ico) sn.title.insertBefore(ico, sn.name);
					sn.ico = ico;
					sn.tone = tone;
				}
				setClass(sn.el, 'vt-node vt-node-ssid' + (s.clients ? '' : ' vt-node-idle'));
				setTitle(sn.el, _('Show the clients of %s').format(s.ssid) + (tone ? '\n' + s.security.long : ''));
				txt(sn.name, s.ssid || _('(hidden)'));
				txt(sn.count, s.clients === 1 ? _('1 client') : _('%d clients').format(s.clients));
				var dots = m.clients.filter(function(c) { return c.ssidId === s.id; }).slice(0, 8);
				var sig = dots.map(function(c) { return c.level.level + ' ' + c.name + ' · ' + fmt.dbm(c.signal); }).join('\n');
				if (sn.sig !== sig) {
					sn.sig = sig;
					dom.content(sn.dots, dots.map(function(c) { return E('span', { 'class': 'vt-dot vt-lvl-' + c.level.level, 'title': c.name + ' · ' + fmt.dbm(c.signal) }); }));
				}
				if (sn.rows) self.paintLeaf(sn.rows, m.clients.filter(function(c) { return c.ssidId === s.id; }).map(function(c) {
					return { mac: c.mac, name: c.name, ips: c.ips, signal: c.signal, level: c.level.level, rate: st.staRates[c.mac] || null };
				}), false);
				var sr = st.ssidRates[s.id];
				sn.active = !!(sr && sr.rx + sr.tx > 50e3);
				if (h.compact) self.paintLine(sn, sr || null, null, self.weakOf(m.clients.filter(function(c) { return c.ssidId === s.id; })));
			});
		});
	},

	/* the Wired branch of the path: its hosts, and per port the one host
	   with its link speed or how many share the port, and the port's
	   traffic: all of its hosts' together, never split between them. A
	   host behind a paired access point is counted in that one's branch,
	   not here; the access point itself goes by its pairing name */
	updateWiredBranch: function(b) {
		var st = this.st, hosts = (this.m.wiredHosts || []).filter(function(c) { return !c.behind; }), n = 0, rx = 0, tx = 0, seen = false;
		var apHosts = this.m.apHosts || {};
		b.ssids.forEach(function(sn) {
			var on = hosts.filter(function(c) { return c.port === sn.port; }), r = st.devRates[sn.port], one = on.length === 1 ? on[0] : null;
			var peer = one && apHosts[one.mac], oneName = one ? (peer && peer.port === one.port ? peer.name : one.name) : null;
			var sw = on.length ? on[0].switch : null;
			n += on.length;
			if (r) { rx += r.rx; tx += r.tx; seen = true; }
			setClass(sn.el, 'vt-node vt-node-ssid' + (on.length ? '' : ' vt-node-idle'));
			setTitle(sn.el, _('Show the devices on %s').format(sn.port) + (r ? '\n' + _('Port total: %s').format('↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx)) : '') +
				(sw ? '\n' + switchNote(sw) : ''));
			txt(sn.name, one ? sn.port + ' · ' + oneName : sn.port);
			txt(sn.count, one ? (one.speed ? fmt.phyRate(one.speed.mbps * 1000) : fmt.DASH) : _('%d devices').format(on.length));
			txt(sn.rate, r ? fmt.rates(r.tx, r.rx) : fmt.DASH);
			sn.active = !!(r && r.rx + r.tx > 50e3);
		});
		txt(b.title, n === 1 ? _('1 device') : _('%d devices').format(n));
		txt(b.sub, seen ? '↓ ' + fmt.bits(tx) : fmt.DASH);
		b.active = !!(seen && rx + tx > 50e3);
		b.rate = seen ? rx + tx : 0;
		if (!b.dn) return;
		this.paintLine(b, seen ? { rx: rx, tx: tx } : null);
		b.ssids.forEach(function(sn) { this.paintLine(sn, st.devRates[sn.port] || null); }, this);
	},

	/* a paired access point's branch: its pairing name, address, uptime
	   and traffic, its stations per SSID and the wired hosts behind it,
	   all as the model gave them to it (apEntries): a MAC it reports
	   that stayed this device's, or another's, is not here. Dimmed, with
	   its state, while it is not reporting */
	updateApBranch: function(b) {
		var a = this.aps().filter(function(x) { return x.id === b.apId; })[0];
		if (!a) return;
		var self = this, r = a.rate, ok = a.state === 'ok', info = a.info || {}, given = this.apEntries();
		var nodes = Object.create(null);
		a.nodes.forEach(function(n) { nodes[n.id] = n; });
		/* what it calls itself only as a detail: the name is the pairing's */
		/* the compact line counts all in one: the split in its tooltip */
		setTitle(b.el, [ ok ? _('Show the clients of %s').format(a.name) : this.apState(a), ok ? (b.dn ? this.apCounts(a) : null) : this.apStateMore(a),
			info.name && info.name !== a.name ? _('Calls itself %s').format(info.name) : null, info.model, a.addr,
			a.parent ? _('Wired to %s on %s').format(a.parent.name, a.parent.port) : null,
			ok && a.age != null ? _('Last report %s').format(fmt.ago(a.age * 1000)) : null ].filter(Boolean).join('\n'));
		txt(b.kicker, _('Access point'));
		txt(b.title, a.name);
		txt(b.addr, a.addr || '');
		txt(b.up, ok && info.uptime != null ? _('up %s').format(fmt.duration(info.uptime)) : '');
		txt(b.sub, ok ? this.apCounts(a) : this.apState(a));
		txt(b.rateEl, ok && r ? fmt.rates(r.tx, r.rx) : '');
		setClass(b.el, 'vt-node vt-node-peer' + (!ok ? ' vt-node-off' : a.clients || a.wired ? '' : ' vt-node-idle'));
		b.ssids.forEach(function(sn) {
			if (sn.wiredNode) {
				txt(sn.name, _('Wired'));
				txt(sn.count, a.wired === 1 ? _('1 device') : _('%d devices').format(a.wired));
				setTitle(sn.el, _('Show the wired devices of %s').format(a.name));
				self.paintLeaf(sn.rows, (given.wired[a.id] || []).map(function(h) {
					var x = h.ap || h.behind;
					return { mac: h.mac, name: h.name, ips: h.ips, speed: x.speed, rate: x.rate };
				}), true);
				sn.active = false;
				return;
			}
			var n = nodes[sn.node];
			if (!n) return;
			self.paintLeaf(sn.rows, (given.sta[a.id + ' ' + n.id] || []).map(function(c) {
				return { mac: c.mac, name: c.name, ips: c.ips, signal: c.signal, level: c.level.level, rate: c.ap.rate };
			}), false);
			setClass(sn.badge, 'vt-band vt-band-' + (n.band || 'x'));
			txt(sn.badge, wifi.bandLabel(n.band));
			txt(sn.name, n.ssid || _('(hidden)'));
			txt(sn.count, n.clients === 1 ? _('1 client') : _('%d clients').format(n.clients));
			setClass(sn.el, 'vt-node vt-node-ssid' + (n.clients ? '' : ' vt-node-idle'));
			setTitle(sn.el, [ n.ifname, n.bssid ? fmt.mac(n.bssid) : null, n.channel ? _('channel %d').format(n.channel) : null, n.freq ? fmt.mhz(n.freq) : null ].filter(Boolean).join(' · '));
			sn.active = false;
		});
		b.active = !!(ok && r && r.rx + r.tx > 50e3);
		b.rate = ok && r ? r.rx + r.tx : 0;
		if (!b.dn) return;
		/* compact: all it has in one count, its state beside its name;
		   a node's rate is what its rows would have added up to */
		var all = a.clients + a.wired;
		txt(b.cstate, ok ? '' : this.apState(a));
		txt(b.cnum, ok ? (all === 1 ? _('1 device') : _('%d devices').format(all)) : '');
		this.paintLine(b, ok ? r : null, ok ? null : '');
		b.ssids.forEach(function(sn) {
			var list = (sn.wiredNode ? given.wired[a.id] : given.sta[a.id + ' ' + sn.node]) || [];
			/* none there: nothing moves */
			var rate = list.length ? sumRates(list.map(function(c) { return (c.ap || c.behind).rate; })) : { rx: 0, tx: 0 };
			self.paintLine(sn, rate, null, sn.wiredNode ? null : self.weakOf(list));
		});
	},

	/* The compact path (Customize, #157): every node of the branches one
	   line. A node keeps its element, its click, its classes and the
	   spans a poll writes; instead of a card's body it holds cells: its
	   name, how many (after a dot where a client there has a weak
	   signal), and its rate down and up, in columns every line shares
	   (app.css). Left out: the client rows, the signal dot of every
	   client, a radio's generation, a network's protocol, an access
	   point's address and uptime (in its tooltip) */
	lineNodes: function(h) {
		function span(cls) { return E('span', { 'class': cls }); }
		function oneLine(x, name, num, weak) {
			x.cname = E('span', { 'class': 'vt-cl-name' }, name);
			/* its tooltip carries the name from now on (setTitle) */
			x.el.vtTip = '';
			x.weak = weak ? span('vt-dots') : null;
			x.cnum = E('span', { 'class': 'vt-cl-num vt-tn' }, (x.weak ? [ x.weak ] : []).concat(num));
			/* the rate down in full, and short for a narrow tree (app.css) */
			x.dnl = span('vt-cl-long');
			x.dns = span('vt-cl-short');
			x.dn = E('span', { 'class': 'vt-cl-dn vt-tn' }, [ x.dnl, x.dns ]);
			x.up = span('vt-cl-up vt-tn');
			x.rows = null;
			dom.content(x.el, [ x.cname, x.cnum, x.dn, x.up ]);
		}
		h.radios.forEach(function(b) {
			if (b.ap) {
				b.cstate = span('vt-cl-state');
				oneLine(b, [ icon('ap', 'vt-ico-sm'), b.title, ' ', b.cstate ], []);
				/* its name in the tooltip, not why it is not reporting: that follows there */
				b.tip = b.title;
			}
			else if (b.wired) oneLine(b, [ E('span', { 'class': 'vt-node-kicker' }, [ _('Wired') ]) ], [ b.title ]);
			else if (b.badge) oneLine(b, [ b.badge, ' ', b.title ], []);
			else oneLine(b, [ b.title, ' ', b.addr ], []);
			b.ssids.forEach(function(sn) {
				if (sn.data) oneLine(sn, [ sn.title ], [ sn.count ], true);
				else oneLine(sn, [ E('span', { 'class': 'vt-node-title vt-ssid-name' }, sn.badge ? [ sn.badge, ' ', sn.name ] : [ sn.name ]) ], [ sn.count ], !!sn.badge);
			});
		});
	},

	/* a compact line's rate, its weak-signal dot and its label: one
	   control, named with every cell's text and both directions of the
	   rate (the narrow layouts show only the first). r: { rx, tx } as the
	   node counts them, ↓ what went towards its devices as the cards
	   read; null before the first counters. state: words in the rate's
	   place ('' for none). weak: the clients there whose signal is weak */
	paintLine: function(x, r, state, weak) {
		var idle = !!r && r.rx === 0 && r.tx === 0, word = state != null ? state : !r ? fmt.DASH : idle ? _('idle') : null;
		txt(x.dnl, word != null ? word : '↓ ' + fmt.bits(r.tx));
		txt(x.dns, word != null ? word : '↓' + shortBits(r.tx));
		txt(x.up, state != null || !r || idle ? '' : '↑ ' + fmt.bits(r.rx));
		if (x.weak) {
			var tip = (weak || []).slice(0, 8).map(function(c) { return c.name + ' · ' + fmt.dbm(c.signal); }).join('\n');
			if (x.weakSig !== tip) {
				x.weakSig = tip;
				dom.content(x.weak, tip ? [ E('span', { 'class': 'vt-dot vt-lvl-crit', 'title': tip }) ] : []);
			}
		}
		/* without a count (a radio, a network, an access point not
		   reporting) the name takes the count's cell too (app.css) */
		setClass(x.cname, 'vt-cl-name' + (x.cnum.textContent ? '' : ' vt-cl-wide'));
		var tip = (x.tip || x.cname).textContent.replace(/\s+/g, ' ').trim();
		if (x.el.vtTip !== tip) { x.el.vtTip = tip; setTitle(x.el, x.el.vtTitle || ''); }
		var label = [ x.cname.textContent.trim(), x.cnum.textContent, state != null ? state : r ? fmt.rates(r.tx, r.rx) : '',
			weak && weak.length ? _('%d weak').format(weak.length) : '' ].filter(Boolean).join(', ');
		if (x.el.getAttribute('aria-label') !== label) x.el.setAttribute('aria-label', label);
	},

	/* the clients whose signal the Signal check would call weak, those
	   set quiet left out (#110); a paired access point's too, on its own
	   lines, where its rows would have shown them red */
	weakOf: function(list) {
		var quiet = this.quiet || {};
		return list.filter(function(c) { return c.signal != null && c.signal < insight.WEAK_DBM && !quiet[c.mac]; });
	},

	/* the devices at the end of a branch (only with paired access points),
	   a line each: name, address, signal (or link speed when wired) and
	   traffic; the busiest first, at most five.
	   list: [ { mac, name, ips, signal, level, speed, rate: { rx, tx } } ] */
	paintLeaf: function(el, list, wired) {
		if (!el) return;
		var self = this, MAX = 5;
		var rows = list.slice().sort(function(a, b) {
			var va = a.rate ? a.rate.rx + a.rate.tx : -1, vb = b.rate ? b.rate.rx + b.rate.tx : -1;
			return vb - va || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
		});
		/* the "+n more" line opens the rest, as the WireGuard tile's does
		   (a click like the rows' own); "Show fewer" closes it again */
		el.vtAll = el.vtAll === true && rows.length > MAX;
		var shown = el.vtAll ? rows : rows.slice(0, MAX), more = rows.length - shown.length;
		var cells = shown.map(function(c) {
			var r = c.rate, live = !!(r && r.rx + r.tx > 0);
			var mid = wired ? (c.speed ? fmt.phyRate(c.speed.mbps * 1000) : '') : (c.signal != null ? String(c.signal) : '');
			return [ c.mac, c.name, mid, c.level || '', live ? '↓' + shortBits(r.tx) : '', (c.ips || []).filter(function(ip) { return model.parseIPv4(ip); })[0] || '',
				live ? '↑' + shortBits(r.rx) : '', live ? '↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx) : '' ];
		});
		var sig = JSON.stringify([ cells, more, el.vtAll ]);
		if (el.vtSig === sig) return;
		el.vtSig = sig;
		/* a row opens the device's details, the click its own, not the
		   node's; no second control inside the node's button for the
		   keyboard: the node opens the same list */
		function open(ev, mac) { ev.preventDefault(); ev.stopPropagation(); self.openDrawer('client', mac); }
		dom.content(el, cells.map(function(x) {
			return E('span', { 'class': 'vt-leaf-row',
				'title': [ _('Show details'), x[1], x[5], wired ? x[2] : x[2] ? fmt.dbm(+x[2]) : '', x[7] ].filter(Boolean).join(' · '),
				'click': function(ev) { open(ev, x[0]); } }, [
				E('span', { 'class': 'vt-leaf-name' }, [ x[1] ]),
				E('span', { 'class': 'vt-leaf-ip vt-tn' }, [ x[5] ]),
				E('span', { 'class': 'vt-leaf-sig vt-tn' + (x[3] ? ' vt-lvl-' + x[3] : '') }, [ x[2] ]),
				E('span', { 'class': 'vt-leaf-rate vt-tn' }, [ x[4] ]),
				E('span', { 'class': 'vt-leaf-rate vt-tn' }, [ x[6] ])
			]);
		}).concat(more > 0 || el.vtAll ? [ E('span', { 'class': 'vt-leaf-more', 'title': el.vtAll ? _('Show fewer') : _('Show all'),
			'click': function(ev) { ev.preventDefault(); ev.stopPropagation(); el.vtAll = !el.vtAll; el.vtSig = null; self.paintLeaf(el, list, wired); } },
			[ el.vtAll ? _('Show fewer') : _('+%d more').format(more) ]) ] : []));
	},

	scheduleWires: function() {
		var self = this;
		if (this.wirePending) return;
		this.wirePending = true;
		window.requestAnimationFrame(function() { self.wirePending = false; self.drawWires(); });
	},

	/* the wires the nodes call for: key, ends, and how busy */
	wireList: function() {
		var self = this, h = this.hero, out = [], peer = Object.create(null);
		if (!h) return out;
		h.radios.forEach(function(b) { if (b.ap) peer[b.apId] = b.el; });
		out.push({ key: 'gw', from: h.gw, to: h.ap, active: h.upActive, speed: wires.speed(h.upRate), main: true, tunnel: !!(this.m && this.m.uplink && this.m.uplink.tunnel) });
		h.lines.forEach(function(ln, k) { out.push({ key: 'l:' + ln.id, from: ln.el, to: h.ap, active: ln.active, speed: wires.speed(ln.rate), line: k }); });
		h.radios.forEach(function(b) {
			/* one plugged into another paired one: from that one, down its
			   left side as its own SSIDs' wires go when stacked. On an
			   access point the other paired ones are its siblings: wired
			   from the gateway (drawWires falls back to this device) */
			if (b.ap && peer[b.under])
				out.push({ key: 'r:' + b.id, from: peer[b.under], to: b.el, active: b.active, speed: wires.speed(b.rate) });
			else if (b.ap && !(self.m && self.m.uplink && self.m.uplink.isWan))
				out.push({ key: 'r:' + b.id, from: h.gw, to: b.el, active: b.active, speed: wires.speed(b.rate), elbow: true, alt: h.ap });
			else
				out.push({ key: 'r:' + b.id, from: h.ap, to: b.el, active: b.active, speed: wires.speed(b.rate) });
			b.ssids.forEach(function(sn) { out.push({ key: 's:' + b.id + ':' + sn.id, from: b.el, to: sn.el, active: sn.active, speed: 1 }); });
		});
		return out;
	},

	/* connectors between the hero nodes, measured after layout (called
	   from the ResizeObserver); wires are kept by key so the flow does not
	   restart when nothing moved */
	drawWires: function() {
		var self = this, path = this.el && this.el.path, svg = this.el && this.el.wires;
		if (!path || !svg || !this.hero || !path.isConnected) return;
		var box = path.getBoundingClientRect();
		/* folded or hidden: no dots running where nobody sees them, and
		   none rebuilt by a poll until the path has a size again */
		if (!box.width) { this.stopFlows(); return; }
		this.flowsHidden = false;
		var vb = '0 0 ' + Math.round(box.width) + ' ' + Math.round(box.height);
		if (svg.getAttribute('viewBox') !== vb) {
			svg.setAttribute('viewBox', vb);
			svg.setAttribute('width', String(Math.round(box.width)));
			svg.setAttribute('height', String(Math.round(box.height)));
		}
		var rects = new Map();
		function rect(el) {
			var r = rects.get(el);
			if (!r) {
				var b = el.getBoundingClientRect();
				r = { l: b.left - box.left, r: b.right - box.left, t: b.top - box.top, b: b.bottom - box.top, cy: (b.top + b.bottom) / 2 - box.top };
				rects.set(el, r);
			}
			return r;
		}

		var list = this.wireList(), seen = Object.create(null), map = this.wireMap;
		list.forEach(function(w) { rect(w.from); rect(w.to); if (w.alt) rect(w.alt); });
		list.forEach(function(w) {
			seen[w.key] = true;
			var g = map[w.key];
			if (!g) {
				g = map[w.key] = { base: svgPath('', 'vt-wire'), flow: svgPath('', 'vt-flow'), fw: E('div', { 'class': 'vt-fwire' }), dots: [], anims: [], steps: [], d: null };
				svg.appendChild(g.base);
				svg.appendChild(g.flow);
				self.el.flows.appendChild(g.fw);
			}
			/* the elbow only where it passes clear of this device's node:
			   the branch to the right of the gateway and below the device
			   (not when the narrow layouts stack them) */
			var elbow = !!w.elbow && rect(w.to).l > rect(w.from).r && rect(w.to).cy > rect(w.alt).b;
			var c = w.line != null ? wires.line(rect(w.from), rect(w.to), w.line) : elbow ? wires.elbow(rect(w.from), rect(w.to))
				: wires.curve(rect(w.elbow ? w.alt : w.from), rect(w.to));
			if (g.d !== c.d) {
				g.base.setAttribute('d', c.d);
				g.flow.setAttribute('d', c.d);
				g.d = c.d;
				var rs = wires.resample(c.pts, 8);
				g.samples = rs.pts;
				g.len = rs.len;
			}
		});
		Object.keys(map).forEach(function(k) {
			if (seen[k]) return;
			var g = map[k];
			self.clearDots(g);
			svg.removeChild(g.base);
			svg.removeChild(g.flow);
			self.el.flows.removeChild(g.fw);
			delete map[k];
		});
		this.paintWireState();
	},

	/* which wires carry traffic and how fast: classes only, no geometry */
	paintWireState: function() {
		var self = this, map = this.wireMap, still = reducedMotion() || !!this.flowsHidden || lowPower();
		if (!map) return;
		this.wireList().forEach(function(w) {
			var g = map[w.key];
			if (!g) return;
			setClass(g.base, 'vt-wire' + (w.main ? ' vt-wire-main' : '') + (w.tunnel ? ' vt-wire-tunnel' : '') + (w.active ? ' vt-wire-on' : ''));
			setClass(g.flow, 'vt-flow vt-flow-' + w.speed + (w.active ? ' vt-flow-on' : ''));
			self.syncFlow(g, !!(w.active && !still && g.d), w.speed);
		});
	},

	/* The flow: about one dot every 16 px moving along the wire, each
	   animated with transform only (the compositor runs it; the old
	   stroke-dashoffset animation repainted the wire layer every frame).
	   Dots exist only while a wire is busy; reduced motion shows the static
	   dotted path (app.css) instead. */
	syncFlow: function(g, on, speed) {
		if (on) {
			if (g.offTimer) { window.clearTimeout(g.offTimer); g.offTimer = null; }
			if (g.dotsFor !== g.d) this.buildDots(g, speed);
			else if (g.speed !== speed) g.anims.forEach(function(a) { a.playbackRate = wires.rate(speed); });
			g.speed = speed;
		}
		else if (g.dots.length && !g.offTimer) {
			/* fade out (app.css), then stop */
			var self = this;
			g.offTimer = window.setTimeout(function() { g.offTimer = null; self.clearDots(g); }, 450);
		}
		setClass(g.fw, 'vt-fwire' + (g.speed === 3 ? ' vt-fwire-3' : '') + (on ? ' vt-fwire-on' : ''));
	},

	buildDots: function(g, speed) {
		this.clearDots(g);
		g.dotsFor = g.d;
		if (!g.samples || g.samples.length < 2 || !(g.len >= 8) || typeof g.fw.animate !== 'function') return;
		var n = wires.dots(g.len), dur = wires.trip(g.len), rate = wires.rate(speed);
		g.steps = [];
		for (var i = 0; i < n; i++) {
			var dot = E('span', { 'class': 'vt-fdot' });
			g.fw.appendChild(dot);
			/* every dot takes the whole trip, started i/n of the way along;
			   paused: the clock moves it (stepMotion), at the wire's rate */
			var a = dot.animate(wires.keyframes(g.samples), { duration: dur, iterations: Infinity, easing: 'linear' });
			a.playbackRate = rate;
			a.currentTime = dur * i / n;
			if (STEP_DOTS) { a.pause(); g.steps.push({ a: a, dur: dur, at: dur * i / n }); }
			else if (this.motionOn === false) a.pause();
			g.dots.push(dot);
			g.anims.push(a);
		}
		this.kickMotion();
	},

	clearDots: function(g) {
		if (g.offTimer) { window.clearTimeout(g.offTimer); g.offTimer = null; }
		g.anims.forEach(function(a) { a.cancel(); });
		g.dots.forEach(function(d) { if (d.parentNode) d.parentNode.removeChild(d); });
		g.anims = [];
		g.steps = [];
		g.dots = [];
		g.dotsFor = null;
	},

	stopFlows: function() {
		var self = this, map = this.wireMap || {};
		this.flowsHidden = true;
		Object.keys(map).forEach(function(k) { self.clearDots(map[k]); setClass(map[k].fw, 'vt-fwire'); });
	},

	/* ----------------------------------------------------------- system */

	buildSystem: function() {
		var el = this.el;
		el.sysUptime = E('span', { 'class': 'vt-hint vt-tn' });
		el.cpuVal = E('span', { 'class': 'vt-big vt-tn' });
		el.cpuCores = E('div', { 'class': 'vt-cores' });
		el.cpuSpark = E('div', { 'class': 'vt-spark-slot' });
		el.cpuLoad = E('span', { 'class': 'vt-hint vt-tn', 'title': _('Load average over 1, 5 and 15 minutes') });
		el.cpuTemp = E('span', { 'class': 'vt-hint vt-tn' });
		el.memHead = E('div', { 'class': 'vt-mem-head' });
		el.memBar = E('div', { 'class': 'vt-seg', 'role': 'img' });
		el.memLegend = E('div', { 'class': 'vt-legend' });
		el.swap = E('div', { 'class': 'vt-swap' });
		el.storage = E('div', { 'class': 'vt-storage' });
		el.fw = E('div', { 'class': 'vt-fw' });
		return this.foldable('sys', E('section', { 'class': 'vt-tile vt-sys', 'aria-label': _('System') }, [
			tileHead('cpu', _('System'), [ el.sysUptime, this.foldButton('sys', _('Show or hide system details')) ]),
			E('div', { 'class': 'vt-sys-cpu' }, [
				E('div', { 'class': 'vt-sys-cpu-l' }, [
					E('span', { 'class': 'vt-label' }, [ _('CPU', 'vantage') ]),
					el.cpuVal,
					el.cpuLoad,
					el.cpuTemp
				]),
				E('div', { 'class': 'vt-sys-cpu-r' }, [
					E('div', { 'class': 'vt-spark-box' }, [ el.cpuSpark, E('span', { 'class': 'vt-cap' }, [ _('last 5 min') ]) ]),
					E('div', { 'class': 'vt-cores-box', 'title': _('Busy share of each CPU core') }, [ el.cpuCores, E('span', { 'class': 'vt-cap' }, [ _('per core') ]) ])
				])
			]),
			E('div', { 'class': 'vt-sys-mem' }, [
				E('span', { 'class': 'vt-label' }, [ _('Memory') ]),
				el.memHead, el.memBar, el.memLegend, el.swap
			]),
			E('div', { 'class': 'vt-sys-store' }, [ E('span', { 'class': 'vt-label' }, [ _('Storage') ]), el.storage ]),
			el.fw
		]));
	},

	paintSystem: function() {
		var el = this.el, d = this.m.device, cpu = this.cpuShown();
		txt(el.sysUptime, d.uptime != null ? _('Up %s').format(fmt.duration(d.uptime)) : '');
		txt(el.cpuVal, cpu ? Math.round(cpu.pct) + '%' : fmt.DASH);
		el.cpuVal.className = 'vt-big vt-tn' + (cpu && cpu.pct >= 90 ? ' vt-t-err' : cpu && cpu.pct >= 70 ? ' vt-t-warn' : '');
		txt(el.cpuLoad, _('Load avg %s').format(d.load.map(fmt.load).join(' · ')));
		/* the hottest sensor; each one in the tooltip */
		var temps = this.st.temps || [];
		el.cpuTemp.hidden = !temps.length;
		txt(el.cpuTemp, temps.length ? _('Temperature %s').format(fmt.celsius(temps[0].celsius)) : '');
		setTitle(el.cpuTemp, temps.map(function(t) { return t.name + ' ' + fmt.celsius(t.celsius); }).join('\n'));
		patch(el.cpuSpark, [ sparkline(this.st.hist.cpu, [ 1 ], 100, 'vt-spark-cpu', { scale: function() { return '100%'; } }) ]);
		patch(el.cpuCores, (cpu ? cpu.cores : []).map(function(p, i) {
			var fill = E('span', { 'class': 'vt-core-fill' });
			fill.style.height = Math.max(4, Math.min(100, p || 0)).toFixed(1) + '%';
			return E('span', { 'class': 'vt-core', 'title': _('Core %d: %s').format(i, fmt.pct(p)) }, [ fill ]);
		}));

		/* memory: one bar, three named segments */
		var mem = d.memory;
		el.memBar.hidden = !mem;
		if (mem) {
			patch(el.memHead, [
				E('span', { 'class': 'vt-mem-avail vt-tn' }, [ _('%s available', 'vantage').format(fmt.pct(mem.availPct)) ]),
				E('span', { 'class': 'vt-mem-of vt-tn' }, [ _('%s of %s').format(fmt.bytes(mem.available), fmt.bytes(mem.total)) ])
			]);
			if (!el.memSegs) {
				el.memSegs = mem.segments.map(function(s) { var x = E('span', { 'class': 'vt-seg-part vt-seg-' + s.key }); el.memBar.appendChild(x); return x; });
			}
			/* animate a visible change only (app.css): a width transition
			   lays out every frame for most of a second */
			var was = el.memPct || [];
			el.memBar.classList.toggle('vt-seg-move', mem.segments.some(function(s, i) { return was[i] != null && Math.abs(s.pct - was[i]) >= 2; }));
			el.memPct = mem.segments.map(function(s) { return s.pct; });
			mem.segments.forEach(function(s, i) { setW(el.memSegs[i], s.pct); setTitle(el.memSegs[i], s.label + ': ' + fmt.bytes(s.bytes)); });
			el.memBar.setAttribute('aria-label', mem.segments.map(function(s) { return s.label + ' ' + fmt.bytes(s.bytes); }).join(', '));
			patch(el.memLegend, mem.segments.map(function(s) {
				return E('span', { 'class': 'vt-legend-item' }, [ E('span', { 'class': 'vt-key vt-seg-' + s.key }), E('span', {}, [ s.label ]), E('b', { 'class': 'vt-tn' }, [ fmt.bytes(s.bytes) ]) ]);
			}));
		}
		else {
			/* nothing left of the last reading, so the next one starts afresh */
			patch(el.memHead, [ E('span', { 'class': 'vt-muted' }, [ _('Not reported') ]) ]);
			dom.content(el.memBar, []);
			el.memBar.removeAttribute('aria-label');
			el.memSegs = null;
			el.memPct = null;
			patch(el.memLegend, []);
		}
		if (d.swap) {
			var sb = E('span', { 'class': 'vt-thin-fill' });
			setW(sb, d.swap.usedPct);
			patch(el.swap, [ E('span', { 'class': 'vt-swap-label' }, [ _('Swap', 'vantage') ]), E('span', { 'class': 'vt-thin' }, [ sb ]),
				E('span', { 'class': 'vt-tn vt-hint' }, [ _('%s of %s').format(fmt.bytes(d.swap.used), fmt.bytes(d.swap.total)) ]) ]);
		}
		else patch(el.swap, []);

		patch(el.storage, d.storage.map(function(s) {
			var f = E('span', { 'class': 'vt-bar-fill' + (s.usedPct >= 95 ? ' vt-bg-err' : s.usedPct >= 85 ? ' vt-bg-warn' : '') });
			setW(f, Math.max(s.usedPct, 0.8));
			return E('div', { 'class': 'vt-mount' }, [
				E('div', { 'class': 'vt-mount-top' }, [ E('span', {}, [ s.label ]), E('span', { 'class': 'vt-tn vt-hint' }, [ _('%s used of %s').format(fmt.bytes(s.used), fmt.bytes(s.total)) ]) ]),
				E('div', { 'class': 'vt-bar' }, [ f ])
			]);
		}));
		patch(el.fw, [
			E('span', {}, [ d.firmware || '' ]),
			d.kernel ? E('span', { 'class': 'vt-hint' }, [ _('Kernel %s').format(d.kernel) ]) : '',
			E('span', { 'class': 'vt-hint' }, [ 'Vantage ' + VERSION ])
		]);
	},

	/* ------------------------------------------------------------ chart */

	buildChart: function() {
		var self = this, el = this.el;
		el.chartSub = E('span', { 'class': 'vt-chart-sub vt-tn' });
		el.chartRows = E('div', { 'class': 'vt-mults' });
		el.chartCursor = E('div', { 'class': 'vt-cursor', 'hidden': 'hidden' });
		el.chartTip = E('div', { 'class': 'vt-tip', 'hidden': 'hidden' });
		el.chartOver = E('div', { 'class': 'vt-mult-over', 'aria-hidden': 'true' }, [ el.chartCursor, el.chartTip ]);
		el.chartX = E('div', { 'class': 'vt-mult-x', 'aria-hidden': 'true' });
		var plot = E('div', { 'class': 'vt-mult-wrap', 'tabindex': '0', 'role': 'group',
			'aria-label': _('Throughput per link; arrow keys read the values over time') }, [ el.chartRows, el.chartOver, el.chartX ]);
		plot.addEventListener('pointermove', function(ev) { self.chartPointer(ev); });
		plot.addEventListener('pointerleave', function() { if (!self.ui.hover || self.ui.hover.x != null) self.chartHide(); });
		plot.addEventListener('keydown', function(ev) { self.chartKey(ev); });
		plot.addEventListener('blur', function() { self.chartHide(); });
		el.plot = plot;
		el.chartLive = E('p', { 'class': 'vt-sr', 'aria-live': 'polite' });
		return this.foldable('chart', E('section', { 'class': 'vt-tile vt-chart', 'aria-label': _('Throughput', 'vantage') }, [
			E('header', { 'class': 'vt-tile-head' }, [
				E('h3', { 'class': 'vt-tile-title' }, [ icon('pulse'), E('span', {}, [ _('Throughput', 'vantage') ]), el.chartSub ]),
				E('div', { 'class': 'vt-tile-extra' }, [
					E('span', { 'class': 'vt-legend vt-dir-legend' }, [
						E('span', { 'class': 'vt-legend-item' }, [ dirKey('dn'), E('span', {}, [ _('Download') ]) ]),
						E('span', { 'class': 'vt-legend-item' }, [ dirKey('up'), E('span', {}, [ _('Upload') ]) ])
					]),
					this.foldButton('chart', _('Show or hide the throughput chart'))
				])
			]),
			plot,
			el.chartLive
		]));
	},

	/* one small multiple per link: the uplink, the other lines to the
	   internet, then each radio, each with
	   its own y scale (a busy uplink would flatten an idle radio), on a
	   shared time axis and crosshair. Download (towards the clients) and
	   upload each keep their direction's colour; how they share the plot
	   is the viewer's chart style (series.chartGeom). Columns of a
	   history point [ t, rx, tx ]: the uplink receives what clients
	   download, a radio sends it. */
	chartSeries: function() {
		var m = this.m;
		var list = [ { key: m.uplink ? lineKey(m.uplink) : 'uplink', label: m.uplink ? _('Uplink %s').format(m.uplink.dev) : _('Uplink', 'vantage'), dn: 1, up: 2 } ];
		this.extraLines().forEach(function(x) { list.push({ key: lineKey(x), label: _('Uplink %s').format(x.dev), dn: 1, up: 2 }); });
		m.radios.forEach(function(r) { list.push({ key: r.id, label: _('%s radio').format(r.bandLabel), dn: 2, up: 1 }); });
		return list;
	},

	paintChart: function() {
		var el = this.el, net = this.st.hist.net, W = 600, H = 100, now = Date.now(), style = this.chartStyle;
		var list = this.chartSeries();
		/* sample times follow the device's clock (model.sampleClock) and
		   can run ahead of the browser's: the axis ends at the newest one */
		list.forEach(function(s) { var h = net[s.key]; if (h && h.length) now = Math.max(now, h[h.length - 1][0]); });

		/* always the full five minutes: while history collects, the lines
		   start part way across and the minute labels stay where they are
		   (a span that grew with the history moved them every poll, #71) */
		var dm = series.domain(list.map(function(s) { return net[s.key]; }), now, WINDOW_MS, WINDOW_MS);
		/* history keeps only samples newer than the window, so its oldest is
		   up to one poll short of five minutes: allow two polls, or the
		   subtitle flips to "collecting" with a full history */
		dm.full = dm.age >= WINDOW_MS - POLL_S * 2000;
		var ticks = [];
		for (var k = 1; k * 60000 < dm.span - 20000; k++) ticks.push(k);
		var rows = [], samples = 0;
		this.chartMeta = { t0: dm.t0, t1: dm.t1, rows: rows };

		dom.content(el.chartRows, list.map(function(s) {
			var d = (net[s.key] || []).filter(function(p) { return p[0] >= dm.t0 - POLL_S * 1000; });
			var sd = series.stats(d, s.dn, dm.t0), su = series.stats(d, s.up, dm.t0);
			var last = d.length ? d[d.length - 1] : null, fresh = !!(last && now - last[0] < POLL_S * 3000);
			var g = series.chartGeom(style, sd.peak, su.peak, rateUnit()), pk = fmt.rateParts(sd.peak, su.peak);
			samples = Math.max(samples, sd.n);

			var svg = svgRoot('vt-mult-svg', '0 0 ' + W + ' ' + H);
			svg.setAttribute('preserveAspectRatio', 'none');
			/* lines keep half a unit inside the box, or the edge ones get cut */
			var yAt = function(f) { return Math.max(0.5, Math.min(H - 0.5, f * H)).toFixed(1); };
			svg.appendChild(svgPath(g.grid.map(function(f) { return 'M0 ' + yAt(f) + 'H' + W; }).join(''), 'vt-chart-grid'));
			ticks.forEach(function(k) {
				var x = (1 - k * 60000 / dm.span) * W;
				svg.appendChild(svgPath('M' + x.toFixed(1) + ' 0V' + H, 'vt-chart-vgrid'));
			});
			var segD = series.trace(d, s.dn, dm.t0, dm.t1, W, H, gapMs(), g.dn.frac);
			var segU = series.trace(d, s.up, dm.t0, dm.t1, W, H, gapMs(), g.up.frac);
			[ [ segD, g.dn, '' ], [ segU, g.up, ' vt-dir-up' ] ].forEach(function(h) {
				var area = svgPath(series.curveArea(h[0], h[1].base * H), 'vt-series-area' + h[2]);
				area.setAttribute('fill', fadeFill(svg, h[1].flip, h[2].trim()));
				svg.appendChild(area);
				svg.appendChild(svgPath(series.curvePath(h[0]), 'vt-series-line' + h[2]));
			});
			svg.appendChild(svgPath(g.axis.map(function(f) { return 'M0 ' + yAt(f) + 'H' + W; }).join(''), 'vt-chart-mid'));

			function tailDot(segs, cls) {
				var tail = segs.length ? segs[segs.length - 1] : null, pt = tail && tail[tail.length - 1];
				return pt && fresh ? pos(E('span', { 'class': 'vt-sk-dot' + cls }), pt[0] / W * 100, pt[1] / H * 100) : '';
			}
			function scaleLabel(l) {
				var lab = E('span', { 'class': 'vt-mult-max vt-tn' + (l.below ? ' vt-mult-max-below' : '') },
					(l.dir ? [ dirArrow(l.dir), ' ' ] : []).concat([ bitsLabel(l.v) ]));
				lab.style.top = (l.at * 100).toFixed(1) + '%';
				return lab;
			}
			/* stretches without samples, so a gap reads as missing data */
			function gapBand(gp) {
				var b = E('span', { 'class': 'vt-mult-gap' }, gp[1] - gp[0] > .12 ? [ E('span', {}, [ _('no data', 'vantage') ]) ] : []);
				b.style.left = (gp[0] * 100).toFixed(2) + '%';
				b.style.width = ((gp[1] - gp[0]) * 100).toFixed(2) + '%';
				return b;
			}
			var dotD = E('span', { 'class': 'vt-mult-dot', 'hidden': 'hidden' }), dotU = E('span', { 'class': 'vt-mult-dot vt-dir-up', 'hidden': 'hidden' });
			rows.push({ s: s, d: d, g: g, dotD: dotD, dotU: dotU });
			return E('div', { 'class': 'vt-mult' }, [
				E('div', { 'class': 'vt-mult-head' }, [
					E('span', { 'class': 'vt-mult-name' }, [ s.label ]),
					E('span', { 'class': 'vt-mult-now', 'title': _('Download') }, [ dirKey('dn'),
						E('b', { 'class': 'vt-tn' }, [ dirArrow('dn'), ' ', fresh && sd.now != null ? fmt.bits(last[s.dn]) : fmt.DASH ]) ]),
					E('span', { 'class': 'vt-mult-now vt-mult-now-up', 'title': _('Upload') }, [ dirKey('up'),
						E('b', { 'class': 'vt-tn' }, [ dirArrow('up'), ' ', fresh && su.now != null ? fmt.bits(last[s.up]) : fmt.DASH ]) ]),
					E('span', { 'class': 'vt-mult-stats vt-tn' }, sd.n > 1 ? [
						/* each direction its own item, so they wrap in the narrow readout column */
						/* the shared unit on both, so a wrapped line keeps its own */
						E('span', {}, [ _('peak', 'vantage'), ' ', E('b', {}, [ dirArrow('dn'), ' ' + pk.dn ]), pk.unit ? ' ' + pk.unit : '' ]),
						E('span', {}, [ E('b', {}, [ dirArrow('up'), ' ' + pk.up ]), pk.unit ? ' ' + pk.unit : '' ])
					] : [ E('span', {}, [ _('measuring…') ]) ])
				]),
				E('div', { 'class': 'vt-mult-plot vt-chart-' + style }, [
					svg
				].concat(sd.n ? g.labels.map(scaleLabel) : [], series.gaps(d, dm.t0, dm.t1, gapMs()).map(gapBand), [
					sd.n < 2 ? E('span', { 'class': 'vt-sk-note' }, [ _('collecting…') ]) : '',
					tailDot(segD, ''),
					tailDot(segU, ' vt-dir-up'),
					dotD, dotU
				]))
			]);
		}));

		/* minute ticks get a label unless it would collide with the ends */
		dom.content(el.chartX, [ E('span', { 'class': 'vt-mx vt-mx-0' }, [ spanAgo(dm.span) ]) ].concat(ticks.filter(function(k) {
			var f = 1 - k * 60000 / dm.span;
			return f > 0.2 && f < 0.85;
		}).map(function(k) {
			var l = E('span', { 'class': 'vt-mx vt-mx-t' + (k % 2 ? ' vt-mx-odd' : '') }, [ _('−%d min').format(k) ]);
			l.style.left = ((1 - k * 60000 / dm.span) * 100).toFixed(2) + '%';
			return l;
		})).concat([ E('span', { 'class': 'vt-mx vt-mx-1' }, [ _('now', 'vantage') ]) ]));

		var age = dm.age;
		txt(el.chartSub, dm.full ? _('last 5 min')
			: samples < 2 ? _('collecting · first samples') : _('collecting · %s of data').format(spanShort(age)));
		if (this.ui.hover) this.chartShow(this.ui.hover);
	},

	chartPointer: function(ev) {
		var r = this.el.chartOver.getBoundingClientRect();
		if (!this.chartMeta || !r.width || ev.clientX < r.left - 6) { this.chartHide(); return; }
		this.chartShow({ x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) });
	},

	/* the longest series gives the sample times the crosshair snaps to */
	chartRef: function() {
		var ref = [];
		(this.chartMeta ? this.chartMeta.rows : []).forEach(function(r) { if (r.d.length > ref.length) ref = r.d; });
		return ref;
	},

	/* at: { x: 0..1 of the plot width } (pointer) or { t: sample time } (keys) */
	chartShow: function(at) {
		var meta = this.chartMeta, el = this.el;
		if (!meta) return;
		var ref = this.chartRef(), span = meta.t1 - meta.t0;
		var t = at.t != null ? at.t : meta.t0 + at.x * span;
		var i = series.nearest(ref, t);
		if (i < 0 || ref[i][0] < meta.t0 - 1000 || (at.x != null && Math.abs(ref[i][0] - t) > POLL_S * 2000)) { this.chartHide(); return; }
		var tp = ref[i][0], x = (tp - meta.t0) / span * 100;
		this.ui.hover = at.t != null ? { t: tp } : at;
		el.chartCursor.hidden = false;
		el.chartCursor.style.left = x.toFixed(2) + '%';
		var said = [];
		var tipRows = meta.rows.map(function(r) {
			var j = series.nearest(r.d, tp), p = (j >= 0 && Math.abs(r.d[j][0] - tp) < POLL_S * 1000) ? r.d[j] : null;
			var vd = p ? p[r.s.dn] : null, vu = p ? p[r.s.up] : null;
			r.dotD.hidden = vd == null;
			r.dotU.hidden = vu == null;
			if (vd != null) pos(r.dotD, x, r.g.dn.frac(vd) * 100);
			if (vu != null) pos(r.dotU, x, r.g.up.frac(vu) * 100);
			var bd = vd == null ? fmt.DASH : fmt.bits(vd), bu = vu == null ? fmt.DASH : fmt.bits(vu);
			said.push(r.s.label + ': ↓ ' + bd + ' ↑ ' + bu);
			return E('div', { 'class': 'vt-tip-link' }, [
				E('div', { 'class': 'vt-tip-label' }, [ r.s.label ]),
				E('div', { 'class': 'vt-tip-row' }, [ dirKey('dn'), E('span', {}, [ _('Download') ]), E('b', { 'class': 'vt-tn' }, [ bd ]) ]),
				E('div', { 'class': 'vt-tip-row' }, [ dirKey('up'), E('span', {}, [ _('Upload') ]), E('b', { 'class': 'vt-tn' }, [ bu ]) ])
			]);
		});
		dom.content(el.chartTip, [ E('div', { 'class': 'vt-tip-time vt-tn' }, [ new Date(tp).toLocaleTimeString(), E('span', {}, [ fmt.ago(Date.now() - tp) ]) ]) ].concat(tipRows));
		el.chartTip.hidden = false;
		/* beside the crosshair, on the side it fits; on a narrow chart it
		   may cover the readouts on the left but never leaves the tile */
		var ow = el.chartOver.clientWidth, tw = el.chartTip.offsetWidth, px = x / 100 * ow, gap = 12;
		var lx = px + gap + tw <= ow ? px + gap : px - gap - tw;
		lx = Math.max(-el.chartOver.offsetLeft, Math.min(ow - tw, lx));
		el.chartTip.style.left = lx.toFixed(0) + 'px';
		if (at.t != null) txt(el.chartLive, [ new Date(tp).toLocaleTimeString() ].concat(said).join('; '));
	},

	chartHide: function() {
		var el = this.el;
		this.ui.hover = null;
		el.chartCursor.hidden = true;
		el.chartTip.hidden = true;
		(this.chartMeta ? this.chartMeta.rows : []).forEach(function(r) { r.dotD.hidden = true; r.dotU.hidden = true; });
	},

	chartKey: function(ev) {
		var ref = this.chartRef(), meta = this.chartMeta;
		if (!ref.length || !meta) return;
		var cur = this.ui.hover && this.ui.hover.t != null ? series.nearest(ref, this.ui.hover.t) : -1, i = cur;
		if (ev.key === 'ArrowLeft') i = cur < 0 ? ref.length - 1 : Math.max(0, cur - 1);
		else if (ev.key === 'ArrowRight') i = cur < 0 ? ref.length - 1 : Math.min(ref.length - 1, cur + 1);
		else if (ev.key === 'Home') i = 0;
		else if (ev.key === 'End') i = ref.length - 1;
		else if (ev.key === 'Escape' && this.ui.hover) { ev.stopPropagation(); this.chartHide(); return; }
		else return;
		ev.preventDefault();
		while (i < ref.length - 1 && ref[i][0] < meta.t0) i++;
		this.chartShow({ t: ref[i][0] });
	},

	/* ----------------------------------------------------------- radios */

	buildRadios: function() {
		var el = this.el;
		el.radioCount = E('span', { 'class': 'vt-hint vt-tn' });
		el.radioSum = E('div', { 'class': 'vt-radio-sum vt-fold-keep' });
		el.radioList = E('div', { 'class': 'vt-radio-list' });
		el.radios = E('section', { 'class': 'vt-radios', 'aria-label': _('Radios') }, [
			E('header', { 'class': 'vt-tile-head vt-sec-head' }, [
				E('h3', { 'class': 'vt-tile-title' }, [ icon('radio'), E('span', {}, [ _('Radios') ]) ]),
				E('div', { 'class': 'vt-tile-extra' }, [ el.radioCount, this.foldButton('radios', _('Show or hide the radio details')) ])
			]),
			el.radioSum,
			el.radioList
		]);
		return this.foldable('radios', el.radios);
	},

	paintRadios: function() {
		var self = this, m = this.m, st = this.st;
		txt(this.el.radioCount, m.radios.length === 1 ? _('1 radio') : _('%d radios').format(m.radios.length));
		/* condensed rows, shown when the section is folded on a phone */
		dom.content(this.el.radioSum, m.radios.map(function(r) {
			var rr = st.radioRates[r.id];
			return E('button', { 'type': 'button', 'class': 'vt-rsum', 'click': function() { self.openDrawer('radio', r.id); } }, [
				E('span', { 'class': 'vt-status vt-status-' + (r.disabled ? 'off' : r.up ? 'ok' : 'err'), 'aria-hidden': 'true' }),
				bandBadge(r.band),
				E('span', { 'class': 'vt-rsum-main vt-tn' }, [ r.channel ? _('Ch %d · %d MHz').format(r.channel, r.width || 20) : fmt.DASH ]),
				E('span', { 'class': 'vt-rsum-sub vt-tn' }, [ r.clients === 1 ? _('1 client') : _('%d clients').format(r.clients) ]),
				E('span', { 'class': 'vt-rsum-rate vt-tn' }, [ r.disabled ? _('Disabled') : !r.up ? _('Down', 'vantage') : rr ? '↓ ' + fmt.bits(rr.tx) : fmt.DASH ]),
				icon('chevron', 'vt-ico-sm')
			]);
		}));
		if (!m.radios.length) {
			dom.content(this.el.radioList, [ E('div', { 'class': 'vt-tile vt-empty' }, [ icon('radio'), E('p', {}, [ _('No wireless radios are reported by this device.') ]) ]) ]);
			return;
		}
		patch(this.el.radioList, m.radios.map(function(r) {
			var rr = st.radioRates[r.id], ins = st.radioInsights[r.id] || { notes: [] };
			var sp = r.spectrum, spec = E('div', { 'class': 'vt-spectrum', 'title': sp ? _('%d–%d MHz of the %d–%d MHz band').format(sp.lo, sp.hi, sp.bandLo, sp.bandHi) : '' });
			if (sp) {
				var blk = E('span', { 'class': 'vt-spectrum-blk' });
				blk.style.left = (sp.from * 100).toFixed(2) + '%';
				blk.style.width = Math.max(1.2, (sp.to - sp.from) * 100).toFixed(2) + '%';
				spec.appendChild(blk);
				spec.appendChild(E('span', { 'class': 'vt-spectrum-lo vt-tn' }, [ String(sp.bandLo) ]));
				spec.appendChild(E('span', { 'class': 'vt-spectrum-hi vt-tn' }, [ _('%s MHz').format(sp.bandHi) ]));
			}
			var hist = st.hist.net[r.id] || [];
			var clients = m.clients.filter(function(c) { return c.radio === r.id; });
			return E('article', { 'class': 'vt-tile vt-radio vt-radio-' + (r.band || 'x') + (r.up ? '' : ' vt-radio-off'), 'data-radio': r.id }, [
				E('header', { 'class': 'vt-radio-head' }, [
					bandBadge(r.band),
					E('span', { 'class': 'vt-radio-name' }, [ r.gen || r.id ]),
					E('span', { 'class': 'vt-status vt-status-' + (r.disabled ? 'off' : r.up ? 'ok' : 'err') }, [ r.disabled ? _('Disabled') : r.up ? _('Up', 'vantage') : _('Down', 'vantage') ]),
					E('button', { 'type': 'button', 'class': 'vt-icon-action', 'title': _('Radio details'), 'aria-label': _('Radio details'),
						'click': function() { self.openDrawer('radio', r.id); } }, [ icon('chevron') ])
				]),
				E('div', { 'class': 'vt-radio-chan' }, [
					E('span', { 'class': 'vt-big vt-tn' }, [ r.channel ? _('Ch %d').format(r.channel) : fmt.DASH ]),
					E('span', { 'class': 'vt-radio-width vt-tn' }, [ r.width ? _('%s MHz').format(r.width) : '', r.auto ? ' · ' + _('auto') : '' ])
				]),
				spec,
				/* noise and airtime only where the driver reports them */
				E('dl', { 'class': 'vt-stats' }, [
					kv(_('Clients'), E('span', { 'class': 'vt-tn' }, [ String(r.clients) ])),
					kv(_('Tx power'), E('span', { 'class': 'vt-tn' }, [ r.txpower != null ? _('%s dBm').format(r.txpower) : fmt.DASH ])),
					r.noise != null ? kv(_('Noise'), E('span', { 'class': 'vt-tn' }, [ fmt.dbm(r.noise) ])) : '',
					r.airtime != null ? kv(_('Airtime'), E('span', { 'class': 'vt-tn' }, [ fmt.pct(r.airtime) ])) : ''
				]),
				E('div', { 'class': 'vt-radio-live' }, [
					rateLine(rr ? rr.tx : null, rr ? rr.rx : null),
					sparkline(hist, [ 2, 1 ], 0, 'vt-spark-' + (r.band || 'x'), { min: 1000, scale: bitsLabel, ceil: rateCeil })
				]),
				E('ul', { 'class': 'vt-notes' }, ins.notes.map(function(n) {
					return E('li', { 'class': 'vt-note vt-note-' + n.level }, [ icon(n.level === 'warn' ? 'warn' : n.level === 'err' ? 'err' : 'info', 'vt-ico-sm'), E('span', {}, [ n.text ]) ]);
				})),
				E('footer', { 'class': 'vt-radio-foot' }, [
					E('span', { 'class': 'vt-avs' }, clients.slice(0, 6).map(function(c) { return avatar(c, true); })),
					pageLink(insight.PAGES.wireless, _('Radio settings'))
				])
			]);
		}));
	},

	/* ----------------------------------------------------------- clients */

	buildClients: function() {
		var self = this, el = this.el, ui = this.ui;
		el.filter = E('input', { 'type': 'text', 'class': 'vt-filter-input', 'placeholder': _('Filter by name, address, SSID…'),
			'aria-label': _('Filter clients'), 'autocomplete': 'off', 'spellcheck': 'false',
			'input': function(ev) { self.ui.filter = ev.target.value; self.pickClients(); } });
		el.filterClear = E('button', { 'type': 'button', 'class': 'vt-filter-clear', 'aria-label': _('Clear filter', 'vantage'), 'hidden': 'hidden',
			'click': function() { self.setFilter(''); el.filter.focus(); } }, [ icon('close') ]);
		/* the quick filters sit in a menu at the end of the search box; the
		   one in force shows as a tag in the box, so none is ever hidden */
		el.filterTag = E('button', { 'type': 'button', 'class': 'vt-ftag', 'hidden': 'hidden',
			'click': function(ev) { ev.preventDefault(); ui.chip = 'all'; self.pickClients(); el.filter.focus(); } });
		el.filterBtn = E('button', { 'type': 'button', 'class': 'vt-filter-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false',
			'aria-label': _('Quick filters'), 'title': _('Quick filters'),
			'click': function(ev) { ev.preventDefault(); self.filterMenu(); } }, [ icon('filter') ]);
		el.filterMenu = E('div', { 'class': 'vt-fmenu', 'role': 'menu', 'aria-label': _('Quick filters'), 'hidden': 'hidden',
			'keydown': function(ev) { self.filterMenuKey(ev); } });
		/* Wi-Fi or wired clients, on a device that has both */
		el.kinds = E('div', { 'class': 'vt-kinds', 'role': 'group', 'aria-label': _('Kind of client'), 'hidden': 'hidden' });
		el.count = E('span', { 'class': 'vt-count vt-tn' });
		el.thead = E('thead');
		el.tbody = E('tbody');
		el.clientsEmpty = E('div', { 'class': 'vt-empty', 'hidden': 'hidden' });
		this.rowMap = new Map();
		el.clients = E('section', { 'class': 'vt-tile vt-clients', 'id': 'vt-clients', 'aria-label': _('Clients') }, [
			tileHead('users', _('Clients'), [ el.kinds, el.count ]),
			E('div', { 'class': 'vt-toolbar' }, [
				E('div', { 'class': 'vt-filter-wrap' }, [
					E('label', { 'class': 'vt-filter' }, [ icon('search'), el.filterTag, el.filter, E('kbd', { 'class': 'vt-key-hint' }, [ 'F' ]), el.filterClear, el.filterBtn ]),
					el.filterMenu
				])
			]),
			E('div', { 'class': 'vt-table-wrap' }, [ E('table', { 'class': 'vt-ctable' }, [ el.thead, el.tbody ]) ]),
			el.clientsEmpty
		]);
		document.addEventListener('click', function(ev) {
			if (!el.filterMenu.hidden && !el.filterMenu.contains(ev.target) && !el.filterBtn.contains(ev.target)) self.filterMenu(false);
		});
		return el.clients;
	},

	/* open (true), close (false) or toggle the quick filter menu */
	filterMenu: function(open) {
		var el = this.el;
		if (open == null) open = el.filterMenu.hidden;
		el.filterMenu.hidden = !open;
		el.filterBtn.setAttribute('aria-expanded', String(!!open));
		if (open) {
			var on = el.filterMenu.querySelector('[aria-checked="true"]') || el.filterMenu.querySelector('button');
			if (on) on.focus();
		}
	},

	filterMenuKey: function(ev) {
		var items = Array.prototype.slice.call(this.el.filterMenu.querySelectorAll('button')), n = items.length, i = items.indexOf(document.activeElement);
		if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.filterMenu(false); this.el.filterBtn.focus(); }
		else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && n) {
			ev.preventDefault();
			if (i < 0) i = ev.key === 'ArrowDown' ? n - 1 : 0;
			items[(i + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n].focus();
		}
		else if ((ev.key === 'Home' || ev.key === 'End') && n) { ev.preventDefault(); items[ev.key === 'Home' ? 0 : n - 1].focus(); }
		else if (ev.key === 'Tab') this.filterMenu(false);
	},

	setFilter: function(v) {
		this.ui.filter = v;
		this.el.filter.value = v;
		this.pickClients();
	},

	/* the viewer changed what the Clients tile lists (filter, quick
	   filter, Wi-Fi or wired): its new height at once. The hold that
	   keeps the page still is for polls, not for a pick */
	pickClients: function() {
		if (this.held) delete this.held.clients;
		this.paintClients();
		this.scheduleLayout();
	},

	filterSsid: function(ssid, band) {
		this.ui.kind = 'wifi';
		this.ui.chip = 'all';
		this.setFilter(ssid);
		this.el.clients.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
	},

	/* a wired host's traffic: its port's, when it has the port to itself */
	portRate: function(c) {
		/* behind a paired access point: its port's, as it reports it */
		if (c.ap) return c.ap.rate || null;
		return c.shared ? null : this.st.devRates[c.port] || null;
	},

	/* what the Clients list shows for a wired host: portRate's, except
	   for one sharing its port here that a paired access point has alone
	   on a port of its own: the rate that access point reports for it;
	   else, for one sharing its port, the rate through this router
	   (trafficRate; null without luci-app-vantage-traffic). Top talkers
	   keeps portRate: neither kind of host is ranked */
	listRate: function(c) {
		return c.shared && c.behind && c.behind.rate ? c.behind.rate : c.shared ? this.trafficRate(c) : this.portRate(c);
	},

	/* luci-app-vantage-traffic's answer for a poll (takeTraffic; undefined:
	   none came; null: a failed call): the rates between its last two reads,
	   by MAC, in st.trafficRates, and the answer in st.traffic. They stand
	   while answers come (st.trafficSeen) at least every two slow polls
	   and a new read (st.trafficNew, its at in st.trafficAt) at least
	   every twice its every or twice the slow poll, whichever is longer:
	   the plugin answers its last read while one runs or within its
	   every, but no longer than that. Else none, whatever the poll (no
	   call made: the plugin not there is asked a minute later), until two
	   new reads: no rate rather than an old one shown as current, nor
	   one taken over the gap */
	noteTraffic: function(reply) {
		var st = this.st, now = Date.now(), slowMs = lowPower() ? LOW_SLOW_MS : POLL_S * 1000;
		var t = reply === undefined ? null : model.trafficHosts(reply);
		if (t) {
			st.trafficSeen = now;
			/* a read the plugin already gave: its rates stand, a while */
			if (t.at !== st.trafficAt) {
				var r = model.rates(st.trafficPrev, t.counters, t.at);
				st.trafficPrev = r.next;
				st.trafficRates = r.rates;
				st.trafficAt = t.at;
				st.trafficNew = now;
			}
			st.traffic = t;
		}
		if (st.traffic && !(now - st.trafficSeen <= 2 * slowMs && now - st.trafficNew <= 2 * Math.max(st.traffic.every, slowMs)))
			st.traffic = st.trafficRates = st.trafficPrev = null;
	},

	/* a wired host's rate as this router's connection tracking counts it:
	   only for one that shares its port (a port to itself counts all of
	   its traffic, also with the devices beside it) and whose traffic this
	   device routes: not the gateway, nor a host on a line's port or on a
	   line's own network (a dumb access point's hosts reach the gateway
	   past it, bridged, uncounted). null otherwise and without the package */
	trafficRate: function(c) {
		var t = this.st && this.st.trafficRates, m = this.m;
		if (!t || !c.shared || c.ap || c.gateway || this.linePort(c.port, m)) return null;
		var onLine = ((m && m.uplinks) || []).some(function(x) {
			var l3 = x && x.l3dev;
			return !!l3 && !!c.bridge && (c.bridge === l3 || (c.vlan != null && c.bridge + '.' + c.vlan === l3));
		});
		return onLine ? null : t[c.mac] || null;
	},

	/* what may make the rate through this router too low: lines for a
	   host's details */
	trafficNotes: function() {
		var t = this.st.traffic, out = [];
		if (!t) return out;
		if (t.partial) out.push(_('From part of the connection table: reading all of it took too long'));
		if (t.hw) out.push(fmt.N_(t.hw, '%d connection offloaded to hardware may be missing', '%d connections offloaded to hardware may be missing').format(t.hw));
		if (t.zeroed) out.push(_('Another program resets the connection counters (nlbwmon?): too low'));
		return out;
	},

	/* where the rate through this router comes from, and how often the
	   plugin reads its table */
	trafficEvery: function() {
		var t = this.st.traffic;
		return _('Through this router, from its connection tracking (read every %d s)').format(Math.max(1, Math.round((t ? t.every : 5000) / 1000)));
	},

	sortValue: function(c, key) {
		var r = typeof c.port === 'string' ? this.listRate(c) : this.st.staRates[c.mac];
		switch (key) {
		case 'name': return String(c.name).toLowerCase();
		case 'signal': return c.signal == null ? -999 : c.signal;
		case 'ssid': return (c.ssid + ' ' + c.band).toLowerCase();
		case 'rate': return Math.max(c.tx && c.tx.rate || 0, c.rx && c.rx.rate || 0);
		case 'exp': return c.exp ? c.exp.score : -1;
		case 'time': return c.connected || 0;
		case 'link': return c.shared || !c.speed ? -1 : c.speed.mbps;
		case 'net': return ((c.network || c.bridge || '') + ' ' + (c.vlan == null ? '' : c.vlan)).toLowerCase();
		case 'seen': return c.seen == null ? Infinity : c.seen;
		default: return r ? r.rx + r.tx : -1;
		}
	},

	/* a client (Wi-Fi station or wired host, which has a port) in the
	   list as filtered */
	matches: function(c) {
		var chip = this.ui.chip, q = String(this.ui.filter || '').trim().toLowerCase(), hay;
		if (typeof c.port === 'string') {
			if (/^port:/.test(chip) && c.port !== chip.slice(5)) return false;
			/* here: what this device lists, a host behind an access point too */
			if (chip === 'here' && c.ap) return false;
			if (/^ap:/.test(chip) && !this.behindAp(c, chip.slice(3))) return false;
			hay = [ c.name, c.macLabel, c.mac, c.vendor, c.port, c.network, c.nameSourceLabel ].concat(this.apWords(c));
		}
		else {
			if (chip === 'weak' && !this.isWeak(c)) return false;
			if (chip === 'new' && !c.isNew) return false;
			if (chip === 'active' && !(this.st.staRates[c.mac] && this.st.staRates[c.mac].rx + this.st.staRates[c.mac].tx > 8000)) return false;
			if (/^band:/.test(chip) && c.band !== chip.slice(5)) return false;
			if (chip === 'here' && c.ap) return false;
			if (/^ap:/.test(chip) && !(c.ap && c.ap.id === chip.slice(3))) return false;
			hay = [ c.name, c.macLabel, c.mac, c.ssid, c.bandLabel, c.gen, c.vendor, c.wps, c.nameSourceLabel ].concat(this.apWords(c));
		}
		if (!q) return true;
		hay = hay.concat(c.ips || []).join(' ').toLowerCase();
		return q.split(/\s+/).every(function(w) { return hay.indexOf(w) >= 0; });
	},

	/* a wired host a paired access point reports: added from its report,
	   or one this device hears behind it */
	behindAp: function(c, id) {
		return !!((c.ap && c.ap.id === id) || (c.behind && c.behind.id === id));
	},

	/* the access point's name and address, for the search */
	apWords: function(c) {
		var a = c.ap || c.behind;
		return a ? [ a.name, a.addr ].filter(Boolean) : [];
	},

	/* the quick filters of the list shown: [ id, label, count, warn ] */
	filterDefs: function() {
		var self = this, m = this.m, st = this.st, out;
		/* the named devices in neither list: a filter only while there are any */
		var off = (m.offline || []).length;
		if (this.ui.kind === 'wired') {
			var hosts = m.wiredHosts, ports = [];
			out = [ [ 'all', _('All'), hosts.length ] ];
			/* a host behind a paired access point is on no port here */
			hosts.forEach(function(h) { if (!h.ap && ports.indexOf(h.port) < 0) ports.push(h.port); });
			if (ports.length > 1) ports.sort().forEach(function(p) { out.push([ 'port:' + p, p, hosts.filter(function(h) { return h.port === p; }).length ]); });
			var via = this.aps().map(function(a) { return [ 'ap:' + a.id, _('Via %s').format(a.name), hosts.filter(function(h) { return self.behindAp(h, a.id); }).length ]; })
				.filter(function(d) { return d[2] > 0; });
			if (via.length) out = out.concat([ [ 'here', _('This device'), hosts.filter(function(h) { return !h.ap; }).length ] ], via);
			if (off) out.push([ 'offline', _('Offline'), off ]);
			return out;
		}
		var bands = [];
		out = [ [ 'all', _('All'), m.clients.length ] ];
		m.clients.forEach(function(c) { if (c.band && bands.indexOf(c.band) < 0) bands.push(c.band); });
		bands.sort().forEach(function(b) { out.push([ 'band:' + b, wifi.bandLabel(b), m.clients.filter(function(c) { return c.band === b; }).length ]); });
		/* where the stations are: this device or a paired access point */
		var aps = this.aps().map(function(a) { return [ 'ap:' + a.id, _('Via %s').format(a.name), m.clients.filter(function(c) { return c.ap && c.ap.id === a.id; }).length ]; })
			.filter(function(d) { return d[2] > 0; });
		if (aps.length) out = out.concat([ [ 'here', _('This device'), m.clients.filter(function(c) { return !c.ap; }).length ] ], aps);
		out.push([ 'active', _('Active'), m.clients.filter(function(c) { var r = st.staRates[c.mac]; return r && r.rx + r.tx > 8000; }).length ]);
		out.push([ 'weak', _('Weak signal'), m.clients.filter(function(c) { return self.isWeak(c); }).length, true ]);
		out.push([ 'new', _('New', 'vantage'), m.clients.filter(function(c) { return c.isNew; }).length ]);
		if (off) out.push([ 'offline', _('Offline'), off ]);
		return out;
	},

	/* the quick filter menu, its button and the tag of the one in force */
	paintFilters: function(defs) {
		var self = this, el = this.el, ui = this.ui;
		var on = defs.filter(function(d) { return d[0] === ui.chip; })[0];
		el.filterBtn.hidden = defs.length < 2;
		if (el.filterBtn.hidden && !el.filterMenu.hidden) this.filterMenu(false);
		el.filterTag.hidden = !on || on[0] === 'all';
		el.filterBtn.classList.toggle('vt-filter-btn-on', !el.filterTag.hidden);
		var tag = el.filterTag.hidden ? '' : on[1];
		if (this.tagSig !== tag) {
			this.tagSig = tag;
			dom.content(el.filterTag, tag ? [ E('span', {}, [ tag ]), icon('close') ] : []);
			el.filterTag.setAttribute('aria-label', tag ? _('Remove filter: %s').format(tag) : '');
		}
		/* new counts go into the open menu in place: rebuilding it would
		   take the focus away */
		var ids = defs.map(function(d) { return d[0]; }).concat(ui.chip).join('\n'), items = el.filterMenu.children;
		if (this.filterIds === ids) {
			defs.forEach(function(d, i) {
				if (!items[i]) return;
				txt(items[i].querySelector('.vt-fmenu-n'), d[2]);
				items[i].classList.toggle('vt-fmenu-warn', !!(d[3] && d[2]));
			});
			return;
		}
		this.filterIds = ids;
		dom.content(el.filterMenu, defs.map(function(d) {
			var sel = ui.chip === d[0];
			return E('button', { 'type': 'button', 'role': 'menuitemradio', 'aria-checked': String(sel), 'class': 'vt-fmenu-item' + (d[3] && d[2] ? ' vt-fmenu-warn' : ''),
				'click': function() { ui.chip = d[0]; self.filterMenu(false); self.pickClients(); el.filterBtn.focus(); } }, [
				E('span', { 'class': 'vt-fmenu-check', 'aria-hidden': 'true' }, [ sel ? icon('check') : '' ]),
				E('span', { 'class': 'vt-fmenu-label' }, [ d[1] ]),
				E('span', { 'class': 'vt-fmenu-n vt-tn' }, [ String(d[2]) ])
			]);
		}));
	},

	/* a header's click: its column, or the other way round on a second
	   one. Only this list's pick is written: the other one's may be newer
	   in the store, from another tab. */
	setSort: function(key) {
		var so = this.ui.sorts[this.ui.kind], all = readSorts();
		if (so.key === key) so.dir = -so.dir;
		else { so.key = key; so.dir = (key === 'name' || key === 'ssid' || key === 'net' || key === 'seen') ? 1 : -1; }
		all[this.ui.kind] = { key: so.key, dir: so.dir };
		writeSorts(all);
		this.paintClients();
	},

	paintClients: function() {
		var self = this, m = this.m, st = this.st, el = this.el, ui = this.ui;

		/* Wi-Fi or wired: the switch shows where there are both; a device
		   without radios lists its wired hosts only */
		/* a device without radios still lists a paired access point's
		   stations */
		var hosts = m.wiredHosts || [], wifiList = !m.wired || m.clients.length > 0, both = !!(hosts.length && wifiList);
		if (!both) ui.kind = wifiList ? 'wifi' : 'wired';
		var defs = this.filterDefs();
		if (!defs.some(function(d) { return d[0] === ui.chip; })) ui.chip = 'all';
		/* Offline: the named devices that are in neither list, a list of
		   its own (no Wi-Fi or wired count has them); a click on Wi-Fi or
		   Wired goes back to that list */
		var off = ui.chip === 'offline';
		var wired = !off && ui.kind === 'wired', all = off ? m.offline : wired ? hosts : m.clients;
		el.kinds.hidden = !both;
		var kindSig = both ? [ off ? 'offline' : ui.kind, m.clients.length, hosts.length ].join(' ') : '';
		if (this.kindSig !== kindSig) {
			this.kindSig = kindSig;
			dom.content(el.kinds, !both ? [] : [ [ 'wifi', _('Wi-Fi'), m.clients.length ], [ 'wired', _('Wired'), hosts.length ] ].map(function(k) {
				var on = !off && ui.kind === k[0];
				return E('button', { 'type': 'button', 'class': 'vt-kind' + (on ? ' vt-kind-on' : ''), 'aria-pressed': String(on),
					'click': function() { if (ui.kind !== k[0] || ui.chip === 'offline') { ui.kind = k[0]; ui.chip = 'all'; self.pickClients(); } } }, [
					E('span', {}, [ k[1] ]), E('span', { 'class': 'vt-kind-n vt-tn' }, [ String(k[2]) ])
				]);
			}));
		}
		var hint = ui.kind === 'wired' ? _('Filter by name, address, port…') : _('Filter by name, address, SSID…');
		if (el.filter.getAttribute('placeholder') !== hint) el.filter.setAttribute('placeholder', hint);

		this.paintFilters(defs);
		el.filterClear.hidden = !ui.filter;

		/* header with sort buttons; wired hosts have a link and when the
		   bridge last heard from them instead of radio figures */
		var cols = off ? [ [ 'name', _('Device') ], [ 'net', _('Last address') ], [ 'seen', _('Last seen') ] ]
			: wired ? [ [ 'name', _('Device') ], [ 'link', _('Link', 'vantage') ], [ 'net', _('Network') ], [ 'live', _('Live') ],
			[ 'seen', _('Last heard'), _('The bridge forgets a device after about five minutes without traffic') ] ]
			: [ [ 'name', _('Device') ], [ 'signal', _('Signal') ], [ 'ssid', _('Network') ], [ 'rate', _('Link rate') ], [ 'live', _('Live') ], [ 'exp', _('Experience') ], [ 'time', _('Online', 'vantage') ] ];
		var so = ui.sorts[ui.kind];
		/* the offline list is by name, always: its headers are labels */
		if (off) so = { key: 'name', dir: 1 };
		var headSig = off ? 'offline' : ui.kind + ' ' + so.key + ' ' + so.dir;
		if (this.headSig !== headSig) dom.content(el.thead, [ E('tr', {}, cols.map(function(c) {
			if (off) return E('th', { 'class': 'vt-th-' + c[0], 'scope': 'col' }, [ E('span', { 'class': 'vt-label' }, [ c[1] ]) ]);
			var on = so.key === c[0];
			var btn = E('button', { 'type': 'button', 'class': 'vt-sort' + (on ? ' vt-sort-on' : ''), 'click': function() { self.setSort(c[0]); } }, [ E('span', {}, [ c[1] ]), E('span', { 'class': 'vt-sort-ind', 'aria-hidden': 'true' }, [ on ? (so.dir > 0 ? '↑' : '↓') : '' ]) ]);
			if (c[2]) btn.setAttribute('title', c[2]);
			return E('th', { 'class': 'vt-th-' + c[0], 'scope': 'col', 'aria-sort': on ? (so.dir > 0 ? 'ascending' : 'descending') : 'none' }, [ btn ]);
		})) ]);
		this.headSig = headSig;

		var list = all.filter(L.bind(this.matches, this));
		list.sort(function(a, b) {
			var va = self.sortValue(a, so.key), vb = self.sortValue(b, so.key);
			if (va < vb) return -so.dir;
			if (va > vb) return so.dir;
			return a.mac < b.mac ? -1 : 1;
		});
		var gone = !wired && (ui.chip === 'all' || ui.chip === 'new') ? st.gone.map(function(g) { return Object.assign({}, g.client, { gone: true, goneAt: g.at }); }).filter(function(c) {
			return !ui.filter || self.matches(Object.assign({}, c, { isNew: false }));
		}) : [];
		if (ui.chip === 'new') gone = [];

		var maxRate = 0;
		all.forEach(function(c) { var r = wired ? self.listRate(c) : st.staRates[c.mac]; if (r && r.rx + r.tx > maxRate) maxRate = r.rx + r.tx; });

		var keep = new Set(), at = 0;
		this.rowSig = this.rowSig || new Map();
		list.concat(gone).forEach(function(c) {
			var key = (off ? 'offline:' : wired ? 'wired:' : '') + (c.gone ? 'gone:' : '') + c.mac;
			keep.add(key);
			var tr = self.rowMap.get(key);
			if (!tr) {
				tr = E('tr', { 'class': 'vt-row vt-row-enter', 'tabindex': '0' });
				tr.addEventListener('click', function() { self.openDrawer('client', tr.getAttribute('data-mac')); });
				tr.addEventListener('keydown', function(ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.openDrawer('client', tr.getAttribute('data-mac')); } });
				self.rowMap.set(key, tr);
			}
			tr.setAttribute('data-mac', c.mac);
			tr.classList.toggle('vt-row-gone', !!c.gone);
			tr.classList.toggle('vt-row-off', off);
			tr.classList.toggle('vt-row-sel', !!(ui.drawer && ui.drawer.kind === 'client' && ui.drawer.id === c.mac));
			tr.setAttribute('aria-label', _('Open details of %s').format(c.name));
			/* a row that would come out the same keeps its cells, and rows
			   already in order stay where they are */
			var cells = off ? self.offlineCells(c) : wired ? self.wiredCells(c, maxRate) : self.clientCells(c, maxRate), sig = treeSig(cells);
			if (self.rowSig.get(key) !== sig) { dom.content(tr, cells); self.rowSig.set(key, sig); }
			if (el.tbody.children[at] !== tr) el.tbody.insertBefore(tr, el.tbody.children[at] || null);
			at++;
		});
		this.rowMap.forEach(function(tr, key) {
			if (keep.has(key)) return;
			if (tr.parentNode) tr.parentNode.removeChild(tr);
			self.rowMap.delete(key);
			self.rowSig.delete(key);
		});
		window.setTimeout(function() { self.rowMap.forEach(function(tr) { tr.classList.remove('vt-row-enter'); }); }, 600);

		var total = all.length;
		txt(el.count, list.length !== total ? _('%d of %d').format(list.length, total)
			: wired || off ? (total === 1 ? _('1 device') : _('%d devices').format(total))
			: (total === 1 ? _('1 connected') : _('%d connected').format(total)));
		el.count.hidden = both && !off && list.length === total;

		el.clientsEmpty.hidden = list.length + gone.length > 0;
		if (!el.clientsEmpty.hidden) {
			dom.content(el.clientsEmpty, total ? [
				icon('search'), E('p', { 'class': 'vt-empty-title' }, [ ui.filter ? _('No clients match “%s”').format(fmt.safeText(ui.filter, 40)) : _('No clients in this view') ]),
				E('button', { 'type': 'button', 'class': 'vt-btn', 'click': function() { ui.chip = 'all'; self.setFilter(''); } }, [ _('Show all clients') ])
			] : wired && this.lastRaw && this.lastRaw.fdbCrowded ? [
				icon('router'), E('p', { 'class': 'vt-empty-title' }, [ _('Too many devices to list') ]),
				E('p', {}, [ _('The bridges have learned so many addresses that listing them here would strain this device.') ])
			] : wired ? [
				icon('router'), E('p', { 'class': 'vt-empty-title' }, [ _('No wired devices heard') ]),
				E('p', {}, [ _('Devices on the Ethernet ports appear here once they send traffic; the bridge forgets quiet ones after about five minutes.') ])
			] : [
				icon('wifi'), E('p', { 'class': 'vt-empty-title' }, [ _('No clients connected') ]),
				E('p', {}, [ _('Stations appear here as soon as they associate with one of the SSIDs.') ])
			]);
		}
	},

	/* the device cell of a client row: avatar, name, where the name comes
	   from, tags and the address. A name made up from the address
	   ("Private device 53:0F") says where it comes from itself, and
	   drops the octets when the second line is the MAC */
	whoCell: function(c, tags) {
		var made = madeName(c), label = made && c.secondary === c.macLabel ? c.plainName : c.name;
		return E('td', { 'class': 'vt-td-name', 'data-title': _('Device') }, [
			E('div', { 'class': 'vt-who' }, [
				avatar(c),
				E('div', { 'class': 'vt-who-text' }, [
					E('div', { 'class': 'vt-who-label', 'title': label }, [ label ]),
					E('div', { 'class': 'vt-who-sub' }, (made ? [] : [ E('span', { 'class': 'vt-src vt-src-' + c.nameSource, 'title': _('Name from: %s').format(this.sourceText(c)) }, [ c.nameSourceLabel ]) ])
						.concat(tags, [ E('span', { 'class': 'vt-mono vt-who-id' }, [ c.secondary ]) ]))
				])
			])
		]);
	},

	/* a wired host's row. Its link is its port's when it has the port to
	   itself; on a shared port (a switch or another access point behind
	   it) neither the speed nor the traffic is its own, unless a paired
	   access point it is behind has it alone on a port, or this router
	   counts it (luci-app-vantage-traffic; listRate) */
	wiredCells: function(c, maxRate) {
		var r = this.listRate(c), total = r ? r.rx + r.tx : 0;
		var theirs = c.shared && r && c.behind && c.behind.rate ? c.behind : null, ours = c.shared && !!r && !theirs;
		var bar = E('span', { 'class': 'vt-mini-fill' });
		setW(bar, maxRate > 0 ? total / maxRate * 100 : 0);
		var tags = [];
		if (c.gateway) tags.push(pill(_('Gateway'), 'accent', _('The router this device sends its traffic to')));
		else if (c.ap) tags.push(apPill(_('via %s').format(c.ap.name), _('Wired to %s, port %s').format(c.ap.name, c.ap.port)));
		else if (this.linePort(c.port)) tags.push(pill(_('Upstream'), 'muted', _('Reached through the uplink port %s, not connected to this device').format(c.port)));
		/* heard here, and behind a paired access point: a note, nothing more */
		if (c.behind) tags.push(apPill(_('behind %s').format(c.behind.name), this.behindText(c.behind)));
		/* a paired access point's own entry: its other addresses, left out of the list (#167) */
		if (c.own) tags.push(apPill(fmt.N_(c.own.macs.length, '%s more address', '%s more addresses').format(fmt.count(c.own.macs.length)), this.ownText(c.own)));
		if (c.vlan != null) tags.push(pill(_('VLAN %d').format(c.vlan), 'muted'));
		var speed = c.speed ? fmt.phyRate(c.speed.mbps * 1000) : fmt.DASH;
		var link = c.ap ? E('td', { 'class': 'vt-td-link', 'data-title': _('Link', 'vantage'), 'title': _('Port %s of %s').format(c.ap.port, c.ap.name) }, [
			E('div', { 'class': 'vt-phy vt-tn' }, [ E('b', {}, [ speed ]) ]),
			E('div', { 'class': 'vt-phy vt-phy-up vt-phy-ap vt-tn' }, [ c.ap.name + ' · ' + c.ap.port ])
		]) : E('td', { 'class': 'vt-td-link', 'data-title': _('Link', 'vantage') }, [
			E('div', { 'class': 'vt-phy vt-tn' }, [ E('b', { 'class': c.carrier === false ? 'vt-t-warn' : '' }, [ c.carrier === false ? _('down') : c.shared ? _('Shared port') : speed ]) ]),
			E('div', { 'class': 'vt-phy vt-phy-up vt-tn' }, [ c.shared ? _('%s · %d devices').format(c.port, c.peers) : c.switchPort ? c.port + ' · ' + c.switchPort : c.port ])
		]);
		if (!c.ap) link.setAttribute('title', (c.shared ? (c.switch ? _('%s is shared by %d devices behind the switch').format(c.port, c.peers)
			: _('%s is shared by %d devices (a switch or another access point behind it); its %s link is not theirs').format(c.port, c.peers, speed)) : _('Port %s').format(c.port)) +
			(c.switch ? '\n' + switchNote(c.switch) : ''));
		return [
			this.whoCell(c, tags),
			link,
			E('td', { 'class': 'vt-td-net', 'data-title': _('Network') }, [ E('div', { 'class': 'vt-net' }, [ E('span', { 'class': 'vt-net-ssid' }, [ c.network || c.bridge || fmt.DASH ]) ]) ]),
			E('td', { 'class': 'vt-td-live', 'data-title': _('Live') }, c.shared && !theirs && !ours ? [
				E('span', { 'class': 'vt-muted', 'title': _('Not counted per device on a shared port') }, [ fmt.DASH ])
			] : [
				E('div', { 'class': 'vt-live-cell' }, [
					/* no title (null: no attribute) on any other row */
					E('span', { 'class': 'vt-tn vt-live-total', 'title': theirs ? _('Counted by %s on its port %s').format(theirs.name, theirs.port) : ours ? this.trafficEvery() : null }, [ r ? fmt.bits(total) : fmt.DASH ]),
					E('span', { 'class': 'vt-mini' }, [ bar ]),
					E('span', { 'class': 'vt-live-split vt-tn', 'title': r ? _('To device %s, from device %s').format(fmt.bits(r.tx), fmt.bits(r.rx)) : '' }, [ r ? fmt.rates(r.tx, r.rx) : '' ])
				])
			]),
			/* a paired access point's host: not heard by this device's bridge */
			E('td', { 'class': 'vt-td-seen vt-tn', 'data-title': _('Last heard') }, [ c.ap ? fmt.DASH : c.seen == null ? _('static entry') : fmt.ago(c.seen * 1000) ])
		];
	},

	/* a named device that is not connected: its name, icon and MAC as its
	   alias has them; an address and when it was last listed only where
	   still known (a dash in the table, no line on a card: app.css) */
	offlineCells: function(c) {
		var seen = c.lastSeen != null;
		return [
			this.whoCell(c, []),
			E('td', { 'class': 'vt-td-net' + (c.ips.length ? '' : ' vt-td-none'), 'data-title': _('Last address') }, [
				c.ips.length ? E('span', { 'class': 'vt-mono' }, [ c.ips[0] ]) : E('span', { 'class': 'vt-muted' }, [ fmt.DASH ]) ]),
			E('td', { 'class': 'vt-td-seen vt-tn' + (seen ? '' : ' vt-td-none'), 'data-title': _('Last seen') }, [ seen ? fmt.ago(Date.now() - c.lastSeen) : fmt.DASH ])
		];
	},

	/* where a host heard here sits behind a paired access point */
	behindText: function(b) {
		return _('Behind %s, its port %s').format(b.name, b.port);
	},

	ownText: function(o) {
		return _('%s reports these as addresses of its own too: %s').format(o.name, o.macs.join(', '));
	},

	clientCells: function(c, maxRate) {
		var st = this.st, r = c.gone ? null : st.staRates[c.mac];
		var total = r ? r.rx + r.tx : 0;
		var bar = E('span', { 'class': 'vt-mini-fill' });
		setW(bar, maxRate > 0 ? total / maxRate * 100 : 0);
		var tags = [];
		if (c.gone) tags.push(pill(_('Left %s').format(fmt.ago(Date.now() - c.goneAt)), 'muted'));
		else if (c.isNew) tags.push(pill(_('New', 'vantage'), 'accent', _('Connected after you opened this page')));
		if (c.legacyOnRadio && !c.gone) tags.push(pill(c.gen === 'legacy' ? _('Legacy', 'vantage') : c.gen, 'warn', _('Older Wi-Fi generation than the radio; uses more airtime')));
		var exp = c.exp || { score: 0, level: 'muted', grade: fmt.DASH, reason: '' };

		return [
			this.whoCell(c, tags),
			E('td', { 'class': 'vt-td-signal', 'data-title': _('Signal') }, c.gone ? [ E('span', { 'class': 'vt-muted' }, [ fmt.DASH ]) ] : [
				E('span', { 'class': 'vt-signal', 'title': c.level.word }, [ signalGlyph(c.level), E('span', { 'class': 'vt-tn' }, [ fmt.dbm(c.signal) ]) ])
			]),
			/* without a paired access point the cell is as it was: no node added */
			E('td', { 'class': 'vt-td-net', 'data-title': _('Network') }, [
				E('div', { 'class': 'vt-net' }, [ E('span', { 'class': 'vt-net-ssid' }, [ c.ssid ]), E('span', { 'class': 'vt-net-badges' }, [ bandBadge(c.band), c.gen ? E('span', { 'class': 'vt-gen' }, [ c.gen ]) : '' ]) ])
			].concat(c.ap ? [ E('div', { 'class': 'vt-net-via vt-muted', 'title': c.ap.addr || '' }, [ _('via %s').format(c.ap.name) ]) ] : [])),
			E('td', { 'class': 'vt-td-rate', 'data-title': _('Link rate'),
				'title': _('To device: %s').format(c.tx ? c.tx.label : fmt.DASH) + '\n' + _('From device: %s').format(c.rx ? c.rx.label : fmt.DASH) }, [
				E('div', { 'class': 'vt-phy vt-tn' }, [ icon('down', 'vt-ico-sm'), E('b', {}, [ c.tx ? fmt.phyRate(c.tx.rate) : fmt.DASH ]) ]),
				E('div', { 'class': 'vt-phy vt-phy-up vt-tn' }, [ [ c.tx && c.tx.mhz ? _('%s MHz').format(c.tx.mhz) : null, c.tx && c.tx.std ? (c.tx.std === 'legacy' ? _('legacy') : c.tx.std) : null ].filter(Boolean).join(' · ') ])
			]),
			E('td', { 'class': 'vt-td-live', 'data-title': _('Live') }, [
				E('div', { 'class': 'vt-live-cell' }, [
					E('span', { 'class': 'vt-tn vt-live-total' }, [ r ? fmt.bits(total) : fmt.DASH ]),
					E('span', { 'class': 'vt-mini' }, [ bar ]),
					E('span', { 'class': 'vt-live-split vt-tn', 'title': r ? _('To device %s, from device %s').format(fmt.bits(r.tx), fmt.bits(r.rx)) : '' }, [ r ? fmt.rates(r.tx, r.rx) : '' ])
				])
			]),
			E('td', { 'class': 'vt-td-exp', 'data-title': _('Experience') }, c.gone ? [ E('span', { 'class': 'vt-muted' }, [ fmt.DASH ]) ] : [
				E('div', { 'class': 'vt-exp', 'title': exp.reason }, [
					E('span', { 'class': 'vt-score vt-score-' + exp.level + ' vt-tn' }, [ String(exp.score) ]),
					E('span', { 'class': 'vt-exp-text' }, [ E('b', {}, [ exp.grade ]), E('span', {}, [ exp.short || exp.reason ]) ])
				])
			]),
			E('td', { 'class': 'vt-td-time vt-tn', 'data-title': _('Connected') }, [ c.gone ? fmt.DASH : fmt.duration(c.connected) ])
		];
	},

	/* ----------------------------------------------------- top talkers */

	buildTalkers: function() {
		this.el.talkers = E('div', { 'class': 'vt-talkers' });
		return E('section', { 'class': 'vt-tile vt-talk', 'aria-label': _('Top talkers', 'vantage') }, [
			tileHead('pulse', _('Top talkers', 'vantage')),
			this.el.talkers
		]);
	},

	/* always TALKERS rows tall: unused rows stay as hidden slots, so the
	   tile keeps its height as talkers come and go */
	paintTalkers: function() {
		var self = this, m = this.m, t = this.st.talkers || [];
		var byMac = {}, hostBy = {}, slots = [];
		m.clients.forEach(function(c) { byMac[c.mac] = c; });
		(m.wiredHosts || []).forEach(function(c) { hostBy[c.mac] = c; });
		for (var k = t.length; k < TALKERS; k++)
			slots.push(E('div', { 'class': 'vt-talk-row vt-talk-slot', 'aria-hidden': 'true' }, [
				E('span', { 'class': 'vt-talk-rank vt-tn' }, [ ' ' ]),
				avatar({}, true),
				E('span', { 'class': 'vt-talk-main' }, [
					E('span', { 'class': 'vt-talk-top' }, [ E('span', { 'class': 'vt-talk-name' }, [ ' ' ]) ]),
					E('span', { 'class': 'vt-talk-bar' }),
					E('span', { 'class': 'vt-talk-sub vt-tn' }, [ E('b', {}, [ ' ' ]), E('span', { 'class': 'vt-talk-share' }, [ ' ' ]) ])
				])
			]));
		if (!t.length) {
			/* wired hosts that all share their ports are connected, and
			   none of them can be measured */
			var hosts = (m.wiredHosts || []).filter(function(c) { return self.talkHost(c); });
			var alone = hosts.some(function(c) { return !c.shared; });
			dom.content(this.el.talkers, [ E('p', { 'class': 'vt-empty-inline' }, [ m.clients.length || alone ? _('Nobody is moving data right now.')
				: hosts.length ? _('No device has a port to itself; traffic on a shared port is not counted per device.') : _('No clients connected.') ]) ].concat(slots));
			return;
		}
		dom.content(this.el.talkers, t.map(function(x, i) {
			var c = (x.wired ? hostBy : byMac)[x.mac] || { mac: x.mac, name: x.name, icon: 'device' };
			var fill = E('span', { 'class': 'vt-talk-fill' });
			setW(fill, x.share * 100);
			return E('button', { 'type': 'button', 'class': 'vt-talk-row', 'click': function() { self.openDrawer('client', x.mac); } }, [
				E('span', { 'class': 'vt-talk-rank vt-tn' }, [ String(i + 1) ]),
				avatar(c, true),
				E('span', { 'class': 'vt-talk-main' }, [
					E('span', { 'class': 'vt-talk-top' }, [ E('span', { 'class': 'vt-talk-name', 'title': c.name }, [ c.name ]) ]),
					E('span', { 'class': 'vt-talk-bar' }, [ fill ]),
					E('span', { 'class': 'vt-talk-sub vt-tn', 'title': _('To device %s, from device %s').format(fmt.bits(x.down), fmt.bits(x.up)) }, [
						E('b', {}, [ fmt.bits(x.total) ]), E('span', { 'class': 'vt-talk-share' }, [ fmt.pct(x.share * 100) ]), fmt.rates(x.down, x.up) ])
				])
			]);
		}).concat(slots));
	},

	/* ------------------------------------------------------------ SSIDs */

	buildSsids: function() {
		this.el.ssids = E('div', { 'class': 'vt-ssids' });
		return this.foldable('ssids', E('section', { 'class': 'vt-tile vt-ssid-tile', 'aria-label': _('Wireless networks', 'vantage') }, [
			tileHead('wifi', _('Wireless networks', 'vantage'), [ pageLink(insight.PAGES.wireless, _('Edit')), this.foldButton('ssids', _('Show or hide the wireless networks')) ]),
			this.el.ssids
		]));
	},

	paintSsids: function() {
		var self = this, m = this.m, st = this.st;
		var groups = model.groupSsids(m.ssids);
		if (!groups.length) {
			dom.content(this.el.ssids, [ E('p', { 'class': 'vt-empty-inline' }, [ _('No wireless networks configured.', 'vantage') ]) ]);
			return;
		}
		patch(this.el.ssids, groups.map(function(g) {
			var rx = 0, tx = 0, has = false;
			g.ids.forEach(function(id) { var r = st.ssidRates[id]; if (r) { rx += r.rx; tx += r.tx; has = true; } });
			var bands = g.bands.map(function(b) { return bandBadge(b); });
			/* a lock, in amber, only where the security is open or weak */
			var tone = g.security.tone === 'open' ? 'unlock' : g.security.tone === 'weak' ? 'lock' : null;
			return E('button', { 'type': 'button', 'class': 'vt-ssid' + (g.clients ? '' : ' vt-ssid-idle'), 'title': _('Show the clients of %s').format(g.ssid),
				'click': function() { self.filterSsid(g.ssid); } }, [
				E('span', { 'class': 'vt-ssid-main' }, [
					E('span', { 'class': 'vt-ssid-top' }, [ E('span', { 'class': 'vt-ssid-name' }, [ g.ssid || _('(hidden)') ]), g.hidden ? pill(_('Hidden', 'vantage'), 'muted') : '' ]),
					E('span', { 'class': 'vt-ssid-meta' }, bands.concat([ E('span', { 'class': 'vt-sec' + (tone ? ' vt-t-warn' : ''), 'title': g.security.long }, [ tone ? icon(tone, 'vt-ico-sm') : '', g.security.short ]) ]))
				]),
				E('span', { 'class': 'vt-ssid-side' }, [
					E('span', { 'class': 'vt-ssid-n vt-tn' }, [ String(g.clients) ]),
					E('span', { 'class': 'vt-hint vt-tn' }, [ g.clients ? (has ? '↓ ' + fmt.bits(tx) : fmt.DASH) : _('idle') ])
				])
			]);
		}));
	},

	/* -------------------------------------------------------- WireGuard */

	/* a tile only with a tunnel (vantage.layout); its link is LuCI's own
	   status page, for a login that has it in its menu */
	buildWireguard: function() {
		this.el.wg = E('div', { 'class': 'vt-wg' });
		return E('section', { 'class': 'vt-tile vt-wg-tile', 'aria-label': _('WireGuard') }, [
			tileHead('lock', _('WireGuard'), [ pageLink(LUCI_WIREGUARD, _('Status')) ]),
			this.el.wg
		]);
	},

	/* each tunnel with its peers, those with a session first (the
	   model's order), WG_PEERS of them until its "+n more" is opened. The
	   dot is a session now, by the handshake's age, and never a warning:
	   a peer that is away is no fault. ↓ is what this device received
	   from the peer and ↑ what it sent to it, as the tunnel's own
	   counters run and the path shows a tunnel. The peer's key only as
	   the model shortened it */
	paintWireguard: function() {
		var self = this, st = this.st, rates = st.wgRates || {};
		if (!this.m.wg) return;
		if (!st.wg.length) {
			patch(this.el.wg, [ E('p', { 'class': 'vt-empty-inline' }, [ _('No WireGuard tunnel is reported right now.') ]) ]);
			return;
		}
		function when(p) {
			if (p.state === 'never' || p.age == null) return _('No handshake yet');
			return _('Handshake %s').format(p.age < 86400 ? fmt.ago(p.age * 1000) : _('%s ago').format(fmt.duration(p.age)));
		}
		patch(this.el.wg, st.wg.map(function(t) {
			var all = self.ui.wgOpen[t.name] === true, shown = all ? t.peers : t.peers.slice(0, WG_PEERS);
			return E('div', { 'class': 'vt-wg-tun' }, [
				E('div', { 'class': 'vt-wg-head' }, [
					E('span', { 'class': 'vt-wg-name' }, [ t.name ]),
					E('span', { 'class': 'vt-hint vt-tn' }, [ (t.port ? [ _('UDP port %d').format(t.port) ] : []).concat(
						[ t.peers.length === 1 ? _('1 peer') : _('%d peers').format(t.peers.length) ]).join(' · ') ])
				]),
				E('div', { 'class': 'vt-wg-peers' }, shown.map(function(p) {
					var r = rates[t.name + ' ' + p.id], here = p.state === 'recent';
					return E('div', { 'class': 'vt-wg-peer' + (here ? '' : ' vt-wg-away'),
						'title': [ p.label, p.name ? _('Public key %s').format(p.key) : null, p.endpoint,
							p.allowed.length ? _('Allowed IPs: %s').format(p.allowed.join(', ')) : null ].filter(Boolean).join('\n') }, [
						E('span', { 'class': 'vt-status vt-status-' + (here ? 'ok' : 'off'), 'aria-hidden': 'true' }),
						E('span', { 'class': 'vt-wg-main' }, [
							E('span', { 'class': 'vt-wg-peer-name' }, [ p.label ]),
							E('span', { 'class': 'vt-wg-ep vt-mono' }, [ p.endpoint || fmt.DASH ])
						]),
						E('span', { 'class': 'vt-wg-side' }, [
							E('span', { 'class': 'vt-wg-rate vt-tn', 'title': r ? _('Received %s, sent %s').format(fmt.bits(r.rx), fmt.bits(r.tx)) : '' }, [ r ? fmt.rates(r.rx, r.tx) : fmt.DASH ]),
							E('span', { 'class': 'vt-hint vt-tn' }, [ when(p) ])
						])
					]);
				}).concat(t.peers.length ? [] : [ E('p', { 'class': 'vt-empty-inline' }, [ _('No peers configured.') ]) ])),
				/* which tunnel: read from the button, which a poll keeps (patch) */
				t.peers.length > WG_PEERS ? E('button', { 'type': 'button', 'class': 'vt-wg-more', 'data-tunnel': t.name, 'aria-expanded': String(all),
					'click': function(ev) { self.toggleTunnel(ev.currentTarget.getAttribute('data-tunnel')); } },
					[ all ? _('Show fewer') : _('+%d more').format(t.peers.length - shown.length) ]) : ''
			]);
		}));
	},

	/* all of a tunnel's peers, or the first WG_PEERS again; the new
	   height at once, as a fold's. The button says which it is in an
	   attribute, so it was built anew: the keyboard stays on it */
	toggleTunnel: function(name) {
		this.ui.wgOpen[name] = this.ui.wgOpen[name] !== true;
		if (this.held) delete this.held.wg;
		this.paintWireguard();
		var btn = Array.prototype.filter.call(this.el.wg.querySelectorAll('.vt-wg-more'), function(b) { return b.getAttribute('data-tunnel') === name; })[0];
		if (btn) btn.focus();
	},

	/* ------------------------------------------------------------ ports */

	/* a tile only on a device with two Ethernet ports or more
	   (vantage.layout); which devices are ports: model.ports */
	buildPorts: function() {
		var el = this.el;
		el.portsSum = E('span', { 'class': 'vt-hint vt-tn' });
		el.ports = E('div', { 'class': 'vt-ports' });
		return E('section', { 'class': 'vt-tile vt-ports-tile', 'aria-label': _('Ports') }, [
			tileHead('port', _('Ports'), [ el.portsSum, pageLink(insight.PAGES.network, _('Interfaces')) ]),
			el.ports
		]);
	},

	/* a cell per port: its name, its link (a dot, and the negotiated
	   speed; half duplex said), its traffic, the wired hosts learned on
	   it, and a mark where a line to the internet leaves through it (the
	   line's name where there are several). ↓ is what goes to the
	   devices on the port and ↑ what comes from them, as the path's port
	   nodes and the wired list count; on a line's port ↓ is what comes
	   from the internet, as the line itself shows it. A port without a
	   link is quieter, never a warning: an empty socket is no fault. A
	   swconfig switch's port has a link and no counters here. Errors,
	   drops and collisions since boot only where there are any: a line
	   each in the cell, and the same words in its tooltip, so they are
	   there without a pointer too. A port with hosts opens the Clients
	   tile's wired list on them, as its node on the path does.
	   The cells are built when the ports or what a click opens change
	   and written to in place by every poll, tooltip and all: a cell
	   under the keyboard or the pointer stays the same element */
	paintPorts: function() {
		var self = this, m = this.m, st = this.st, ports = m.ports || [];
		if (!m.portsTile) return;
		var known = ports.length > 0 && ports.every(function(p) { return p.link !== null; });
		txt(this.el.portsSum, known ? _('%d of %d connected').format(ports.filter(function(p) { return p.link; }).length, ports.length) : '');
		function opens(p) { return p.hosts && p.dev ? p.dev : null; }
		var shape = JSON.stringify(ports.map(function(p) { return [ p.id, opens(p) ]; }));
		if (shape !== this.portsShape) {
			this.portsShape = shape;
			this.portCells = ports.map(function(p) {
				var dev = opens(p);
				return dev ? E('button', { 'type': 'button', 'click': function() { self.showWired(dev); } }) : E('div');
			});
			dom.content(this.el.ports, ports.length ? this.portCells : [ E('p', { 'class': 'vt-empty-inline' }, [ _('No Ethernet ports are reported right now.') ]) ]);
		}
		var several = (m.uplinks || []).length > 1;
		/* a note as its label and its counts, so a narrow cell breaks
		   between the two and not before the last word (#168) */
		function note(t) {
			var x = fmt.labelled(t);
			return E('span', { 'class': 'vt-port-note vt-tn' }, x.length > 1 ? x.map(function(p) { return E('span', {}, [ p ]); }) : x);
		}
		ports.forEach(function(p, i) {
			var r = p.link && !p.sw ? st.devRates[p.id] || null : null, line = p.lines.length > 0, c = p.counters, counted = [];
			var rate = r && !(r.rx === 0 && r.tx === 0) ? (line ? fmt.rateParts(r.rx, r.tx) : fmt.rateParts(r.tx, r.rx)) : null;
			if (c && (c.rxErrors || c.txErrors)) counted.push(_('Errors: %s in · %s out').format(fmt.count(c.rxErrors), fmt.count(c.txErrors)));
			if (c && (c.rxDropped || c.txDropped)) counted.push(_('Dropped: %s in · %s out').format(fmt.count(c.rxDropped), fmt.count(c.txDropped)));
			if (c && c.collisions) counted.push(_('Collisions: %s').format(fmt.count(c.collisions)));
			var el = self.portCells[i];
			setClass(el, 'vt-port' + (p.link ? '' : ' vt-port-off'));
			setTitle(el, [
				p.sw ? p.name + ' · ' + _('Port %s of %s').format(p.sw.num, p.sw.name) : p.name,
				p.link === null ? null : !p.link ? _('No link') : p.speed ? model.speedLabel(p.speed) : _('link up'),
				line ? _('Uplink · %s').format(p.lines.join(', ')) : null,
				r ? _('Received %s, sent %s').format(fmt.bits(r.rx), fmt.bits(r.tx)) : null
			].concat(counted, opens(p) ? [ _('Show the devices on %s').format(p.dev) ] : []).filter(Boolean).join('\n'));
			patch(el, [
				E('span', { 'class': 'vt-port-top' }, [
					E('span', { 'class': 'vt-status vt-status-' + (p.link ? 'ok' : 'off'), 'aria-hidden': 'true' }),
					E('span', { 'class': 'vt-port-name' }, [ p.name ]),
					line ? pill(several ? p.lines.join(', ') : _('Uplink', 'vantage'), 'accent') : ''
				]),
				E('span', { 'class': 'vt-port-link vt-tn' }, [ p.link === null ? fmt.DASH : !p.link ? _('No link')
					: p.speed ? fmt.phyRate(p.speed.mbps * 1000) + (p.speed.duplex === 'half' ? ' · ' + _('half duplex') : '') : _('link up') ]),
				/* its rates as two items, so a narrow cell wraps them rather than cut them */
				p.link && !p.sw ? E('span', { 'class': 'vt-port-rates vt-tn' }, rate ? [ E('span', {}, [ '↓ ' + rate.dn ]), E('span', {}, [ '↑ ' + rate.up + (rate.unit ? ' ' + rate.unit : '') ]) ]
					: [ E('span', {}, [ r ? _('idle') : fmt.DASH ]) ]) : '',
				p.hosts ? E('span', { 'class': 'vt-port-hosts vt-tn' }, [ p.hosts === 1 ? _('1 device') : _('%d devices').format(p.hosts) ]) : ''
			].concat(counted.map(note)));
		});
	},

	/* --------------------------------------------------- provider tiles */

	/* A tile for each provider this login may ask (tileIds; not one whose
	   first answer said it is not there) that has none yet: its layout
	   id ('x' and the provider's id) in a list. Its name, icon and dot
	   come with its answers (paintTile); before one it goes by the
	   provider's id */
	buildProvided: function() {
		var self = this, ts = this.tileState || {}, out = [], els = this.extEls || (this.extEls = Object.create(null));
		(this.tileIds || []).forEach(function(id) {
			if (els[id] || (ts[id] && ts[id].off)) return;
			var e = els[id] = { head: E('h3', { 'class': 'vt-tile-title' }), extra: E('div', { 'class': 'vt-tile-extra' }), body: E('div', { 'class': 'vt-ext' }) };
			e.tile = self.tiles['x' + id] = E('section', { 'class': 'vt-tile vt-ext-tile' }, [
				E('header', { 'class': 'vt-tile-head' }, [ e.head, e.extra ]),
				e.body
			]);
			self.nameTile(id);
			out.push('x' + id);
		});
		return out;
	},

	/* the tiles of providers the page learnt of after it was built (its
	   first read of the ACL failed: askTiles), made as buildTiles makes
	   tiles and watched as render watches them */
	addProvided: function() {
		var self = this, ro = this.tileRo;
		this.buildProvided().forEach(function(lid) {
			var t = self.tiles[lid];
			t.classList.add('vt-cell');
			t.appendChild(self.buildOverlay(lid));
			self.tileList.push(lid);
			self.el.grid.appendChild(t);
			if (ro) [ t ].concat(Array.prototype.slice.call(t.children)).forEach(function(c) { if (!c.classList.contains('vt-ov')) ro.observe(c); });
		});
	},

	/* Provenance: whose tile it is, so that no provider passes for a tile
	   of the dashboard's own. The head carries the provider's id in a
	   source tag after its name (the look of a client's name source),
	   which its tooltip explains; only provider tiles have one.
	   Customize, the hidden tiles' list and the screen reader name it
	   "name (id)". The id is the object's, from the session's ACL, never
	   from what the provider answered. Its name is that of the last
	   answer that could be read, the id before one */
	tileName: function(id) {
		var t = this.st.ext[id], d = t && t.readable;
		return d ? _('%s (%s)').format(_(d.title), id) : id;
	},

	nameTile: function(id) {
		var e = this.extEls[id], t = this.st.ext[id], d = t && t.readable, lid = 'x' + id, name = this.tileName(id);
		patch(e.head, [
			icon(d ? d.icon : model.TILE_ICONS[0]),
			d ? E('span', { 'class': 'vt-ext-name' }, [ _(d.title) ]) : '',
			E('span', { 'class': 'vt-src vt-ext-src', 'title': _('From another package: %s').format(id) }, [ id ])
		]);
		/* Customize names it too: its controls made again under the name,
		   but not while it is open, which would take a control from under
		   the pointer or the keyboard */
		var ov = this.ov && this.ov[lid];
		if (this.tileNames[lid] === name || (ov && this.editing)) return;
		this.tileNames[lid] = name;
		e.tile.setAttribute('aria-label', name);
		if (ov && ov.root.parentNode === e.tile) e.tile.replaceChild(this.buildOverlay(lid), ov.root);
	},

	paintTiles: function() {
		var self = this;
		Object.keys(this.extEls || {}).forEach(function(id) { self.paintTile(id); });
	},

	/* What a provider handed over, drawn by the dashboard as text: its
	   name and icon (the dashboard's own), its dot (never a health check
	   and never the page title's mark), the link to its LuCI page where
	   this login's menu has it, under LuCI's name for that page, a note
	   and its items. Its words (name, note, labels) are looked up in
	   LuCI's catalogues, as the dashboard's own are; a text value is a
	   value (an operator's name) and is shown as it came. A value is
	   written out by its unit, a counter as its rate between two
	   answers, with a meter or the page's values of it where it asks
	   for one. Before an answer, after one that cannot be read and when
	   it does not answer, it says so in words */
	paintTile: function(id) {
		var e = this.extEls[id], t = this.st.ext[id], lid = 'x' + id;
		if (!e || !t || (this.m.extra || []).indexOf(lid) < 0) return;
		var last = t.readable, d = t.state === 'ok' ? t.data : null;
		this.nameTile(id);
		var page = last && last.page ? menuPage(last.page) : null;
		patch(e.extra, [
			d && d.state ? E('span', { 'class': 'vt-status vt-status-' + d.state }, d.state === 'err' || d.state === 'warn' ? [ E('span', { 'class': 'vt-sr' }, [ d.state === 'err' ? _('Error') : _('Warning') ]) ] : []) : '',
			page ? pageLink(last.page, page) : ''
		]);
		if (!d) {
			patch(e.body, [ E('p', { 'class': 'vt-empty-inline' }, [ t.state === 'wait' ? _('Waiting for its first report') : t.state === 'bad' ? _('Sent a report that could not be read') : _('Did not answer in time') ]) ]);
			return;
		}
		patch(e.body, [
			d.note ? E('p', { 'class': 'vt-hint vt-ext-note' }, [ _(d.note) ]) : '',
			d.items.length ? E('div', { 'class': 'vt-ext-items' }, d.items.map(function(x) {
				var r = x.rate ? t.rates[x.label] : null, level = x.level === 'err' ? ' vt-t-err' : x.level === 'warn' ? ' vt-t-warn' : x.level === 'off' ? ' vt-muted' : '';
				return E('div', { 'class': 'vt-ext-item' }, [
					E('span', { 'class': 'vt-label' }, [ _(x.label) ]),
					E('span', { 'class': 'vt-ext-val vt-tn' + level }, [ tileValue(x, r ? r.rx / 8 : null) ].concat(x.level === 'err' || x.level === 'warn' ? [ E('span', { 'class': 'vt-sr' }, [ ' ' + (x.level === 'err' ? _('Error') : _('Warning')) ]) ] : [])),
					x.max != null ? tileMeter(x) : '',
					x.trend ? tileTrend(t.hist[x.label] || []) : ''
				]);
			})) : ''
		]);
	},

	/* ----------------------------------------------------------- drawer */

	buildDrawer: function() {
		var self = this, el = this.el;
		el.drawerTitle = E('div', { 'class': 'vt-drawer-title', 'id': 'vt-drawer-title' });
		el.drawerBody = E('div', { 'class': 'vt-drawer-body' });
		el.drawerClose = E('button', { 'type': 'button', 'class': 'vt-drawer-close', 'aria-label': _('Close'), 'click': function() { self.closeDrawer(); } }, [ icon('close') ]);
		/* what a Copy button did, for a screen reader (copyLine) */
		el.drawerSay = E('span', { 'class': 'vt-sr', 'role': 'status' });
		el.drawer = E('aside', { 'class': 'vt-drawer', 'role': 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'vt-drawer-title', 'hidden': 'hidden' }, [
			E('div', { 'class': 'vt-drawer-grip', 'aria-hidden': 'true' }),
			E('header', { 'class': 'vt-drawer-head' }, [ el.drawerTitle, el.drawerClose ]),
			el.drawerBody,
			el.drawerSay
		]);
		el.drawerBack = E('div', { 'class': 'vt-drawer-back', 'hidden': 'hidden', 'click': function() { self.closeDrawer(); } });
		return E('div', { 'class': 'vt-drawer-layer' }, [ el.drawerBack, el.drawer ]);
	},

	openDrawer: function(kind, id) {
		var el = this.el;
		this.ui.drawer = { kind: kind, id: id };
		this.ui.editing = null;
		/* the address names what is shown, also when the open drawer
		   moves on (from a radio to one of its clients) */
		try { history.replaceState(null, '', '#' + kind + (kind === 'uplink' && !id ? '' : '=' + encodeURIComponent(id))); } catch (e) {}
		if (!el.drawer.hidden) { this.paintDrawer(); this.paintClients(); return; }
		this.lastFocus = document.activeElement;
		el.drawer.hidden = false;
		el.drawerBack.hidden = false;
		this.paintDrawer();
		this.paintClients();
		window.requestAnimationFrame(function() { el.root.classList.add('vt-drawer-open'); el.drawerClose.focus(); });
	},

	closeDrawer: function() {
		var el = this.el, self = this;
		if (el.drawer.hidden) return;
		this.ui.drawer = null;
		this.ui.editing = null;
		el.root.classList.remove('vt-drawer-open');
		window.setTimeout(function() { if (!self.ui.drawer) { el.drawer.hidden = true; el.drawerBack.hidden = true; } }, reducedMotion() ? 0 : 260);
		try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
		this.paintClients();
		if (this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus();
	},

	/* A deep link names an existing thing or nothing: a client by a
	   station MAC, a radio this device reports, a line to the internet by
	   its interface (#uplink alone: the main one, whichever it is); the
	   device takes no id. Anything else is dropped from the address bar,
	   so a crafted link cannot put its own text in the drawer title. */
	openFromHash: function() {
		var hash = location.hash || '', m = /^#(client|radio|uplink|device)=(.{1,128})$/.exec(hash), id = null;
		if (hash === '#uplink') { this.openDrawer('uplink', ''); return; }
		if (m) {
			try { id = decodeURIComponent(m[2]); } catch (e) { id = null; }
			if (id == null) { /* malformed escape */ }
			else if (m[1] === 'client') id = names.normMac(id);
			else if (m[1] === 'radio') id = this.m && this.m.radios.some(function(r) { return r.id === id; }) ? id : null;
			else if (m[1] === 'uplink') id = ((this.m && this.m.uplinks) || []).some(function(x) { return x.iface === id; }) ? id : '';
			else id = m[1];
		}
		if (id != null) { this.openDrawer(m[1], id); return; }
		if (/^#(client|radio|uplink|device)=/.test(hash)) {
			try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
		}
	},

	paintDrawer: function() {
		var d = this.ui.drawer, el = this.el;
		if (!d || !el.drawer || el.drawer.hidden) return;
		if (this.ui.editing) return;   /* do not replace a form being typed in */
		/* nor a text someone selected in the details, to copy by hand */
		var body = el.drawerBody, sel = body.contains && window.getSelection ? window.getSelection() : null;
		if (sel && !sel.isCollapsed && sel.anchorNode && body.contains(sel.anchorNode)) return;
		var content;
		if (d.kind === 'client') content = this.drawerClient(d.id);
		else if (d.kind === 'radio') content = this.drawerRadio(d.id);
		else if (d.kind === 'uplink') content = this.drawerUplink(d.id);
		else content = this.drawerDevice();
		/* a poll's rebuild takes the focus with the old controls: the one
		   in the same place (a Copy button say) has it again */
		var focusable = function() { return body.querySelectorAll ? Array.prototype.slice.call(body.querySelectorAll('button, a[href], input, select')) : []; };
		var had = focusable(), at = had.indexOf(document.activeElement);
		dom.content(el.drawerTitle, content.title);
		dom.content(body, content.body);
		var now = focusable();
		if (at >= 0 && now.length === had.length) now[at].focus();
	},

	section: function(title, children, cls) {
		return E('section', { 'class': 'vt-dsec' + (cls ? ' ' + cls : '') }, [ E('h4', { 'class': 'vt-dsec-title' }, [ title ]) ].concat(children));
	},

	/* Copies `text`, the value shown in `node`. The async clipboard needs
	   a secure context, and LuCI is often served over plain HTTP: then
	   the value's own text is selected and execCommand('copy') takes it
	   (selecting plain text leaves the focus on the button). Where
	   neither works the text stays selected, to copy by hand.
	   -> Promise<boolean> */
	copyText: function(text, node) {
		var fallback = function() {
			var ok = false, sel = window.getSelection(), range = document.createRange();
			range.selectNodeContents(node);
			sel.removeAllRanges();
			sel.addRange(range);
			try { ok = document.execCommand('copy') === true; } catch (e) {}
			if (ok) sel.removeAllRanges();
			return ok;
		};
		if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
			return navigator.clipboard.writeText(text).then(function() { return true; }, fallback);
		return Promise.resolve(fallback());
	},

	/* A value of the details (a MAC, an address) with a Copy button on
	   its line; `tail` is shown after the value and not copied. The
	   button's name ends in the value, so it says what it copies; its
	   label reads "Copied" for a moment (COPIED_MS), and the drawer's
	   status line says so to a screen reader. The drawer is rebuilt on
	   every poll, so what was copied and when is the view's
	   (this.copied): a rebuilt button shows the same. */
	copyLine: function(text, tail) {
		var self = this, value = E('span', {}, [ text ]);
		var word = function(c) { return !c ? _('Copy') : c.ok ? _('Copied') : _('Not copied'); };
		var now = this.copied && this.copied.text === text && Date.now() - this.copied.at < COPIED_MS ? this.copied : null;
		var label = E('span', { 'class': 'vt-copy-label' }, [ word(now) ]);
		var btn = E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost vt-copy', 'click': function() {
			self.copyText(text, value).then(function(ok) {
				var mine = self.copied = { text: text, at: Date.now(), ok: ok }, say = self.el.drawerSay, body = self.el.drawerBody;
				txt(label, word(mine));
				/* a poll may have rebuilt the details between the click and
				   this answer: the button that is there now for this value
				   says it too */
				if (body) Array.prototype.forEach.call(body.querySelectorAll('.vt-copy'), function(b) {
					var parts = b.childNodes;
					if (parts.length === 2 && parts[1].textContent === ' ' + text) txt(parts[0], word(mine));
				});
				if (say) { txt(say, ''); window.setTimeout(function() { txt(say, word(mine)); }, 30); }
				window.setTimeout(function() {
					/* a later copy has its own timer; every button, also one
					   a poll has rebuilt since, reads Copy again */
					if (self.copied !== mine) return;
					self.copied = null;
					txt(label, word(null));
					if (body) Array.prototype.forEach.call(body.querySelectorAll('.vt-copy-label'), function(l) { txt(l, word(null)); });
				}, COPIED_MS);
			});
		} }, [ label, E('span', { 'class': 'vt-sr' }, [ ' ' + text ]) ]);
		return E('span', { 'class': 'vt-copyline' }, [ E('span', {}, [ value, tail || '' ]), btn ]);
	},

	/* an address with its Copy button; of "address/length" the address
	   is what is copied */
	addrLine: function(a) {
		var p = String(a).split('/');
		return this.copyLine(p[0], p.length > 1 ? '/' + p.slice(1).join('/') : '');
	},

	/* a client's drawer title: its name, where the name comes from and
	   its address; a name made up from the MAC shows the MAC instead */
	drawerWho: function(c) {
		var made = madeName(c);
		return [
			avatar(c),
			E('div', { 'class': 'vt-drawer-titles' }, [
				E('div', { 'class': 'vt-drawer-name', 'id': 'vt-drawer-name' }, [ made ? c.plainName : c.name ]),
				E('div', { 'class': 'vt-drawer-sub' }, made ? [ E('span', { 'class': 'vt-mono' }, [ c.macLabel ]) ] : [
					E('span', { 'class': 'vt-src vt-src-' + c.nameSource }, [ c.nameSourceLabel ]),
					E('span', { 'class': 'vt-mono' }, [ c.secondary ])
				])
			])
		];
	},

	drawerClient: function(mac) {
		var self = this, st = this.st, c = null, gone = null;
		this.m.clients.forEach(function(x) { if (x.mac === mac) c = x; });
		if (!c) st.gone.forEach(function(g) { if (g.client.mac === mac) gone = g; });
		if (!c && gone) c = Object.assign({}, gone.client, { gone: true, goneAt: gone.at });
		if (!c) (this.m.wiredHosts || []).forEach(function(x) { if (x.mac === mac) c = x; });
		if (c && typeof c.port === 'string') return this.drawerWired(c);
		if (!c) (this.m.offline || []).forEach(function(x) { if (x.mac === mac) c = x; });
		if (c && c.offline) return this.drawerOffline(c);
		if (!c) return {
			title: [ E('span', { 'class': 'vt-drawer-name' }, [ names.normMac(mac) ? fmt.mac(mac) : _('Unknown device', 'vantage') ]) ],
			body: [ E('div', { 'class': 'vt-empty' }, [ icon('wifi'), E('p', { 'class': 'vt-empty-title' }, [ _('Not connected') ]), E('p', {}, [ _('This station is not associated right now.') ]) ]) ]
		};

		var r = c.gone ? null : st.staRates[c.mac], hist = st.clientHist[c.mac] || [];
		var exp = c.exp || insight.experience(c);
		/* #110: a weak station far away on purpose can be left out of the
		   warnings; shown while it is weak or set so, and then kept while
		   its details are open (a signal around the line would make the
		   row come and go under the pointer) */
		var quietOn = !!(this.quiet && this.quiet[c.mac]);
		if (quietOn || (c.signal != null && c.signal < insight.WEAK_DBM)) this.quietShown = c.mac;
		var quietRow = !c.gone && (quietOn || this.quietShown === c.mac) ? this.quietRow(c, quietOn) : '';
		/* a paired access point's station is in no warning here (isWeak) */
		if (c.ap) quietRow = '';
		var radio = this.m.radios.filter(function(x) { return x.id === c.radio; })[0];

		var title = this.drawerWho(c);

		var rename = this.canWrite ? E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost', 'click': function() { self.startRename(c); } }, [ icon('pencil'), E('span', {}, [ c.alias ? _('Rename', 'vantage') : _('Name this device') ]) ]) : '';
		var sigSeries = hist.map(function(p) { return [ p[0], p[1] ]; }).filter(function(p) { return isFinite(p[1]); });
		/* dBm as headroom above -95 dBm: -30 dBm at the top, the -75 dBm
		   weak-signal line dashed */
		var sigSpark = sparkline(sigSeries.map(function(p) { return [ p[0], Math.max(0, 95 - p[1]) ]; }), [ 1 ], 65, 'vt-spark-' + (c.band || 'x'),
			{ thresh: 95 + insight.WEAK_DBM, threshLabel: fmt.dbm(insight.WEAK_DBM) });
		var sigVals = sigSeries.map(function(p) { return -p[1]; });

		var body = [
			c.gone ? E('div', { 'class': 'vt-banner vt-banner-muted' }, [ icon('info'), E('span', {}, [ _('Disconnected %s; shown from the last sample.').format(fmt.ago(Date.now() - c.goneAt)) ]) ]) : ''
		].concat(c.ap && !c.gone ? [ E('div', { 'class': 'vt-banner vt-banner-muted' }, [ icon('info'), E('span', {}, [ _('Connected to %s, a paired access point: signal, link rates and traffic as it reports them.').format(c.ap.name) ]) ]) ] : [], [
			/* no link to the access point's own LuCI: its address is text only */
			E('div', { 'class': 'vt-dactions' }, [ rename, c.ap ? '' : pageLink(insight.PAGES.wireless, _('Wireless settings')) ]),
			this.el.renameSlot = E('div', { 'class': 'vt-rename-slot' }),
			quietRow,
			c.gone ? '' : E('div', { 'class': 'vt-expcard vt-expcard-' + exp.level }, [
				E('div', { 'class': 'vt-ring vt-tn' }, [ this.ring(exp.score), E('span', { 'class': 'vt-ring-n' }, [ String(exp.score) ]) ]),
				E('div', { 'class': 'vt-expcard-text' }, [
					E('div', { 'class': 'vt-expcard-grade' }, [ _('%s experience').format(exp.grade) ]),
					E('div', { 'class': 'vt-expcard-reason' }, [ exp.reason ]),
					exp.factors.length > 1 ? E('ul', { 'class': 'vt-factors' }, exp.factors.filter(function(f) { return f.cost > 0; }).map(function(f) {
						return E('li', {}, [ E('span', { 'class': 'vt-tn' }, [ '−' + f.cost ]), E('span', {}, [ f.text ]) ]);
					})) : ''
				])
			]),
			E('div', { 'class': 'vt-dgrid' }, [
				E('div', { 'class': 'vt-dcard' }, [
					E('div', { 'class': 'vt-dcard-label' }, [ _('Signal') ]),
					E('div', { 'class': 'vt-dcard-value' }, [ c.gone ? fmt.DASH : fmt.dbm(c.signal) ]),
					E('div', { 'class': 'vt-dcard-sub' }, [ c.gone ? '' : c.level.word + (sigVals.length > 1 ? ' · ' + _('range %s … %s').format(fmt.dbm(Math.min.apply(null, sigVals)), fmt.dbm(Math.max.apply(null, sigVals))) : '') ]),
					sigSpark
				]),
				E('div', { 'class': 'vt-dcard' }, [
					E('div', { 'class': 'vt-dcard-label' }, [ _('Throughput', 'vantage') ]),
					E('div', { 'class': 'vt-dcard-value' }, [ r ? fmt.bits(r.tx + r.rx) : fmt.DASH ]),
					E('div', { 'class': 'vt-dcard-sub vt-tn' }, [ r ? '↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx) : _('measuring') ]),
					sparkline(hist, [ 2, 3 ], 0, 'vt-spark-' + (c.band || 'x'), { min: 1000, scale: bitsLabel, ceil: rateCeil })
				])
			]),
			c.ap ? this.section(_('Link', 'vantage'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('To device'), c.tx ? c.tx.label : fmt.DASH),
				kv(_('From device'), c.rx ? c.rx.label : fmt.DASH)
			]) ]) : this.section(_('Link', 'vantage'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('To device'), c.tx ? [ c.tx.label, c.tx.detail ? E('small', {}, [ c.tx.detail ]) : '' ] : fmt.DASH),
				kv(_('From device'), c.rx ? [ c.rx.label, c.rx.detail ? E('small', {}, [ c.rx.detail ]) : '' ] : fmt.DASH),
				kv(_('Generation', 'vantage'), c.gen ? [ c.gen, c.legacyOnRadio ? E('small', { 'class': 'vt-t-warn' }, [ _('older than the radio (%s)').format(radio && radio.gen || '') ]) : '' ] : fmt.DASH),
				kv(_('Capabilities', 'vantage'), [ c.wmm ? 'WMM' : null, c.mfp ? _('PMF') : null, c.caps && c.caps.rrm ? '802.11k' : null, c.caps && c.caps.mbo ? 'MBO' : null ].filter(Boolean).join(' · ') || fmt.DASH),
				kv(_('Noise / SNR'), c.noise != null && c.signal != null ? fmt.dbm(c.noise) + ' · ' + (c.signal - c.noise) + ' dB' : E('span', { 'class': 'vt-muted' }, [ _('not reported by the driver') ]))
			]) ]),
			this.section(_('Connection'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('Network'), [ c.ssid, ' ', bandBadge(c.band) ]),
				/* a channel that is not known is a dash, as on the tiles, and
				   a width that is not known is left out: neither is made up */
				c.ap ? kv(_('Access point'), [ c.ap.name, c.ap.addr ? E('small', {}, [ c.ap.addr ]) : '', alsoLine(c.ap) ]) :
					kv(_('Radio', 'vantage'), !radio ? c.radio : radio.channel && radio.width ? _('%s · channel %d · %d MHz').format(radio.id, radio.channel, radio.width)
						: radio.id + ' · ' + (radio.channel ? _('channel %d').format(radio.channel) : fmt.DASH))
			].concat(c.ap && c.ap.bssid ? [ kv(_('BSSID'), [ fmt.mac(c.ap.bssid), c.ap.channel ? E('small', {}, [ _('channel %d').format(c.ap.channel) ]) : '' ]) ] : [],
				/* on the interface of one of the network's VLANs (#164) */
				c.vlanIf ? [ kv(_('Interface'), c.vlanIf) ] : [], [
				kv(_('Connected for'), c.gone ? fmt.DASH : fmt.duration(c.connected)),
				kv(_('Last activity', 'vantage'), c.inactive == null || c.gone ? fmt.DASH : fmt.ago(c.inactive)),
				kv(_('Seen since'), c.firstSeen ? (c.isNew ? _('%s (new this session)').format(new Date(c.firstSeen).toLocaleTimeString()) : _('before this page opened')) : fmt.DASH)
			])) ]),
			c.ap ? '' : this.section(_('Traffic'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('Downloaded', 'vantage'), fmt.bytes(c.txBytes)),
				kv(_('Uploaded', 'vantage'), fmt.bytes(c.rxBytes)),
				kv(_('Frames to device'), c.txPackets ? _('%s sent · %s retried · %s failed').format(fmt.count(c.txPackets), fmt.pct(c.txRetries / Math.max(1, c.txPackets) * 100, 1), fmt.pct(c.txFailed / Math.max(1, c.txPackets + c.txFailed) * 100, 1)) : fmt.DASH)
			]) ]),
			this.section(_('Identity'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('MAC address'), this.copyLine(c.macLabel), true),
				kv(_('Address type'), c.isPrivate ? _('Private Wi-Fi address (randomised by the device)') : (c.vendor ? _('Globally unique · %s').format(c.vendor) : _('Globally unique'))),
				kv(_('IP addresses'), c.ips && c.ips.length ? c.ips.map(this.addrLine, this) : E('span', { 'class': 'vt-muted' }, [ _('not known to this AP') ]), true),
				madeName(c) ? '' : kv(_('Name from'), this.sourceText(c)),
				c.wps && c.nameSource !== 'wps' ? kv(_('WPS device name'), c.wps) : ''
			]) ])
		]);
		return { title: title, body: body };
	},

	drawerWired: function(c) {
		var self = this, r = this.listRate(c), shared = c.shared ? this.st.devRates[c.port] : null;
		var theirs = c.shared && r && c.behind && c.behind.rate ? c.behind : null, ours = c.shared && !!r && !theirs;
		var counting = this.st.traffic;
		var title = this.drawerWho(c);
		var rename = this.canWrite ? E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost', 'click': function() { self.startRename(c); } }, [ icon('pencil'), E('span', {}, [ c.alias ? _('Rename', 'vantage') : _('Name this device') ]) ]) : '';
		var speed = c.speed ? model.speedLabel(c.speed) : fmt.DASH;
		var body = [
			/* a paired access point's host: no LuCI page of this device is
			   about it, and none of the access point's is linked (its
			   address is text only) */
			E('div', { 'class': 'vt-dactions' }, [ rename, c.ap ? '' : pageLink(insight.PAGES.network, _('Interfaces')) ]),
			this.el.renameSlot = E('div', { 'class': 'vt-rename-slot' }),
			c.ap ? this.section(_('Connection'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('Access point'), [ c.ap.name, c.ap.addr ? E('small', {}, [ c.ap.addr ]) : '', alsoLine(c.ap) ]),
				kv(_('Port'), c.ap.port, true),
				kv(_('Link', 'vantage'), c.ap.speed ? model.speedLabel(c.ap.speed) : fmt.DASH),
				kv(_('Traffic'), r ? '↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx) : E('span', { 'class': 'vt-muted' }, [ _('not reported') ]))
			]) ]) : this.section(_('Connection'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('Port'), c.port, true),
				kv(_('Link', 'vantage'), c.carrier === false ? _('down') : c.shared ? [ _('Shared by %d devices').format(c.peers),
					E('small', {}, [ c.switch ? _('behind %s, VLAN %d').format(c.switch.name, c.switch.vlan) : _('the port: %s').format(speed) ]) ]
					: c.switchPort ? [ speed, E('small', {}, [ _('switch port %s').format(c.switchPort) ]) ] : speed),
				c.switch ? kv(_('Switch ports'), switchLines(c.switch).map(function(l) { return E('div', {}, [ l ]); })) : '',
				kv(_('Traffic'), theirs ? [
					'↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx),
					E('small', {}, [ _('Counted by %s on its port %s').format(theirs.name, theirs.port) ]),
					shared ? E('small', {}, [ _('the port in total: %s').format('↓ ' + fmt.bits(shared.tx) + ' · ↑ ' + fmt.bits(shared.rx)) ]) : ''
				] : ours ? [
					'↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx),
					E('small', {}, [ this.trafficEvery() ]),
					E('small', {}, [ _('Not counted: traffic with devices on the same network') ])
				].concat(this.trafficNotes().map(function(n) { return E('small', {}, [ n ]); }), [
					shared ? E('small', {}, [ _('the port in total: %s').format('↓ ' + fmt.bits(shared.tx) + ' · ↑ ' + fmt.bits(shared.rx)) ]) : ''
				]) : c.shared ? [
					E('span', { 'class': 'vt-muted' }, [ _('Not counted per device on a shared port') ])
				].concat(counting && counting.acct === false ? [ E('small', {}, [ _('Connection accounting is off on this router: per-device traffic counts nothing') ]) ] : [], [
					shared ? E('small', {}, [ _('the port in total: %s').format('↓ ' + fmt.bits(shared.tx) + ' · ↑ ' + fmt.bits(shared.rx)) ]) : ''
				]) : r ?'↓ ' + fmt.bits(r.tx) + ' · ↑ ' + fmt.bits(r.rx) : _('measuring')),
				kv(_('Network'), [ c.network || c.bridge || fmt.DASH, c.vlan != null ? E('small', {}, [ _('VLAN %d').format(c.vlan) ]) : '' ]),
				kv(_('Last heard'), c.seen == null ? _('static entry') : fmt.ago(c.seen * 1000))
			].concat(c.behind ? [ kv(_('Access point'), [ c.behind.name, E('small', {}, [ _('its port %s').format(c.behind.port) ]), alsoLine(c.behind) ]) ] : [])) ]),
			this.section(_('Identity'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('MAC address'), this.copyLine(c.macLabel), true),
				c.own ? kv(_('Access point'), [ c.own.name, E('small', {}, [ this.ownText(c.own) ]) ]) : '',
				kv(_('Address type'), c.isPrivate ? _('Private address (randomised by the device)') : (c.vendor ? _('Globally unique · %s').format(c.vendor) : _('Globally unique'))),
				kv(_('IP addresses'), c.ips && c.ips.length ? c.ips.map(this.addrLine, this) : E('span', { 'class': 'vt-muted' }, [ _('not known to this device') ]), true),
				madeName(c) ? '' : kv(_('Name from'), this.sourceText(c))
			]) ])
		];
		return { title: title, body: body };
	},

	/* a named device that is not connected: what is known of it, and its
	   name to change or remove as for one that is */
	drawerOffline: function(c) {
		var self = this;
		var rename = this.canWrite ? E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost', 'click': function() { self.startRename(c); } }, [ icon('pencil'), E('span', {}, [ _('Rename', 'vantage') ]) ]) : '';
		/* the vendor table comes only when a name needs it: here for these details */
		if (!c.isPrivate) this.loadOui();
		return { title: this.drawerWho(c), body: [
			E('div', { 'class': 'vt-banner vt-banner-muted' }, [ icon('info'), E('span', {}, [ _('Not connected right now. A wired device that stays quiet is forgotten after about five minutes.') ]) ]),
			E('div', { 'class': 'vt-dactions' }, [ rename ]),
			this.el.renameSlot = E('div', { 'class': 'vt-rename-slot' }),
			this.section(_('Identity'), [ E('dl', { 'class': 'vt-kvs' }, [
				kv(_('MAC address'), c.macLabel, true),
				kv(_('Address type'), c.isPrivate ? _('Private address (randomised by the device)') : (c.vendor ? _('Globally unique · %s').format(c.vendor) : _('Globally unique'))),
				c.ips.length ? kv(_('Last address'), c.ips.join('\n'), true) : '',
				c.lastSeen != null ? kv(_('Last seen'), [ fmt.ago(Date.now() - c.lastSeen), E('small', {}, [ new Date(c.lastSeen).toLocaleTimeString() ]) ]) : '',
				kv(_('Name from'), this.sourceText(c))
			]) ])
		] };
	},

	sourceText: function(c) {
		switch (c.nameSource) {
		case 'alias': return _('Your name for this device');
		case 'dns': return _('Reverse DNS of its address');
		case 'mdns': return _('mDNS announcement');
		case 'dhcp': return _('DHCP hostname');
		case 'wps': return _('The name the device announces (WPS)');
		}
		return _('Nothing better known');
	},

	ring: function(score) {
		var s = svgRoot('vt-ring-svg', '0 0 36 36');
		var c = 2 * Math.PI * 15.5, f = Math.max(0, Math.min(100, score)) / 100 * c;
		var track = document.createElementNS(SVGNS, 'circle');
		track.setAttribute('cx', '18'); track.setAttribute('cy', '18'); track.setAttribute('r', '15.5');
		track.setAttribute('class', 'vt-ring-track');
		var arc = document.createElementNS(SVGNS, 'circle');
		arc.setAttribute('cx', '18'); arc.setAttribute('cy', '18'); arc.setAttribute('r', '15.5');
		arc.setAttribute('class', 'vt-ring-arc');
		arc.setAttribute('stroke-dasharray', f.toFixed(2) + ' ' + c.toFixed(2));
		s.appendChild(track);
		s.appendChild(arc);
		return s;
	},

	/* inline alias editor; Enter saves, Escape cancels, empty clears */
	startRename: function(c) {
		var self = this, slot = this.el.renameSlot, chosen = { icon: (this.aliases[c.mac] && this.aliases[c.mac].icon) || null };
		this.ui.editing = c.mac;
		var err = E('p', { 'class': 'vt-form-err', 'role': 'alert', 'hidden': 'hidden' });
		var input = E('input', { 'type': 'text', 'class': 'vt-rename-input', 'maxlength': String(names.NAME_MAX * 2), 'autocomplete': 'off',
			'placeholder': _('e.g. Living room TV', 'vantage'), 'aria-label': _('Device name') });
		input.value = c.alias || '';
		var iconBtns = names.ICONS.map(function(ic) {
			return E('button', { 'type': 'button', 'class': 'vt-icon-pick', 'title': ic, 'aria-label': ic, 'aria-pressed': String(chosen.icon === ic),
				'click': function(ev) {
					chosen.icon = chosen.icon === ic ? null : ic;
					iconBtns.forEach(function(b) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-label') === chosen.icon)); });
				} }, [ icon(ic) ]);
		});
		function save() {
			var v = names.validateAlias(input.value);
			if (!v.ok) { txt(err, v.error); err.hidden = false; input.focus(); return; }
			saveBtn.disabled = true;
			self.saveAlias(c.mac, v.value, chosen.icon).then(function(ok) {
				saveBtn.disabled = false;
				if (typeof ok === 'string') { txt(err, ok); err.hidden = false; return; }
				if (!ok) { txt(err, _('Could not save the name (no permission or the device refused it).')); err.hidden = false; return; }
				self.ui.editing = null;
				self.rerender();
			});
		}
		function cancel() { self.ui.editing = null; dom.content(slot, []); self.paintDrawer(); }
		input.addEventListener('keydown', function(ev) {
			if (ev.key === 'Enter') { ev.preventDefault(); save(); }
			else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancel(); }
		});
		var saveBtn = E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-primary', 'click': save }, [ _('Save') ]);
		dom.content(slot, [ E('div', { 'class': 'vt-rename' }, [
			E('label', { 'class': 'vt-rename-label' }, [ _('Name'), input ]),
			E('div', { 'class': 'vt-icon-picks', 'role': 'group', 'aria-label': _('Device type') }, iconBtns),
			err,
			E('div', { 'class': 'vt-rename-actions' }, [
				saveBtn,
				E('button', { 'type': 'button', 'class': 'vt-btn', 'click': cancel }, [ _('Cancel') ]),
				c.alias ? E('button', { 'type': 'button', 'class': 'vt-btn vt-btn-ghost', 'click': function() { input.value = ''; save(); } }, [ _('Remove name') ]) : '',
				E('span', { 'class': 'vt-hint' }, [ _('Stored on this device in /etc/config/vantage') ])
			])
		]) ]);
		input.focus();
	},

	/* Checked here for a quick answer, then sent to luci.vantage
	   set_alias, which checks again, keeps one section per MAC and commits
	   /etc/config/vantage at once, outside LuCI's Save & Apply (so LuCI's
	   apply/rollback lock does not block it; libuci's change store is
	   shared, so changes to that config still pending in LuCI go in with
	   it). The names are reloaded after
	   every attempt, failed or not, so the next one starts from what the
	   device holds.
	   -> Promise<true | false | string (error text)> */
	saveAlias: function(mac, name, iconName) {
		var self = this, key = names.normMac(mac);
		var op = names.aliasOp(key ? this.aliases[key] || null : null, mac, name, iconName);
		if (!op.ok) return Promise.resolve(op.error);
		var value = op.op === 'add' || op.op === 'set' ? op.values.name : '';
		var icon = value ? (names.validIcon(iconName) || '') : '';
		return Promise.resolve(callSetAlias(key, value, icon)).then(function(r) {
			return (r && typeof r === 'object' && r.ok === true) ? true : self.aliasError(r);
		}, function() { return false; }).then(function(res) {
			return self.loadAliases().then(function() { return res; }, function() { return res; });
		});
	},

	/* #110: whether a station's weak signal stays out of the warnings; a
	   checkbox for a login that may name stations, else a line when set */
	quietRow: function(c, on) {
		var self = this, key = names.normMac(c.mac), busy = this.quietBusy || {}, said = this.quietSaid || {};
		if (!this.canWrite) return on ? E('p', { 'class': 'vt-quiet vt-muted' }, [ _('Its weak signal is left out of the warnings.') ]) : '';
		var box = E('input', { 'type': 'checkbox' });
		/* the drawer is rebuilt on every poll: what is under way and what
		   the last attempt said come from the view, not this row */
		box.checked = on;
		box.disabled = !!busy[key];
		box.addEventListener('change', function() { box.disabled = true; self.saveQuiet(c.mac, box.checked); });
		return E('label', { 'class': 'vt-quiet' }, [ box, E('span', {}, [ _('Don\'t warn about its signal') ]),
			E('span', { 'class': 'vt-quiet-err', 'role': 'status' }, [ said[key] || '' ]) ]);
	},

	/* a weak signal the warnings count: not a station set quiet (#110) */
	isWeak: function(c) {
		/* a paired access point's station: this device cannot help it */
		return !c.ap && c.signal != null && c.signal < insight.WEAK_DBM && !(this.quiet && this.quiet[c.mac]);
	},

	/* sent to luci.vantage set_quiet, which keeps one quiet section per
	   MAC in /etc/config/vantage and commits it at once (as set_alias);
	   reloaded after every attempt, and the health checks with it.
	   -> Promise<true | false | string (error text)> */
	saveQuiet: function(mac, on) {
		var self = this, key = names.normMac(mac);
		this.quietBusy = this.quietBusy || {};
		this.quietSaid = this.quietSaid || {};
		if (!key || this.quietBusy[key]) return Promise.resolve(false);
		this.quietBusy[key] = true;
		delete this.quietSaid[key];
		return Promise.resolve(callSetQuiet(key, on === true)).then(function(r) {
			if (r && typeof r === 'object' && r.ok === true) return true;
			switch (r && typeof r === 'object' ? r.error : null) {
			case 'too-many': return _('This device already keeps %d of these; turn some off first.').format(names.QUIET_MAX);
			case 'failed': return _('The device could not write /etc/config/vantage.');
			}
			return false;
		}, function() { return false; }).then(function(res) {
			delete self.quietBusy[key];
			if (res !== true) self.quietSaid[key] = typeof res === 'string' ? res : _('Could not save this.');
			var done = function() { self.rehealth(); return res; };
			return self.loadAliases().then(done, done);
		});
	},

	/* the health checks again, after a station was set quiet or not */
	rehealth: function() {
		var st = this.st;
		if (!this.m || !st) return;
		st.health = insight.health(this.m, { cpu: this.cpuShown(), uplinkRate: st.uplinkRate, temps: st.temps, quiet: this.quiet });
		st.summary = insight.summary(st.health);
		this.paint();
	},

	/* set_alias refusal -> message; false for anything else (no grant, no
	   plugin, transport error) */
	aliasError: function(r) {
		switch (r && typeof r === 'object' ? r.error : null) {
		case 'invalid-mac': return _('Not a station MAC address');
		case 'invalid-name': return _('Name contains invisible or control characters');
		case 'name-too-long': return _('Name is longer than %d characters').format(names.NAME_MAX);
		case 'invalid-icon': return _('Unknown device type');
		case 'too-many': return _('This device already stores %d names; remove some first.').format(names.ALIAS_MAX);
		case 'failed': return _('The device could not write /etc/config/vantage.');
		}
		return false;
	},

	drawerRadio: function(id) {
		var self = this, r = this.m.radios.filter(function(x) { return x.id === id; })[0];
		if (!r) return { title: [ E('span', { 'class': 'vt-drawer-name' }, [ _('Unknown radio') ]) ], body: [ E('p', { 'class': 'vt-empty-inline' }, [ _('This radio is not reported any more.') ]) ] };
		var rr = this.st.radioRates[r.id], ins = this.st.radioInsights[r.id] || { notes: [] };
		var clients = this.m.clients.filter(function(c) { return c.radio === r.id; });
		return {
			title: [ E('span', { 'class': 'vt-drawer-ico' }, [ icon('radio') ]), E('div', { 'class': 'vt-drawer-titles' }, [
				E('div', { 'class': 'vt-drawer-name' }, [ r.bandLabel + ' · ' + (r.gen || r.id) ]),
				E('div', { 'class': 'vt-drawer-sub vt-mono' }, [ r.id + (r.htmode ? ' · ' + r.htmode : '') ])
			]) ],
			body: [
				E('div', { 'class': 'vt-dactions' }, [ pageLink(insight.PAGES.wireless, _('Radio settings')) ]),
				E('div', { 'class': 'vt-dgrid' }, [
					E('div', { 'class': 'vt-dcard' }, [ E('div', { 'class': 'vt-dcard-label' }, [ _('Channel') ]), E('div', { 'class': 'vt-dcard-value' }, [ r.channel ? String(r.channel) : fmt.DASH ]), E('div', { 'class': 'vt-dcard-sub' }, [ [ r.width ? _('%s MHz').format(r.width) : null, r.freq ? fmt.mhz(r.freq) : null ].filter(Boolean).join(' · ') ]) ]),
					E('div', { 'class': 'vt-dcard' }, [ E('div', { 'class': 'vt-dcard-label' }, [ _('Traffic') ]), E('div', { 'class': 'vt-dcard-value' }, [ rr ? fmt.bits(rr.tx + rr.rx) : fmt.DASH ]), E('div', { 'class': 'vt-dcard-sub vt-tn' }, [ rr ? '↓ ' + fmt.bits(rr.tx) + ' · ↑ ' + fmt.bits(rr.rx) : '' ]), sparkline(this.st.hist.net[r.id] || [], [ 2, 1 ], 0, 'vt-spark-' + (r.band || 'x'), { min: 1000, scale: bitsLabel, ceil: rateCeil }) ])
				]),
				ins.notes.length ? E('ul', { 'class': 'vt-notes' }, ins.notes.map(function(n) { return E('li', { 'class': 'vt-note vt-note-' + n.level }, [ icon(n.level === 'warn' ? 'warn' : 'info', 'vt-ico-sm'), E('span', {}, [ n.text ]) ]); })) : '',
				this.section(_('Radio', 'vantage'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('Status'), r.disabled ? _('Disabled') : r.up ? _('Up', 'vantage') : _('Down', 'vantage')),
					kv(_('Mode'), [ r.htmode || fmt.DASH, r.hwmodes ? E('small', {}, [ r.hwmodes ]) : '' ]),
					kv(_('Centre frequency'), r.spectrum ? _('%d MHz (%d–%d MHz)').format(r.spectrum.centre, r.spectrum.lo, r.spectrum.hi) : fmt.DASH),
					kv(_('Tx power'), r.txpower != null ? _('%s dBm').format(r.txpower) + (r.txpowerCfg != null && r.txpowerCfg !== r.txpower ? ' ' + _('(configured %d dBm, limited by regulatory rules)').format(r.txpowerCfg) : '') : fmt.DASH),
					/* a placeholder from the driver says why there is none */
					r.noise != null ? kv(_('Noise floor'), fmt.dbm(r.noise))
						: r.noiseRaw != null ? kv(_('Noise floor'), E('span', { 'class': 'vt-muted' }, [ _('not reported (driver placeholder %s)').format(fmt.dbm(r.noiseRaw)) ])) : '',
					kv(_('Country'), r.country || fmt.DASH)
				]) ]),
				this.section(_('Clients on this radio'), clients.length ? [ E('div', { 'class': 'vt-dlist' }, clients.map(function(c) {
					return E('button', { 'type': 'button', 'class': 'vt-dlist-row', 'click': function() { self.openDrawer('client', c.mac); } }, [
						avatar(c, true), E('span', { 'class': 'vt-dlist-name' }, [ c.name ]),
						E('span', { 'class': 'vt-signal' }, [ signalGlyph(c.level), E('span', { 'class': 'vt-tn' }, [ fmt.dbm(c.signal) ]) ])
					]);
				})) ] : [ E('p', { 'class': 'vt-empty-inline' }, [ _('No clients connected') ]) ])
			]
		};
	},

	/* the main line (id ''), whichever interface it is, or one line by
	   its interface: still that one after a failover makes it the main
	   line, and said to be down when it is no line any more (never
	   another interface under its name) */
	drawerUplink: function(id) {
		var m = this.m, st = this.st, lines = m.uplinks || [];
		var up = id ? lines.filter(function(x) { return x.iface === id; })[0] : m.uplink;
		var r = up && up === m.uplink ? st.uplinkRate : model.lineRate(up, st.devRates);
		var hist = up ? st.hist.net[lineKey(up)] : null, several = lines.length > 1;
		var tunR = up && up.tunnel ? st.devRates[up.tunnel.dev] || null : null;
		function errors(n) { return fmt.N_(n, '%s error', '%s errors').format(fmt.count(n)); }
		if (id && !up) return {
			title: [ E('span', { 'class': 'vt-drawer-ico' }, [ icon('globe') ]), E('div', { 'class': 'vt-drawer-titles' }, [
				E('div', { 'class': 'vt-drawer-name' }, [ _('Uplink · %s').format(id) ])
			]) ],
			body: [
				E('div', { 'class': 'vt-dactions' }, [ pageLink(insight.PAGES.network, _('Interfaces')) ]),
				E('p', { 'class': 'vt-empty-inline' }, [ _('This line is down or has no default route now.') ])
			]
		};
		if (!up) return { title: [ E('span', { 'class': 'vt-drawer-name' }, [ _('Uplink', 'vantage') ]) ], body: [ E('p', { 'class': 'vt-empty-inline' }, [ _('No interface with a route is up.') ]) ] };
		var s = up.stats || {};
		/* a router behind another NAT (model.lineNat): said here, plain,
		   and in no health check: it is how the line is, not a fault */
		var nat = model.lineNat(up);
		var natText = nat === 'private' ? _('This line has a private address (%s): another router, or the provider, translates addresses in front of this one (double NAT). Port forwards can be reached from the internet only where that one passes them on.').format(lineAddr(up))
			: nat === 'shared' ? _('This line has a shared address (%s): the provider translates addresses for many customers (carrier-grade NAT). Port forwards cannot be reached from the internet over IPv4.').format(lineAddr(up)) : null;
		return {
			title: [ E('span', { 'class': 'vt-drawer-ico' }, [ icon('globe') ]), E('div', { 'class': 'vt-drawer-titles' }, [
				E('div', { 'class': 'vt-drawer-name' }, [ _('Uplink · %s').format(up.iface) ]),
				E('div', { 'class': 'vt-drawer-sub vt-mono' }, [ up.l3dev + (up.dev !== up.l3dev ? ' → ' + up.dev : '') ])
			]) ],
			body: [
				E('div', { 'class': 'vt-dactions' }, [ pageLink(insight.PAGES.network, _('Interfaces')), pageLink(insight.PAGES.realtime, _('Realtime graphs')) ]),
				E('div', { 'class': 'vt-dgrid' }, [
					E('div', { 'class': 'vt-dcard' }, [ E('div', { 'class': 'vt-dcard-label' }, [ _('From network') ]), E('div', { 'class': 'vt-dcard-value' }, [ r ? fmt.bits(r.rx) : fmt.DASH ]), E('div', { 'class': 'vt-dcard-sub' }, [ _('received on %s').format(up.dev) ]) ]),
					E('div', { 'class': 'vt-dcard' }, [ E('div', { 'class': 'vt-dcard-label' }, [ _('To network') ]), E('div', { 'class': 'vt-dcard-value' }, [ r ? fmt.bits(r.tx) : fmt.DASH ]), E('div', { 'class': 'vt-dcard-sub' }, [ _('sent on %s').format(up.dev) ]) ])
				]),
				E('div', { 'class': 'vt-dspark' }, [ sparkline(hist || [], [ 1, 2 ], 0, 'vt-spark-up', { min: 1000, scale: bitsLabel, ceil: rateCeil }) ]),
				natText ? E('ul', { 'class': 'vt-notes' }, [ E('li', { 'class': 'vt-note vt-note-info' }, [ icon('info', 'vt-ico-sm'), E('span', {}, [ natText ]) ]) ]) : '',
				this.section(_('Link', 'vantage'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('Carrier'), up.carrier === false ? _('No link') : _('Up', 'vantage')),
					kv(_('Speed', 'vantage'), model.speedLabel(up.speed)),
					kv(_('Protocol'), up.proto || fmt.DASH),
					kv(_('Interface up for'), up.uptime != null ? fmt.duration(up.uptime) : fmt.DASH),
					/* a full-tunnel VPN over this line: ordinary traffic goes through it */
					up.tunnel ? kv(_('Tunnel'), up.tunnel.iface + (up.tunnel.proto ? ' · ' + up.tunnel.proto : '')) : '',
					up.tunnel ? kv(_('In the tunnel'), tunR ? '↓ ' + fmt.bits(tunR.rx) + ' · ↑ ' + fmt.bits(tunR.tx) : fmt.DASH) : ''
				]) ]),
				this.section(_('Addresses'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('IPv4'), up.ipv4.length ? up.ipv4.map(this.addrLine, this) : fmt.DASH, true),
					kv(_('IPv6'), up.ipv6.length ? up.ipv6.map(this.addrLine, this) : fmt.DASH, true),
					/* the prefix the provider delegated, where there is one */
					up.prefix6 && up.prefix6.length ? kv(_('IPv6 prefix'), up.prefix6.join('\n'), true) : '',
					kv(_('Gateway'), up.gateway ? this.addrLine(up.gateway) : fmt.DASH, true),
					/* beside other lines, the metric says which one the kernel takes */
					several ? kv(_('Route metric'), up.metric != null ? String(up.metric) : fmt.DASH, true) : '',
					kv(_('DNS'), up.dns.length ? up.dns.map(this.addrLine, this) : fmt.DASH, true)
				]) ]),
				this.section(_('Counters since boot'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('Received', 'vantage'), fmt.bytes(s.rx_bytes) + ' · ' + errors(+s.rx_errors || 0)),
					kv(_('Sent', 'vantage'), fmt.bytes(s.tx_bytes) + ' · ' + errors(+s.tx_errors || 0)),
					kv(_('Dropped', 'vantage'), _('%s in · %s out').format(fmt.count(+s.rx_dropped || 0), fmt.count(+s.tx_dropped || 0)))
				]) ])
			]
		};
	},

	drawerDevice: function() {
		var d = this.m.device, cpu = this.cpuShown(), temps = this.st.temps || [];
		return {
			title: [ E('span', { 'class': 'vt-drawer-ico' }, [ icon('ap') ]), E('div', { 'class': 'vt-drawer-titles' }, [
				E('div', { 'class': 'vt-drawer-name' }, [ d.model ]),
				E('div', { 'class': 'vt-drawer-sub' }, [ d.hostname || '' ])
			]) ],
			body: [
				E('div', { 'class': 'vt-dactions' }, [ pageLink([ 'admin', 'system', 'system' ], _('System settings')), pageLink(insight.PAGES.processes, _('Processes')) ]),
				this.section(_('Device'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('Model'), d.model),
					kv(_('Platform', 'vantage'), [ d.target || fmt.DASH, d.system ? E('small', {}, [ d.system ]) : '' ]),
					kv(_('Firmware', 'vantage'), d.firmware || fmt.DASH),
					this.builtRow(d.built),
					kv(_('Kernel'), d.kernel || fmt.DASH),
					kv(_('Uptime'), d.uptime != null ? fmt.duration(d.uptime) : fmt.DASH),
					kv(_('Local time'), d.localtime != null ? new Date(d.localtime * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') : fmt.DASH, true)
				]) ]),
				this.section(_('Load'), [ E('dl', { 'class': 'vt-kvs' }, [
					kv(_('CPU', 'vantage'), cpu ? fmt.N_(cpu.cores.length || 1, '%s over %d core', '%s over %d cores').format(fmt.pct(cpu.pct), cpu.cores.length || 1) : fmt.DASH),
					kv(_('Load average', 'vantage'), d.load.map(fmt.load).join(' · ')),
					kv(_('Memory in use'), d.memory ? _('%s of %s').format(fmt.bytes(d.memory.used), fmt.bytes(d.memory.total)) : fmt.DASH)
				]) ]),
				/* every sensor, the hottest first: the System tile names
				   that one and keeps the others in a tooltip */
				temps.length ? this.section(_('Temperature'), [ E('dl', { 'class': 'vt-kvs' }, temps.map(function(t) {
					return kv(t.name || _('Sensor'), fmt.celsius(t.celsius));
				})) ], 'vt-dsec-temps') : ''
			]
		};
	},

	/* ------------------------------------------------------------ search */

	/* What the theme's palette may list for a query (see SEARCH_EVENT):
	   the clients (stations and wired hosts, a paired access point's with
	   its name), the radios, the Wi-Fi networks by name and the
	   interfaces. Each does what a click on it does on this page: a
	   client's or a radio's details, the Clients list on a network, the
	   Interfaces page. A kind's entries are those the query may find, in
	   name order, cut to SEARCH_MAX: a network of hundreds of clients hands
	   over eight. */
	searchEntries: function(query) {
		var self = this, m = this.m, out = [];
		var q = String(query == null ? '' : query).slice(0, 128).toLowerCase().split(/\s+/).filter(Boolean);
		if (!m) return out;
		function give(kind, list) {
			list.forEach(function(e) { e.hit = searchHit(q, e.title, e.detail + ' ' + e.words); e.key = e.title.toLowerCase(); });
			list.filter(function(e) { return e.hit; }).sort(function(a, b) {
				return (b.hit - a.hit) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
			}).slice(0, SEARCH_MAX).forEach(function(e) {
				out.push({ kind: kind, title: e.title, detail: e.detail, words: e.words, run: e.run });
			});
		}
		function cut(parts, sep, max) { return fmt.safeText(parts.filter(Boolean).join(sep), max); }

		give('client', m.clients.concat(m.wiredHosts || [], m.offline || []).map(function(c) {
			return {
				title: cut([ c.name ], '', 64),
				detail: cut([ c.secondary, c.offline ? _('Offline') : typeof c.port === 'string' ? c.network || c.bridge : c.ssid, c.ap ? _('via %s').format(c.ap.name) : null ], ' · ', 64),
				words: cut([ c.mac ].concat(c.ips || []), ' ', 256),
				run: function() { self.openDrawer('client', c.mac); }
			};
		}));

		give('radio', m.radios.map(function(r) {
			return {
				title: cut([ r.bandLabel, r.gen || r.id ], ' · ', 64),
				detail: r.channel ? _('Ch %d · %d MHz').format(r.channel, r.width || 20) : '',
				words: cut([ r.id, r.htmode, r.channel ? _('Channel') + ' ' + r.channel : null ], ' ', 256),
				run: function() { self.openDrawer('radio', r.id); }
			};
		}));

		/* a network by its name, once: this device's and the paired access
		   points', as the Clients list filters by the name. Not where the
		   layout hides that list, and not one without a name */
		var nets = [], named = Object.create(null);
		function net(ssid, band, clients) {
			if (!ssid) return;
			var n = named[ssid];
			if (!n) nets.push(n = named[ssid] = { ssid: ssid, bands: [], clients: 0 });
			if (band && n.bands.indexOf(band) < 0) n.bands.push(band);
			n.clients += clients;
		}
		if (this.el.clients.getClientRects().length) {
			m.ssids.forEach(function(s) { net(s.ssid, s.band, s.clients); });
			this.aps().forEach(function(a) { a.nodes.forEach(function(n) { net(n.ssid, n.band, n.clients); }); });
		}
		give('ssid', nets.map(function(n) {
			return {
				title: cut([ n.ssid ], '', 64),
				detail: cut(n.bands.sort().map(wifi.bandLabel).concat(n.clients === 1 ? _('1 client') : _('%d clients').format(n.clients)), ' · ', 64),
				words: '',
				/* open details would cover the list */
				run: function() { self.closeDrawer(); self.filterSsid(n.ssid); }
			};
		}));

		/* the lines to the internet and the other networks, where LuCI
		   has the page the dashboard's own links to them go to */
		var page = insight.PAGES.network;
		function go() { window.location.href = L.url.apply(L, page); }
		give('interface', !hasPage(page) ? [] : (m.uplinks || []).map(function(x) {
			return {
				title: cut([ x.iface ], '', 64),
				detail: cut([ lineAddr(x), x.proto ], ' · ', 64),
				words: cut((x.ifaces || []).concat(x.l3dev, x.dev), ' ', 256),
				run: go
			};
		}).concat((m.networks || []).map(function(n) {
			return {
				title: cut([ n.name ], '', 64),
				detail: cut([ n.ipv4 ? String(n.ipv4).split('/')[0] : null, n.proto ], ' · ', 64),
				words: cut([ n.dev ], '', 256),
				run: go
			};
		})));
		return out;
	},

	/* The firmware's build date (model.buildDate: seconds, or null where
	   system board gives no date) as a row: the day, in UTC as the build
	   stamped it, and how long ago that is; no age for a date ahead of
	   this browser's clock. Nothing without a date. */
	builtRow: function(built) {
		if (built == null) return '';
		var days = Math.floor((Date.now() - built * 1000) / 864e5);
		return kv(_('Firmware built'), [ new Date(built * 1000).toISOString().slice(0, 10), days >= 0 ? E('small', {}, [ fmt.daysAgo(days) ]) : '' ]);
	},

	/* ---------------------------------------------------------- keyboard */

	handleKey: function(ev) {
		var t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
		/* Escape in an open chart style list (a select whose list the page
		   draws, focus on an option) closes the list, not Customize */
		if (ev.key === 'Escape' && t && t.tagName === 'OPTION') return;
		if (ev.key === 'Escape' && this.ui.drawer && !document.body.classList.contains('modal-overlay-active')) {
			this.closeDrawer();
			return;
		}
		if (ev.key === 'Escape' && this.editing && !this.drag) {
			this.setEditing(false, this.viewFailed);
			return;
		}
		/* 'f' focuses the client filter; '/' and Ctrl+K belong to the theme */
		if ((ev.key === 'f' || ev.key === 'F') && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !this.ui.drawer) {
			ev.preventDefault();
			this.el.filter.focus();
			this.el.filter.select();
		}
		if (ev.key === 'Escape' && t === this.el.filter && this.ui.filter) this.setFilter('');
	}
});
