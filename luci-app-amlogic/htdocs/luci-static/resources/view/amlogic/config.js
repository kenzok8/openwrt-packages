// SPDX-License-Identifier: GPL-2.0
// Plugin Settings
//
// Uses form.Map to maintain the `config` section in /etc/config/amlogic,
// covering:
//   - OpenWrt firmware GitHub repo, tag keyword, file suffix
//   - Kernel download repo / tag / version branch
//   - Keep config, auto-write bootloader, shared partition fs type
// This page uses the default form.Map Save / Apply buttons; saving only
// writes UCI, while other pages (Online Update / Manual Upload) read these
// values to drive the actual operations.

'use strict';
'require view';
'require form';
'require rpc';
'require uci';

// Get platform info; only used to display the device PLATFORM tag.
const callPlatform = rpc.declare({ object: 'luci.amlogic', method: 'platform_info' });
// Get runtime state; only kernel_release is used here, to derive default
// values for kernel tags / version branch.
const callState    = rpc.declare({ object: 'luci.amlogic', method: 'state' });

return view.extend({
	load: function () {
		return Promise.all([
			callPlatform(),
			callState(),
			uci.load('amlogic')
		]);
	},

	render: function (data) {
		const platform = data[0] || {};
		const state    = data[1] || {};

		// Auto-create the section if missing
		if (!uci.get('amlogic', 'config')) {
			uci.add('amlogic', 'amlogic', 'config');
		}

		const m = new form.Map('amlogic', _('Plugin Settings'),
			_('You can customize the github.com download repository of OpenWrt files and kernels in [Online Download Update].') +
			'<br />' + _('Tip: The same files as the current OpenWrt system\'s BOARD (such as rock5b) and kernel (such as 5.10) will be downloaded.'));
		const o = m.section(form.NamedSection, 'config', 'amlogic');
		o.anonymous = true;

		// 1. Display device platform
		const dev = o.option(form.DummyValue, 'mydevice', _('Current Device:'),
			_('Display the PLATFORM classification of the device.'));
		dev.cfgvalue = function () { return 'PLATFORM: ' + (platform.platform || 'Unknown'); };

		// 2. OpenWrt download repository
		const repo = o.option(form.Value, 'amlogic_firmware_repo',
			_('OpenWrt download repository:'),
			_('Set the OpenWrt files download repository on github.com in [Online Download Update].'));
		repo.default = 'https://github.com/breakingbadboy/OpenWrt';
		repo.rmempty = false;

		// 3. Tags keyword
		const tag = o.option(form.Value, 'amlogic_firmware_tag',
			_('OpenWrt download tags keyword:'),
			_('Set the OpenWrt files download tags keyword for github.com in [Online Download Update].'));
		tag.default = 'ARMv8';
		tag.rmempty = false;

		// 4. File suffix
		const suffix = o.option(form.ListValue, 'amlogic_firmware_suffix',
			_('OpenWrt files suffix:'),
			_('Set the OpenWrt files download suffix for github.com in [Online Download Update].'));
		['.7z', '.zip', '.img.gz', '.img.xz'].forEach(function (s) { suffix.value(s, _(s)); });
		suffix.default = '.img.gz';
		suffix.rmempty = false;

		// 5. Kernel download repository
		const kpath = o.option(form.ListValue, 'amlogic_kernel_path',
			_('Kernel download repository:'),
			_('Set the kernel files download repository on github.com in [Online Download Update].'));
		kpath.value('https://github.com/breakingbadboy/OpenWrt');
		kpath.value('https://github.com/ophub/kernel');
		kpath.default = 'https://github.com/breakingbadboy/OpenWrt';
		kpath.rmempty = false;

		// 6. Kernel tags - the list depends on currently saved kpath value.
		// The breakingbadboy/OpenWrt repo only ships rk3588/rk35xx/stable;
		// ophub/kernel additionally ships flippy/h6/beta. The default value is
		// auto-derived from -rk3588 / -rk35xx / -h6 keywords in `uname` so the
		// user does not have to pick the wrong tag.
		const currentKpath = uci.get('amlogic', 'config', 'amlogic_kernel_path') ||
		                     'https://github.com/breakingbadboy/OpenWrt';
		const knownTags = {
			kernel_rk3588: 'kernel_rk3588 [Rockchip RK3588 Kernel]',
			kernel_rk35xx: 'kernel_rk35xx [Rockchip RK35xx Kernel]',
			kernel_stable: 'kernel_stable [Mainline Stable Kernel]'
		};
		if (currentKpath.indexOf('ophub/kernel') >= 0) {
			knownTags.kernel_flippy = 'kernel_flippy [Mainline Stable Kernel by Flippy]';
			knownTags.kernel_h6     = 'kernel_h6 [Allwinner H6 Kernel]';
			knownTags.kernel_beta   = 'kernel_beta [Beta Kernel]';
		}
		// Determine default tag from existing config or uname
		let kernelTagDefault = uci.get('amlogic', 'config', 'amlogic_kernel_tags') || '';
		if (!kernelTagDefault) {
			const u = state.kernel_release || '';
			if (u.indexOf('-rk3588') >= 0) kernelTagDefault = 'kernel_rk3588';
			else if (u.indexOf('-rk35xx') >= 0) kernelTagDefault = 'kernel_rk35xx';
			else if (u.indexOf('-h6') >= 0 || u.indexOf('-zicai') >= 0) kernelTagDefault = 'kernel_h6';
			else kernelTagDefault = 'kernel_stable';
		}
		const ktags = o.option(form.ListValue, 'amlogic_kernel_tags',
			_('Kernel download tags:'),
			_('Set the kernel files download tags on github.com in [Online Download Update].'));
		Object.keys(knownTags).forEach(function (k) { ktags.value(k, _(knownTags[k])); });
		if (!knownTags[kernelTagDefault]) ktags.value(kernelTagDefault, kernelTagDefault);
		ktags.default = kernelTagDefault;
		ktags.rmempty = false;

		// 7. Kernel branch
		const kbranch = o.option(form.ListValue, 'amlogic_kernel_branch',
			_('Set version branch:'),
			_('Set the version branch of the OpenWrt files and kernel selected in [Online Download Update].'));
		['5.4', '5.10', '5.15', '6.1', '6.6', '6.12', '6.18'].forEach(function (b) {
			kbranch.value(b, _(b));
		});
		const m2 = (state.kernel_release || '').match(/^(\d+\.\d+)/);
		kbranch.default = m2 ? m2[1] : '5.10';
		kbranch.rmempty = false;

		// 8. Plugin branch
		const pbranch = o.option(form.ListValue, 'amlogic_plugin_branch',
			_('Set plugin branch:'),
			_('Set the branch of the luci-app-amlogic plugin used in [Only update Amlogic Service]. Default (empty) uses the main (JavaScript) branch.'));
		pbranch.value('', _('main [JavaScript version]'));
		pbranch.value('lua', _('lua [Lua version]'));
		pbranch.default = '';
		pbranch.rmempty = true;

		// 9. Keep config
		const fcfg = o.option(form.Flag, 'amlogic_firmware_config',
			_('Keep config update:'),
			_('Set whether to keep the current config during [Online Download Update] and [Manually Upload Update].'));
		fcfg.default = '1';
		fcfg.rmempty = false;

		// 9. Write bootloader
		const wb = o.option(form.Flag, 'amlogic_write_bootloader',
			_('Auto write bootloader:'),
			_('[Recommended choice] Set whether to auto write bootloader during install and update OpenWrt.'));
		wb.default = '0';
		wb.rmempty = false;

		// 10. Shared partition fs type
		const fst = o.option(form.ListValue, 'amlogic_shared_fstype',
			_('Set the file system type:'),
			_('[Default ext4] Set the file system type of the shared partition (/mnt/mmcblk*p4) when install OpenWrt.'));
		['ext4', 'f2fs', 'btrfs', 'xfs'].forEach(function (s) { fst.value(s, _(s)); });
		fst.default = 'ext4';
		fst.rmempty = false;

		return m.render();
	}
});
