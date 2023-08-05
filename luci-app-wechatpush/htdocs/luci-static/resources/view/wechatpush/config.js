'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require rpc';
'require form';

'require poll';
'require tools.widgets as widgets';
'require tools.firewall as fwtool';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('wechatpush'), {}).then(function (res) {
		console.log(res);
		var isRunning = false;
		try {
			isRunning = res['wechatpush']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		renderHTML = String.format(spanTemp, 'green', _('wechatpush'), _('RUNNING'));
	} else {
		renderHTML = String.format(spanTemp, 'red', _('wechatpush'), _('NOT RUNNING'));
	}

	return renderHTML;
}

var cbiRichListValue = form.ListValue.extend({
	renderWidget: function(section_id, option_index, cfgvalue) {
		var choices = this.transformChoices();
		var widget = new ui.Dropdown((cfgvalue != null) ? cfgvalue : this.default, choices, {
			id: this.cbid(section_id),
			sort: this.keylist,
			optional: true,
			select_placeholder: this.select_placeholder || this.placeholder,
			custom_placeholder: this.custom_placeholder || this.placeholder,
			validate: L.bind(this.validate, this, section_id),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly
		});

		return widget.render();
	},

	value: function(value, title, description) {
		if (description) {
			form.ListValue.prototype.value.call(this, value, E([], [
				E('span', { 'class': 'hide-open' }, [ title ]),
				E('div', { 'class': 'hide-close', 'style': 'min-width:25vw' }, [
					E('strong', [ title ]),
					E('br'),
					E('span', { 'style': 'white-space:normal' }, description)
				])
			]));
		}
		else {
			form.ListValue.prototype.value.call(this, value, title);
		}
	}
});

return view.extend({
	callHostHints: rpc.declare({
		object: 'luci-rpc',
		method: 'getHostHints',
		expect: { '': {} }
	}),

	load: function () {
		return Promise.all([
			this.callHostHints()
		]);
	},

	render: function (data) {
		if (fwtool.checkLegacySNAT())
			return fwtool.renderMigration();
		else
			return this.renderForwards(data);
	},

	renderForwards: function (data) {
		var hosts = data[0],
			m, s, o,
			programPath = '/usr/share/wechatpush/wechatpush';

		m = new form.Map('wechatpush', _('WeChat push'), _('A tool that can push device messages from OpenWrt to a mobile phone via WeChat or Telegram.<br /><br />If you encounter any issues while using it, please submit them here:') + '<a href="https://github.com/tty228/luci-app-wechatpush" target="_blank">' + _('GitHub Project Address') + '</a>');

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			var statusView = E('p', { id: 'service_status' }, _('Collecting data ...'));
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					statusView.innerHTML = renderStatus(res);
				});
			});

			setTimeout(function () {
				poll.start();
			}, 100);

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				statusView
			]);
		}

		s = m.section(form.NamedSection, 'config', 'wechatpush', _(''));
		s.tab('basic', _('Basic Settings'));
		s.tab('content', _('Push Content'));
		s.tab('ipset', _('Auto Ban'));
		s.tab('crontab', _('Scheduled Push'));
		s.tab('disturb', _('Do Not Disturb'));
		s.addremove = false;
		s.anonymous = true;

		// 基本设置
		o = s.taboption('basic', form.Flag, 'enable', _('Enabled'));

		o = s.taboption('basic', cbiRichListValue, 'jsonpath', _('Push Mode'));
		o.value('/usr/share/wechatpush/api/serverchan.json', _('WeChat serverchan'),
			_('Using serverchan API, simple configuration, supports multiple push methods'));
		o.value('/usr/share/wechatpush/api/qywx_mpnews.json', _('WeChat Work Image Message'),
			_('Using WeChat Work application message, more complex configuration, and starting from June 20, 2022, additional configuration for trusted IP is required. Trusted IP cannot be shared. This channel is no longer recommended.'));
		o.value('/usr/share/wechatpush/api/qywx_markdown.json', _('WeChat Work Markdown Version'),
			_('WeChat Work application message in plain text format, no need to click the title to view the content, same as above'));
		o.value('/usr/share/wechatpush/api/wxpusher.json', _('wxpusher'),
			_('Another channel for WeChat push, the configuration is relatively simple, and only supports official accounts'));
		o.value('/usr/share/wechatpush/api/pushplus.json', _('pushplus'),
			_('Another channel for WeChat push, the configuration is relatively simple, and it supports multiple push methods'));
		o.value('/usr/share/wechatpush/api/telegram.json', _('Telegram'),
			_('Telegram Bot Push'));
		o.value('/usr/share/wechatpush/api/diy.json', _('Custom Push'),
			_('By modifying the JSON file, you can use a custom API'));

		o = s.taboption('basic', form.Value, 'sckey', _('「wechatpush」sendkey'));
		o.description = _('Get Instructions') + ' <a href="https://sct.ftqq.com/" target="_blank">' + _('Click here') + '</a>';
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/serverchan.json');

		o = s.taboption('basic', form.Value, 'corpid', _('corpid'));
		o.description = _('Get Instructions') + ' <a href="https://work.weixin.qq.com/api/doc/10013" target="_blank">' + _('Click here') + '</a>';
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_mpnews.json');
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_markdown.json');

		o = s.taboption('basic', form.Value, 'userid', _('userid'));
		o.rmempty = false;
		o.description = _('Send to All App Users, enter @all');
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_mpnews.json');
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_markdown.json');

		o = s.taboption('basic', form.Value, 'agentid', _('agentid'));
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_mpnews.json');
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_markdown.json');

		o = s.taboption('basic', form.Value, 'corpsecret', _('Secret'));
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_mpnews.json');
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_markdown.json');

		o = s.taboption('basic', form.Value, 'mediapath', _('Thumbnail Image File Path'))
		o.rmempty = false;
		o.default = '/usr/share/wechatpush/api/logo.jpg';
		o.depends('jsonpath', '/usr/share/wechatpush/api/qywx_mpnews.json');
		o.description = _('Supports JPG and PNG formats within 2MB <br> Optimal size: 900383 or 2.35:1');

		o = s.taboption('basic', form.Value, 'wxpusher_apptoken', _('appToken'));
		o.description = _('Get Instructions') + ' <a href="https://wxpusher.zjiecode.com/docs/#/?id=%e5%bf%ab%e9%80%9f%e6%8e%a5%e5%85%a5" target="_blank">' + _('Click here') + '</a>';
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/wxpusher.json');

		o = s.taboption('basic', form.Value, 'wxpusher_uids', _('uids'));
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/wxpusher.json');

		o = s.taboption('basic', form.Value, 'wxpusher_topicIds', _('topicIds(Mass sending)'));
		o.description = _('Get Instructions') + ' <a href="https://wxpusher.zjiecode.com/docs/#/?id=%e5%8f%91%e9%80%81%e6%b6%88%e6%81%af-1" target="_blank">' + _('Click here') + '</a>';
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/wxpusher.json');

		o = s.taboption('basic', form.Value, 'pushplus_token', _('pushplus_token'));
		o.description = _('Get Instructions') + ' <a href="http://www.pushplus.plus/" target="_blank">' + _('Click here') + '</a>';
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/pushplus.json');

		o = s.taboption('basic', form.Value, 'tg_token', _('TG_token'));
		o.description = _('Get Bot') + ' <a href="https://t.me/BotFather" target="_blank">' + _('Click here') + '</a>' + _('<br />Send a message to the created bot to initiate a conversation.');
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/telegram.json');

		o = s.taboption('basic', form.Value, 'chat_id', _('TG_chatid'));
		o.description = _('Get chat_id') + ' <a href="https://t.me/getuserIDbot" target="_blank">' + _('Click here') + '</a>' + _('<br />If you want to send to a group/channel, please create a non-Chinese group/channel (for easier chatid lookup, you can rename it later).<br />Add the bot to the group, send a message, and use https://api.telegram.org/bot token /getUpdates to obtain the chatid.');
		o.rmempty = false;
		o.depends('jsonpath', '/usr/share/wechatpush/api/telegram.json');

		o = s.taboption('basic', form.TextValue, 'diy_json', _('Custom Push'));
		o.rows = 28;
		o.wrap = 'oft';
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/usr/share/wechatpush/api/diy.json');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/usr/share/wechatpush/api/diy.json', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};
		o.description = _('Please refer to the comments and other interface files for modifications. Limited resources, no longer supporting more interfaces, please debug on your own.<br />You can use a similar website to check the JSON file format: https://www.google.com/search?q=JSON+Parser+Online<br />Please use the 「Save」 button in the text box.');
		o.depends('jsonpath', '/usr/share/wechatpush/api/diy.json');
		

		o = s.taboption('basic', form.Button, '_test', _('Send Test'), _('You may need to save the configuration before sending.'));
		o.inputstyle = 'add';
		o.onclick = function () {
			var _this = this;
			return fs.exec(programPath, ['test']).then(function (res) {
				if (res.code === 0)
					_this.description = _('Message sent successfully. If you don\'t receive the message, please check the logs for manual processing.');
				else if (res.code === 1)
					_this.description = _('Sending failed');

				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [_('Unknown error: %s.').format(err)]));
				_this.description = _('Sending failed');
				return _this.map.reset();
			});
		}

		o = s.taboption('basic', form.Value, 'device_name', _('Device Name'));
		o.description = _('The device name will be displayed in the push message title to identify the source device of the message.');

		o = s.taboption('basic', form.Value, 'sleeptime', _('Check Interval (s)'));
		o.rmempty = false;
		o.placeholder = '60';
		o.datatype = 'and(uinteger,min(10))';
		o.description = _('Shorter intervals provide quicker response but consume more system resources.');

		o = s.taboption('basic', cbiRichListValue, 'oui_data', _('MAC Device Database'));
		o.value('', _('Close'),
			_('Do not use MAC device database'));
		o.value('1', _('Simplified Version'),
			_('Includes common device manufacturers, occupies approximately 200Kb of space'));
		o.value('2', _('Full Version'),
			_('Download the complete database, processed size is approximately 1.3Mb'));
		o.value('3', _('Network Query'),
			_('Enables network query, slower response. Only use if space is limited.'));

		o = s.taboption('basic', form.Button, '_update_oui', _('Update MAC Device Database'));
		o.inputstyle = 'add';
		o.onclick = function () {
			var _this = this;
			return fs.exec('/usr/libexec/wechatpush-call', ['down_oui']).then(function (res) {
				if (res.code === 2) {
					_this.description = _('Database is up to date, skipping update');
				}
				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [_('Unknown error: %s.').format(err)]));
				_this.description = _('Browser timeout or unknown error. If the log shows that the update process has been established, please ignore this error: %s.');
				return _this.map.reset();
			});
		};
		o.depends('oui_data', '1');
		o.depends('oui_data', '2');

		o = s.taboption('basic', form.Flag, 'reset_regularly', _('Reset Traffic Data Every Day at Midnight'));

		o = s.taboption('basic', form.Flag, 'debuglevel', _('Enable Logging'));

		o = s.taboption('basic', form.TextValue, '_device_aliases', _('Device Alias'));
		o.rows = 20;
		o.wrap = 'oft';
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/usr/share/wechatpush/api/device_aliases.list');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/usr/share/wechatpush/api/device_aliases.list', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};
		o.description = _('Please enter the device MAC and device alias separated by a space, such as:<br/> XX:XX:XX:XX:XX:XX My Phone<br/> 192.168.1.2 My PC<br />Please use the 「Save」 button in the text box.');

		// 推送内容
		o = s.taboption('content', cbiRichListValue, 'get_ipv4_mode', _('IPv4 Dynamic Notification'));
		o.value('', _('Close'),
			_(' '));
		o.value('1', _('Obtain through interface'),
			_(' '));
		o.value('2', _('Obtain through URL'),
			_('May fail due to server stability and frequent connections.<br/>If the interface can obtain the IP address properly, it is not recommended to use this method.'));

		o = s.taboption('content', widgets.DeviceSelect, 'ipv4_interface', _("Device"));
		o.description = _('Typically, it should be WAN or br-lan interface. For multi-wan environments, please choose accordingly.');
		o.modalonly = true;
		o.multiple = false;
		o.default = 'WAN';
		o.depends('get_ipv4_mode', '1');

		o = s.taboption('content', form.TextValue, 'ipv4_list', _('IPv4 API List'));
		o.depends('get_ipv4_mode', '2');
		o.optional = false;
		o.rows = 8;
		o.wrap = 'oft';
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/usr/share/wechatpush/api/ipv4.list');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/usr/share/wechatpush/api/ipv4.list', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};
		o.description = _('Access a random address from the list above,URLs in the list are specific to Chinese websites. If you need to use this feature, please replace the URLs with the ones available to you.<br/>Please use the 「Save」 button in the text box.');

		o = s.taboption('content', form.Button, '_update_ipv4_list', _('Update IPv4 list'));
		o.inputstyle = 'add';
		o.onclick = function () {
			var _this = this;
			return fs.exec('/usr/libexec/wechatpush-call', ['update_ip_list', 'ipv4']).then(function (res) {
				if (res.code === 0)
					_this.description = _('Update successful');
				else if (res.code === 1)
					_this.description = _('Update failed');
				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [_('Unknown error: %s.').format(err)]));
				_this.description = _('Update failed');
				return _this.map.reset();
			});
		}
		o.depends('get_ipv4_mode', '2');

		o = s.taboption('content', cbiRichListValue, 'get_ipv6_mode', _('IPv6 Dynamic Notification'));
		o.value('', _('Close'),
			_(' '));
		o.value('1', _('Obtain through interface'),
			_(' '));
		o.value('2', _('Obtain through URL'),
			_('May fail due to server stability and frequent connections.<br/>If the interface can obtain the IP address properly, it is not recommended to use this method.'));

		o = s.taboption('content', widgets.DeviceSelect, 'ipv6_interface', _("Device"));
		o.description = _('Typically, it should be WAN or br-lan interface. For multi-wan environments, please choose accordingly.');
		o.modalonly = true;
		o.multiple = false;
		o.default = 'WAN';
		o.depends('get_ipv6_mode', '1');

		o = s.taboption('content', form.TextValue, 'ipv6_list', _('IPv6 API List'));
		o.depends('get_ipv6_mode', '2')
		o.optional = false;
		o.rows = 8;
		o.wrap = 'oft';
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/usr/share/wechatpush/api/ipv6.list');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/usr/share/wechatpush/api/ipv6.list', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};
		o.description = _('Access a random address from the list above,URLs in the list are specific to Chinese websites. If you need to use this feature, please replace the URLs with the ones available to you.<br/>Please use the 「Save」 button in the text box.');

		o = s.taboption('content', form.Button, '_update_ipv6_list', _('Update IPv6 list'));
		o.inputstyle = 'add';
		o.onclick = function () {
			var _this = this;
			return fs.exec('/usr/libexec/wechatpush-call', ['update_ip_list', 'ipv6']).then(function (res) {
				if (res.code === 0)
					_this.description = _('Update successful');
				else if (res.code === 1)
					_this.description = _('Update failed');
				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [_('Unknown error: %s.').format(err)]));
				_this.description = _('Update failed');
				return _this.map.reset();
			});
		}
		o.depends('get_ipv6_mode', '2');
		
		o = s.taboption('content', form.Flag, 'auto_update_ip_list', _('Automatically update API list'));
		o.description = _('When multiple IP retrieval attempts fail, try to automatically update the list file from GitHub');
		o.depends('get_ipv4_mode', '2');
		o.depends('get_ipv6_mode', '2');
		
		o = s.taboption('content', form.MultiValue, 'device_notification', _('Device Online/Offline Notification'));
		o.value('online', _('Online Notification'));
		o.value('offline', _('Offline Notification'));
		o.modalonly = true;
		
		o = s.taboption('content', form.MultiValue, 'cpu_notification', _('CPU Alert'));
		o.value('load', _('Load Alert'));
		o.value('temp', _('Temperature Alert'));
		o.modalonly = true;
		o.description = _('Device alert will be triggered only if it exceeds the set value continuously for five minutes, and there won\'t be a second reminder within an hour.');

		o = s.taboption('content', form.Value, 'cpu_load_threshold', _('Load alert threshold'));
		o.rmempty = false;
		o.placeholder = '2';
		o.depends({ cpu_notification: "load", '!contains': true });
		o.validate = function (section_id, value) {
			var floatValue = parseFloat(value);
			if (!isNaN(floatValue) && floatValue.toString() === value) {
				return true;
			}
			return 'Please enter a numeric value only';
		};

		o = s.taboption('content', form.Value, 'temperature_threshold', _('Temperature alert threshold'));
		o.rmempty = false;
		o.placeholder = '80';
		o.datatype = 'and(uinteger,min(1))';
		o.depends({ cpu_notification: "temp", '!contains': true });
		o.description = _('Please confirm that the device can retrieve temperature. If you need to modify the command, please go to advanced settings.');

		o = s.taboption('content', form.MultiValue, 'login_notification', _('Login Notification'));
		o.value('web_logged', _('Web Login'));
		o.value('ssh_logged', _('SSH Login'));
		o.value('web_login_failed', _('Frequent Web Login Errors'));
		o.value('ssh_login_failed', _('Frequent SSH Login Errors'));
		o.modalonly = true;

		o = s.taboption('content', form.Value, 'login_max_num', _('Login failure count'));
		o.default = '3';
		o.rmempty = false;
		o.datatype = 'and(uinteger,min(1))';
		o.depends({ login_notification: "web_login_failed", '!contains': true });
		o.depends({ login_notification: "ssh_login_failed", '!contains': true });
		o.description = _('Send notification after exceeding the count, and optionally auto-ban IP');

		o = s.taboption('content', form.Flag, 'client_usage', _('Device abnormal traffic alert'));
		o.description = _('Please ensure that you can retrieve device traffic information correctly, otherwise this feature will not work properly');
		o.default = '0';

		o = s.taboption('content', form.Value, 'client_usage_max', _('Per-minute traffic limit'));
		o.placeholder = '10M';
		o.rmempty = false;
		o.depends('client_usage', '1');
		o.description = _('Abnormal traffic alert (byte), you can append K or M');

		o = s.taboption('content', form.Flag, 'client_usage_disturb', _('Abnormal traffic do not disturb'));
		o.default = '0';
		o.depends('client_usage', '1');

		o = fwtool.addMACOption(s, 'content', 'client_usage_whitelist', _('Abnormal traffic monitoring list'),
			_('Please select device MAC'), hosts);
		o.rmempty = true;
		o.datatype = 'list(neg(macaddr))';
		o.depends('client_usage_disturb', '1');

		// 自动封禁
		o = s.taboption('ipset', form.Flag, 'login_web_black', _('Auto-ban unauthorized login devices'));
		o.default = '0';
		o.depends({ login_notification: "web_login_failed", '!contains': true });
		o.depends({ login_notification: "ssh_login_failed", '!contains': true });

		o = s.taboption('ipset', form.Value, 'login_ip_black_timeout', _('Blacklisting time (s)'));
		o.default = '86400';
		o.rmempty = false;
		o.datatype = 'and(uinteger,min(0))';
		o.depends('login_web_black', '1');
		o.description = _('\"0\" in ipset means permanent blacklist, use with caution. If misconfigured, change the device IP and clear rules in LUCI.');

		o = s.taboption('ipset', form.Flag, 'port_knocking_enable', _('Port knocking'));
		o.default = '0';
		o.description = _('If you have disabled LAN port inbound and forwarding in Firewall - Zone Settings, it won\'t work.');
		o.depends({ login_notification: "web_login_failed", '!contains': true });
		o.depends({ login_notification: "ssh_login_failed", '!contains': true });

		o = s.taboption('ipset', form.Value, 'login_port_white', _('Port'));
		o.default = '';
		o.description = _('Open port after successful login<br/>example：\"22\"、\"21:25\"、\"21:25,135:139\"');
		o.depends('port_knocking_enable', '1');

		o = s.taboption('ipset', form.DynamicList, 'login_port_forward_list', _('Port Forwards'));
		o.default = '';
		o.description = _('Example: Forward port 13389 of this device (IPv4:10.0.0.1 / IPv6:fe80::10:0:0:2) to port 3389 of (IPv4:10.0.0.2 / IPv6:fe80::10:0:0:8)<br/>\"10.0.0.1,13389,10.0.0.2,3389\"<br/>\"fe80::10:0:0:1,13389,fe80::10:0:0:2,3389\"');
		o.depends('port_knocking_enable', '1');

		o = s.taboption('ipset', form.Value, 'login_ip_white_timeout', _('Release time (s)'));
		o.default = '86400';
		o.datatype = 'and(uinteger,min(0))';
		o.description = _('\"0\" in ipset means permanent release, use with caution');
		o.depends('port_knocking_enable', '1');

		o = s.taboption('ipset', form.TextValue, 'ip_black_list', _('IP blacklist'));
		o.rows = 8;
		o.wrap = 'soft';
		o.cfgvalue = function (section_id) {
			return fs.trimmed('/usr/share/wechatpush/api/ip_blacklist');
		};
		o.write = function (section_id, formvalue) {
			return this.cfgvalue(section_id).then(function (value) {
				if (value == formvalue) {
					return
				}
				return fs.write('/usr/share/wechatpush/api/ip_blacklist', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
			});
		};
		o.depends('login_web_black', '1');
		o.description = _('You can add or delete here, the numbers after represent the remaining time. When adding, only the IP needs to be entered.<br/>When clearing, please leave a blank line, otherwise it cannot be saved ╮(╯_╰)╭<br/>Please use the 「Save」 button in the text box.');

		// 定时推送
		o = s.taboption('crontab', cbiRichListValue, 'crontab_mode', _('Scheduled Tasks'));
		o.value('', _('Close'),
			_(' '));
		o.value('1', _('Scheduled sending'),
			_('Send at the same time every day'));
		o.value('2', _('Interval sending'),
			_('Starting from 00:00, send every * hours'));

		o = s.taboption('crontab', form.MultiValue, 'crontab_regular_time', _('Sending time'));
		for (var t = 0; t <= 23; t++) {
			o.value(t, _('Every day') + t + _('clock'));
		}
		o.modalonly = true;
		o.depends("crontab_mode", "1");

		o = s.taboption('crontab', form.ListValue, 'crontab_interval_time', _('Interval sending'));
		o.default = "6"
		for (var t = 0; t <= 12; t++) {
			o.value(t, _("") + t + _("Hour"));
		}
		o.default = '';
		o.datatype = "uinteger";
		o.depends('crontab_mode', '2');
		o.description = _('Starting from 00:00, send every * hours');

		o = s.taboption('crontab', form.Value, 'send_title', _('Push title'));
		o.depends('crontab_mode', '1');
		o.depends('crontab_mode', '2');
		o.placeholder = _('OpenWrt Router Status:');
		o.description = _('Using special characters may cause sending failure');

		o = s.taboption('crontab', form.MultiValue, 'send_notification', _('Push content'));
		o.value('router_status', _('System running status'));
		o.value('router_temp', _('Device temperature'));
		o.value('wan_info', _('WAN info'));
		o.value('client_list', _('Client list'));
		o.modalonly = true;
		o.depends('crontab_mode', '1');
		o.depends('crontab_mode', '2');

		o = s.taboption('crontab', form.Button, '_send', _('Manual sending'), _('You may need to save the configuration before sending.<br/>Due to browser timeout limitations, if the program is not running, it may exit due to timeout during device list initialization'));
		o.inputstyle = 'add';
		o.onclick = function () {
			var _this = this;
			return fs.exec(programPath, ['send']).then(function (res) {
				if (res.code === 0)
					_this.description = _('Message sent successfully. If you don\'t receive the message, please check the logs for manual processing.');
				else if (res.code === 1)
					_this.description = _('Sending failed');

				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [_('Unknown error: %s.').format(err)]));
				_this.description = _('Sending failed');
				return _this.map.reset();
			});
		}

		// 免打扰
		o = s.taboption('disturb', form.MultiValue, 'lite_enable', _('Simplified mode'));
		o.value('device', _('Simplify the current device list'));
		o.value('nowtime', _('Simplify the current time'));
		o.value('content', _('Push only the title'));
		
		o = s.taboption('disturb', cbiRichListValue, 'do_not_disturb_mode', _('Do Not Disturb time setting'));
		o.value('', _('Close'),
			_(' '));
		o.value('1', _('Mode 1: Script Suspension'),
			_('Suspend all script actions, including unattended tasks, until the end of the time period'));
		o.value('2', _('Mode 2: Silent Mode'),
			_('Stop sending notifications, but log normally'));

		o = s.taboption('disturb', form.ListValue, 'do_not_disturb_starttime', _('Do Not Disturb start time'));
		for (var t = 0; t <= 23; t++) {
			o.value(t, _('Every day') + t + _('clock'));
		}
		o.default = '0';
		o.datatype = "uinteger"
		o.depends('do_not_disturb_mode', '1');
		o.depends('do_not_disturb_mode', '2');

		o = s.taboption('disturb', form.ListValue, 'do_not_disturb_endtime', _('Do Not Disturb end time'));
		for (var t = 0; t <= 23; t++) {
			o.value(t, _('Every day') + t + _('clock'));
		}
		o.default = 8
		o.datatype = "uinteger"
		o.depends('do_not_disturb_mode', '1');
		o.depends('do_not_disturb_mode', '2');

		o = s.taboption('disturb', cbiRichListValue, 'mac_filtering_mode_1', _('MAC Filtering Mode 1'));
		o.value('', _('Close'),
			_(' '));
		o.value('allow', _('Ignore devices in the list'),
			_('Ignored devices will not receive notifications or be logged'));
		o.value('block', _('Notify only devices in the list'),
			_('Ignored devices will not receive notifications or be logged'));
		o.value('interface', _('Notify only devices using this interface'),
			_('Multiple selections are not supported at the moment'));

		o = fwtool.addMACOption(s, 'disturb', 'up_down_push_whitelist', _('Ignored device list'),
			_('Please select device MAC'), hosts);
		o.datatype = 'list(neg(macaddr))';
		o.depends('mac_filtering_mode_1', 'allow');

		o = fwtool.addMACOption(s, 'disturb', 'up_down_push_blacklist', _('Followed device list'),
			_('Please select device MAC'), hosts);
		o.datatype = 'list(neg(macaddr))';
		o.depends('mac_filtering_mode_1', 'block');
		o.description = _('AA:AA:AA:AA:AA:AA\\|BB:BB:BB:BB:BB:BB Multiple MAC addresses can be treated as the same user.<br/>Notifications will not be sent once any device is online, and notifications will only be sent when all devices are offline to avoid frequent notifications in dual Wi-Fi scenarios.'); // 有点问题，待修复

		o = s.taboption('disturb', widgets.DeviceSelect, 'up_down_push_interface', _("Device"));
		o.description = _('Notify only devices using this interface');
		o.modalonly = true;
		o.multiple = false;
		o.depends('mac_filtering_mode_1', 'interface');

		o = s.taboption('disturb', cbiRichListValue, 'mac_filtering_mode_2', _('MAC Filtering Mode 2'));
		o.value('', _('Close'),
			_(' '));
		o.value('mac_online', _('Do Not Disturb when devices are online'),
			_('No notifications will be sent when any device in the list is online'));
		o.value('mac_offline', _('Do Not Disturb when devices are offline'),
			_('No notifications will be sent when any device in the list is offline'));

		o = fwtool.addMACOption(s, 'disturb', 'mac_online_list', _('Do Not Disturb device online list'),
			_('Please select device MAC'), hosts);
		o.datatype = 'list(neg(macaddr))';
		o.depends('mac_filtering_mode_2', 'mac_online');

		o = fwtool.addMACOption(s, 'disturb', 'mac_offline_list', _('Do Not Disturb device offline list'),
			_('Please select device MAC'), hosts);
		o.datatype = 'list(neg(macaddr))';
		o.depends('mac_filtering_mode_2', 'mac_offline');

		o = s.taboption('disturb', cbiRichListValue, 'login_disturb', _('Do Not Disturb for Login Reminders'));
		o.value('', _('Close'),
			_(' '));
		o.value('1', _('Only record in the log'),
			_('Ignore all login reminders and only record in the log'));
		o.value('2', _('Send notification only on the first login'),
			_('Send notification only once within the specified time interval'));

		o = s.taboption('disturb', form.Value, 'login_notification_delay', _('Login reminder do not disturb time (s)'));
		o.rmempty = false;
		o.placeholder = '3600';
		o.datatype = 'and(uinteger,min(10))';
		o.description = _('Send notification after the first login and do not repeat within the specified time<br/>Take a shortcut and read the login time from the log');
		o.depends('login_disturb', '2');

		o = fwtool.addIPOption(s, 'disturb', 'login_ip_white_list', _('Login reminder whitelist'), null, 'ipv4', hosts, true);
		o.datatype = 'ipaddr';
		o.depends({ login_notification: "web_logged", '!contains': true });
		o.depends({ login_notification: "ssh_logged", '!contains': true });
		o.depends({ login_notification: "web_login_failed", '!contains': true });
		o.depends({ login_notification: "ssh_login_failed", '!contains': true });
		o.description = _('Add the IP addresses in the list to the whitelist for the blocking function (if available), and ignore automatic blocking and login event notifications. Only record in the log. Mask notation is currently not supported.');

		o = s.taboption('disturb', form.Flag, 'login_log_enable', _('Login reminder log anti-flooding'));
		o.description = _('Users in the whitelist or during the undisturbed time period after their first login IP will be exempt from log recording, preventing log flooding.');
		o.depends('login_disturb', '1');
		o.depends('login_disturb', '2');

		return m.render();
	}
});
