/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022-2023 ImmortalWrt.org
 */

'use strict';
'require form';
'require fs';
'require network';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

var CBIStaticList = form.DynamicList.extend({
	__name__: 'CBI.StaticList',

	renderWidget: function(/* ... */) {
		var dl = form.DynamicList.prototype.renderWidget.apply(this, arguments);
		dl.querySelector('.add-item ul > li[data-value="-"]').remove();
		return dl;
	}
});

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('unblockneteasemusic'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['unblockneteasemusic']['instances']['unblockneteasemusic']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		renderHTML = spanTemp.format('green', _('UnblockNeteaseMusic'), _('运行中'));
	} else {
		renderHTML = spanTemp.format('red', _('UnblockNeteaseMusic'), _('未运行'));
	}

	return renderHTML;
}

function uploadCertificate(type, filename, ev) {
	return ui.uploadFile('/usr/share/unblockneteasemusic/' + filename, ev.target)
	.then(L.bind(function(btn, res) {
		btn.firstChild.data = _('检查 %s 中...').format(type);

		if (res.size <= 0) {
			ui.addNotification(null, E('p', _('上传的 %s 为空。').format(tyupe)));
			return fs.remove('/usr/share/unblockneteasemusic/' + filename);
		}

		ui.addNotification(null, E('p', _('您的 %s 已成功上传。大小：%sB。').format(type, res.size)));
	}, this, ev.target))
	.catch(function(e) { ui.addNotification(null, E('p', e.message)) })
	.finally(L.bind(function(btn, input) {
		btn.firstChild.data = _('上传...');
	}, this, ev.target));
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('unblockneteasemusic'),
			network.getHostHints()
		]);
	},

	render: function(data) {
		var m, s, o;

		m = new form.Map('unblockneteasemusic', _('解除网易云音乐播放限制'),
			_('原理：采用 [Bilibili/JOOX/酷狗/酷我/咪咕/pyncmd/QQ/Youtube] 等音源，替换网易云音乐 无版权/收费 歌曲链接<br/>' +
			'具体使用方法参见：<a href="https://github.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic" target="_blank">GitHub @UnblockNeteaseMusic/luci-app-unblockneteasemusic</a>'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('收集数据中...'))
			]);
		}

		s = m.section(form.NamedSection, 'config', 'unblockneteasemusic');

		o = s.option(form.Flag, 'enable', _('启用服务'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(CBIStaticList, 'music_source', _('音源接口'),
			_('留空以使用默认音源。'));
		o.value('bilibili', _('Bilibili 音乐'));
		o.value('joox', _('JOOX 音乐'));
		o.value('kugou', _('酷狗音乐'));
		o.value('kuwo', _('酷我音乐'));
		o.value('migu', _('咪咕音乐'));
		o.value('pyncmd', _('网易云音乐（pyncmd）'));
		o.value('qq', _('QQ 音乐'));
		o.value('youtube', _('Youtube 音乐'));
		o.value('youtubedl', _('Youtube 音乐（youtube-dl）'));
		o.value('ytdlp', _('Youtube 音乐（yt-dlp）'));
		o.value('ytdownload', _('Youtube 音乐（ytdownload）'));

		o = s.option(form.Value, 'joox_cookie', _('JOOX Cookie'),
			_('在 joox.com 获取，需要 wmid 和 session_key 值。'));
		o.placeholder = 'wmid=; session_key=';
		o.rmempty = false;
		o.depends({'music_source': 'joox', '!contains': true});

		o = s.option(form.Value, 'migu_cookie', _('Migu Cookie'),
			_('通过抓包手机客户端请求获取，需要 aversionid 值。'));
		o.depends({'music_source': 'migu', '!contains': true});

		o = s.option(form.Value, 'qq_cookie', _('QQ Cookie'),
			_('在 y.qq.com 获取，需要 uin 和 qm_keyst 值。'));
		o.placeholder = 'uin=; qm_keyst=';
		o.rmempty = false;
		o.depends({'music_source': 'qq', '!contains': true});

		o = s.option(form.Value, 'youtube_key', _('Youtube API Key'),
			_('API Key 申请地址：https://developers.google.com/youtube/v3/getting-started#before-you-start'));
		o.depends({'music_source': 'youtube', '!contains': true});

		o = s.option(form.Flag, 'follow_source_order', _('顺序查询'),
			_('默认为并行查询并返回第一个结果，开启后将严格按照配置音源的顺序进行查询。'))
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'search_album', _('附加专辑名'),
			_('在其他音源搜索歌曲时携带专辑名称（默认搜索条件 <code>歌曲名 - 歌手</code>，启用后搜索条件 <code>歌曲名 - 歌手 专辑名</code>）。'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'local_vip', _('启用本地 VIP'),
			_('启用后，可以使用去广告、个性换肤、鲸云音效等本地功能。'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'enable_flac', _('启用无损音质'),
			_('目前仅支持酷狗、酷我、咪咕、pyncmd、QQ 音源。'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'disable_upgrade_check', _('禁用更新检查'),
			_('禁止客户端检查更新，全平台支持。'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'replace_music_source', _('音源替换'),
			_('当音乐音质低于指定数值时，尝试强制使用其他平台的高音质版本进行替换。'));
		o.value('dont_replace', _('不强制替换音乐音源'));
		o.value('lower_than_192kbps', _('当音质低于 192 Kbps（中）时'));
		o.value('lower_than_320kbps', _('当音质低于 320 Kbps（高）时'));
		o.value('lower_than_999kbps', _('当音质低于 999 Kbps（无损）时'));
		o.value('replace_all', _('替换所有音乐音源'));
		o.default = 'dont_replace';
		o.rmempty = false;

		o = s.option(form.Flag, 'auto_update', _('启用自动更新'),
			_('启用后，每天将定时自动检查最新版本并更新。'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'update_time', '检查更新时间',
			_('设定每天自动检查更新时间。'));
		for (var i = 0; i < 24; i++)
			o.value(i, i + ':00');
		o.default = '3';
		o.depends('auto_update', '1');

		o = s.option(form.Button, '_download_cert', _('CA 根证书'),
			_('Linux / iOS / MacOSX 在信任根证书后方可正常使用。'));
		o.inputstyle = 'apply';
		o.inputtitle = _('下载 ca.crt');
		o.onclick = function() {
			return fs.read_direct('/usr/share/unblockneteasemusic/core/ca.crt', 'blob').then(function(blob) {
				var url = window.URL.createObjectURL(blob);
				var link = E('a', { 'style': 'display:none', 'href': url, 'download': 'ca.crt' });

				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.URL.revokeObjectURL(url);
			}).catch(function(err) {
				ui.addNotification(null, E('p', [ _('下载文件失败：%s。').format(err.message) ]));
			});
		}

		o = s.option(form.Flag, 'advanced_mode', _('启用进阶设置'),
			_('非必要不推荐使用。'));
		o.default = o.disabled,
		o.rmempty = false;

		o = s.option(form.ListValue, 'log_level', _('日志等级'));
		o.value('debug', _('调试'));
		o.value('info', _('信息（默认）'));
		o.value('silent', _('静默'));
		o.default = 'info';
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'http_port', _('HTTP 监听端口'));
		o.datatype = 'port';
		o.default = '5200';
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'https_port', _('HTTPS 监听端口'));
		o.datatype = 'port';
		o.default = '5201';
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'endpoint_url', _('EndPoint'),
			_('音源地址反代（包装）。'));
		o.default = 'https://music.163.com';
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'cnrelay', _('UNM Bridge 服务器'),
			_('使用 UnblockNeteaseMusic 中继桥（bridge）以获取音源信息。'));
		o.placeholder = 'http(s)://host:port'
		o.depends('advanced_mode', '1');

		o = s.option(form.ListValue, 'hijack_ways', _('劫持方法'));
		o.value('dont_hijack', _('不开启劫持'));
		o.value('use_ipset', _('使用 IPSet 劫持'));
		o.value('use_hosts', _('使用 Hosts 劫持'));
		o.default = 'dont_hijack';
		o.rmempty = false;
		o.depends('advanced_mode', '1');
		o.onchange = function(ev, section_id, value) {
			if (!section_id || !value)
				return null;

			var ele_http_port = this.map.findElement('id', 'widget.cbid.unblockneteasemusic.%s.http_port'.format(section_id));
			var ele_https_port = this.map.findElement('id', 'widget.cbid.unblockneteasemusic.%s.https_port'.format(section_id));

			if (value === 'use_hosts') {
				ele_http_port.value = '80';
				ele_http_port.disabled = true;

				ele_https_port.value = '443';
				ele_https_port.disabled = true;
			} else if (ele_http_port.disabled || ele_https_port.disabled) {
				L.resolveDefault(this.map.data.loaded.unblockneteasemusic).then((res) => {
					ele_http_port.disabled = null;
					ele_http_port.value = res.config.http_port || '5200';

					ele_https_port.disabled = null;
					ele_https_port.value = res.config.https_port || '5201';
				});
			}
		}

		o = s.option(form.Flag, 'keep_core_when_upgrade', _('升级时保留核心程序'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Flag, 'pub_access', _('部署到公网'),
			_('默认仅放行局域网请求，如需提供公开访问请勾选此选项。'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Flag, 'strict_mode', _('启用严格模式'),
			_('若将服务部署到公网，则强烈建议使用严格模式，此模式下仅放行网易云音乐所属域名的请求。<br/>注意：该模式下不能使用全局代理。'));
		o.default = o.disabled;
		o.rmempty = false;
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'netease_server_ip', _('网易云服务器 IP'));
		o.datatype = 'ipaddr';
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'proxy_server_ip', _('代理服务器地址'),
			_('使用代理服务器获取音乐信息。'));
		o.placeholder = 'http(s)://host:port';
		o.depends('advanced_mode', '1');

		o = s.option(form.Value, 'self_issue_cert_crt', _('自签发证书公钥位置'));
		o.value('/usr/share/unblockneteasemusic/core/server.crt', _('内置公钥'));
		o.value('/usr/share/unblockneteasemusic/server.crt');
		o.default = '/usr/share/unblockneteasemusic/core/server.crt';
		o.datatype = 'file';
		o.depends('advanced_mode', '1');

		o = s.option(form.Button, '_upload_cert', _('上传公钥'));
		o.inputstyle = 'action';
		o.inputtitle = _('上传...');
		o.depends('self_issue_cert_crt', '/usr/share/unblockneteasemusic/server.crt');
		o.onclick = L.bind(uploadCertificate, this, _('公钥'), 'server.crt');
		o.modalonly = true;

		o = s.option(form.Value, 'self_issue_cert_key', _('自签发证书私钥位置'));
		o.value('/usr/share/unblockneteasemusic/core/server.key', _('内置私钥'));
		o.value('/usr/share/unblockneteasemusic/server.key');
		o.default = '/usr/share/unblockneteasemusic/core/server.key';
		o.datatype = 'file'
		o.depends('advanced_mode', '1');

		o = s.option(form.Button, '_upload_key', _('上传私钥'));
		o.inputstyle = 'action';
		o.inputtitle = _('上传...');
		o.depends('self_issue_cert_key', '/usr/share/unblockneteasemusic/server.key');
		o.onclick = L.bind(uploadCertificate, this, _('私钥'), 'server.key');
		o.modalonly = true;

		s = m.section(form.TableSection, 'acl_rule', _('例外客户端规则'),
			_('可以为局域网客户端分别设置不同的例外模式。'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;

		o = s.option(form.Flag, 'enable', _('启用'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'ip_addr', _('IP 地址'));
		o.datatype = 'ip4addr';
		for (var i of Object.entries(data[1].hosts))
			for (var v in i[1].ipaddrs)
				if (i[1].ipaddrs[v]) {
					var ip_addr = i[1].ipaddrs[v], ip_host = i[1].name;
					o.value(ip_addr, ip_host ? String.format('%s (%s)', ip_host, ip_addr) : ip_addr)
				}
		o.rmempty = false;

		o = s.option(form.ListValue, 'filter_mode', _('规则'));
		o.value('disable_all', _('不代理 HTTP 和 HTTPS'));
		o.value('disable_http', _('不代理 HTTP'));
		o.value('disable_https', _('不代理 HTTPS'));
		o.default = 'disable_all';
		o.rmempty = false;

		return m.render();
	}
});
