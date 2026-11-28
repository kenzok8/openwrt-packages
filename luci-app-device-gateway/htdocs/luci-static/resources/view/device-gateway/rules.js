'use strict';
'require view';
'require form';
'require uci';
'require network';
'require ui';
'require dom';
'require fs';
'require poll';

var config = 'device-gateway';
var statusPath = '/tmp/device-gateway.status';

function isIPv4(ip) {
	var parts = ip.split('.');
	return parts.length === 4 && parts.every(function(octet) {
		return /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255;
	});
}

function saveMaps() {
	var tasks = [];
	document.getElementById('maincontent').querySelectorAll('.cbi-map').forEach(function(map) {
		tasks.push(dom.callClassMethod(map, 'save'));
	});
	return Promise.all(tasks);
}

return view.extend({
	handleSave: function() {
		// LuCI's "Save" action only stages changes. Do not rebuild dnsmasq here:
		// /etc/config/device-gateway still contains the previously committed data.
		return saveMaps();
	},

	handleSaveApply: function(ev, mode) {
		if (this.gatewayChanges && !this.gatewayChanges())
			return Promise.resolve();
		return saveMaps()
			.then(function() { return ui.changes.apply(mode == '0'); });
	},

	load: function() {
		return Promise.all([
			uci.load('device-gateway'),
			network.getHostHints(),
			network.getNetwork('lan'),
			fs.read(statusPath).catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var hints = data[1];
		var lan = data[2];
		var lanIp = lan ? lan.getIPAddr() : null;
		var hosts = {};
		var m = new form.Map('device-gateway', _('指定网关'),
			_('为指定设备分配固定 IPv4 地址、网关和 DNS。网关和 DNS 均选择继承时，只分配固定 IP。IPv6 由系统单独配置。'));

		var g = m.section(form.NamedSection, 'main', 'settings', _('全局设置'));
		g.anonymous = true;
		g.addremove = false;

		var o = g.option(form.Flag, 'enabled', _('启用设备网关规则'));
		o.default = '1';
		o.rmempty = false;
		o.description = _('关闭后会清理插件生成的 DHCP 标签，但保留用户原有的静态租约。');

		var presets = m.section(form.TableSection, 'gateway_preset', _('网关预设'));
		presets.anonymous = true;
		presets.addremove = true;
		var defaultGatewayLabel = lanIp ? _('默认网关 · %s').format(lanIp) : _('默认网关');
		function isDefaultAddress(address) {
			return Boolean(lanIp && address === lanIp);
		}
		presets.filter = function(id) {
			return !isDefaultAddress(uci.get(config, id, 'address'));
		};
		presets.description = lanIp
			? _('默认网关 · %s（当前 LAN 地址，只读）').format(lanIp)
			: _('默认网关（继承当前网络的 DHCP 设置）');
		presets.renderSectionAdd = function() { return E([]); };
		var renderPresets = presets.renderContents;
		presets.renderContents = function() {
			var section = renderPresets.apply(this, arguments);
			var table = section.querySelector('table');
			var labelInput = E('input', { type: 'text', 'class': 'cbi-input-text', style: 'width:100%', placeholder: _('例如：旁路由 A'), 'aria-label': _('旁路由名称') });
			var addressInput = E('input', { type: 'text', 'class': 'cbi-input-text', style: 'width:100%', placeholder: _('IPv4 地址'), 'aria-label': _('旁路由 IPv4 地址') });
			var error = E('div', { role: 'alert' });
			function openForm() {
				entry.style.display = '';
				opener.style.display = 'none';
				open.setAttribute('aria-expanded', 'true');
				labelInput.focus();
			}
			var open = E('button', {
				type: 'button', 'class': 'btn cbi-button cbi-button-neutral',
				title: _('新增旁路由表单'),
				'aria-expanded': 'false', 'aria-controls': 'device-gateway-preset-form',
				disabled: m.readonly || null,
				click: openForm
			}, _('添加'));
			var confirm = E('button', {
				type: 'button', 'class': 'cbi-button cbi-button-add',
				disabled: m.readonly || null,
				click: function() {
					if (entry.style.display === 'none') {
						openForm();
						return;
					}
					var label = labelInput.value.trim();
					var address = addressInput.value.trim();
					var invalid = !label ? _('请输入预设名称。')
						: !isIPv4(address) ? _('请输入有效的 IPv4 地址。')
						: isDefaultAddress(address) ? _('这是默认网关地址，无需另建预设。')
						: presetAddressExists(null, address) ? _('这个地址已在网关预设中。') : '';
					error.textContent = invalid;
					if (invalid)
						return;

					confirm.disabled = true;
					return m.save(function() {
						var key = 'gw_' + Date.now().toString(36);
						while (uci.get(config, key))
							key += 'x';
						uci.add(config, 'gateway_preset', key);
						uci.set(config, key, 'label', label);
						uci.set(config, key, 'address', address);
					}).catch(function() {
						confirm.disabled = false;
					});
				}
			}, _('添加网关'));
			var cancel = E('button', {
				type: 'button', 'class': 'btn cbi-button',
				click: function() {
					labelInput.value = '';
					addressInput.value = '';
					error.textContent = '';
					entry.style.display = 'none';
					opener.style.display = '';
					open.setAttribute('aria-expanded', 'false');
					open.focus();
				}
			}, _('取消'));
			function presetActionCell(button) {
				return E('td', { 'class': 'td cbi-section-table-cell nowrap cbi-section-actions' }, E('div', {}, button));
			}
			var opener = E('tr', { 'class': 'tr cbi-section-table-row' }, [
				E('td', { 'class': 'td' }),
				E('td', { 'class': 'td' }),
				presetActionCell(open)
			]);
			var entry = E('tr', { 'class': 'tr cbi-section-table-row', id: 'device-gateway-preset-form', style: 'display:none' }, [
				E('td', { 'class': 'td cbi-value-field cbi-section-table-cell', 'data-title': _('名称') }, labelInput),
				E('td', { 'class': 'td cbi-value-field cbi-section-table-cell', 'data-title': _('IPv4 地址') }, addressInput),
				presetActionCell(cancel)
			]);
			var rows = table.tBodies[0] || table.createTBody();
			rows.append(opener, entry);
			var actions = E('div', { 'class': 'cbi-section-create cbi-tblsection-create' }, [confirm, error]);
			section.appendChild(actions);
			return section;
		};
		var presetName = presets.option(form.Value, 'label', _('名称'));
		presetName.editable = true;
		presetName.rmempty = false;
		var presetIp = presets.option(form.Value, 'address', _('IPv4 地址'));
		presetIp.editable = true;
		presetIp.rmempty = false;
		presetIp.datatype = 'ip4addr';
		function presetAddressExists(id, value) {
			return presets.cfgsections().some(function(other) {
				return other !== id && (presetIp.formvalue(other) || uci.get(config, other, 'address')) === value;
			});
		}
		presetIp.validate = function(id, value) {
			if (!isIPv4(value))
				return _('请输入有效的 IPv4 地址。');
			if (isDefaultAddress(value))
				return _('这是默认网关地址，无需另建预设。');
			return presetAddressExists(id, value) ? _('这个地址已在网关预设中。') : true;
		};

		var s = m.section(form.TableSection, 'rule', _('设备规则'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.addbtntitle = _('添加设备');
		s.description = _('固定私有 MAC 可以正常使用；若手机定期轮换随机 MAC，请先将该 Wi-Fi 的私有地址模式设为“固定”。');

		o = s.option(form.Flag, 'enabled', _('启用'));
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		var nameOpt = s.option(form.Value, 'name', _('设备名称'));
		nameOpt.placeholder = _('例如：客厅电视');
		nameOpt.rmempty = true;
		nameOpt.editable = true;

		var mac = s.option(form.ListValue, 'mac', _('设备 / MAC'));
		mac.editable = true;
		mac.rmempty = false;
		mac.datatype = 'macaddr';
		mac.description = _('可以从在线设备中选择，也可以手工输入 MAC 地址。');
		hints.getMACHints(false).forEach(function(hint) {
			var value = hint[0].toLowerCase();
			var ip = hints.getIPAddrByMACAddr(hint[0]);
			var label = [hint[1], ip, hint[0]].filter(function(v) { return v; }).join(' · ');
			hosts[value] = { name: hint[1], ip: ip };
			mac.value(value, label);
		});
		mac.cfgvalue = function(section_id) {
			return (uci.get('device-gateway', section_id, 'mac') || '').toLowerCase();
		};
		mac.validate = function(section_id, value) {
			value = (value || '').toLowerCase();
			for (var i = 0; i < s.cfgsections().length; i++) {
				var sid = s.cfgsections()[i];
				if (sid != section_id && (mac.formvalue(sid) || '').toLowerCase() == value)
					return _('该 MAC 地址已经存在规则中。');
			}
			return true;
		};

		mac.write = function(section_id, value) {
			value = value.toLowerCase();
			uci.set('device-gateway', section_id, 'mac', value);
			if (!uci.get('device-gateway', section_id, 'name')) {
				var hostname = hints.getHostnameByMACAddr(value);
				if (hostname)
					uci.set('device-gateway', section_id, 'name', hostname);
			}
			if (!uci.get('device-gateway', section_id, 'ip')) {
				var ip = hints.getIPAddrByMACAddr(value);
				if (ip)
					uci.set('device-gateway', section_id, 'ip', ip);
			}
		};

		var ipOpt = s.option(form.Value, 'ip', _('固定 IP'));
		ipOpt.datatype = 'ip4addr';
		ipOpt.rmempty = false;
		ipOpt.placeholder = _('选择设备后自动填写');
		ipOpt.editable = true;
		ipOpt.validate = function(section_id, value) {
			for (var i = 0; i < s.cfgsections().length; i++) {
				var sid = s.cfgsections()[i];
				if (sid != section_id && ipOpt.formvalue(sid) == value)
					return _('该固定 IP 已被另一条规则使用。');
			}
			return true;
		};

		mac.onchange = function(ev, section_id, value) {
			var host = hosts[(value || '').toLowerCase()] || {};
			var ipElem = ipOpt.getUIElement(section_id);
			var nameElem = nameOpt.getUIElement(section_id);
			if (ipElem && host.ip)
				ipElem.setValue(host.ip);
			if (nameElem && !nameElem.getValue() && host.name)
				nameElem.setValue(host.name);
		};

		var gateway = s.option(form.ListValue, 'gateway_mode', _('指定网关'));
		gateway.editable = true;
		gateway.rmempty = false;
		gateway.default = 'inherit';
		var renderGateway = gateway.renderWidget;
		gateway.renderWidget = function(id, index, value) {
			this.keylist = [];
			this.vallist = [];
			this.value('inherit', defaultGatewayLabel);
			uci.sections(config, 'gateway_preset').forEach(function(preset) {
				if (preset.label && preset.address && !isDefaultAddress(preset.address))
					gateway.value(preset['.name'], preset.label + ' · ' + preset.address);
			});
			if (value && this.keylist.indexOf(value) < 0)
				this.value(value, value.indexOf('legacy:') === 0
					? _('旧规则 · %s').format(value.slice(7))
					: _('缺失的预设 · %s').format(value));
			return renderGateway.call(this, id, index, value);
		};
		gateway.cfgvalue = function(id) {
			var mode = uci.get(config, id, 'gateway_mode');
			var legacy = uci.get(config, id, 'gateway');
			// Present the migrated main-router preset as the single default choice.
			// Keep its stored binding until the user changes this device's selection.
			if (isDefaultAddress(mode ? uci.get(config, mode, 'address') : legacy))
				return 'inherit';
			return mode || (legacy ? 'legacy:' + legacy : 'inherit');
		};
		gateway.write = function(id, value) {
			if (value.indexOf('legacy:') === 0) {
				uci.unset(config, id, 'gateway_mode');
				uci.set(config, id, 'gateway', value.slice(7));
			}
			else {
				uci.set(config, id, 'gateway_mode', value);
				uci.unset(config, id, 'gateway');
			}
		};
		function references(id) {
			return s.cfgsections().filter(function(rule) {
				return (gateway.formvalue(rule) || gateway.cfgvalue(rule)) === id;
			}).length;
		}
		var removePreset = presets.handleRemove;
		presets.handleRemove = function(id, ev) {
			if (references(id)) {
				ui.addNotification(null, E('p', _('这个预设仍有设备在用，请先更改这些设备的网关。')));
				return Promise.resolve();
			}
			return removePreset.call(this, id, ev);
		};
		this.gatewayChanges = function() {
			var affected = presets.cfgsections().filter(function(id) {
				var current = uci.get(config, id, 'address');
				return current && current !== presetIp.formvalue(id);
			}).reduce(function(count, id) { return count + references(id); }, 0);
			return !affected || window.confirm(_('修改网关预设会影响 %s 台设备。继续应用？').format(affected));
		};

		var dnsChoices = {
			inherit: _('继承当前网络的 DNS'),
			ali: _('阿里 DNS · 223.5.5.5 / 223.6.6.6'),
			tencent: _('腾讯 DNSPod · 119.29.29.29'),
			'114': _('114 DNS · 114.114.114.114')
		};
		function isDnsChoice(value) {
			return Object.prototype.hasOwnProperty.call(dnsChoices, value);
		}
		var dnsOpt = s.option(form.Value, 'dns_mode', _('指定 DNS'));
		dnsOpt.rmempty = false;
		dnsOpt.editable = true;
		dnsOpt.default = 'inherit';
		['inherit', 'ali', 'tencent', '114'].forEach(function(mode) {
			dnsOpt.value(mode, dnsChoices[mode]);
		});
		dnsOpt.validate = function(id, value) {
			if (isDnsChoice(value))
				return true;
			return value.trim() && value.trim().split(/[\s,]+/).every(isIPv4)
				? true : _('请输入一个或多个 IPv4 DNS，可用逗号分隔。');
		};
		dnsOpt.cfgvalue = function(id) {
			var mode = uci.get(config, id, 'dns_mode');
			if (isDnsChoice(mode))
				return mode;
			var value = uci.get(config, id, 'dns');
			return (Array.isArray(value) ? value.join(', ') : value) || 'inherit';
		};
		dnsOpt.write = function(id, value) {
			if (isDnsChoice(value)) {
				uci.set(config, id, 'dns_mode', value);
			}
			else {
				uci.set(config, id, 'dns_mode', 'custom');
				uci.set(config, id, 'dns', value.trim().split(/[\s,]+/).join(','));
			}
		};

		var status = E('p');
		var statusSummary = E('summary', { style: 'cursor:pointer' }, _('DHCP 同步记录'));
		var diagnostics = E('details', { 'class': 'cbi-section' }, [statusSummary, status,
			E('p', {}, _('这是路由器侧的规则加载记录。设备收到新参数的时间取决于 DHCP 续租。'))
		]);
		function showStatus(value) {
			var next = value.trim() || _('暂无后台同步记录。');
			if (next === status.textContent)
				return;
			var failed = next.indexOf('错误：') >= 0;
			status.textContent = next;
			statusSummary.textContent = failed ? _('DHCP 同步失败') : _('DHCP 同步记录');
			if (failed)
				diagnostics.open = true;
		}
		showStatus(data[3]);
		poll.add(function() {
			return fs.read(statusPath).then(showStatus).catch(function() {});
		}, 5);
		return m.render().then(function(content) {
			return E('div', {}, [content, diagnostics]);
		});
	}
});

