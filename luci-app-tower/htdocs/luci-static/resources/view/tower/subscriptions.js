'use strict';
'require view';
'require ui';
'require tower';

const css = '\
.tower-page{--tower-line:rgba(128,128,128,.2);--tower-muted:rgba(128,128,128,.78);--tower-surface:rgba(128,128,128,.055);width:100%;max-width:none;margin:0;box-sizing:border-box}\
.tower-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:4px 0 20px}\
.tower-heading h2{margin:0;padding:0;background:transparent;border:0;box-shadow:none!important;color:inherit;font-size:26px;font-weight:650;letter-spacing:-.4px}\
.tower-subtitle{margin:4px 0 0;color:var(--tower-muted);font-size:13px}\
.tower-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--tower-line);border-radius:12px;background:var(--tower-surface);margin-bottom:24px;overflow:hidden}\
.tower-stat{padding:14px 18px;min-width:0}\
.tower-stat+.tower-stat{border-left:1px solid var(--tower-line)}\
.tower-stat-link{display:block;color:inherit;text-decoration:none;transition:background .16s ease}\
.tower-stat-link:hover,.tower-stat-link:focus{background:rgba(128,128,128,.12);color:inherit;text-decoration:none}\
.tower-stat-label{display:block;color:var(--tower-muted);font-size:12px;margin-bottom:5px}\
.tower-stat-value{font-size:22px;font-weight:650;line-height:1.1}\
.tower-section{margin:0 0 24px}\
.tower-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 10px}\
.tower-section-head h3{flex:1;min-width:0;margin:0;padding:0;background:transparent;border:0;color:inherit;font-size:17px;font-weight:620}\
.tower-section-note{flex-shrink:0;white-space:nowrap;color:var(--tower-muted);font-size:12px}\
.tower-source-card,.tower-owned-card{border:1px solid var(--tower-line);border-radius:12px;padding:16px 18px;margin-bottom:10px;background:var(--tower-surface)}\
.tower-source-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}\
.tower-source-main{min-width:0;flex:1}\
.tower-source-identity{display:flex;align-items:center;gap:11px;min-width:0}\
.tower-airport-icon{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:11px;background:rgba(52,152,219,.15);color:#3498db;font-size:20px}\
.tower-airport-copy{min-width:0}\
.tower-source-name{font-size:16px;font-weight:620;overflow-wrap:anywhere}\
.tower-source-host{font-size:12px;color:var(--tower-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-source-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}\
.tower-pill{display:inline-flex;align-items:center;min-height:23px;padding:2px 9px;border:1px solid var(--tower-line);border-radius:999px;background:rgba(128,128,128,.08);font-size:11.5px;line-height:1.3}\
.tower-pill-ok{color:#299b62}.tower-pill-err{color:#d66565}\
.tower-source-actions{display:flex;gap:6px;flex-shrink:0;align-items:center}\
.tower-usage{margin-top:15px}.tower-usage-label{display:flex;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:6px}\
.tower-usage-track{height:5px;border-radius:99px;background:rgba(128,128,128,.25);overflow:hidden}.tower-usage-fill{height:100%;background:#36bd69;border-radius:inherit}\
.tower-source-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:13px;color:var(--tower-muted);font-size:12px}\
.tower-owned-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}\
.tower-owned-card{display:flex;align-items:center;gap:12px;margin:0;min-width:0}\
.tower-node-mark{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:10px;background:rgba(66,153,225,.13);color:#4299e1;font-size:17px;font-weight:650}\
.tower-owned-info{min-width:0;flex:1}.tower-owned-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-owned-endpoint{font-size:11.5px;color:var(--tower-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-owned-actions{display:flex;align-items:center;gap:8px}.tower-owned-actions .btn,.tower-source-actions .btn{white-space:nowrap}\
.tower-node-menu{position:relative;flex-shrink:0}.tower-node-menu summary{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--tower-line);border-radius:8px;cursor:pointer;list-style:none;color:var(--tower-muted);font-size:18px;line-height:1}.tower-node-menu summary::-webkit-details-marker{display:none}.tower-node-menu-list{position:absolute;right:0;top:calc(100% + 5px);z-index:20;display:grid;min-width:112px;padding:5px;border:1px solid var(--tower-line);border-radius:9px;background:var(--tower-menu-bg)!important;color:var(--tower-menu-color)!important;box-shadow:0 8px 22px rgba(0,0,0,.2)}.tower-node-menu-list button{padding:7px 10px;border:0!important;background:transparent!important;box-shadow:none!important;text-align:left;color:inherit!important}.tower-node-menu-list button:hover{background:rgba(128,128,128,.18)!important}.tower-node-menu-list .tower-node-delete{color:#d66565!important}\
.tower-action-status{min-height:0;margin-top:8px;font-size:12px;color:#299b62}.tower-action-status:empty{display:none}.tower-action-status-error{color:#d66565}\
.tower-node-editor{max-height:72vh;overflow:auto}.tower-node-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tower-node-field{display:flex;flex-direction:column;gap:5px;min-width:0}.tower-node-field label{font-size:12px;color:var(--tower-muted)}.tower-node-field input:not([type=checkbox]){width:100%;min-height:36px;box-sizing:border-box;border:1px solid var(--tower-line);border-radius:7px;background:rgba(128,128,128,.06);color:inherit;padding:7px 9px}.tower-node-field-check{flex-direction:row;align-items:center}.tower-node-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}\
.tower-disclosure{border:1px solid var(--tower-line);border-radius:10px;margin:0 0 12px;background:var(--tower-surface);overflow:hidden}\
.tower-disclosure summary{padding:12px 15px;cursor:pointer;font-weight:600;list-style:none}.tower-disclosure summary::-webkit-details-marker{display:none}\
.tower-disclosure summary:after{content:"＋";float:right;color:var(--tower-muted)}.tower-disclosure[open] summary:after{content:"－"}\
.tower-disclosure-body{padding:0 15px 15px;border-top:1px solid var(--tower-line)}\
.tower-add{display:flex;gap:10px;align-items:flex-end;margin:13px 0 4px;flex-wrap:wrap}\
.tower-field{display:flex;flex-direction:column;gap:5px;flex:1;min-width:170px}.tower-field label{font-size:12px;color:var(--tower-muted)}\
.tower-paste{width:100%;min-height:120px;box-sizing:border-box;border:1px solid var(--tower-line);border-radius:7px;background:transparent;color:inherit;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px;resize:vertical;margin-top:12px}\
.tower-empty{display:flex;align-items:center;justify-content:center;min-height:66px;padding:16px;text-align:center;border:1px dashed var(--tower-line);border-radius:10px;color:var(--tower-muted);font-size:13px}\
@media(max-width:700px){.tower-heading{align-items:flex-start;flex-direction:column;margin-bottom:15px}.tower-heading h2{font-size:23px}.tower-stats{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:19px}.tower-stat{padding:11px 9px}.tower-stat-value{font-size:19px}.tower-source-card{padding:14px}.tower-source-top{flex-direction:column;gap:12px}.tower-source-actions{width:100%;justify-content:flex-end}.tower-source-actions .btn{flex:1}.tower-source-foot{align-items:flex-start;flex-direction:column}.tower-owned-grid{grid-template-columns:minmax(0,1fr)}.tower-add .tower-field{min-width:100%}.tower-add>.btn{width:100%}.tower-node-fields{grid-template-columns:minmax(0,1fr)}.tower-node-editor{max-height:65vh}}\
';

function formatBytes(value) {
	var n = Number(value || 0);
	if (n < 1024) return n + ' B';
	var units = [ 'KB', 'MB', 'GB', 'TB' ], i = -1;
	do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
	return n.toFixed(n >= 100 ? 0 : 1) + ' ' + units[i];
}

function hostOf(url) {
	try { return new URL(url).host; }
	catch (e) { return _('订阅来源'); }
}

function displayName(sub) {
	var name = String(sub.name || '').trim();
	if (/^https?:\/\//i.test(name)) return hostOf(name);
	return name || hostOf(sub.url);
}

function updatedAt(value) {
	if (!value) return _('尚未更新');
	var date = new Date(value);
	return isNaN(date.getTime()) ? _('已更新') : _('更新于 %s').format(date.toLocaleString());
}

function expiryLabel(value) {
	var ms = new Date(value).getTime();
	if (!isFinite(ms)) return _('到期时间未知');
	var days = Math.ceil((ms - Date.now()) / 86400000);
	return days < 0 ? _('已到期') : _('还剩 %d 天').format(days);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(tower.rpcListSubs(), []),
			L.resolveDefault(tower.rpcListNodes(), [])
		]).then(function(res) {
			var subs = res[0], nodes = res[1], counts = {};
			nodes.forEach(function(n) {
				if (n.source_id) counts[n.source_id] = (counts[n.source_id] || 0) + 1;
			});
			subs.forEach(function(s) { s.node_count = counts[s.id] || 0; });
			return { subs: subs, nodes: nodes };
		});
	},

	render: function(data) {
		var subs = data.subs || [], nodes = data.nodes || [];
		var localNodes = nodes.filter(function(n) { return !n.source_id; });
		var totalNodes = nodes.length;
		var activeSubs = subs.filter(function(s) { return s.enabled !== false; }).length;
		var nameInput = E('input', { 'class': 'cbi-input-text', 'name': 'name', 'placeholder': _('如：MAYING_Clash'), 'required': 'required' });
		var urlInput = E('input', { 'class': 'cbi-input-text', 'name': 'url', 'placeholder': 'https://…' });
		var uaSelect = E('select', { 'class': 'cbi-input-select', 'name': 'user_agent' });

		tower.userAgents.forEach(function(u) { uaSelect.appendChild(E('option', { 'value': u.id }, [ u.name ])); });

		var addBtn = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': ui.createHandlerFn(this, function() {
				var url = urlInput.value.trim();
				if (!url) { ui.addNotification(null, E('p', [ _('订阅链接必填') ]), 'error'); return; }
				var name = nameInput.value.trim();
				if (!name) { nameInput.focus(); ui.addNotification(null, E('p', [ _('请填写机场或订阅名称') ]), 'error'); return; }
				return tower.rpcAddSub(name, url, uaSelect.value).then(function(sub) {
					if (!sub || !sub.id) return;
					return tower.rpcRefresh(sub.id).then(function(res) {
						var err = (res && res[0]) ? res[0].error : null;
						ui.addNotification(null, E('p', [ err || _('订阅已添加') ]), err ? 'error' : 'info');
						window.location.reload();
					});
				}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
			})
		}, [ _('添加并更新') ]);
		var pasteTextarea = E('textarea', { 'class': 'tower-paste', 'placeholder': _('粘贴 Clash YAML / Surge INI / Base64 或分享链接，自动识别并导入节点。') });
		var importBtn = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': ui.createHandlerFn(this, function() {
				var content = pasteTextarea.value.trim();
				if (!content) { ui.addNotification(null, E('p', [ _('请先粘贴配置内容。') ]), 'error'); return; }
				return tower.rpcImport(content).then(function(res) {
					if (res.error) ui.addNotification(null, E('p', [ res.error ]), 'error');
					else ui.addNotification(null, E('p', [ _('已导入 %d 个节点').format(res.imported || 0) ]), 'info');
					window.location.reload();
				}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
			})
		}, [ _('导入节点') ]);

		var sourceCards = subs.map(function(sub) {
			var actionStatus = E('div', { 'class': 'tower-action-status', 'role': 'status' });
			var flash = sessionStorage.getItem('tower-subscription-status');
			if (flash) {
				try {
					var saved = JSON.parse(flash);
					if (saved.id === sub.id) {
						actionStatus.textContent = saved.text;
						sessionStorage.removeItem('tower-subscription-status');
					}
				} catch (e) { sessionStorage.removeItem('tower-subscription-status'); }
			}
			function showStatus(message, error) {
				actionStatus.textContent = message;
				actionStatus.classList.toggle('tower-action-status-error', !!error);
			}
			var meta = [ E('span', { 'class': 'tower-pill' }, [ sub.node_count + ' ' + _('个节点') ]) ];
			meta.push(E('span', { 'class': 'tower-pill ' + (sub.enabled === false ? '' : 'tower-pill-ok') }, [ sub.enabled === false ? _('已停用') : _('已启用') ]));
			if (sub.last_error) meta.push(E('span', { 'class': 'tower-pill tower-pill-err' }, [ _('更新失败') ]));
			var actions = [
				E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, function() {
					return tower.copyText(sub.url).then(function() { showStatus(_('订阅链接已复制'), false); })
						.catch(function() { showStatus(_('复制失败'), true); });
				}) }, [ _('复制链接') ]),
				E('button', { 'class': 'btn cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, function() {
					showStatus(_('正在更新订阅…'), false);
					return tower.rpcRefresh(sub.id).then(function(res) {
						var err = (res && res[0]) ? res[0].error : null;
						if (err) { showStatus(err, true); return; }
						sessionStorage.setItem('tower-subscription-status', JSON.stringify({ id: sub.id, text: _('订阅更新完成') }));
						window.location.reload();
					}).catch(function(e) { showStatus(String(e), true); });
				}) }, [ _('更新') ]),
				E('button', { 'class': 'btn cbi-button cbi-button-reset', 'click': ui.createHandlerFn(this, function() {
					if (!confirm(_('删除此订阅及其节点？'))) return;
					return tower.rpcRemoveSub(sub.id).then(function() { window.location.reload(); })
						.catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
				}) }, [ _('删除') ])
			];
			var cardChildren = [
				E('div', { 'class': 'tower-source-top' }, [
					E('div', { 'class': 'tower-source-main' }, [
						E('div', { 'class': 'tower-source-identity' }, [
							E('span', { 'class': 'tower-airport-icon', 'aria-hidden': 'true' }, [ '✈' ]),
							E('div', { 'class': 'tower-airport-copy' }, [
								E('div', { 'class': 'tower-source-name' }, [ displayName(sub) ]),
								E('div', { 'class': 'tower-source-host', 'title': hostOf(sub.url) }, [ hostOf(sub.url) ])
							])
						]),
						E('div', { 'class': 'tower-source-meta' }, meta)
					]),
					E('div', { 'class': 'tower-source-actions' }, actions)
				])
			];
			var usage = sub.usage;
			if (usage && usage.total_bytes > 0) {
				var used = Number(usage.upload_bytes || 0) + Number(usage.download_bytes || 0);
				var percent = Math.min(100, Math.max(0, used / usage.total_bytes * 100));
				cardChildren.push(E('div', { 'class': 'tower-usage' }, [
					E('div', { 'class': 'tower-usage-label' }, [
						E('span', {}, [ _('剩余 %s').format(formatBytes(Math.max(0, usage.total_bytes - used))) ]),
						E('span', {}, [ _('总流量 %s').format(formatBytes(usage.total_bytes)) ])
					]),
					E('div', { 'class': 'tower-usage-track' }, [ E('div', { 'class': 'tower-usage-fill', 'style': 'width:' + percent.toFixed(1) + '%' }) ])
				]));
			}
			cardChildren.push(E('div', { 'class': 'tower-source-foot' }, [
				E('span', {}, [ _('最近更新：%s').format(updatedAt(sub.last_updated_at)) ]),
				usage && usage.expires_at ? E('span', {}, [ expiryLabel(usage.expires_at) ]) : E('span', {}, [ _('订阅凭据仅保存在本机') ])
			]));
			cardChildren.push(actionStatus);
			return E('article', { 'class': 'tower-source-card' }, cardChildren);
		}.bind(this));

		function editOwnedNode(node) {
			var protocolFields = {
				ss: [ 'cipher', 'password', 'plugin' ],
				ssr: [ 'cipher', 'password', 'protocol_name', 'protocol_param', 'obfs', 'obfs_param' ],
				vmess: [ 'uuid', 'alter_id', 'transport', 'tls', 'sni', 'host_header', 'path', 'alpn', 'skip_cert_verify' ],
				vless: [ 'uuid', 'flow', 'transport', 'tls', 'sni', 'host_header', 'path', 'alpn', 'reality_public_key', 'reality_short_id', 'fingerprint', 'skip_cert_verify' ],
				trojan: [ 'password', 'transport', 'tls', 'sni', 'host_header', 'path', 'alpn', 'fingerprint', 'skip_cert_verify' ],
				hysteria: [ 'password', 'sni', 'alpn', 'up_mbps', 'down_mbps', 'congestion_control', 'udp_relay_mode', 'skip_cert_verify' ],
				hysteria2: [ 'password', 'sni', 'alpn', 'obfs', 'obfs_param', 'up_mbps', 'down_mbps', 'skip_cert_verify' ],
				tuic: [ 'uuid', 'password', 'sni', 'alpn', 'congestion_control', 'udp_relay_mode', 'skip_cert_verify' ],
				wireguard: [ 'wireguard_private_key', 'wireguard_public_key', 'wireguard_preshared_key', 'wireguard_ipv4', 'wireguard_ipv6', 'wireguard_allowed_ips', 'wireguard_reserved', 'wireguard_mtu', 'wireguard_persistent_keepalive', 'wireguard_dns' ],
				anytls: [ 'password', 'sni', 'alpn', 'fingerprint', 'skip_cert_verify' ],
				snell: [ 'password', 'version', 'obfs', 'obfs_param' ],
				socks5: [ 'username', 'password', 'tls', 'sni', 'skip_cert_verify' ],
				http: [ 'username', 'password', 'tls', 'sni', 'skip_cert_verify' ]
			};
			var labels = {
				name: _('节点名称'), server: _('服务器'), port: _('端口'), cipher: _('加密方式'), password: _('密码'),
				username: _('用户名'), uuid: 'UUID', flow: 'Flow', transport: _('传输方式'), tls: 'TLS', sni: 'SNI',
				host_header: _('Host'), path: _('传输路径'), alpn: 'ALPN', plugin: _('插件'), protocol_name: _('协议'),
				protocol_param: _('协议参数'), obfs: _('混淆方式'), obfs_param: _('混淆参数'), alter_id: 'Alter ID',
				reality_public_key: 'REALITY Public Key', reality_short_id: 'REALITY Short ID', fingerprint: 'Fingerprint',
				skip_cert_verify: _('跳过证书验证'), up_mbps: 'Upload Mbps', down_mbps: 'Download Mbps',
				congestion_control: _('拥塞控制'), udp_relay_mode: 'UDP Relay Mode', wireguard_private_key: _('私钥'),
				wireguard_public_key: _('公钥'), wireguard_preshared_key: _('预共享密钥'), wireguard_ipv4: 'IPv4',
				wireguard_ipv6: 'IPv6', wireguard_allowed_ips: 'Allowed IPs', wireguard_reserved: 'Reserved',
				wireguard_mtu: 'MTU', wireguard_persistent_keepalive: _('保活间隔'), wireguard_dns: 'DNS', version: _('版本')
			};
			var fields = [ 'name', 'server', 'port' ].concat(protocolFields[node.kind] || [ 'username', 'password', 'tls', 'sni' ]);
			var controls = {};
			var fieldRows = fields.map(function(key) {
				var checkbox = key === 'tls' || key === 'skip_cert_verify';
				var number = [ 'port', 'alter_id', 'up_mbps', 'down_mbps', 'wireguard_mtu', 'wireguard_persistent_keepalive', 'version' ].indexOf(key) >= 0;
				var secret = key === 'password' || key.indexOf('private_key') >= 0 || key.indexOf('preshared_key') >= 0;
				var input = E('input', { 'type': checkbox ? 'checkbox' : number ? 'number' : secret ? 'password' : 'text' });
				if (checkbox)
					input.checked = !!node[key];
				else if (secret)
					input.placeholder = node[key] ? _('留空保持原值') : '';
				else
					input.value = node[key] == null ? '' : String(node[key]);
				controls[key] = input;
				var label = E('label', {}, [ labels[key] || key ]);
				return E('div', { 'class': 'tower-node-field' + (checkbox ? ' tower-node-field-check' : '') }, checkbox ? [ input, label ] : [ label, input ]);
			});
			var editor = E('div', { 'class': 'tower-node-editor' }, [
				E('div', { 'class': 'tower-node-fields' }, fieldRows),
				E('div', { 'class': 'tower-node-modal-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': function() { ui.hideModal(); } }, [ _('取消') ]),
					E('button', { 'class': 'btn cbi-button cbi-button-apply', 'click': function() {
						var updated = Object.assign({}, node);
						fields.forEach(function(key) {
							var control = controls[key];
							var secret = key === 'password' || key.indexOf('private_key') >= 0 || key.indexOf('preshared_key') >= 0;
							if (control.type === 'checkbox') {
								updated[key] = control.checked;
							} else if (secret && control.value.trim() === '') {
								return;
							} else if (control.value.trim() === '') {
								delete updated[key];
							} else {
								updated[key] = control.type === 'number' ? Number(control.value) : control.value.trim();
							}
						});
						if (!updated.name || !updated.server || !updated.port) {
							ui.addNotification(null, E('p', [ _('节点名称、服务器和端口不能为空。') ]), 'error');
							return;
						}
						return tower.rpcUpdateNode(JSON.stringify(updated)).then(function() {
							ui.hideModal();
							ui.addNotification(null, E('p', [ _('自有节点已更新') ]), 'info');
							window.location.reload();
						}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
					} }, [ _('保存修改') ])
				])
			]);
			ui.showModal(_('编辑自有节点'), [ editor ]);
		}

		function removeOwnedNode(node) {
			if (!confirm(_('删除自有节点「%s」？').format(node.name)))
				return;
			return tower.rpcRemoveNode(node.id).then(function() {
				ui.addNotification(null, E('p', [ _('自有节点已删除') ]), 'info');
				window.location.reload();
			}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
		}

		var ownedCards = localNodes.map(function(n) {
			return E('article', { 'class': 'tower-owned-card' }, [
				E('div', { 'class': 'tower-node-mark', 'aria-hidden': 'true' }, [ String(n.kind || '?').slice(0, 1).toUpperCase() ]),
				E('div', { 'class': 'tower-owned-info' }, [
					E('div', { 'class': 'tower-owned-name', 'title': n.name }, [ n.name ]),
					E('div', { 'class': 'tower-owned-endpoint' }, [ String(n.kind || '').toUpperCase() + ' · ' + n.server + ':' + n.port ])
				]),
				E('div', { 'class': 'tower-owned-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, function() {
						return tower.rpcLinks('', n.id).then(function(links) {
							if (!links.length) { ui.addNotification(null, E('p', [ _('该节点无法生成链接') ]), 'error'); return; }
							return tower.copyText(links[0].link).then(function() { ui.addNotification(null, E('p', [ _('已复制链接') ]), 'info'); });
						}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
					}) }, [ _('分享') ]),
					E('details', { 'class': 'tower-node-menu' }, [
						E('summary', { 'title': _('更多操作'), 'aria-label': _('更多操作') }, [ '⋯' ]),
						E('div', { 'class': 'tower-node-menu-list' }, [
							E('button', { 'type': 'button', 'click': function(ev) {
								ev.currentTarget.closest('details').open = false;
								editOwnedNode(n);
							} }, [ _('编辑') ]),
							E('button', { 'type': 'button', 'class': 'tower-node-delete', 'click': ui.createHandlerFn(this, function(ev) {
								ev.currentTarget.closest('details').open = false;
								return removeOwnedNode(n);
							}) }, [ _('删除') ])
						])
					])
				])
			]);
		}.bind(this));

		var subscriptionSection = [
			E('div', { 'class': 'tower-section-head' }, [ E('h3', {}, [ _('订阅') ]), E('span', { 'class': 'tower-section-note' }, [ subs.length + ' ' + _('个来源') ]) ])
		].concat(subs.length ? sourceCards : [ E('div', { 'class': 'tower-empty' }, [ _('还没有订阅，使用上方添加或导入。') ]) ]);
		var ownedSection = [
			E('div', { 'class': 'tower-section-head' }, [ E('h3', {}, [ _('自有节点') ]), E('span', { 'class': 'tower-section-note' }, [ localNodes.length + ' ' + _('个') ]) ])
		].concat(localNodes.length ? [ E('div', { 'class': 'tower-owned-grid' }, ownedCards) ] : [ E('div', { 'class': 'tower-empty' }, [ _('尚无自有节点，可通过粘贴导入添加。') ]) ]);

		var page = E('div', { 'class': 'cbi-map tower-page' }, [
			E('style', {}, [ css ]),
			E('div', { 'class': 'tower-heading' }, [
				E('div', {}, [ E('h2', {}, [ _('我的订阅') ]), E('p', { 'class': 'tower-subtitle' }, [ _('集中管理订阅与自有节点') ]) ]),
				E('span', { 'class': 'tower-section-note' }, [ _('数据保存在此设备') ])
			]),
			E('div', { 'class': 'tower-stats' }, [
				E('a', { 'class': 'tower-stat tower-stat-link', 'href': L.url('admin/services/tower/subscriptions') }, [ E('span', { 'class': 'tower-stat-label' }, [ _('已启用') ]), E('div', { 'class': 'tower-stat-value' }, [ String(activeSubs) ]) ]),
				E('a', { 'class': 'tower-stat tower-stat-link', 'href': L.url('admin/services/tower/nodes') }, [ E('span', { 'class': 'tower-stat-label' }, [ _('节点') ]), E('div', { 'class': 'tower-stat-value' }, [ String(totalNodes) ]) ]),
				E('a', { 'class': 'tower-stat tower-stat-link', 'href': L.url('admin/services/tower/nodes') + '?scope=owned' }, [ E('span', { 'class': 'tower-stat-label' }, [ _('自有节点') ]), E('div', { 'class': 'tower-stat-value' }, [ String(localNodes.length) ]) ])
			]),
			E('details', { 'class': 'tower-disclosure' }, [
				E('summary', {}, [ _('添加订阅') ]),
				E('div', { 'class': 'tower-disclosure-body' }, [ E('div', { 'class': 'tower-add' }, [
					E('div', { 'class': 'tower-field' }, [ E('label', {}, [ _('名称') ]), nameInput ]),
					E('div', { 'class': 'tower-field' }, [ E('label', {}, [ _('订阅链接') ]), urlInput ]),
					E('div', { 'class': 'tower-field' }, [ E('label', {}, [ _('User-Agent') ]), uaSelect ]), addBtn
				]) ])
			]),
			E('details', { 'class': 'tower-disclosure' }, [
				E('summary', {}, [ _('粘贴导入节点') ]),
				E('div', { 'class': 'tower-disclosure-body' }, [
					E('p', { 'class': 'cbi-section-descr' }, [ _('支持 Clash YAML、Surge INI、Base64 或分享链接。') ]), pasteTextarea,
					E('div', { 'style': 'margin-top:10px' }, [ importBtn ])
				])
			]),
			E('section', { 'class': 'tower-section' }, subscriptionSection),
			E('section', { 'class': 'tower-section' }, ownedSection)
		]);
		page.style.setProperty('--tower-menu-bg', window.getComputedStyle(document.body).backgroundColor);
		page.style.setProperty('--tower-menu-color', window.getComputedStyle(document.body).color);
		return page;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
