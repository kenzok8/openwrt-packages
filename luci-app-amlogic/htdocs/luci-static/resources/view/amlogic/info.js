// SPDX-License-Identifier: GPL-2.0
// Plugin landing / info page
//
// Renders the plugin LOGO, three quick-link badges (packit project, author
// homepage, plugin repository), the feature summary and the list of
// supported boxes. The page does not read or write any UCI config; it only
// calls the author RPC to obtain the author's repository URL.

'use strict';
'require view';
'require rpc';
'require view.amlogic.shared as amlogicShared';

// Extract OPENWRT_AUTHOR from /usr/sbin/openwrt-update-amlogic and return the
// author's GitHub repo URL, used when the user clicks author.svg.
const callAuthor = rpc.declare({
	object: 'luci.amlogic',
	method: 'author',
	expect: { openwrt_author: 'Invalid value.' }
});

// Sync menu_install / menu_armcpu UCI flags from runtime platform detection.
// Called on every info page load so the sidebar menu is correct from first visit.
const callSyncMenu = rpc.declare({ object: 'luci.amlogic', method: 'sync_menu' });

// Static list of supported boxes (display only, not used in any logic).
const SUPPORTED_BOXES = [
	_('Amlogic s922x --- [ Beelink, Beelink-Pro, Ugoos-AM6-Plus, ODROID-N2, Khadas-VIM3, Ali-CT2000 ]'),
	_('Amlogic s905x3 -- [ X96-Max+, HK1-Box, H96-Max-X3, Ugoos-X3, TX3, X96-Air, A95XF3-Air ]'),
	_('Amlogic s905x2 -- [ X96Max-4G, X96Max-2G, MECOOL-KM3-4G, Tanix-Tx5-Max, A95X-F2 ]'),
	_('Amlogic s912 ---- [ H96-Pro-Plus, Octopus-Planet, A1, A2, Z6-Plus, TX92, X92, TX8-MAX, TX9-Pro ]'),
	_('Amlogic s905x --- [ HG680P, B860H, TBee, T95, TX9, XiaoMI-3S, X96 ]'),
	_('Amlogic s905w --- [ X96-Mini, TX3-Mini, W95, X96W/FunTV, MXQ-Pro-4K ]'),
	_('Amlogic s905d --- [ Phicomm-N1, MECOOL-KI-Pro, SML-5442TW ]'),
	_('Amlogic s905l --- [ UNT402A, M201-S ]'),
	_('Amlogic s905l2 -- [ MGV2000, MGV3000, Wojia-TV-IPBS9505, M301A, E900v21E ]'),
	_('Amlogic s905l3 -- [ CM211-1, CM311-1, HG680-LC, M401A, UNT400G1, UNT402A, ZXV10-BV310 ]'),
	_('Amlogic s905l3a - [ E900V22C/D, CM311-1a-YST, M401A, M411A, UNT403A, UNT413A, IP112H ]'),
	_('Amlogic s905l3b - [ CM211-1, CM311-1, E900V22D, E900V21E, E900V22E, M302A/M304A ]'),
	_('Amlogic s905 ---- [ Beelink-Mini-MX-2G, Sunvell-T95M, MXQ-Pro+4K, SumaVision-Q5 ]'),
	_('Allwinner H6 ---- [ V-Plus Cloud ]'),
	_('Rockchip -------- [ BeikeYun, L1-Pro, FastRhino R66S/R68S, Radxa 5B/E25 ]'),
	_('Used in KVM ----- [ Can be used in KVM virtual machine of Armbian system. ]')
];

// Open an external link in a new tab; fall back to the current window if the
// browser blocks the popup.
function openExternal(url) {
	const w = window.open(url, '_blank', 'noopener,noreferrer');
	if (!w) window.location.href = url;
}

return view.extend({
	// Read-only info page: disable the top Save / Apply / Reset buttons.
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	load: function () {
		// Fire sync_menu in background (don't block render on it).
		callSyncMenu().catch(function () {});
		return callAuthor();
	},

	render: function (authorUrl) {
		// Inject the theme stylesheet on first entry so amlogic-* classes work.
		amlogicShared.ensureCss();
		const res = L.resource('amlogic');

		// Flatten the supported-boxes list to [text, <br>, text, <br>, ...].
		const boxRows = [];
		for (let i = 0; i < SUPPORTED_BOXES.length; i++)
			boxRows.push(SUPPORTED_BOXES[i], E('br'));

		return E('div', { class: 'cbi-section' }, [
			E('h2', { style: 'border-bottom:none' }, _('Amlogic Service')),
			E('p', { style: 'border:none; margin-bottom:0' }, _('Supports management of Amlogic s9xxx, Allwinner (V-Plus Cloud), and Rockchip (BeikeYun, Chainedbox L1 Pro) boxes.')),
			E('table', { class: 'amlogic-row-table' }, [
				E('tr', [
					E('td', { colspan: '2', style: 'text-align:center' }, [
						E('img', { src: res + '/logo.png', alt: 'Logo', width: '135' })
					])
				]),
				E('tr', [
					E('td', { colspan: '2', style: 'text-align:center' }, [
						E('img', {
							src: res + '/packit.svg', alt: 'Packit',
							width: '168', height: '20',
							style: 'cursor:pointer; margin:0 5px',
							click: function () { openExternal('https://github.com/unifreq/openwrt_packit'); }
						}),
						E('img', {
							src: res + '/author.svg', alt: 'Author',
							width: '168', height: '20',
							style: 'cursor:pointer; margin:0 5px',
							click: function () {
								callAuthor().then(function (repo) {
									let url = String(repo || '').trim();
									if (!url) return;
									if (url.indexOf('https') === -1)
										url = 'https://github.com/' + url;
									openExternal(url);
								});
							}
						}),
						E('img', {
							src: res + '/plugin.svg', alt: 'luci-app-amlogic',
							width: '160', height: '20',
							style: 'cursor:pointer; margin:0 5px',
							click: function () { openExternal('https://github.com/ophub/luci-app-amlogic'); }
						})
					])
				]),
				E('tr', [
					E('td', { width: '20%', align: 'right' }, _('Supported functions:')),
					E('td', { width: '80%', align: 'left' },
					  _('Provide services such as install to EMMC, Update Firmware and Kernel, Backup and Recovery Config, Snapshot management, etc.'))
				]),
				E('tr', [
					E('td', { width: '20%', align: 'right', style: 'vertical-align:top; padding-top:4px' }, _('Supported Boxes:')),
					E('td', { width: '80%', align: 'left', style: 'line-height:1.8' }, boxRows)
				])
			])
		]);
	}
});
