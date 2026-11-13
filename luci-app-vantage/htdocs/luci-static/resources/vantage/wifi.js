'use strict';
'require baseclass';
'require vantage.fmt as fmt';

/* Wi-Fi vocabulary: bands, channel widths, generations, signal levels,
   security labels and channel geometry. Pure functions. */

function num(v) { v = +v; return isFinite(v) ? v : 0; }
function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }

var BANDS = {
	'2g': { label: _('2.4 GHz', 'vantage'), short: '2.4', lo: 2400, hi: 2495, base: 2407 },
	'5g': { label: _('5 GHz', 'vantage'), short: '5', lo: 5150, hi: 5895, base: 5000 },
	'6g': { label: _('6 GHz', 'vantage'), short: '6', lo: 5925, hi: 7125, base: 5950 },
	'60g': { label: _('60 GHz'), short: '60', lo: 57240, hi: 70200, base: 56160 }
};

/* rank for comparisons; 'legacy' is 802.11a/b/g */
var GEN_RANK = { 'legacy': 0, 'Wi-Fi 4': 4, 'Wi-Fi 5': 5, 'Wi-Fi 6': 6, 'Wi-Fi 6E': 6.5, 'Wi-Fi 7': 7 };

/* UCI encryption -> friendly label. Suffixes like +ccmp are cipher
   choices, not a different protocol. */
var SECURITY = [
	[ /^none$/, _('Open', 'vantage'), _('Open network'), 'open' ],
	[ /^owe$/, _('OWE', 'vantage'), _('Enhanced Open (OWE)'), 'owe' ],
	[ /^sae-mixed$/, _('WPA2/3'), _('WPA2/WPA3-Personal'), 'ok' ],
	[ /^sae(-ext)?$/, _('WPA3', 'vantage'), _('WPA3-Personal'), 'ok' ],
	[ /^psk-mixed$/, _('WPA/WPA2', 'vantage'), _('WPA/WPA2-Personal (TKIP allowed)'), 'weak' ],
	[ /^psk2$/, _('WPA2', 'vantage'), _('WPA2-Personal'), 'ok' ],
	[ /^psk$/, _('WPA', 'vantage'), _('WPA-Personal (legacy)'), 'weak' ],
	[ /^wpa3-mixed$/, _('WPA2/3-Ent'), _('WPA2/WPA3-Enterprise'), 'ok' ],
	[ /^wpa3(-192)?$/, _('WPA3-Ent'), _('WPA3-Enterprise'), 'ok' ],
	[ /^wpa-mixed$/, _('WPA/WPA2-Ent'), _('WPA/WPA2-Enterprise'), 'weak' ],
	[ /^wpa2$/, _('WPA2-Ent'), _('WPA2-Enterprise'), 'ok' ],
	[ /^wpa$/, _('WPA-Ent'), _('WPA-Enterprise (legacy)'), 'weak' ],
	[ /^wep/, _('WEP'), _('WEP (insecure)'), 'weak' ]
];

return baseclass.extend({
	BANDS: BANDS,

	/* '2g' / frequency (MHz) -> '2g' | '5g' | '6g' | '60g' | null */
	bandKey: function(cfgBand, freq) {
		if (typeof cfgBand === 'string' && own(BANDS, cfgBand)) return cfgBand;
		freq = num(freq);
		if (!freq) return null;
		return freq < 2500 ? '2g' : freq < 5925 ? '5g' : freq < 7200 ? '6g' : '60g';
	},

	bandLabel: function(key) {
		return own(BANDS, key) ? BANDS[key].label : fmt.DASH;
	},

	/* 'EHT160' -> { std: 'EHT', gen: 'Wi-Fi 7', width: 160 } */
	htmode: function(mode) {
		var m = String(mode || '').toUpperCase().match(/^(EHT|HE|VHT|HT|NOHT)(\d+)?/);
		if (!m) return { std: null, gen: null, width: null };
		var gen = { EHT: 'Wi-Fi 7', HE: 'Wi-Fi 6', VHT: 'Wi-Fi 5', HT: 'Wi-Fi 4', NOHT: 'legacy' }[m[1]];
		return { std: m[1] === 'NOHT' ? null : m[1], gen: gen, width: m[2] ? +m[2] : (m[1] === 'NOHT' ? 20 : null) };
	},

	/* Wi-Fi generation, marketing name. HE on 6 GHz is "Wi-Fi 6E". */
	genName: function(std, band) {
		switch (std) {
		case 'EHT': return 'Wi-Fi 7';
		case 'HE': return band === '6g' ? 'Wi-Fi 6E' : 'Wi-Fi 6';
		case 'VHT': return 'Wi-Fi 5';
		case 'HT': return 'Wi-Fi 4';
		case 'legacy': return 'legacy';
		}
		return null;
	},

	genRank: function(gen) { return own(GEN_RANK, gen) ? GEN_RANK[gen] : -1; },

	/* std of one iwinfo rate block ({ ht, vht, he, eht, ... }) */
	rateStd: function(r) {
		if (!r || typeof r !== 'object') return null;
		return r.eht ? 'EHT' : r.he ? 'HE' : r.vht ? 'VHT' : r.ht ? 'HT' : 'legacy';
	},

	/* Best standard a client has shown: capability flags from hostapd
	   (ht/vht/he/eht) and the rate flags of the frames seen by iwinfo.
	   The last frame is often a low-rate management frame, so the
	   maximum is what the client can do. */
	clientStd: function(rx, tx, caps) {
		var order = [ 'legacy', 'HT', 'VHT', 'HE', 'EHT' ], best = -1;
		[ this.rateStd(rx), this.rateStd(tx) ].forEach(function(s) { best = Math.max(best, order.indexOf(s)); });
		if (caps && typeof caps === 'object') {
			if (caps.eht) best = Math.max(best, 4);
			else if (caps.he) best = Math.max(best, 3);
			else if (caps.vht) best = Math.max(best, 2);
			else if (caps.ht) best = Math.max(best, 1);
		}
		return best < 0 ? null : order[best];
	},

	/* iwinfo rate block -> { rate (kbit/s), mhz, std, mcs, nss, label } */
	phy: function(r) {
		if (!r || typeof r !== 'object') return null;
		var std = this.rateStd(r), mhz = num(r.mhz) || null, rate = num(r.rate) || null;
		var parts = [ fmt.phyRate(rate) ];
		if (mhz) parts.push(_('%s MHz').format(mhz));
		parts.push(std === 'legacy' ? _('legacy') : std);
		var detail = [];
		if (r.mcs != null && isFinite(+r.mcs)) detail.push(_('MCS %d').format(+r.mcs));
		if (r.nss != null && +r.nss > 0) detail.push((+r.nss) + '×' + (+r.nss));
		if (r.short_gi || +r.he_gi > 0 || +r.eht_gi > 0) detail.push(_('short GI'));
		return { rate: rate, mhz: mhz, std: std, mcs: r.mcs != null ? +r.mcs : null, nss: r.nss != null ? +r.nss : null,
			label: parts.join(' · '), detail: detail.join(' · ') };
	},

	/* signal (dBm) -> { bars 0..4, level ok|warn|crit|none, word } */
	signal: function(dbm) {
		dbm = num(dbm);
		if (!dbm || dbm >= 0) return { bars: 0, level: 'none', word: _('No signal') };
		if (dbm >= -55) return { bars: 4, level: 'ok', word: _('Excellent', 'vantage') };
		if (dbm >= -67) return { bars: 3, level: 'ok', word: _('Good', 'vantage') };
		if (dbm >= -75) return { bars: 2, level: 'warn', word: _('Fair', 'vantage') };
		return { bars: 1, level: 'crit', word: _('Weak') };
	},

	/* ath12k (and some others) report a fixed placeholder (-107..-121 dBm)
	   instead of a measured noise floor. Anything below -105 dBm is not
	   physical for a 20 MHz+ channel: unknown, not a fake SNR. */
	noise: function(dbm) {
		dbm = num(dbm);
		return (dbm < 0 && dbm > -105) ? dbm : null;
	},

	/* UCI encryption string -> { short, long, tone: ok|weak|open|owe } */
	security: function(enc) {
		var e = String(enc == null ? 'none' : enc).trim().toLowerCase().replace(/\+.*$/, '') || 'none';
		for (var i = 0; i < SECURITY.length; i++)
			if (SECURITY[i][0].test(e)) return { short: SECURITY[i][1], long: SECURITY[i][2], tone: SECURITY[i][3] };
		return { short: e.toUpperCase(), long: e, tone: 'ok' };
	},

	/* channel -> centre frequency (MHz) for the band */
	chanFreq: function(band, chan) {
		chan = num(chan);
		if (!own(BANDS, band) || !chan) return null;
		if (band === '2g') return chan === 14 ? 2484 : 2407 + 5 * chan;
		if (band === '60g') return 56160 + 2160 * chan;
		return BANDS[band].base + 5 * chan;
	},

	/* Where the occupied channel sits inside its band, as fractions 0..1
	   of the band's span: { from, to, lo, hi, centre } or null. Uses the
	   centre channel of wide channels (iwinfo center_chan1). */
	spectrum: function(band, chan, centerChan, width) {
		if (!own(BANDS, band)) return null;
		var b = BANDS[band];
		var c = this.chanFreq(band, centerChan) || this.chanFreq(band, chan);
		width = num(width) || 20;
		if (!c) return null;
		var lo = c - width / 2, hi = c + width / 2, span = b.hi - b.lo;
		var clamp = function(v) { return Math.max(0, Math.min(1, v)); };
		return { from: clamp((lo - b.lo) / span), to: clamp((hi - b.lo) / span), lo: lo, hi: hi, centre: c, bandLo: b.lo, bandHi: b.hi };
	}
});
