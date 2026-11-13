'use strict';
'require baseclass';
'require vantage.fmt as fmt';
'require vantage.wifi as wifi';

/* Explainable judgements over the model: health checks, per-client
   experience, top talkers, session presence and radio insights. Every
   verdict carries a one-line reason and, where something can be done
   about it, the LuCI page that does it. Pure functions. */

var PAGES = {
	network: [ 'admin', 'network', 'network' ],
	wireless: [ 'admin', 'network', 'wireless' ],
	processes: [ 'admin', 'status', 'processes' ],
	mounts: [ 'admin', 'system', 'mounts' ],
	realtime: [ 'admin', 'status', 'realtime' ]
};

var WEAK_DBM = -75;

function num(v) { v = +v; return isFinite(v) ? v : 0; }
function finite(v) { return typeof v === 'number' && isFinite(v); }
function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
function speedLong(mbps) { return mbps >= 1000 ? _('%s Gbit/s').format(mbps / 1000) : _('%s Mbit/s').format(mbps); }
function rank(level) { return { err: 3, warn: 2, info: 1, ok: 0 }[level] || 0; }

return baseclass.extend({
	PAGES: PAGES,
	WEAK_DBM: WEAK_DBM,

	/* ------------------------------------------------------------ health */

	/* model + { cpu: { pct, cores } | null, uplinkRate: { rx, tx } | null,
	   temps: model.temps() | null }
	   (model.wired: no Wi-Fi checks)
	   -> [ { id, level, title, value, reason, detail, page } ]
	   value and reason are short enough for a health chip; detail is the
	   full sentence (tooltip / accessible description). */
	health: function(model, live) {
		model = model || {};
		live = live || {};
		var out = [], dev = model.device || {}, up = model.uplink;

		/* uplink: live traffic is the value, the negotiated link the context */
		if (!up) out.push({ id: 'uplink', level: 'err', title: _('Uplink', 'vantage'), value: _('Down', 'vantage'), reason: _('No interface with a route'),
			detail: _('No network interface with a route is up'), page: PAGES.network });
		else if (up.carrier === false) out.push({ id: 'uplink', level: 'err', title: _('Uplink', 'vantage'), value: _('No link'), reason: _('%s: no carrier').format(up.dev),
			detail: _('%s has no carrier: cable unplugged or switch port down').format(up.dev), page: PAGES.network });
		else if (up.speed && up.speed.duplex === 'half') out.push({ id: 'uplink', level: 'warn', title: _('Uplink', 'vantage'), value: _('Half duplex'), reason: _('%s · check cable').format(up.dev),
			detail: _('%s negotiated half duplex; check the cable and switch port').format(up.dev), page: PAGES.network });
		else if (up.speed && up.speed.mbps < 1000) out.push({ id: 'uplink', level: 'warn', title: _('Uplink', 'vantage'), value: _('%s Mbit/s').format(up.speed.mbps), reason: _('%s · slow link').format(up.dev),
			detail: _('%s negotiated only %d Mbit/s; a cable pair or port may be faulty').format(up.dev, up.speed.mbps), page: PAGES.network });
		else {
			var rate = live.uplinkRate && finite(live.uplinkRate.rx) && finite(live.uplinkRate.tx) ? live.uplinkRate : null;
			/* no-break spaces keep '↑ 2.9 Mbit/s' and '2.5 Gbit/s link' whole when the chip wraps */
			var link = up.speed ? _('%s link').format(speedLong(up.speed.mbps)).replace(/ /g, '\u00a0') : null;
			out.push({ id: 'uplink', level: 'ok', title: _('Uplink', 'vantage'), value: rate ? '↓ ' + fmt.bits(rate.rx) : _('Up', 'vantage'),
				/* the device name only until there is a rate (the path names it) */
				reason: [ rate ? ('↑ ' + fmt.bits(rate.tx)).replace(/ /g, '\u00a0') : up.dev, link ].filter(Boolean).join(' · '),
				detail: (up.speed ? _('%s up at %s').format(up.dev, speedLong(up.speed.mbps)) : _('%s up').format(up.dev)) +
					(up.gateway ? ', ' + _('gateway %s').format(up.gateway) : '') +
					(rate ? '; ' + _('now %s down, %s up').format(fmt.bits(rate.rx), fmt.bits(rate.tx)) : ''),
				page: PAGES.network });
		}

		/* CPU */
		var cpu = live.cpu && finite(live.cpu.pct) ? live.cpu.pct : null, cores = (live.cpu && live.cpu.cores && live.cpu.cores.length) || 1;
		var load = (dev.load || [])[0];
		/* the hottest sensor, when the device has any */
		var hot = live.temps && live.temps[0] ? fmt.celsius(live.temps[0].celsius) : null;
		if (cpu == null) out.push({ id: 'cpu', level: 'info', title: _('CPU', 'vantage'), value: fmt.DASH, reason: _('Measuring…'), detail: _('Measuring over the next poll'), page: PAGES.processes });
		else out.push({ id: 'cpu', level: cpu >= 90 ? 'err' : cpu >= 70 ? 'warn' : 'ok', title: _('CPU', 'vantage'), value: fmt.pct(cpu),
			reason: (cpu >= 70 ? _('Busy · load %s').format(fmt.load(load)) : fmt.N_(cores, 'Load %s · %d core', 'Load %s · %d cores').format(fmt.load(load), cores)) + (hot ? ' · ' + hot : ''),
			detail: (cpu >= 70 ? fmt.N_(cores, 'Busy; load %s on %d core; see the busiest processes', 'Busy; load %s on %d cores; see the busiest processes').format(fmt.load(load), cores)
				: fmt.N_(cores, 'Load %s on %d core', 'Load %s on %d cores').format(fmt.load(load), cores)) +
				(hot ? ' · ' + _('Temperature %s').format(hot) : ''),
			page: PAGES.processes });

		/* memory, framed as available (as in the System tile) */
		var mem = dev.memory;
		if (mem) {
			var avail = finite(mem.availPct) ? mem.availPct : 100 - num(mem.usedPct);
			out.push({ id: 'memory', level: mem.usedPct >= 90 ? 'err' : mem.usedPct >= 80 ? 'warn' : 'ok', title: _('Memory'), value: _('%s available', 'vantage').format(fmt.pct(avail)),
				reason: _('%s of %s').format(fmt.bytes(mem.available), fmt.bytes(mem.total)),
				detail: _('%s of %s available (%s in use)').format(fmt.bytes(mem.available), fmt.bytes(mem.total), fmt.pct(mem.usedPct)), page: PAGES.processes });
		}

		/* radios and signal; neither applies to a wired-only device */
		if (!model.wired) this.wifiHealth(model, out, live.quiet);

		/* storage */
		var root = (dev.storage || [])[0];
		if (root) out.push({ id: 'storage', level: root.usedPct >= 95 ? 'err' : root.usedPct >= 85 ? 'warn' : 'ok', title: _('Storage'), value: _('%s used').format(fmt.pct(root.usedPct)),
			reason: _('%s free').format(fmt.bytes(root.free)), detail: _('%s free on the overlay (%s used)').format(fmt.bytes(root.free), fmt.pct(root.usedPct)), page: PAGES.mounts });

		return out;
	},

	/* the Wi-Fi and Signal checks, appended to out; an SSID without
	   clients is idle, not a fault */
	wifiHealth: function(model, out, quietMacs) {
		var radios = model.radios || [], nSsid = (model.ssids || []).length;
		var off = radios.filter(function(r) { return r.disabled; }), down = radios.filter(function(r) { return !r.disabled && !r.up; });
		var idle = (model.ssids || []).filter(function(s) { return s.up && !s.clients; });
		if (!radios.length) out.push({ id: 'radios', level: 'info', title: _('Wi-Fi'), value: _('None'), reason: _('No radios reported'), detail: _('This device reports no radios'), page: PAGES.wireless });
		else if (down.length) out.push({ id: 'radios', level: 'err', title: _('Wi-Fi'), value: fmt.N_(down.length, '%d radio down', '%d radios down').format(down.length), reason: _('%s is not up').format(down[0].bandLabel),
			detail: _('%s (%s) is enabled but not up').format(down[0].id, down[0].bandLabel), page: PAGES.wireless });
		/* a radio switched off in the configuration is a choice, not a
		   fault: shown, never tinted or counted as needing attention */
		else if (off.length) out.push({ id: 'radios', level: 'info', title: _('Wi-Fi'), value: fmt.N_(off.length, '%d radio off', '%d radios off').format(off.length), reason: _('%s is disabled').format(off[0].bandLabel),
			detail: _('%s (%s) is disabled').format(off[0].id, off[0].bandLabel), page: PAGES.wireless });
		else out.push({ id: 'radios', level: 'ok', title: _('Wi-Fi'), value: fmt.N_(radios.length, '%d radio up', '%d radios up').format(radios.length),
			reason: idle.length ? fmt.N_(nSsid, '%d SSID · %d idle', '%d SSIDs · %d idle').format(nSsid, idle.length) : fmt.N_(nSsid, '%d SSID on air', '%d SSIDs on air').format(nSsid),
			detail: idle.length ? fmt.N_(nSsid, '%d SSID broadcasting, %d idle', '%d SSIDs broadcasting, %d idle').format(nSsid, idle.length) : fmt.N_(nSsid, '%d SSID broadcasting', '%d SSIDs broadcasting').format(nSsid),
			page: PAGES.wireless });

		/* signal; a station set quiet (#110: far away on purpose) is left
		   out, of the warning and of the weakest */
		var clients = model.clients || [], quiet = quietMacs || {};
		var counted = clients.filter(function(c) { return !quiet[c.mac]; });
		var weak = counted.filter(function(c) { return c.signal != null && c.signal < WEAK_DBM; }).sort(function(a, b) { return a.signal - b.signal; });
		var heard = counted.filter(function(c) { return c.signal != null; }).sort(function(a, b) { return a.signal - b.signal; });
		if (!clients.length) out.push({ id: 'signal', level: 'info', title: _('Signal'), value: _('No clients'), reason: '', detail: _('No stations are associated right now'), page: PAGES.wireless });
		else if (weak.length) out.push({ id: 'signal', level: 'warn', title: _('Signal'), value: _('%d weak').format(weak.length),
			/* the level stays in one piece when the line wraps */
			reason: _('%s · %s').format(weak[0].name, fmt.dbm(weak[0].signal).replace(/ /g, '\u00a0')),
			detail: _('%s at %s; below %s roaming and throughput suffer').format(weak[0].name, fmt.dbm(weak[0].signal), fmt.dbm(WEAK_DBM)), page: PAGES.wireless,
			/* one weak client opens its details, several the list of them
			   (the weakest's details where the layout hides that list) */
			client: weak[0].mac, list: weak.length > 1 ? 'weak' : null });
		/* all fine: the weakest, which is how close the network is to a problem */
		else if (!counted.length) out.push({ id: 'signal', level: 'ok', title: _('Signal'), value: fmt.DASH,
			reason: _('No warnings asked for'), detail: _('Every client here is set not to warn about its signal'), page: PAGES.wireless });
		else out.push({ id: 'signal', level: 'ok', title: _('Signal'), value: heard.length ? fmt.dbm(heard[0].signal) : fmt.DASH,
			reason: !heard.length ? _('Not reported by the driver') : heard.length === 1 ? _('The only measured client')
				: fmt.N_(heard.length, 'Weakest of %d client', 'Weakest of %d clients').format(heard.length),
			detail: !heard.length ? _('The driver reports no signal levels')
				: heard.length === 1 ? _('The one measured client is above %s').format(fmt.dbm(WEAK_DBM))
				: fmt.N_(heard.length, '%d measured client is above %s', '%d measured clients are above %s').format(heard.length, fmt.dbm(WEAK_DBM)), page: PAGES.wireless });
	},

	/* -> { level, count (warn+err), headline } */
	summary: function(checks) {
		var worst = 'ok', n = 0;
		(checks || []).forEach(function(c) {
			if (rank(c.level) > rank(worst)) worst = c.level;
			if (c.level === 'warn' || c.level === 'err') n++;
		});
		var headline = n === 0 ? _('Everything looks healthy') : n === 1 ? _('1 thing needs attention') : _('%d things need attention').format(n);
		return { level: worst === 'info' ? 'ok' : worst, count: n, headline: headline };
	},

	/* -------------------------------------------------------- experience */

	/* Per-client experience 0..100 from signal, link rate, delivery
	   failures and the generation gap to the radio. The explanation is
	   the factor that cost the most. -> { score, grade, level, reason, short, factors } */
	experience: function(c) {
		c = c || {};
		var factors = [], s = c.signal;
		if (s == null) factors.push({ cost: 0, text: _('Signal not reported'), short: _('Signal not reported') });
		else if (s < -80) factors.push({ cost: 70, text: _('Very weak signal %s; expect drops').format(fmt.dbm(s)), short: _('Very weak signal; expect drops') });
		else if (s < WEAK_DBM) factors.push({ cost: 55, text: _('Weak signal %s; may roam poorly').format(fmt.dbm(s)), short: _('Weak signal') });
		else if (s < -67) factors.push({ cost: 30, text: _('Fair signal %s; lower rates at range').format(fmt.dbm(s)), short: _('Fair signal') });
		else if (s < -60) factors.push({ cost: 10, text: _('Good signal %s').format(fmt.dbm(s)), short: _('Good signal') });

		var best = Math.max(c.rx && c.rx.rate || 0, c.tx && c.tx.rate || 0);
		var active = c.inactive == null || c.inactive < 10000;
		if (best > 0 && best < 20000 && active && s != null && s >= -70)
			factors.push({ cost: 20, text: _('Low link rate %s despite good signal; interference or an old device').format(fmt.phyRate(best)), short: _('Low link rate for its signal') });

		var sent = num(c.txPackets) + num(c.txFailed);
		if (sent >= 200) {
			var fail = num(c.txFailed) / sent * 100;
			if (fail >= 10) factors.push({ cost: 25, text: _('%s of frames to the device fail; interference likely').format(fmt.pct(fail)), short: _('%s of frames fail').format(fmt.pct(fail)) });
			else if (fail >= 4) factors.push({ cost: 10, text: _('%s of frames to the device fail').format(fmt.pct(fail)), short: _('%s of frames fail').format(fmt.pct(fail)) });
		}

		if (c.legacyOnRadio)
			factors.push({ cost: 5, text: _('%s device on a newer radio; uses more airtime per byte').format(c.gen === 'legacy' ? _('Legacy', 'vantage') : c.gen),
				short: _('Older %s device').format(c.gen === 'legacy' ? _('legacy') : c.gen) });

		var cost = factors.reduce(function(a, f) { return a + f.cost; }, 0);
		var score = Math.max(0, Math.min(100, 100 - cost));
		var grade = score >= 85 ? _('Excellent', 'vantage') : score >= 65 ? _('Good', 'vantage') : score >= 40 ? _('Fair', 'vantage') : _('Poor', 'vantage');
		var level = score >= 65 ? 'ok' : score >= 40 ? 'warn' : 'err';
		var worst = factors.slice().sort(function(a, b) { return b.cost - a.cost; })[0];
		var reason = (worst && worst.cost > 0) ? worst.text
			: (s != null ? _('Strong signal %s, %s link').format(fmt.dbm(s), fmt.phyRate(best)) : _('No problems detected'));
		var short = (worst && worst.cost > 0) ? worst.short
			: (s != null ? (best > 0 ? _('Strong signal, %s').format(fmt.phyRate(best)) : _('Strong signal')) : _('No problems detected'));
		return { score: score, grade: grade, level: level, reason: reason, short: short, factors: factors };
	},

	/* ------------------------------------------------------ top talkers */

	/* clients + rates { mac: { rx, tx } } (AP view: tx = to the client)
	   -> top n [ { mac, name, down, up, total, share } ] with total > 0 */
	topTalkers: function(clients, rates, n) {
		var list = [], sum = 0;
		(clients || []).forEach(function(c) {
			var r = own(rates, c.mac) ? rates[c.mac] : null;
			if (!r) return;
			var down = num(r.tx), up = num(r.rx), total = down + up;
			if (!(total > 0)) return;
			sum += total;
			list.push({ mac: c.mac, name: c.name, down: down, up: up, total: total });
		});
		list.sort(function(a, b) { return b.total - a.total || (a.mac < b.mac ? -1 : 1); });
		list.forEach(function(t) { t.share = sum > 0 ? t.total / sum : 0; });
		return list.slice(0, n > 0 ? n : 5);
	},

	/* --------------------------------------------------------- presence */

	/* Session presence. state: { baseline: [macs] | null, present: { mac: client },
	   gone: { mac: { client, at } }, firstSeen: { mac: ms } }.
	   The first call fixes the baseline (what was there when the page
	   opened); later arrivals are "new". Stations that leave are kept as
	   gone for keepMs. -> { state, isNew: { mac: true }, gone: [ { client, at } ] } */
	presence: function(state, clients, now, keepMs) {
		state = state || {};
		var baseline = Array.isArray(state.baseline) ? state.baseline : null;
		var present = Object.create(null), gone = Object.create(null), firstSeen = Object.create(null), isNew = Object.create(null);
		var prevPresent = state.present || {}, prevGone = state.gone || {}, prevFirst = state.firstSeen || {};

		(clients || []).forEach(function(c) {
			present[c.mac] = c;
			firstSeen[c.mac] = own(prevFirst, c.mac) ? prevFirst[c.mac] : now;
			if (baseline && baseline.indexOf(c.mac) < 0) isNew[c.mac] = true;
		});
		Object.keys(prevGone).forEach(function(mac) {
			var g = prevGone[mac];
			if (!own(present, mac) && g && now - g.at < keepMs) { gone[mac] = g; firstSeen[mac] = prevFirst[mac]; }
		});
		Object.keys(prevPresent).forEach(function(mac) {
			if (!own(present, mac)) { gone[mac] = { client: prevPresent[mac], at: now }; firstSeen[mac] = prevFirst[mac]; }
		});

		var goneList = Object.keys(gone).map(function(k) { return gone[k]; }).sort(function(a, b) { return b.at - a.at; });
		return {
			state: { baseline: baseline || Object.keys(present), present: present, gone: gone, firstSeen: firstSeen },
			isNew: isNew,
			gone: goneList
		};
	},

	/* ---------------------------------------------------------- radios */

	/* radios + per-radio rates { id: { rx, tx } } -> { id: { busiest, share, notes: [ { level, text } ] } } */
	radioInsights: function(radios, rates) {
		var out = {}, sum = 0, top = null, topV = 0;
		(radios || []).forEach(function(r) {
			var v = own(rates, r.id) ? num(rates[r.id].rx) + num(rates[r.id].tx) : 0;
			sum += v;
			if (v > topV) { topV = v; top = r.id; }
		});
		(radios || []).forEach(function(r) {
			var v = own(rates, r.id) ? num(rates[r.id].rx) + num(rates[r.id].tx) : 0;
			var notes = [];
			if (r.disabled) notes.push({ level: 'info', text: _('Radio is disabled') });
			else if (!r.up) notes.push({ level: 'err', text: _('Radio is enabled but not up') });
			if (top === r.id && sum > 0 && (radios.length > 1)) notes.push({ level: 'info', text: _('Busiest radio: %s of Wi-Fi traffic').format(fmt.pct(v / sum * 100)) });
			if (r.legacy) notes.push({ level: 'info', text: r.legacy === 1 ? _('1 older device (Wi-Fi 4 or earlier) slows airtime') : _('%d older devices (Wi-Fi 4 or earlier) slow airtime').format(r.legacy) });
			out[r.id] = { busiest: top === r.id && sum > 0, share: sum > 0 ? v / sum : 0, notes: notes };
		});
		return out;
	}
});
