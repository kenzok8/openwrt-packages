'use strict';
'require view';
'require ui';
'require tower';

const css = '\
.tower-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:17px 18px;margin-bottom:14px;background:rgba(128,128,128,.055)}\
.tower-card-title{font-size:16px;font-weight:620;opacity:.9;margin:0;padding:0;letter-spacing:0;text-transform:none}\
.tower-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}\
.tower-filter{margin-left:auto;min-width:200px;box-sizing:border-box;border:1px solid rgba(128,128,128,.28);border-radius:6px;background:transparent!important;color:inherit!important;font-size:12px;padding:7px 9px}\
.tower-filter::placeholder{color:inherit;opacity:.48}\
.tower-results{border:1px solid rgba(128,128,128,.18);border-radius:9px;max-height:560px;overflow:auto}\
.tower-node-row{display:grid;grid-template-columns:74px minmax(90px,1fr) minmax(120px,1.2fr) auto;gap:10px;align-items:center;padding:7px 10px;border-bottom:1px solid rgba(128,128,128,.12);font-size:12.5px}\
.tower-node-row:last-child{border-bottom:0}\
.tower-proto{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;opacity:.65;text-transform:uppercase}\
.tower-name,.tower-server{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.tower-server{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.7;font-size:11.5px}\
.tower-empty{display:flex;align-items:center;justify-content:center;min-height:64px;padding:16px;text-align:center;font-size:12px;opacity:.5}\
.tower-btn{font-size:11.5px;padding:4px 10px}\
@media(max-width:700px){.tower-card{padding:14px}.tower-toolbar{align-items:stretch}.tower-filter{margin-left:0;min-width:100%}.tower-node-row{grid-template-columns:58px minmax(80px,1fr) auto;gap:7px;padding:9px}.tower-server{grid-column:2;grid-row:2}.tower-node-row .tower-btn{grid-column:3;grid-row:1/3}}\
';

return view.extend({
	load: function() {
		return tower.rpcListNodes();
	},

	render: function(nodes) {
		var onlyOwned = new URLSearchParams(window.location.search).get('scope') === 'owned';
		if (onlyOwned)
			nodes = nodes.filter(function(n) { return !n.source_id; });
		var filterText = '';
		var filterInput = E('input', {
			'class': 'tower-filter',
			'placeholder': _('筛选名称、协议或服务器')
		});
		var listBody = E('div', { 'class': 'tower-results' });
		var statTotal = E('strong', {}, String(nodes.length));

		function renderList() {
			while (listBody.firstChild)
				listBody.removeChild(listBody.firstChild);

			var q = filterText.toLowerCase();
			var shown = nodes.filter(function(n) {
				return !q ||
					n.name.toLowerCase().indexOf(q) >= 0 ||
					String(n.kind).toLowerCase().indexOf(q) >= 0 ||
					String(n.server).toLowerCase().indexOf(q) >= 0;
			});

			shown.forEach(function(n) {
				listBody.appendChild(E('div', { 'class': 'tower-node-row' }, [
					E('span', { 'class': 'tower-proto' }, String(n.kind)),
					E('span', { 'class': 'tower-name', 'title': n.name }, n.name),
					E('span', { 'class': 'tower-server' }, n.server + ':' + n.port),
					E('button', {
						'class': 'btn cbi-button tower-btn',
						'click': ui.createHandlerFn(this, function() {
							return tower.rpcLinks('', n.id).then(function(links) {
								if (!links.length) {
									ui.addNotification(null, E('p', [ _('该节点无法生成链接') ]), 'error');
									return;
								}
								return tower.copyText(links[0].link).then(function() {
									ui.addNotification(null, E('p', [ _('已复制链接') ]), 'info');
								});
							}).catch(function(e) {
								ui.addNotification(null, E('p', [ String(e) ]), 'error');
							});
						})
					}, [ _('复制链接') ])
				]));
			});

			if (!shown.length)
				listBody.appendChild(E('div', { 'class': 'tower-empty' }, _('没有匹配的节点。')));
		}

		filterInput.addEventListener('input', function() {
			filterText = filterInput.value;
			renderList();
		});

		renderList();

		if (!nodes.length) {
			return E('div', { 'class': 'cbi-map' }, [
				E('style', {}, [ css ]),
				E('div', { 'class': 'tower-empty' }, [ onlyOwned ? _('还没有自有节点。') : _('还没有节点。请先到「订阅」页添加订阅或导入节点。') ])
			]);
		}

		return E('div', { 'class': 'cbi-map' }, [
			E('style', {}, [ css ]),
			E('div', { 'class': 'tower-card' }, [
				E('div', { 'class': 'tower-toolbar' }, [
					E('h4', { 'class': 'tower-card-title' }, [ onlyOwned ? _('自有节点') : _('节点'), ' ', statTotal, ' ', _('个') ]),
					filterInput
				]),
				listBody
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
