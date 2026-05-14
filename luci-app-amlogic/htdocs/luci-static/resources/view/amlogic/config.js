// SPDX-License-Identifier: GPL-2.0
// Plugin Settings
//
// Purpose: configure the `config` section in /etc/config/amlogic via form.Map,
// covering firmware/kernel GitHub repos, tags, version branch, plugin branch,
// keep-config flag, bootloader write flag, and shared partition fs type.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (platform_info, state).

'use strict';
'require view';
'require form';
'require rpc';
'require uci';

// Get platform info; only used to display the device PLATFORM tag.
const callPlatform = rpc.declare({ object: 'luci.amlogic', method: 'platform_info' });
// Query runtime state; kernel_release is used to derive default kernel tag and branch.
const callState    = rpc.declare({ object: 'luci.amlogic', method: 'state' });

// This page uses its own Save button; hide LuCI's default Save/Apply/Reset.
return view.extend({
	// Load platform info + state in parallel, along with the UCI config (we will read/write it).
    load: function () {
		return Promise.all([
			callPlatform(),
			callState(),
			uci.load('amlogic')
		]);
	},

	// Render form options bound to the amlogic.config NamedSection, and pre-fill some defaults based on platform/state.
    render: function (data) {
		const platform = data[0] || {};
		const state    = data[1] || {};

		// Auto-create the section if missing
		if (!uci.get('amlogic', 'config')) {
			uci.add('amlogic', 'amlogic', 'config');
		}

		// Build a form.Map bound to the amlogic.config NamedSection, with options for various plugin settings.
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

		// 6. Kernel tags; available tags depend on the selected kernel repo.
		// Default is auto-derived from kernel_release suffixes (-rk3588/-rk35xx/-h6).
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
		// Determine default tag from saved config or kernel_release uname string.
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
			state.has_luci_js
				? _('Set the branch of the luci-app-amlogic plugin used in [Only update Amlogic Service]. Select main for JavaScript version or lua for Lua version.')
				: _('Set the branch of the luci-app-amlogic plugin used in [Only update Amlogic Service]. This system does not have JS LuCI, only the Lua branch is available.'));
		if (state.has_luci_js)
			pbranch.value('main', _('main [JavaScript version]'));
		pbranch.value('lua', _('lua [Lua version]'));
		pbranch.default = state.has_luci_js ? 'main' : 'lua';
		pbranch.rmempty = false;

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
