// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2025 ImmortalWrt.org
 */

'use strict';
'require form';
'require poll';
'require rpc';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('gost'), {}).then(function(res) {
		let isRunning = false;
		try {
			isRunning = res['gost']['instances']['instance1']['running'];
		} catch (e) {}
		return isRunning;
	});
}

function renderStatus(isRunning) {
	let spanTmpl = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	return spanTmpl.format(
		isRunning ? 'green' : 'red',
		_('GOST'),
		isRunning ? _('RUNNING') : _('NOT RUNNING')
	);
}

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('gost', _('GOST'),
			_('A simple security tunnel written in Golang.'));

		/* Bug fix: 为状态栏段指定一个不存在的 UCI 类型，避免匹配实际配置节 */
		s = m.section(form.TypedSection, '_status');
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return L.resolveDefault(getServiceStatus()).then(function(isRunning) {
					/* Bug fix: 重命名变量以避免遮蔽外层 'require view' 中的 view 模块 */
					let statusEl = document.getElementById('service_status');
					if (statusEl)
						statusEl.innerHTML = renderStatus(isRunning);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data…'))
			]);
		};

		s = m.section(form.NamedSection, 'config', 'gost');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		o = s.option(form.Value, 'config_file', _('Configuration file'));
		o.value('/etc/gost/gost.json');
		o.datatype = 'path';

		o = s.option(form.DynamicList, 'arguments', _('Arguments'));
		o.validate = function(section_id, value) {
			if (section_id) {
				let config_file = this.section.formvalue(section_id, 'config_file');
				/* Bug fix: 避免使用 ES2020 可选链 (?.) 以兼容旧版 JS 运行时 */
				let args = this.section.formvalue(section_id, 'arguments');

				if (!config_file && (!args || !args.length))
					return _('Expecting: %s').format(_('non-empty value'));
			}

			return true;
		};

		return m.render();
	}
});
