// SPDX-License-Identifier: Apache-2.0
// NOTE: luci-app-fileassistant 使用模板视图（luasrc/view/fileassistant.htm）
// 此文件在 luci 23.05+ 下通过 menu.d 的 action.type=template 加载，
// 不会直接调用本 JS view，保留此文件仅供参考。
'use strict';
'require view';
'require rpc';
'require form';

return view.extend({
	render: function() {
		// 实际界面由 luasrc/view/fileassistant.htm 模板提供
		return E('p', {}, _('Loading…'));
	}
});
