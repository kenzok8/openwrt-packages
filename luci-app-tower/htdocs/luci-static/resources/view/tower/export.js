'use strict';
'require view';
'require ui';
'require tower';

const css = '\
.tower-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:17px 18px;margin-bottom:14px;background:rgba(128,128,128,.055)}\
.tower-export-page .tower-card-title{display:block;width:auto;background:transparent!important;border:0!important;box-shadow:none!important;color:inherit!important;font-size:16px;font-weight:620;opacity:.9;margin:0 0 12px;padding:0!important;letter-spacing:0;text-transform:none}\
.tower-client-section+.tower-client-section{margin-top:18px;padding-top:16px;border-top:1px solid rgba(128,128,128,.16)}\
.tower-client-heading{font-size:12px;font-weight:650;opacity:.65;margin:0 0 9px}\
.tower-client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:8px}\
.tower-client-card{display:flex;align-items:center;gap:9px;min-width:0;padding:9px 10px;border:1px solid rgba(128,128,128,.26);border-radius:9px;cursor:pointer;background:transparent;font-size:12.5px;user-select:none}\
.tower-client-card:hover{border-color:rgba(74,160,101,.65)}\
.tower-client-card input{display:none}\
.tower-client-card:has(input:checked){border-color:#4aa065;background:rgba(74,160,101,.14);font-weight:600;box-shadow:0 0 0 1px rgba(74,160,101,.25)}\
.tower-client-icon{width:30px;height:30px;flex:none;object-fit:contain;border-radius:7px}\
.tower-client-fallback{display:flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:7px;background:rgba(84,114,228,.16);color:#5e72e4;font-size:11px;font-weight:700}\
.tower-client-text{display:flex;flex-direction:column;min-width:0;line-height:1.25}\
.tower-client-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-client-detail{font-size:10.5px;opacity:.56;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-target-note{margin:11px 0 0;font-size:12px;opacity:.7}\
.tower-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}\
.tower-protocol-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;margin-bottom:12px}\
.tower-export-page .tower-protocol-option{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:center;gap:12px;min-width:0;min-height:60px;box-sizing:border-box;padding:10px 14px;border:1px solid rgba(128,128,128,.22);border-radius:9px;background:rgba(128,128,128,.04);cursor:pointer;font-size:13px}\
.tower-protocol-option:first-child{grid-column:1/-1}\
.tower-protocol-option:hover{border-color:rgba(74,160,101,.55)}\
.tower-protocol-option:has(input:checked){border-color:rgba(74,160,101,.68);background:rgba(74,160,101,.1)}\
.tower-protocol-option:has(input:focus-visible){outline:2px solid rgba(66,153,225,.75);outline-offset:2px}\
.tower-protocol-meta{display:flex;flex-direction:column;gap:3px;min-width:0}\
.tower-protocol-name{font-size:13px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}\
.tower-protocol-option input{appearance:none;-webkit-appearance:none;position:relative;justify-self:end;width:42px;height:24px;margin:0;border:1px solid rgba(128,128,128,.4);border-radius:999px;background:rgba(128,128,128,.25);cursor:pointer;transition:background-color .16s ease,border-color .16s ease}\
.tower-protocol-option input::before{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .16s ease}\
.tower-protocol-option input:checked{border-color:#4aa065;background:#4aa065}\
.tower-protocol-option input:checked::before{transform:translateX(18px)}\
.tower-protocol-option input:focus-visible{outline:none}\
.tower-protocol-option input:disabled{opacity:.5;cursor:not-allowed}\
.tower-protocol-count{opacity:.62;font-size:11px;font-variant-numeric:tabular-nums}\
.tower-filter{margin-left:auto;min-width:200px;box-sizing:border-box;border:1px solid rgba(128,128,128,.28);border-radius:6px;background:transparent!important;color:inherit!important;font-size:12px;padding:7px 9px}\
.tower-filter::placeholder,.tower-preview::placeholder{color:inherit;opacity:.48}\
.tower-summary{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;opacity:.8}\
.tower-results{border:1px solid rgba(128,128,128,.18);border-radius:8px;max-height:340px;overflow:auto}\
.tower-result{display:grid;grid-template-columns:20px minmax(100px,1fr) 88px;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid rgba(128,128,128,.12);font-size:12.5px}\
.tower-result:last-child{border-bottom:0}\
.tower-result input{appearance:checkbox !important;-webkit-appearance:checkbox !important;accent-color:#4aa065;width:15px;height:15px;margin:0}\
.tower-name,.tower-server{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.tower-proto{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;opacity:.65;text-transform:uppercase;justify-self:end}\
.tower-empty{display:flex;align-items:center;justify-content:center;min-height:64px;padding:16px;text-align:center;font-size:13px;opacity:.65}\
.tower-preview{width:100%;height:300px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;box-sizing:border-box;border:1px solid rgba(128,128,128,.18);border-radius:8px;background:transparent!important;color:inherit!important;padding:10px}\
.tower-share{display:none}\
.tower-share.tower-visible{display:block}\
.tower-share-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}\
.tower-share-head .tower-card-title{margin:0}\
.tower-share-url{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(128,128,128,.28);border-radius:7px;background:transparent!important;color:inherit!important;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}\
.tower-share-help{font-size:12px;opacity:.7;margin:0 0 10px}\
.tower-link-list{border:1px solid rgba(128,128,128,.18);border-radius:8px;max-height:300px;overflow:auto}\
.tower-link-row{display:grid;grid-template-columns:74px minmax(80px,1fr) auto;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid rgba(128,128,128,.12);font-size:12px}\
.tower-link-row:last-child{border-bottom:0}\
.tower-link-row .tower-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.tower-btn-row{display:flex;gap:6px;align-items:center}\
.tower-btn{font-size:11.5px;padding:4px 10px}\
.tower-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}\
.tower-modal{background:var(--cbi-background,#fff);color:var(--cbi-color,#000);border-radius:14px;padding:20px;max-width:340px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.3)}\
.tower-modal-title{font-size:14px;font-weight:600;margin:0 0 12px}\
.tower-modal canvas{image-rendering:pixelated;width:220px;height:220px;background:#fff;padding:8px;border-radius:8px}\
.tower-modal-link{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;opacity:.65;margin:12px 0;text-align:left;max-height:64px;overflow:auto}\
.tower-modal-actions{display:flex;gap:8px;justify-content:center}\
.tower-gen-status{font-size:12px;opacity:.75}\
.tower-gen-status-ok{color:#4aa065;font-weight:600}\
.tower-gen-status-error{color:#d96d6d}\
.tower-gen-status-busy{opacity:.55}\
.tower-preflight{margin-top:8px;font-size:12px}\
.tower-preflight-title{font-weight:650;margin:8px 0 4px}\
.tower-preflight-list{margin:0 0 8px;padding-left:20px}\
.tower-preflight-list li{margin:2px 0;overflow-wrap:anywhere}\
.tower-preflight-details{margin:6px 0 8px}\
.tower-preflight-details summary{cursor:pointer;font-weight:600}\
.tower-service-regions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}\
.tower-service-region{display:flex;align-items:center;gap:6px;font-size:12px}\
.tower-service-region select{min-width:88px}\
.tower-preflight-error{color:#d96d6d}\
.tower-preflight-warning{color:#bd7f18}\
.tower-preflight-ok{color:#4aa065}\
.tower-scheme-select{flex:0 1 320px;width:100%;max-width:320px;height:34px!important;min-height:34px!important;box-sizing:border-box;padding:5px 10px!important;border:1px solid rgba(128,128,128,.28)!important;border-radius:7px!important;background-color:rgba(128,128,128,.07)!important;color:inherit!important;font-size:13px!important;line-height:1.2}\
.tower-scheme-select:focus{border-color:#4299e1!important;box-shadow:0 0 0 2px rgba(66,153,225,.16)}\
.tower-scheme-label{font-size:12px;opacity:.7;white-space:nowrap}\
.tower-rule-set-check{display:inline-flex;align-items:center;gap:7px;font-size:12px;opacity:.75;line-height:1.2;white-space:nowrap;cursor:pointer}\
.tower-rule-set-check input{position:static!important;top:auto!important;left:auto!important;appearance:checkbox!important;-webkit-appearance:checkbox!important;accent-color:#5e72e4;flex:none;width:16px;height:16px;margin:0!important}\
@media(max-width:700px){.tower-card{padding:14px}.tower-client-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tower-client-card{padding:8px}.tower-protocol-list{grid-template-columns:minmax(0,1fr)}.tower-filter{margin-left:0;min-width:100%}.tower-result{grid-template-columns:20px minmax(0,1fr) auto}.tower-result .tower-server{grid-column:2;grid-row:2}.tower-preview{height:240px}.tower-link-row{grid-template-columns:58px minmax(0,1fr) auto}.tower-btn-row{flex-wrap:wrap}.tower-scheme-select{flex:1 1 100%;max-width:none}}\
';

function extFor(target) {
	if (target === 'links')
		return '.txt';
	if (target === 'sing-box' || target === 'hiddify' || target === 'clashoo-singbox' || target === 'momo')
		return '.json';
	if (target === 'dae-config')
		return '.dae';
	if (target === 'surge' || target === 'surge-mac' || target === 'shadowrocket')
		return '.conf';
	return '.yaml';
}

function reusableLink(item) {
	var aliases = { hysteria2: 'hysteria2|hy2', socks5: 'socks5|socks', http: 'https?' };
	var scheme = aliases[item.kind] || item.kind;
	return new RegExp('^(?:' + scheme + ')://', 'i').test(item.link || '');
}

function supportsServiceRegions(target) {
	return [ 'sing-box', 'hiddify', 'clashoo-singbox', 'momo', 'dae-config' ].indexOf(target) >= 0;
}

function serviceRegionsJSON(target, regions) {
	if (!supportsServiceRegions(target))
		return '{}';

	var selected = {};
	[ 'claude', 'openai', 'gemini', 'netflix' ].forEach(function(service) {
		if (regions[service])
			selected[service] = regions[service];
	});
	return JSON.stringify(selected);
}

function clientCard(client) {
	var icon = client.icon
		? E('img', { 'class': 'tower-client-icon', 'src': L.resource('view/tower/icons/' + client.icon), 'alt': '' })
		: E('span', { 'class': 'tower-client-fallback' }, [ 'dae' ]);
	var text = [ E('span', { 'class': 'tower-client-name' }, [ client.name ]) ];
	if (client.detail)
		text.push(E('span', { 'class': 'tower-client-detail' }, [ client.detail ]));
	return E('label', { 'class': 'tower-client-card' }, [
		E('input', { 'type': 'radio', 'name': 'tower-client', 'value': client.id }),
		icon,
		E('span', { 'class': 'tower-client-text' }, text)
	]);
}

function loadQrcode() {
	if (window.qrcode)
		return Promise.resolve(window.qrcode);

	return new Promise(function(resolve, reject) {
		var s = document.createElement('script');
		s.src = L.resource('view/tower/vendor/qrcode.js');
		s.onload = function() { resolve(window.qrcode); };
		s.onerror = function() { reject(new Error(_('二维码组件加载失败'))); };
		document.head.appendChild(s);
	});
}

function renderQR(canvas, text) {
	return loadQrcode().then(function(QR) {
		var qr = QR(0, 'M');
		qr.addData(text);
		qr.make();
		var size = qr.getModuleCount();
		var scale = 5;
		canvas.width = size * scale;
		canvas.height = size * scale;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#000000';
		for (var r = 0; r < size; r++)
			for (var c = 0; c < size; c++)
				if (qr.isDark(r, c))
					ctx.fillRect(c * scale, r * scale, scale, scale);
	});
}

function showQRModal(name, link) {
	var canvas = E('canvas');

	var overlay = E('div', { 'class': 'tower-modal-overlay' }, [
		E('div', {
			'class': 'tower-modal',
			'click': function(ev) { ev.stopPropagation(); }
		}, [
			E('p', { 'class': 'tower-modal-title' }, [ name ]),
			canvas,
			E('div', { 'class': 'tower-modal-link' }, [ link ]),
			E('div', { 'class': 'tower-modal-actions' }, [
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.createHandlerFn(this, function() {
						return tower.copyText(link).then(function() {
							ui.addNotification(null, E('p', [ _('已复制链接') ]), 'info');
						}).catch(function() {
							ui.addNotification(null, E('p', [ _('复制失败') ]), 'error');
						});
					})
				}, [ _('复制链接') ]),
				E('button', {
					'class': 'btn cbi-button cbi-button-reset',
					'click': ui.createHandlerFn(this, function() { document.body.removeChild(overlay); })
				}, [ _('关闭') ])
			])
		])
	]);

	overlay.addEventListener('click', function() { document.body.removeChild(overlay); });
	document.body.appendChild(overlay);
	renderQR(canvas, link).catch(function() {
		canvas.parentNode.insertBefore(E('p', { 'class': 'tower-empty' }, [ _('二维码生成失败') ]), canvas);
	});
}

return view.extend({
	load: function() {
		return Promise.all([ tower.rpcListNodes(), tower.rpcSchemes(), tower.rpcCapabilities() ]).then(function(res) {
			return { nodes: res[0], schemes: res[1], capabilities: res[2] };
		});
	},

	render: function(data) {
		var nodes = data.nodes;
		var schemes = data.schemes || [];
		var capabilities = {};
		(data.capabilities || []).forEach(function(item) { capabilities[item.target] = item; });
		var destinations = tower.clients.concat(tower.openwrtClients);
		var selected = {};
		nodes.forEach(function(n) { selected[n.id] = true; });
		var serviceRegions = {};
		var filterText = '';
		var allProtocols = true;
		var activeProtocols = {};
		nodes.forEach(function(n) { activeProtocols[n.kind] = true; });

		var resultBody = E('div', { 'class': 'tower-results' });
		var statTotal = E('strong', {}, '0');
		var statSelected = E('strong', {}, '0');
		var statVisible = E('strong', {}, '0');

		var previewArea = E('textarea', {
			'class': 'tower-preview',
			'readonly': 'readonly',
			'placeholder': _('点击「生成」后在此预览配置内容。')
		});

		var linkList = E('div', { 'class': 'tower-link-list' });
		var configTitle = E('h4', { 'class': 'tower-card-title' }, [ _('配置文件') ]);
		var localShareURL = E('input', { 'class': 'tower-share-url', 'readonly': 'readonly', 'placeholder': _('生成后显示仅供本机插件使用的地址') });
		var localShareStatus = E('span', { 'class': 'tower-gen-status' });
		var sharePanel = E('div', { 'class': 'tower-share' }, [
			E('div', { 'class': 'tower-card' }, [
				configTitle,
				E('div', { 'class': 'tower-toolbar' }, [
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-download-file' }, [ _('下载文件') ]),
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-copy-config' }, [ _('复制配置文本') ])
				]),
				previewArea
			]),
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, _('节点链接')),
				E('div', { 'class': 'tower-toolbar' }, [
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-download-links' }, [ _('下载链接文件') ]),
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-copy-links' }, [ _('复制全部链接') ]),
					E('span', { 'class': 'tower-summary' }, [ _('点「二维码」用手机扫码导入单个节点。') ])
				]),
				linkList
			]),
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, [ _('本机订阅共享') ]),
				E('p', { 'class': 'tower-share-help' }, [ _('为同一台路由器上的 Clashoo、Momo、daede 等插件生成订阅地址；只监听 127.0.0.1。重新生成会使旧地址失效。') ]),
				E('div', { 'class': 'tower-toolbar' }, [
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-share-create' }, [ _('生成本机地址') ]),
					E('button', { 'class': 'btn cbi-button', 'id': 'tower-share-copy' }, [ _('复制地址') ]),
					E('button', { 'class': 'btn cbi-button cbi-button-remove', 'id': 'tower-share-revoke' }, [ _('撤销共享') ]),
					localShareStatus
				]),
				localShareURL
			])
		]);

		function currentDestination() {
			var el = document.querySelector('input[name=tower-client]:checked');
			var id = el ? el.value : 'clash-verge';
			return destinations.filter(function(c) { return c.id === id; })[0] || destinations[0];
		}

		function destinationCapability(destination) {
			if (destination.nodeOnly)
				return { protocols: destination.allowedKinds || [], strict: false };
			return capabilities[destination.target || destination.id] || { protocols: [], strict: false };
		}

		function selectedCount() {
			var n = 0;
			for (var id in selected)
				if (selected[id]) n++;
			return n;
		}

		function updateSummary() {
			statTotal.textContent = String(nodes.length);
			statSelected.textContent = String(selectedCount());
			statVisible.textContent = String(visibleNodes().length);
		}

		function visibleNodes() {
			var q = filterText.toLowerCase();
			return nodes.filter(function(n) {
				return (!q || n.name.toLowerCase().indexOf(q) >= 0) && (allProtocols || !!activeProtocols[n.kind]);
			});
		}

		function renderResults() {
			while (resultBody.firstChild)
				resultBody.removeChild(resultBody.firstChild);

			var shown = visibleNodes();
			var supported = destinationCapability(currentDestination()).protocols || [];
			shown.forEach(function(n) {
				var checkbox = E('input', { 'type': 'checkbox' });
				var compatible = supported.indexOf(n.kind) >= 0;
				checkbox.disabled = !compatible;
				checkbox.checked = !!selected[n.id];
				if (!compatible)
					checkbox.title = _('当前客户端不支持此协议');
				checkbox.addEventListener('change', function() {
					selected[n.id] = checkbox.checked;
					invalidateGeneration();
					updateSummary();
				});
				resultBody.appendChild(E('div', { 'class': 'tower-result' }, [
					checkbox,
					E('span', { 'class': 'tower-name', 'title': n.name }, n.name),
					E('span', { 'class': 'tower-proto' }, String(n.kind))
				]));
			});
			if (!shown.length)
				resultBody.appendChild(E('div', { 'class': 'tower-empty' }, _('没有匹配的节点。')));
			updateSummary();
		}

		function selectedIDs() {
			var ids = [];
			for (var id in selected)
				if (selected[id]) ids.push(id);
			return ids;
		}

		var currentContent = '';
		var currentLinks = [];
		var currentTargetName = 'clash-verge';
		var currentDestinationID = 'clash-verge';
		var generatedOptions = null;
		var generationSerial = 0;
		var activeExportID = null;

		function discardExport(id) {
			if (!id)
				return Promise.resolve();
			return tower.rpcExportDiscard(id).catch(function() {});
		}

		function discardActiveExport() {
			var id = activeExportID;
			activeExportID = null;
			discardExport(id);
		}

		function decodeBase64Chunk(value) {
			if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
				throw new Error(_('分片内容格式无效。'));
			var binary;
			try {
				binary = atob(value);
			} catch (e) {
				throw new Error(_('分片内容无法解码。'));
			}
			var bytes = new Uint8Array(binary.length);
			for (var i = 0; i < binary.length; i++)
				bytes[i] = binary.charCodeAt(i);
			return bytes;
		}

		function hashExport(bytes, expected) {
			if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest)
				return Promise.resolve();
			return window.crypto.subtle.digest('SHA-256', bytes).then(function(hash) {
				var actual = Array.prototype.map.call(new Uint8Array(hash), function(value) {
					return ('0' + value.toString(16)).slice(-2);
				}).join('');
				if (actual !== expected.toLowerCase())
					throw new Error(_('配置校验失败，请重新生成。'));
			});
		}

		function chunkedExport(target, nodes, scheme, preferRuleSets, options, requestID) {
			return tower.rpcExportBegin(target, '', nodes, scheme, preferRuleSets, options.planDigest, [], options.strict, options.serviceRegions).then(function(meta) {
				if (!meta || typeof meta.id !== 'string' || !meta.id || !Number.isSafeInteger(meta.size) || meta.size < 0 || typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(meta.sha256))
					return discardExport(meta && meta.id).then(function() { throw new Error(_('导出初始化信息无效。')); });
				if (requestID !== generationSerial) {
					discardExport(meta.id);
					return null;
				}
				activeExportID = meta.id;
				var chunks = [];
				function readNext(offset, total) {
					if (requestID !== generationSerial)
						return Promise.resolve(null);
					return tower.rpcExportRead(meta.id, offset).then(function(chunk) {
						if (!chunk || chunk.offset !== offset || !Number.isSafeInteger(chunk.next) || typeof chunk.eof !== 'boolean')
							throw new Error(_('导出分片位置无效。'));
						var bytes = decodeBase64Chunk(chunk.data);
						if (bytes.length > 128 * 1024 || chunk.next !== offset + bytes.length || chunk.next > meta.size || (bytes.length === 0 && !chunk.eof))
							throw new Error(_('导出分片长度无效。'));
						chunks.push(bytes);
						total += bytes.length;
						if (total > meta.size || chunk.eof !== (chunk.next === meta.size))
							throw new Error(_('导出分片结束位置无效。'));
						if (!chunk.eof)
							return readNext(chunk.next, total);
						var content = new Uint8Array(total);
						var cursor = 0;
						chunks.forEach(function(part) {
							content.set(part, cursor);
							cursor += part.length;
						});
						return hashExport(content, meta.sha256).then(function() {
							return new TextDecoder('utf-8').decode(content);
						});
					});
				}
				return readNext(0, 0).then(function(content) {
					return discardExport(meta.id).then(function() {
						if (activeExportID === meta.id)
							activeExportID = null;
						return content;
					});
				}, function(error) {
					return discardExport(meta.id).then(function() {
						if (activeExportID === meta.id)
							activeExportID = null;
						throw error;
					});
				});
			});
		}

		function renderLinks(links) {
			currentLinks = links || [];
			while (linkList.firstChild)
				linkList.removeChild(linkList.firstChild);

			if (!currentLinks.length) {
				linkList.appendChild(E('div', { 'class': 'tower-empty' }, _('没有可导出的节点链接。')));
				return;
			}

			currentLinks.forEach(function(item) {
				linkList.appendChild(E('div', { 'class': 'tower-link-row' }, [
					E('span', { 'class': 'tower-proto' }, String(item.kind)),
					E('span', { 'class': 'tower-name', 'title': item.link }, item.name),
					E('div', { 'class': 'tower-btn-row' }, [
						E('button', {
							'class': 'btn cbi-button tower-btn',
							'click': ui.createHandlerFn(this, function() {
								return tower.copyText(item.link).then(function() {
									ui.addNotification(null, E('p', [ _('已复制链接') ]), 'info');
								});
							})
						}, [ _('复制') ]),
						E('button', {
							'class': 'btn cbi-button tower-btn',
							'click': ui.createHandlerFn(this, function() { showQRModal(item.name, item.link); })
						}, [ _('二维码') ])
					])
				]));
			});
		}

		// —— 规则方案选择 ——
		var schemeSelect = E('select', { 'class': 'cbi-input-select tower-scheme-select', 'name': 'scheme' });
		var schemeTargets = {};
		var schemeLabels = { '': _('默认（简单分流）') };
		var daeSchemePolicies = {
			'kenzok8-dae-native': 'tower-dae-kenzok8-policy-v2',
			'acl4ssr-online': 'tower-dae-acl-policy-v2',
			'acl4ssr-full': 'tower-dae-acl-policy-v2',
			'self-configuration': 'tower-dae-acl-policy-v2'
		};
		function targetPolicyMatches(target, schemeID, result) {
			if (target !== 'dae-config' || !schemeID)
				return true;

			var expected = daeSchemePolicies[schemeID];
			return !!expected && !!result && result.target_policy === expected;
		}
		var schemeCompatEpoch = 0;
		var schemeCompatTimer = null;
		var preflightTimer = null;
		var preferRuleSets = E('input', { 'type': 'checkbox', 'name': 'prefer-rule-sets' });
		preferRuleSets.checked = true;
		var serviceRegionInputs = {};
		var serviceRegionOptions = [
			{ id: 'claude', name: 'Claude' },
			{ id: 'openai', name: 'OpenAI' },
			{ id: 'gemini', name: 'Gemini' },
			{ id: 'netflix', name: 'Netflix' }
		];
		var serviceRegionFields = serviceRegionOptions.map(function(service) {
			var select = E('select', { 'class': 'cbi-input-select', 'name': 'service-region-' + service.id });
			serviceRegionInputs[service.id] = select;
			select.addEventListener('change', function() {
				if (select.value)
					serviceRegions[service.id] = select.value;
				else
					delete serviceRegions[service.id];
				invalidateGeneration();
			});
			return E('label', { 'class': 'tower-service-region' }, [
				E('span', {}, [ service.name ]),
				select
			]);
		});
		var serviceRegionsPanel = E('div', { 'class': 'tower-service-regions' }, serviceRegionFields);

		function updateServiceRegionOptions() {
			var destination = currentDestination();
			var target = destination.target || destination.id;
			var supported = destinationCapability(destination).protocols || [];
			var regions = [];
			nodes.forEach(function(node) {
				if (selected[node.id] && supported.indexOf(node.kind) >= 0 && node.effective_region && regions.indexOf(node.effective_region) < 0)
					regions.push(node.effective_region);
			});
			regions.sort();
			serviceRegionsPanel.style.display = supportsServiceRegions(target) ? '' : 'none';
			serviceRegionOptions.forEach(function(service) {
				var select = serviceRegionInputs[service.id];
				var current = serviceRegions[service.id] || '';
				while (select.firstChild)
					select.removeChild(select.firstChild);
				select.appendChild(E('option', { 'value': '' }, [ _('不限') ]));
				if (current && regions.indexOf(current) < 0)
					select.appendChild(E('option', { 'value': current }, [ current + _('（当前所选节点中不可用）') ]));
				regions.forEach(function(region) {
					select.appendChild(E('option', { 'value': region }, [ region.toUpperCase() ]));
				});
				select.value = current;
			});
		}

		schemeSelect.appendChild(E('option', { 'value': '' }, [ _('默认（简单分流）') ]));
		schemes.forEach(function(s) {
			schemeTargets[s.id] = s.target_only || '';
			schemeLabels[s.id] = (s.name || _('未命名方案')) + (s.is_bundled ? '' : '（导入）');
			schemeSelect.appendChild(E('option', { 'value': s.id }, [ schemeLabels[s.id] ]));
		});
		var targetNote = E('p', { 'class': 'tower-target-note' });
		var schemeCompatibilityNote = E('p', { 'class': 'tower-target-note' });

		function updateTargetCapabilities() {
			var destination = currentDestination();
			var target = destination.target || destination.id;
			Array.prototype.forEach.call(schemeSelect.options, function(option) {
				option.disabled = (target === 'dae-config' && !!option.value && !daeSchemePolicies[option.value]) ||
					(!!option.value && !!schemeTargets[option.value] && schemeTargets[option.value] !== target);
			});
			if (schemeSelect.selectedOptions[0] && schemeSelect.selectedOptions[0].disabled)
				schemeSelect.value = target === 'dae-config' ? '' : destinationCapability(destination).default_rule || '';
			var nodeOnly = !!destination.nodeOnly;
			schemeSelect.disabled = nodeOnly;
			preferRuleSets.disabled = nodeOnly || target === 'dae-config';
			generateBtn.textContent = destination.target === 'links' ? _('生成节点订阅') : _('生成配置与链接');
			sharePanel.querySelector('#tower-copy-config').textContent = destination.target === 'links' ? _('复制节点订阅') : _('复制配置文本');
			if (nodeOnly) {
				schemeSelect.value = '';
				targetNote.textContent = _('此目标只导出节点订阅；完整配置和分流规则仍在目标插件中管理。');
			} else if (target === 'dae-config') {
				targetNote.textContent = _('dae 完整配置使用原生自动测速规则方案；其他不兼容规则会在预检中说明。');
			} else if (destination.target === 'clashoo-singbox') {
				targetNote.textContent = _('Clashoo 专用 sing-box 配置会内联受支持的规则集；当前目标不支持的节点会由严格预检提示。');
			} else {
				targetNote.textContent = _('使用所选规则方案生成完整配置；兼容目标仍需在对应插件中导入验证。');
			}
			if (!nodeOnly && target !== 'dae-config' && destinationCapability(destination).default_rule)
				schemeSelect.value = destinationCapability(destination).default_rule;
			invalidateGeneration();
			renderResults();
		}

		// —— 生成 ——
		var genStatus = E('span', { 'class': 'tower-gen-status' });
		var preflightReport = E('div', { 'class': 'tower-preflight' });

		function renderPreflight(result) {
			while (preflightReport.firstChild)
				preflightReport.removeChild(preflightReport.firstChild);
			if (!result)
				return;

			var status = result.status || 'unknown';
			var statusClass = status === 'exact' ? 'tower-preflight-ok' : status === 'degraded' ? 'tower-preflight-warning' : 'tower-preflight-error';
			var statusText = status === 'exact' ? _('预检通过') : status === 'degraded' ? _('预检发现兼容性降级') : status === 'unsupported' ? _('预检未通过') : _('预检状态未知');
			preflightReport.appendChild(E('p', { 'class': 'tower-preflight-title ' + statusClass }, [ statusText ]));
			if (result.policy_note)
				preflightReport.appendChild(E('p', { 'class': 'tower-target-note' }, [ result.policy_note ]));

			var issues = result.issues || [];
			var warnings = result.warnings || [];
			if (issues.length || warnings.length) {
				var details = E('details', { 'class': 'tower-preflight-details' });
				details.appendChild(E('summary', {}, [ _('问题明细（') + (issues.length + warnings.length) + '）' ]));
				if (issues.length) {
					details.appendChild(E('p', { 'class': 'tower-preflight-title' }, [ _('问题') ]));
					var issueList = E('ul', { 'class': 'tower-preflight-list' });
					issues.forEach(function(issue) {
						var location = issue.location ? ' [' + issue.location + ']' : '';
						var issueClass = issue.severity === 'warning' ? 'tower-preflight-warning' : 'tower-preflight-error';
						issueList.appendChild(E('li', { 'class': issueClass }, [ (issue.message || issue.code || _('未知问题')) + location ]));
					});
					details.appendChild(issueList);
				}
				if (warnings.length) {
					details.appendChild(E('p', { 'class': 'tower-preflight-title tower-preflight-warning' }, [ _('该方案不能完整导出') ]));
					var warningList = E('ul', { 'class': 'tower-preflight-list' });
					warnings.forEach(function(warning) {
						warningList.appendChild(E('li', { 'class': 'tower-preflight-warning' }, [ (warning.message || warning.code || _('未知差异')) + (warning.location ? ' [' + warning.location + ']' : '') ]));
					});
					details.appendChild(warningList);
				}
				preflightReport.appendChild(details);
			}

			var planned = result.planned || [];
			if (planned.length) {
				var plannedCounts = { node: 0, group: 0, rule: 0, resource: 0 };
				planned.forEach(function(item) {
					if (Object.prototype.hasOwnProperty.call(plannedCounts, item.kind))
						plannedCounts[item.kind]++;
				});
				preflightReport.appendChild(E('p', { 'class': 'tower-preflight-title' }, [
					_('计划导出：') + planned.length + _(' 项（节点 ') + plannedCounts.node + _(' · 组 ') + plannedCounts.group + _(' · 规则 ') + plannedCounts.rule + _(' · 规则资源 ') + plannedCounts.resource + '）'
				]));
			} else {
				preflightReport.appendChild(E('p', { 'class': 'tower-preflight-title' }, [ _('计划导出：0 项') ]));
				preflightReport.appendChild(E('p', {}, [ _('没有可导出的项目。') ]));
			}
		}

		function refreshSchemeCompatibility(target, ids, selectedScheme) {
			var epoch = ++schemeCompatEpoch;
			var options = Array.prototype.slice.call(schemeSelect.options).filter(function(option) {
				return !(option.value && schemeTargets[option.value] && schemeTargets[option.value] !== target) &&
					!(target === 'dae-config' && option.value && !daeSchemePolicies[option.value]);
			});
			if (!ids.length || target === 'links') {
				options.forEach(function(option) {
					option.textContent = schemeLabels[option.value];
					option.title = '';
					option.disabled = !ids.length && option.value !== selectedScheme;
				});
				schemeCompatibilityNote.textContent = ids.length ? '' : _('请先选择节点，再查看规则方案兼容性。');
				return Promise.resolve();
			}
			options.forEach(function(option) {
				option.disabled = option.value !== selectedScheme;
			});
			schemeCompatibilityNote.textContent = _('正在检查当前节点组合的规则方案…');
			if (schemeCompatTimer)
				clearTimeout(schemeCompatTimer);
			return new Promise(function(resolve) {
				schemeCompatTimer = setTimeout(function() {
					var queue = options.filter(function(option) { return option.value !== selectedScheme; });
					var exactCount = 0;
					var blocked = [];
					var next = 0;
					function worker() {
						if (next >= queue.length)
							return Promise.resolve();
						var option = queue[next++];
						return tower.rpcPreflightExport(target, '', ids.join(','), option.value, preferRuleSets.checked, true, serviceRegionsJSON(target, serviceRegions)).then(function(result) {
							if (epoch !== schemeCompatEpoch)
								return;
							var status = result && result.status || 'unknown';
							var policyMatches = targetPolicyMatches(target, option.value, result);
							var reason = (result && result.issues || []).concat(result && result.warnings || []).map(function(item) {
								return item.message || item.code;
							}).filter(Boolean)[0] || '';
							if (target === 'dae-config' && option.value && !policyMatches)
								reason = _('未返回预期的 DAE 目标策略元数据。');
							var exact = status === 'exact' && policyMatches;
							option.textContent = (exact ? '✓ ' : status === 'degraded' ? '⚠ ' : '× ') + schemeLabels[option.value];
							option.title = reason;
							option.disabled = !exact;
							if (exact)
								exactCount++;
							else
								blocked.push(schemeLabels[option.value] + (reason ? '：' + reason : ''));
						}).catch(function(error) {
							if (epoch !== schemeCompatEpoch)
								return;
							var reason = String(error);
							option.textContent = '× ' + schemeLabels[option.value];
							option.title = reason;
							option.disabled = true;
							blocked.push(schemeLabels[option.value] + '：' + reason);
						}).then(worker);
					}
					Promise.all([worker(), worker()]).then(function() {
						if (epoch === schemeCompatEpoch) {
						var firstBlocked = blocked[0] || '';
						schemeCompatibilityNote.textContent = _('当前节点组合下，另有 ') + exactCount + ' ' + _(' 套方案可完整导出；') + blocked.length + ' ' + _(' 套需调整。') +
							(firstBlocked ? ' ' + _('示例：') + firstBlocked : '');
						}
						resolve();
					});
				}, 350);
			});
		}

		function needsExportPreflight(target) {
			return target !== 'links';
		}

		var preflightEpoch = 0;
		function refreshStrictPreflight() {
			var epoch = ++preflightEpoch;
			var destination = currentDestination();
			var target = destination.target || destination.id;
			var ids = selectedIDs();
			refreshSchemeCompatibility(target, ids, schemeSelect.value);
			if (!needsExportPreflight(target)) {
				generateBtn.disabled = selectedCount() === 0;
				return Promise.resolve();
			}
			if (!ids.length) {
				generateBtn.disabled = true;
				renderPreflight({ status: 'unsupported', issues: [{ code: 'nodes_empty', message: _('请至少选择一个节点。') }], planned: [] });
				return Promise.resolve();
			}
			generateBtn.disabled = true;
			return tower.rpcPreflightExport(target, '', ids.join(','), schemeSelect.disabled ? '' : schemeSelect.value, preferRuleSets.checked, true, serviceRegionsJSON(target, serviceRegions)).then(function(result) {
				if (epoch !== preflightEpoch)
					return;
				var schemeID = schemeSelect.disabled ? '' : schemeSelect.value;
				if (result && result.status === 'exact' && !targetPolicyMatches(target, schemeID, result)) {
					result.status = 'unsupported';
					result.issues = (result.issues || []).concat([{ code: 'target_policy_mismatch', message: _('DAE 预检没有返回所选方案对应的目标策略元数据。') }]);
				}
				renderPreflight(result);
				generateBtn.disabled = !result || result.status !== 'exact' || !result.plan_digest;
			}).catch(function(error) {
				if (epoch !== preflightEpoch)
					return;
				renderPreflight({ status: 'unsupported', issues: [{ code: 'preflight_error', message: String(error) }], planned: [] });
				generateBtn.disabled = true;
			});
		}

		function setGenStatus(text, kind) {
			genStatus.textContent = text || '';
			genStatus.className = 'tower-gen-status' + (kind ? ' tower-gen-status-' + kind : '');
		}

		function clearGenerationResult() {
			sharePanel.classList.remove('tower-visible');
			currentContent = '';
			currentLinks = [];
			generatedOptions = null;
			previewArea.value = '';
			configTitle.textContent = _('配置文件');
			renderLinks([]);
			localShareURL.value = '';
			localShareStatus.textContent = '';
		}

		function invalidateGeneration() {
			updateServiceRegionOptions();
			generationSerial++;
			preflightEpoch++;
			schemeCompatEpoch++;
			discardActiveExport();
			renderPreflight(null);
			setGenStatus('', '');
			clearGenerationResult();
			generateBtn.disabled = true;
			if (preflightTimer)
				clearTimeout(preflightTimer);
			preflightTimer = setTimeout(refreshStrictPreflight, 350);
		}

		schemeSelect.addEventListener('change', invalidateGeneration);
		preferRuleSets.addEventListener('change', invalidateGeneration);

		var generateBtn = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': ui.createHandlerFn(this, function() {
				var requestID = ++generationSerial;
				discardActiveExport();
				renderPreflight(null);
				setGenStatus('', '');
				clearGenerationResult();
				var ids = selectedIDs();
				if (!ids.length) {
					setGenStatus(_('请至少选择一个节点。'), 'error');
					return Promise.resolve();
				}
				var destination = currentDestination();
				currentDestinationID = destination.id;
				var targetName = destination.target || destination.id;
				currentTargetName = targetName;
				var idsStr = ids.join(',');
				var schemeID = schemeSelect.disabled ? '' : schemeSelect.value;
				var preferRuleSetsValue = preferRuleSets.checked;
				generatedOptions = {
					destination: destination.id,
					target: targetName,
					nodes: idsStr,
					scheme: schemeID,
					preferRuleSets: preferRuleSetsValue,
					planDigest: '',
					targetPolicy: '',
					serviceRegions: serviceRegionsJSON(targetName, serviceRegions),
					strict: needsExportPreflight(targetName)
				};
				localShareURL.value = '';
				localShareStatus.textContent = '';
				setGenStatus(_('正在生成…'), 'busy');
				if (targetName === 'links') {
					return tower.rpcLinks('', idsStr).then(function(links) {
						if (requestID !== generationSerial)
							return;
						var allowed = destination.allowedKinds || [];
						var supported = links.filter(function(item) { return allowed.indexOf(item.kind) >= 0 && reusableLink(item); });
						if (!supported.length)
							throw new Error(_('所选节点没有此插件支持的协议。'));
						var raw = supported.map(function(item) { return item.link; }).join('\n') + '\n';
						currentContent = raw;
						previewArea.value = currentContent;
						configTitle.textContent = _('节点订阅');
						renderLinks(supported);
						sharePanel.classList.add('tower-visible');
						setGenStatus(_('已导出') + ' ' + supported.length + ' ' + _('个节点；跳过') + ' ' + (links.length - supported.length) + ' ' + _('个不兼容节点'), 'ok');
					}).catch(function(e) {
						if (requestID === generationSerial)
							setGenStatus(String(e), 'error');
					});
				}
				var preflight = needsExportPreflight(targetName)
							? tower.rpcPreflightExport(targetName, '', idsStr, schemeID, preferRuleSetsValue, true, generatedOptions.serviceRegions).then(function(result) {
						if (requestID !== generationSerial)
							return false;
						if (!result || typeof result !== 'object') {
						result = { status: 'unknown', issues: [{ message: _('预检没有返回有效结果。') }], planned: [] };
					}
					if (result.status === 'exact' && !targetPolicyMatches(targetName, schemeID, result)) {
						result.status = 'unsupported';
						result.issues = (result.issues || []).concat([{ code: 'target_policy_mismatch', message: _('DAE 预检没有返回所选方案对应的目标策略元数据。') }]);
					}
					renderPreflight(result);
					if (result.status !== 'exact')
						throw new Error(result.status === 'degraded' ? _('该方案存在未支持的差异，无法生成。') : result.status === 'unsupported' ? _('预检未通过，请先处理上方问题。') : _('预检返回未知状态，已停止导出。'));
					if (!result.plan_digest)
						throw new Error(_('预检没有返回计划摘要，已停止导出。'));
					generatedOptions.planDigest = result.plan_digest;
					generatedOptions.targetPolicy = result.target_policy || '';
						return new Promise(function(resolve) { requestAnimationFrame(resolve); }).then(function() {
							return requestID === generationSerial;
						});
					})
					: Promise.resolve().then(function() {
						renderPreflight(null);
						return requestID === generationSerial;
					});
				return preflight.then(function(ready) {
					if (!ready || requestID !== generationSerial)
						return null;
					return Promise.all([
						chunkedExport(targetName, idsStr, schemeID, preferRuleSetsValue, generatedOptions, requestID),
						tower.rpcLinks('', idsStr)
					]);
				}).then(function(res) {
					if (!res || requestID !== generationSerial)
						return;
					if (typeof res[0] !== 'string' || !res[0].trim())
						throw new Error(_('导出未返回配置内容，请重新登录后重试。'));
					currentContent = res[0] || '';
					previewArea.value = currentContent;
					configTitle.textContent = _('配置文件');
					renderLinks(res[1]);
					sharePanel.classList.add('tower-visible');
					setGenStatus(_('已生成配置与节点链接'), 'ok');
				}).catch(function(e) {
					if (requestID === generationSerial)
						setGenStatus(String(e), 'error');
				});
			})
		}, [ _('生成配置与链接') ]);

		// —— 分享面板按钮 ——
		sharePanel.querySelector('#tower-download-file').addEventListener('click', function() {
			if (!currentContent) {
				ui.addNotification(null, E('p', [ _('请先生成配置。') ]), 'error');
				return;
			}
			tower.downloadFile('tower-' + currentDestinationID + extFor(currentTargetName), currentContent);
			ui.addNotification(null, E('p', [ currentTargetName === 'links' ? _('节点订阅已下载') : _('配置文件已下载') ]), 'info');
		});

		sharePanel.querySelector('#tower-copy-config').addEventListener('click', function() {
			if (!currentContent) {
				ui.addNotification(null, E('p', [ _('请先生成配置。') ]), 'error');
				return;
			}
			tower.copyText(currentContent).then(function() {
				ui.addNotification(null, E('p', [ currentTargetName === 'links' ? _('节点订阅已复制') : _('配置已复制到剪贴板') ]), 'info');
			}).catch(function() {
				ui.addNotification(null, E('p', [ _('复制失败') ]), 'error');
			});
		});

		sharePanel.querySelector('#tower-download-links').addEventListener('click', function() {
			if (!currentLinks.length) {
				ui.addNotification(null, E('p', [ _('没有可导出的节点链接。') ]), 'error');
				return;
			}
			tower.downloadFile('tower-links.txt', currentLinks.map(function(i) { return i.link; }).join('\n') + '\n');
			ui.addNotification(null, E('p', [ _('链接文件已下载') ]), 'info');
		});

		sharePanel.querySelector('#tower-copy-links').addEventListener('click', function() {
			if (!currentLinks.length) {
				ui.addNotification(null, E('p', [ _('没有可导出的节点链接。') ]), 'error');
				return;
			}
			tower.copyText(currentLinks.map(function(i) { return i.link; }).join('\n')).then(function() {
				ui.addNotification(null, E('p', [ _('全部链接已复制') ]), 'info');
			}).catch(function() {
				ui.addNotification(null, E('p', [ _('复制失败') ]), 'error');
			});
		});

		sharePanel.querySelector('#tower-share-create').addEventListener('click', function() {
			if (!generatedOptions || !currentContent) {
				localShareStatus.textContent = _('请先生成配置。');
				return;
			}
			var shareOptions = generatedOptions;
			if (!targetPolicyMatches(shareOptions.target, shareOptions.scheme, { target_policy: shareOptions.targetPolicy })) {
				localShareStatus.textContent = _('生成结果的 DAE 目标策略信息不匹配，请重新生成配置。');
				return;
			}
			var shareGeneration = generationSerial;
			localShareStatus.textContent = _('正在生成…');
			tower.rpcShareCreate(shareOptions.destination, shareOptions.nodes, shareOptions.scheme, shareOptions.preferRuleSets, shareOptions.planDigest, [], shareOptions.strict, shareOptions.serviceRegions).then(function(result) {
				if (shareGeneration !== generationSerial || generatedOptions !== shareOptions)
					return;
				localShareURL.value = result.url;
				localShareStatus.textContent = _('本机地址已生成');
			}).catch(function(e) {
				if (shareGeneration === generationSerial && generatedOptions === shareOptions)
					localShareStatus.textContent = String(e);
			});
		});
		sharePanel.querySelector('#tower-share-copy').addEventListener('click', function() {
			if (!localShareURL.value) {
				localShareStatus.textContent = _('请先生成本机地址。');
				return;
			}
			tower.copyText(localShareURL.value).then(function() {
				localShareStatus.textContent = _('地址已复制');
			}).catch(function() {
				localShareStatus.textContent = _('复制失败');
			});
		});
		sharePanel.querySelector('#tower-share-revoke').addEventListener('click', function() {
			tower.rpcShareRevoke().then(function() {
				localShareURL.value = '';
				localShareStatus.textContent = _('共享已撤销');
			}).catch(function(e) {
				localShareStatus.textContent = String(e);
			});
		});

		// —— 节点选择工具栏 ——
		var filterInput = E('input', {
			'class': 'tower-filter',
			'placeholder': _('按名称搜索')
		});
		filterInput.addEventListener('input', function() {
			filterText = filterInput.value;
			renderResults();
		});

		var protocolList = E('div', { 'class': 'tower-protocol-list' });
		var existingKinds = [];
		nodes.forEach(function(n) { if (existingKinds.indexOf(n.kind) < 0) existingKinds.push(n.kind); });
		existingKinds.sort();
		var allProtocolsCheckbox = E('input', { 'type': 'checkbox' });
		allProtocolsCheckbox.checked = true;
		allProtocolsCheckbox.addEventListener('change', function() {
			allProtocols = allProtocolsCheckbox.checked;
			existingKinds.forEach(function(kind) { activeProtocols[kind] = allProtocols; });
			nodes.forEach(function(n) { selected[n.id] = allProtocols; });
			invalidateGeneration();
			renderProtocolList('all');
			renderResults();
		});
		function renderProtocolList(focusKind) {
			while (protocolList.firstChild)
				protocolList.removeChild(protocolList.firstChild);
			allProtocolsCheckbox.checked = allProtocols;
			protocolList.appendChild(E('label', { 'class': 'tower-protocol-option' }, [
				E('span', { 'class': 'tower-protocol-meta' }, [
					E('span', { 'class': 'tower-protocol-name' }, _('全部协议')),
					E('span', { 'class': 'tower-protocol-count' }, String(nodes.length))
				]),
				allProtocolsCheckbox
			]));
			existingKinds.forEach(function(kind) {
				var protocol = (tower.protocols || []).filter(function(item) { return item.id === kind; })[0];
				var count = nodes.filter(function(n) { return n.kind === kind; }).length;
				var checkbox = E('input', { 'type': 'checkbox' });
				checkbox.checked = !allProtocols && !!activeProtocols[kind];
				checkbox.addEventListener('change', function() {
					if (allProtocols) {
						allProtocols = false;
						existingKinds.forEach(function(existingKind) { activeProtocols[existingKind] = existingKind === kind; });
						nodes.forEach(function(n) {
							if (n.kind !== kind) selected[n.id] = false;
						});
					} else {
						activeProtocols[kind] = checkbox.checked;
						nodes.forEach(function(n) {
							if (n.kind === kind) selected[n.id] = checkbox.checked;
						});
					}
					invalidateGeneration();
					renderProtocolList(kind);
					renderResults();
				});
				protocolList.appendChild(E('label', { 'class': 'tower-protocol-option' }, [
					E('span', { 'class': 'tower-protocol-meta' }, [
						E('span', { 'class': 'tower-protocol-name' }, protocol ? protocol.name : kind),
						E('span', { 'class': 'tower-protocol-count' }, String(count))
					]),
					checkbox
				]));
			});
			var focusIndex = focusKind === 'all' ? 0 : existingKinds.indexOf(focusKind) + 1;
			if (focusIndex > 0 || focusKind === 'all')
				protocolList.querySelectorAll('input')[focusIndex].focus();
		}
		renderProtocolList();

		// —— 目标客户端 grid ——
		var clientGrid = tower.clients.map(clientCard);
		var openwrtGrid = tower.openwrtClients.map(clientCard);
		clientGrid[0].querySelector('input').checked = true;
		clientGrid.concat(openwrtGrid).forEach(function(card) {
			card.querySelector('input').addEventListener('change', updateTargetCapabilities);
		});
		updateTargetCapabilities();

		renderResults();

		if (nodes.length === 0) {
			return E('div', { 'class': 'cbi-map tower-export-page' }, [
				E('style', {}, [ css ]),
				E('div', { 'class': 'tower-empty' }, [ _('还没有节点。请先到「订阅」页添加订阅或导入节点。') ])
			]);
		}

		return E('div', { 'class': 'cbi-map tower-export-page' }, [
			E('style', {}, [ css ]),
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, _('1. 目标客户端')),
				E('div', { 'class': 'tower-client-section' }, [
					E('p', { 'class': 'tower-client-heading' }, [ _('桌面与移动客户端') ]),
					E('div', { 'class': 'tower-client-grid' }, clientGrid)
				]),
				E('div', { 'class': 'tower-client-section' }, [
					E('p', { 'class': 'tower-client-heading' }, [ _('OpenWrt 插件') ]),
					E('div', { 'class': 'tower-client-grid' }, openwrtGrid)
				]),
				targetNote
			]),
				E('div', { 'class': 'tower-card' }, [
					E('h4', { 'class': 'tower-card-title' }, _('2. 选择节点')),
					protocolList,
					E('div', { 'class': 'tower-toolbar' }, [ filterInput ]),
				E('div', { 'class': 'tower-summary' }, [
					E('span', {}, [ _('共'), ' ', statTotal, ' ', _('个节点') ]),
					E('span', {}, [ _('当前筛选'), ' ', statVisible, ' ', _('个') ]),
					E('span', {}, [ _('已选'), ' ', statSelected, ' ', _('个') ])
				]),
				resultBody
			]),
			E('div', { 'class': 'tower-card' }, [
				E('h4', { 'class': 'tower-card-title' }, _('3. 生成与导出')),
				E('div', { 'class': 'tower-toolbar' }, [
					E('span', { 'class': 'tower-scheme-label' }, [ _('规则方案') ]),
					schemeSelect,
					E('label', { 'class': 'tower-rule-set-check' }, [ preferRuleSets, _('优先使用原生规则集') ]),
				]),
				serviceRegionsPanel,
				schemeCompatibilityNote,
				E('div', { 'class': 'tower-toolbar' }, [ generateBtn, genStatus ]),
				preflightReport,
				sharePanel
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
