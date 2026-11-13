'use strict';
'require baseclass';

/*
 * Vantage theme - device naming for the host chip and title.
 *
 * `system board` model strings are often the SoC vendor's reference-design
 * name ("Qualcomm Technologies, Inc. IPQ5332/RDP442/AP-MI01.3") rather than
 * the product. In that case (or when the model is missing) the product name
 * is derived from board_name ("zyxel,nwa50be" -> "Zyxel NWA50BE"): vendor
 * capitalised (or its usual spelling), model upper-cased. The chip leaves
 * out a name the other one contains. Pure functions, no DOM, unit tested
 * in tests/host.test.js.
 */

/* SoC vendors, reference boards and placeholders: not a product name.
   A bare chip id only counts at the start ("IPQ8074/AP-HK01"); inside a
   product name it is part of the model ("GL.iNet GL-MT3000"). */
const REFERENCE = /\b(qualcomm|qca|mediatek|broadcom|realtek|marvell|airoha|econet|ralink|allwinner|rockchip|amlogic|rdp\d*|rfb|reference|ref[\s_-]?board|evb|eval(?:uation)?\s*board|dev(?:elopment)?\s*board|generic|default\s*string|to be filled|unknown)\b|^(ipq|qca|mt|bcm|rtl|en)\d{3,}/i;

/* board_name vendor prefixes whose usual spelling is not simply Capitalised */
const VENDORS = {
	'tplink': 'TP-Link', 'tp-link': 'TP-Link', 'dlink': 'D-Link', 'd-link': 'D-Link', 'asus': 'ASUS',
	'netgear': 'NETGEAR', 'glinet': 'GL.iNet', 'gl-inet': 'GL.iNet', 'ubnt': 'Ubiquiti', 'ubiquiti': 'Ubiquiti',
	'mikrotik': 'MikroTik', 'avm': 'AVM', 'zte': 'ZTE', 'tenda': 'Tenda', 'openwrt': 'OpenWrt', 'bananapi': 'Banana Pi',
	'sinovoip': 'Banana Pi', 'raspberrypi': 'Raspberry Pi', 'friendlyarm': 'FriendlyElec', 'friendlyelec': 'FriendlyElec',
	'iodata': 'I-O DATA', 'nec': 'NEC', 'wavlink': 'Wavlink', 'cudy': 'Cudy', 'xiaomi': 'Xiaomi', 'linksys': 'Linksys',
	'zyxel': 'Zyxel', 'edgecore': 'Edgecore', 'engenius': 'EnGenius', 'aruba': 'Aruba', 'meraki': 'Meraki', 'buffalo': 'Buffalo'
};

function clean(s) {
	return (typeof s === 'string') ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function looksLikeReference(model) {
	const m = clean(model);
	return !m || REFERENCE.test(m);
}

function vendorName(v) {
	const key = v.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(VENDORS, key)) return VENDORS[key];
	return key.split(/[-_]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* "zyxel,nwa50be" -> "Zyxel NWA50BE"; null when there is no vendor,model pair */
function fromBoardName(boardName) {
	const b = clean(boardName);
	const i = b.indexOf(',');
	if (i <= 0 || i === b.length - 1) return null;
	const vendor = b.slice(0, i).trim(), model = b.slice(i + 1).trim();
	if (!/^[A-Za-z0-9._-]+$/.test(vendor) || !/^[A-Za-z0-9._+,-]+$/.test(model)) return null;
	return vendorName(vendor) + ' ' + model.replace(/,/g, ' ').toUpperCase();
}

/* names compared for repeats: case, spaces and punctuation don't count
   ("cudy-wr-3000" and "Cudy WR3000" are one name) */
function nameKey(s) {
	return clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/* the host chip's names, hostname first: a name the other one contains
   only repeats it and is left out (the product, when they are the same) */
function chipNames(hostname, product) {
	const h = clean(hostname), p = clean(product);
	const hk = nameKey(h), pk = nameKey(p);
	if (!p || (h && pk && hk.indexOf(pk) >= 0)) return h ? [ h ] : [];
	if (!h || (hk && pk.indexOf(hk) >= 0)) return [ p ];
	return [ h, p ];
}

/* product name for a `system board` reply, '' when nothing usable */
function productName(board) {
	if (!board || typeof board !== 'object') return '';
	const model = clean(board.model);
	if (model && !looksLikeReference(model)) return model;
	return fromBoardName(board.board_name) || clean(board.board_name);
}

return baseclass.extend({
	productName,
	chipNames,
	fromBoardName,
	looksLikeReference
});
