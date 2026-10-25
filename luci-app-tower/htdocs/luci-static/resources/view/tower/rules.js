'use strict';
'require view';
'require ui';
'require tower';

const css = '\
.tower-rules-page .tower-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:17px 18px;margin-bottom:12px;background:transparent}\
.tower-rules-page .tower-card-title{display:block;width:auto;background:transparent!important;box-shadow:none!important;border:0!important;color:inherit!important;font-size:16px;font-weight:620;opacity:.9;margin:0 0 12px;padding:0!important;letter-spacing:0;text-transform:none}\
.tower-import-intro{margin:0 0 16px;line-height:1.5;font-size:12px;opacity:.65}\
.tower-card-info{min-width:0;flex:1}\
.tower-card-name{font-size:15px;font-weight:600}\
.tower-card-desc{font-size:12px;opacity:.65;margin-top:3px;line-height:1.5}\
.tower-card-meta{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center}\
.tower-rules-page .tower-pill{display:inline-block;padding:2px 8px;border:1px solid rgba(128,128,128,.2);border-radius:10px;background:transparent;font-size:11.5px}\
.tower-pill-builtin{background:rgba(74,160,101,.16);color:#4aa065}\
.tower-card-actions{display:flex;gap:6px;flex-shrink:0;align-items:center}\
.tower-detail{display:none;grid-column:1/-1;border-top:1px solid rgba(128,128,128,.16);padding-top:10px;margin-top:10px}\
.tower-detail.tower-visible{display:block}\
.tower-detail-group{padding:7px 0;border-bottom:1px solid rgba(128,128,128,.1);font-size:12px}\
.tower-detail-group:last-child{border-bottom:0}\
.tower-detail-members{opacity:.65;margin-top:3px;line-height:1.55;overflow-wrap:anywhere}\
.tower-add{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:end;margin-bottom:14px}\
.tower-add-file{grid-template-columns:minmax(0,1fr)}\
.tower-field{display:flex;flex-direction:column;gap:4px;min-width:0}\
.tower-field label{font-size:12px;opacity:.7}\
.tower-field input:not([type=file]){width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:36px;border:1px solid rgba(128,128,128,.28);border-radius:7px;background:rgba(128,128,128,.06)!important;color:inherit!important;font-size:13px;padding:7px 9px}\
.tower-rule-file{display:block;width:100%;height:38px;box-sizing:border-box;border:1px solid rgba(128,128,128,.28);border-radius:7px;background:rgba(128,128,128,.06);color:inherit;padding:0;line-height:36px;overflow:hidden}\
.tower-rule-file::file-selector-button{height:36px;box-sizing:border-box;margin:0 10px 0 0;border:0;border-right:1px solid rgba(128,128,128,.3);border-radius:6px 0 0 6px;background:rgba(128,128,128,.12);color:inherit;padding:0 12px;vertical-align:top;cursor:pointer}\
.tower-paste{width:100%;min-height:160px;box-sizing:border-box;border:1px solid rgba(128,128,128,.28);border-radius:8px;background:rgba(128,128,128,.06)!important;color:inherit!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;padding:10px;resize:vertical}\
.tower-paste::placeholder,.tower-field input::placeholder{color:inherit;opacity:.48}\
.tower-empty{display:flex;align-items:center;justify-content:center;min-height:64px;padding:16px;text-align:center;font-size:13px;opacity:.65}\
.tower-rename-panel{display:none;grid-column:1/-1;gap:8px;align-items:center;margin-top:10px}.tower-rename-panel.tower-visible{display:flex}.tower-rename-panel input{flex:1;min-width:0;box-sizing:border-box;background:rgba(128,128,128,.06)!important;color:inherit!important}\
@media(max-width:700px){.tower-rules-page .tower-card{padding:14px}.tower-card-actions{width:100%;flex-wrap:wrap;margin-top:10px}.tower-card-actions .btn{flex:1}.tower-card-info{width:100%}.tower-card-desc{overflow-wrap:anywhere}.tower-add{grid-template-columns:minmax(0,1fr);gap:8px}.tower-rule-file{font-size:12px}}\
';

return view.extend({
	load: function() {
		return tower.rpcSchemes();
	},

	render: function(schemes) {
		var nameInput = E('input', { 'class': 'cbi-input-text', 'name': 'name', 'placeholder': _('请填写方案名称'), 'required': 'required' });
		var urlInput = E('input', { 'class': 'cbi-input-text', 'name': 'url', 'placeholder': 'https://…（配置链接或来源链接）' });
		var fileInput = E('input', { 'class': 'tower-rule-file', 'type': 'file', 'accept': '.yaml,.yml,.conf,.ini,.txt' });
		var pasteArea = E('textarea', {
			'class': 'tower-paste',
			'placeholder': _('粘贴 Clash YAML、subconverter .ini 或 Surge 配置。只导入策略组和规则，不导入节点。')
		});

		var importBtn = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': ui.createHandlerFn(this, function() {
				var name = nameInput.value.trim();
				var config = pasteArea.value.trim();
				var url = urlInput.value.trim();
				var file = fileInput.files && fileInput.files[0];
				if (!file && !config && !url) {
					ui.addNotification(null, E('p', [ _('请提供配置链接、粘贴配置文本或选择文件。') ]), 'error');
					return;
				}
				if (!name) {
					nameInput.focus();
					ui.addNotification(null, E('p', [ _('请为导入的规则方案填写名称，方便后续管理。') ]), 'error');
					return;
				}
				var input = file ? new Promise(function(resolve, reject) {
					var reader = new FileReader();
					reader.onload = function() { resolve(String(reader.result || '')); };
					reader.onerror = function() { reject(new Error(_('读取文件失败'))); };
					reader.readAsText(file);
				}) : Promise.resolve(config);
				return input.then(function(text) {
					return tower.rpcAddScheme(name, text.trim(), url);
				}).then(function(scheme) {
					if (!scheme || !scheme.id) {
						ui.addNotification(null, E('p', [ _('导入失败：无法解析规则配置。') ]), 'error');
						return;
					}
					ui.addNotification(null, E('p', [ _('规则方案「%s」已导入；远程规则可在方案卡片中刷新。').format(scheme.name) ]), 'info');
					window.location.reload();
				}).catch(function(e) {
					ui.addNotification(null, E('p', [ String(e) ]), 'error');
				});
			})
		}, [ _('导入方案') ]);

		function card(s) {
			var meta = [
				E('span', { 'class': 'tower-pill' }, [ s.groups + ' ' + _('个策略组') ]),
				E('span', { 'class': 'tower-pill' }, [ s.rules + ' ' + _('条本地规则') ])
			];
			if (s.is_bundled)
				meta.push(E('span', { 'class': 'tower-pill tower-pill-builtin' }, [ _('内置') ]));
			if (s.rule_sets > 0)
				meta.push(E('span', { 'class': 'tower-pill' }, [ s.rule_sets + ' ' + _('个规则集') + (s.cached ? '' : ' · ' + _('缓存缺失')) ]));

			var actions = [];
			var nameLabel = E('div', { 'class': 'tower-card-name' }, [ s.name || _('未命名方案') ]);
			var renameInput = E('input', { 'class': 'cbi-input-text', 'value': s.name || '', 'placeholder': _('填写便于区分的方案名称') });
			var renamePanel = E('div', { 'class': 'tower-rename-panel' }, [
				renameInput,
				E('button', { 'class': 'btn cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, function() {
					var name = renameInput.value.trim();
					if (!name) { renameInput.focus(); return; }
					return tower.rpcRenameScheme(s.id, name).then(function() {
						nameLabel.textContent = name;
						renamePanel.classList.remove('tower-visible');
					}).catch(function(e) { ui.addNotification(null, E('p', [ String(e) ]), 'error'); });
				}) }, [ _('保存名称') ]),
				E('button', { 'class': 'btn cbi-button', 'click': function() { renamePanel.classList.remove('tower-visible'); } }, [ _('取消') ])
			]);
			var detail = E('div', { 'class': 'tower-detail' });
			actions.push(E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(this, function(ev) {
					if (detail.classList.contains('tower-visible')) {
						detail.classList.remove('tower-visible');
						ev.target.textContent = _('查看策略组');
						return;
					}
					return tower.rpcSchemeDetail(s.id).then(function(full) {
						while (detail.firstChild) detail.removeChild(detail.firstChild);
						(full.groups || []).forEach(function(g) {
							var members = (g.members || []).map(function(m) {
								return (m.type === 'reference' ? _('引用') : _('节点匹配')) + '：' + m.value;
							});
							detail.appendChild(E('div', { 'class': 'tower-detail-group' }, [
								E('strong', {}, [ g.name + ' · ' + g.kind ]),
								E('div', { 'class': 'tower-detail-members' }, [ members.join('　') || _('没有成员') ])
							]));
						});
						var remote = (full.rules || []).filter(function(r) { return !!r.resource; });
						if (remote.length) {
							detail.appendChild(E('div', { 'class': 'tower-detail-group' }, [ _('远程规则集') + '：' ]));
							remote.forEach(function(r) {
								var source = r.resource.author || r.resource.url;
								var license = r.resource.license ? ' · ' + r.resource.license : '';
								detail.appendChild(E('div', { 'class': 'tower-detail-members' }, [ r.group + ' ← ' + source + license ]));
							});
						}
						detail.appendChild(E('div', { 'class': 'tower-detail-members' }, [ _('导出时可优先使用客户端原生规则集；关闭后会按本地缓存展开规则。') ]));
						detail.classList.add('tower-visible');
						ev.target.textContent = _('收起策略组');
					}).catch(function(e) {
						ui.addNotification(null, E('p', [ String(e) ]), 'error');
					});
				})
			}, [ _('查看策略组') ]));
			if (s.rule_sets > 0) {
				actions.push(E('button', {
					'class': 'btn cbi-button',
					'click': ui.createHandlerFn(this, function() {
						return tower.rpcRefreshScheme(s.id).then(function(res) {
							ui.addNotification(null, E('p', [ _('规则集刷新完成：更新 %d 个，失败 %d 个').format(res.updated || 0, res.failed || 0) ]), res.failed ? 'warning' : 'info');
							window.location.reload();
						}).catch(function(e) {
							ui.addNotification(null, E('p', [ String(e) ]), 'error');
						});
					})
				}, [ _('刷新规则') ]));
			}
			if (!s.is_bundled) {
				actions.push(E('button', {
					'class': 'btn cbi-button',
					'click': function() { renamePanel.classList.toggle('tower-visible'); renameInput.focus(); }
				}, [ _('重命名') ]));
				actions.push(E('button', {
					'class': 'btn cbi-button cbi-button-reset',
					'click': ui.createHandlerFn(this, function() {
						if (!confirm(_('删除规则方案「%s」？').format(s.name)))
							return;
						return tower.rpcRemoveScheme(s.id).then(function() {
							window.location.reload();
						}).catch(function(e) {
							ui.addNotification(null, E('p', [ String(e) ]), 'error');
						});
					})
				}, [ _('删除') ]));
			}

			return E('div', { 'class': 'tower-card' }, [
				E('div', { 'class': 'tower-card-info' }, [
					nameLabel,
					E('div', { 'class': 'tower-card-desc' }, [ s.summary || s.source_url || '' ]),
					E('div', { 'class': 'tower-card-meta' }, meta)
				]),
				E('div', { 'class': 'tower-card-actions' }, actions),
				renamePanel,
				detail
			]);
		}

		var builtin = schemes.filter(function(s) { return s.is_bundled; });
		var imported = schemes.filter(function(s) { return !s.is_bundled; });

		var builtinSection = [
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, [ _('本机规则'), ' ', E('span', { 'class': 'tower-pill' }, [ builtin.length ]) ]),
				E('p', { 'class': 'tower-card-desc' }, [ _('包含 ACL4SSR 多个离线方案；远程规则需能访问 GitHub 时下载。') ])
			])
		].concat(builtin.map(card));

		var importedSection = [
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, [ _('已导入'), ' ', E('span', { 'class': 'tower-pill' }, [ imported.length ]) ])
			])
		].concat(
			(imported.length === 0)
				? [ E('div', { 'class': 'tower-empty' }, [ _('还没有导入的规则方案。') ]) ]
				: imported.map(card)
		);

		return E('div', { 'class': 'cbi-map tower-rules-page' }, [
			E('style', {}, [ css ]),
			E('section', { 'class': 'tower-card' }, [
				E('h3', { 'class': 'tower-card-title' }, [ _('导入规则方案') ]),
				E('p', { 'class': 'tower-import-intro' }, [ _('支持 HTTPS 链接、粘贴文本和本地文件；识别 Clash YAML、subconverter .ini 和 Surge 配置。只导入策略组与规则，不导入节点；引用的 HTTPS 规则集在刷新时下载并缓存在本机。') ]),
				E('div', { 'class': 'tower-add' }, [
					E('div', { 'class': 'tower-field' }, [
						E('label', {}, [ _('名称') ]),
						nameInput
					]),
					E('div', { 'class': 'tower-field' }, [
						E('label', {}, [ _('来源链接') ]),
						urlInput
					])
				]),
				E('div', { 'class': 'tower-add tower-add-file' }, [
					E('div', { 'class': 'tower-field' }, [
						E('label', {}, [ _('本地配置文件') ]),
						fileInput
					])
				]),
				pasteArea,
				E('div', { 'class': 'tower-card-actions' }, [ importBtn ])
			]),
			E('section', { 'class': 'tower-card' }, [ E('h3', { 'class': 'tower-card-title' }, [ _('规则方案') ]) ].concat(builtinSection, importedSection))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
