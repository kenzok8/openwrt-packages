// SPDX-License-Identifier: Apache-2.0
// NOTE: luci-app-adguardhome 使用多页面 CBI 模板架构，luci 23.05+ 通过 menu.d alias 跳转至 base 子页。
// 此 JS 文件不直接调用，保留供参考。
'use strict';
'require view';
'require rpc';
'require form';

return view.extend({
	render: function() {
		// 实际界面由 luasrc/model/cbi/AdGuardHome/ 下多个 CBI 模型提供
		return E('p', {}, _('Loading…'));
	}
});
