'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require fs';
'require poll';

var HELPER = '/usr/share/openclaw/luci-helper';

function callHelper(args) {
	return L.resolveDefault(fs.exec_direct(HELPER, args), '').then(function(res) {
		try { return JSON.parse(String(res).trim()); }
		catch(e) { return {}; }
	});
}

function fmtMem(kb) {
	kb = parseInt(kb) || 0;
	if (kb <= 0) return '-';
	if (kb >= 1048576) return (kb / 1048576).toFixed(1) + ' GB';
	if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
	return kb + ' KB';
}

/* ── Logo: 官方 SVG 从 gateway static 资源动态加载 ── */
var LOGO_SVG = '<img src="/luci-static/openclaw/logo.svg" width="44" height="44" style="vertical-align:middle;border-radius:8px" onerror="this.style.display=\'none\'">';

/* ── CSS: inherit page theme, zero custom dark rules ── */
var CSS = '\
*,*::before,*::after{box-sizing:border-box}\
#oc-app{margin:0;padding:0;width:100%;color:inherit}\
.oc-header{padding:6px 0 4px;display:flex;align-items:center;gap:10px}\
.oc-header h2{margin:0;font-size:20px;font-weight:600;color:inherit}\
.oc-header .sub{font-size:11px;opacity:.5;margin-top:2px;letter-spacing:.3px}\
.oc-header>*,.oc-header h2,.oc-header .sub{background:transparent!important;box-shadow:none!important;border:none!important;border-radius:0!important;padding:0!important;margin:0!important}\
.oc-tabs{display:flex;border-bottom:2px solid currentColor;border-bottom-color:rgba(128,128,128,.25);overflow:hidden}\
.oc-tab{padding:10px 18px;font-size:13px;font-weight:500;opacity:.55;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .2s;white-space:nowrap;user-select:none;color:inherit}\
.oc-tab:hover{opacity:.85}\
.oc-tab.active{opacity:1;border-bottom-color:var(--primary,#5e72e4)}\
.oc-panel{display:none;padding:20px 0}\
.oc-panel.active{display:block}\
.oc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}\
.oc-card{border:1px solid rgba(128,128,128,.2);border-radius:10px;padding:14px 16px}\
.oc-card .lbl{font-size:11px;opacity:.55;letter-spacing:.3px}\
.oc-card .val{font-size:22px;font-weight:700;margin-top:4px;line-height:1.2}\
.oc-card .val.sm{font-size:15px;font-weight:600}\
.oc-badge{display:inline-block;padding:3px 14px;border-radius:20px;font-size:12px;font-weight:600}\
.oc-badge-run{background:#e8f5e9;color:#2e7d32}\
.oc-badge-stop{background:#ffebee;color:#c62828}\
.oc-badge-start{background:#fff8e1;color:#f57f17}\
.oc-badge-off{opacity:.5}\
.oc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}\
.oc-dot-g{background:#2e7d32}.oc-dot-r{background:#c62828}.oc-dot-y{background:#f57f17}.oc-dot-x{background:#9e9e9e}\
.oc-info{border:1px solid rgba(128,128,128,.2);border-radius:10px;padding:0;overflow:hidden;margin-bottom:20px}\
.oc-info-title{padding:12px 18px;font-size:13px;font-weight:600;opacity:.7;border-bottom:1px solid rgba(128,128,128,.15)}\
.oc-info table{width:100%;border-collapse:collapse}\
.oc-info tr,.oc-info tr:nth-of-type(2n){background:transparent!important}\
.oc-info td{padding:8px 16px;font-size:13px;border-bottom:1px solid rgba(128,128,128,.1)}\
.oc-info tr:last-child td{border-bottom:none}\
.oc-info td:first-child{width:100px;opacity:.6;font-weight:500}\
.oc-info td:last-child{word-break:break-all}\
.oc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}\
.oc-btn{padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}\
.oc-btn:hover{filter:brightness(.93)}\
.oc-btn:active{transform:scale(.97)}\
.oc-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}\
.oc-btn-p{background:var(--primary,#5e72e4);color:#fff}\
.oc-btn-s{background:#1b5e20;color:#fff;box-shadow:0 2px 6px rgba(27,94,32,.35)}\
.oc-btn-s:hover{background:#2e7d32}\
.oc-btn-d{background:#37474f;color:#fff;box-shadow:0 2px 6px rgba(55,71,79,.3)}\
.oc-btn-d:hover{background:#546e7a}\
.oc-btn-r{background:#1565c0;color:#fff;box-shadow:0 2px 6px rgba(21,101,192,.35)}\
.oc-btn-r:hover{background:#1976d2}\
.oc-btn-g{border:1px solid rgba(128,128,128,.3);color:inherit;background:transparent}\
.oc-btn-icon{padding:6px 10px;font-size:16px;line-height:1;min-width:unset}\
.oc-log-wrap{margin-top:16px;display:none}\
.oc-log-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}\
.oc-log-hdr span{font-weight:600;font-size:13px;opacity:.7}\
.oc-log-st{font-size:12px}\
.oc-log{background:#1e1e2e;color:#cdd6f4;padding:14px 16px;border-radius:8px;font-family:Consolas,Monaco,"Courier New",monospace;font-size:12px;line-height:1.6;max-height:380px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;border:1px solid #313244}\
.oc-log-result{margin-top:10px;padding:12px 16px;border-radius:8px;font-size:13px}\
.oc-log-ok{background:#e8f5e9;border:1px solid #c8e6c9;color:#2e7d32}\
.oc-log-fail{background:#ffebee;border:1px solid #ffcdd2;color:#c62828}\
.oc-form{border:1px solid rgba(128,128,128,.2);border-radius:10px;overflow:hidden;margin-bottom:20px}\
.oc-form-title{padding:12px 18px;font-size:13px;font-weight:600;opacity:.7;border-bottom:1px solid rgba(128,128,128,.15)}\
.oc-form-body{padding:6px 18px}\
.oc-form-row{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid rgba(128,128,128,.1)}\
.oc-form-row:last-child{border-bottom:none}\
.oc-form-lbl{width:120px;font-size:13px;font-weight:500;opacity:.7;flex-shrink:0}\
.oc-form-ctl{flex:1;min-width:0}\
.oc-form-ctl input,.oc-form-ctl select{padding:7px 10px;border:1px solid rgba(128,128,128,.3);border-radius:6px;font-size:13px;width:100%;max-width:260px;outline:none;transition:border-color .2s;background:transparent;color:inherit}\
.oc-form-ctl input:focus,.oc-form-ctl select:focus{border-color:var(--primary,#5e72e4)}\
.oc-form-hint{font-size:11px;opacity:.5;margin-top:3px}\
.oc-iframe-wrap{border:2px solid rgba(128,128,128,.2);border-radius:10px;overflow:hidden;margin-top:10px}\
.oc-iframe-wrap iframe{width:100%;height:650px;border:none;display:block}\
.oc-iframe-msg{padding:48px;text-align:center;opacity:.55;font-size:14px;line-height:1.8}\
.oc-iframe-msg .icon{font-size:36px;margin-bottom:12px}\
.oc-dialog-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:10000;display:flex;align-items:center;justify-content:center}\
.oc-dialog{background:var(--background-color-low,var(--background-color,#fff));border-radius:12px;padding:24px;max-width:440px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1px solid rgba(128,128,128,.2)}\
.oc-dialog h3{margin:0 0 16px;font-size:16px}\
.oc-dialog-opt{padding:12px 14px;border:2px solid rgba(128,128,128,.2);border-radius:8px;margin-bottom:10px;cursor:pointer;transition:all .2s}\
.oc-dialog-opt:hover{border-color:rgba(128,128,128,.5)}\
.oc-dialog-opt.sel{border-color:var(--primary,#5e72e4)}\
.oc-dialog-opt strong{display:block;font-size:13px}\
.oc-dialog-opt small{font-size:11px;opacity:.55;display:block;margin-top:3px}\
.oc-dialog-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}\
.oc-switch{position:relative;display:inline-block;width:44px;height:24px}\
.oc-switch input{opacity:0;width:0;height:0}\
.oc-switch .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:rgba(128,128,128,.35);border-radius:24px;transition:.3s}\
.oc-switch .slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}\
.oc-switch input:checked+.slider{background:var(--primary,#5e72e4)}\
.oc-switch input:checked+.slider:before{transform:translateX(20px)}\
.oc-more-wrap{position:relative;display:inline-block}\
.oc-more-menu{position:fixed;border:1px solid rgba(128,128,128,.2);border-radius:10px;box-shadow:0 -4px 20px rgba(0,0,0,.15);min-width:190px;z-index:9999;display:none;overflow:hidden;padding:4px 0;background:var(--background-color-low,#f8f8f8)}\
.oc-more-item{display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:13px;cursor:pointer;border:none;background:none;width:100%;text-align:left;transition:background .12s;color:inherit}\
.oc-more-item:hover{background:rgba(128,128,128,.1)}\
.oc-more-item.danger{color:inherit;background:none}\
.oc-more-item.danger:hover{background:rgba(128,128,128,.1)}\
.oc-more-sep{height:1px;background:rgba(128,128,128,.15);margin:4px 0}\
@media(max-width:768px){\
#oc-app{padding:0 10px;overflow-x:hidden}\
.oc-tabs{max-width:100%}\
.oc-header{padding:8px 0;gap:10px}\
.oc-header h2{font-size:16px}\
.oc-cards{grid-template-columns:repeat(2,1fr);gap:10px}\
.oc-card .val{font-size:17px}\
.oc-card .val.sm{font-size:13px}\
.oc-actions{gap:6px;flex-wrap:wrap;max-width:100%}\
.oc-actions>*{flex:0 1 auto;min-width:0}\
.oc-actions .oc-btn{padding:7px 10px;font-size:12px;white-space:nowrap;justify-content:center}\
.oc-form-row{flex-direction:column;align-items:stretch;gap:4px}\
.oc-form-lbl{width:auto}\
.oc-form-ctl input,.oc-form-ctl select{max-width:100%}\
.oc-iframe-wrap iframe{height:400px}\
.oc-info td:first-child{width:80px}\
}\
@media(max-width:420px){\
.oc-header{padding:6px 0}\
.oc-header h2{font-size:15px}\
.oc-tab{padding:9px 14px;font-size:12px}\
.oc-btn{padding:6px 10px;font-size:12px}\
.oc-actions .oc-btn{padding:6px 8px;font-size:11px}\
.oc-info td{padding:7px 12px;font-size:12px}\
.oc-cards{gap:8px}\
.oc-card{padding:10px 12px}\
.oc-card .val{font-size:16px}\
.oc-iframe-wrap iframe{height:350px}\
}\
';

return view.extend({

	load: function() {
		return Promise.all([
			uci.load('openclaw'),
			callHelper(['status'])
		]);
	},

	render: function(data) {
		var st = data[1] || {};
		this._st = st;
		this._setupTimer = null;
		this._upgradeTimer = null;
		this._tabEls = {};

		var contentEl = E('div', { 'id': 'oc-content' }, [
			this._overview(st),
			this._settings(),
			this._console(st),
			this._terminal(st)
		]);
		this._contentEl = contentEl;

		var app = E('div', { 'id': 'oc-app' }, [
			E('style', {}, [CSS]),
			this._header(),
			this._tabBar(),
			contentEl
		]);

		this._switchTab('overview');
		poll.add(L.bind(this._poll, this), 5);

		document.addEventListener('click', function() {
			var m = document.getElementById('oc-more-menu');
			if (m) m.style.display = 'none';
		});

		return app;
	},

	/* ═══ Header ═══ */
	_header: function() {
		var h = E('div', { 'class': 'oc-header' });
		h.innerHTML = LOGO_SVG +
			'<div><h2>OpenClaw AI Gateway</h2>' +
			'<div class="sub">' + _('OpenWrt 路由器智能 AI 网关') + '</div></div>';
		return h;
	},

	/* ═══ Tabs ═══ */
	_tabBar: function() {
		var self = this;
		var tabs = [
			['overview', _('概况')],
			['settings', _('设置')],
			['console',  _('Web 控制台')],
			['terminal', _('配置终端')]
		];
		var bar = E('div', { 'class': 'oc-tabs' });
		tabs.forEach(function(t) {
			var el = E('div', {
				'class': 'oc-tab',
				'data-tab': t[0],
				'click': function() { self._switchTab(t[0]); }
			}, [t[1]]);
			self._tabEls[t[0]] = el;
			bar.appendChild(el);
		});
		return bar;
	},

	_switchTab: function(id) {
		var self = this;
		Object.keys(this._tabEls).forEach(function(k) {
			self._tabEls[k].classList.toggle('active', k === id);
		});
		var root = this._contentEl || document.getElementById('oc-content');
		if (root) {
			var panels = root.querySelectorAll('.oc-panel');
			if (panels) panels.forEach(function(p) {
				p.classList.toggle('active', p.getAttribute('data-panel') === id);
			});
		}
	},

	/* ═══ Overview Panel ═══ */
	_overview: function(st) {
		return E('div', { 'class': 'oc-panel', 'data-panel': 'overview' }, [
			/* Status Cards */
			E('div', { 'class': 'oc-cards' }, [
				this._card('status',  _('服务状态'), this._badge(st)),
				this._card('port',    _('网关端口'),   st.port || '18789', true),
				this._card('memory',  _('内存'),       fmtMem(st.memory_kb), true),
				this._card('uptime',  _('运行时间'),   st.uptime || '-', true)
			]),
			/* Version Info */
			this._infoTable(st),
			/* Action Buttons */
			this._actionBtns(),
			/* Log Viewer */
			this._logViewer()
		]);
	},

	_card: function(id, label, valueHtml, small) {
		var c = E('div', { 'class': 'oc-card' }, [
			E('div', { 'class': 'lbl' }, [label]),
			E('div', { 'class': 'val' + (small ? ' sm' : ''), 'id': 'oc-c-' + id })
		]);
		if (typeof valueHtml === 'string' && valueHtml.indexOf('<') >= 0)
			c.querySelector('.val').innerHTML = valueHtml;
		else
			c.querySelector('.val').textContent = valueHtml || '-';
		return c;
	},

	_badge: function(st) {
		if (!st || !st.enabled) return '<span class="oc-badge oc-badge-off">' + _('未知') + '</span>';
		if (st.enabled !== '1') return '<span class="oc-badge oc-badge-off"><span class="oc-dot oc-dot-x"></span>' + _('已禁用') + '</span>';
		if (st.gateway_running) return '<span class="oc-badge oc-badge-run"><span class="oc-dot oc-dot-g"></span>' + _('运行中') + '</span>';
		if (st.gateway_starting) return '<span class="oc-badge oc-badge-start"><span class="oc-dot oc-dot-y"></span>' + _('启动中') + '</span>';
		return '<span class="oc-badge oc-badge-stop"><span class="oc-dot oc-dot-r"></span>' + _('已停止') + '</span>';
	},

	_infoTable: function(st) {
		var rows = [
			[_('Node.js'),      'oc-i-node',     st.node_version || _('未安装')],
			[_('OpenClaw'),     'oc-i-oc',       st.oc_version || _('未安装')],
			[_('插件'),          'oc-i-plugin',   st.plugin_version || '-'],
			[_('活动模型'),       'oc-i-model',    st.active_model || '-'],
			[_('消息渠道'),       'oc-i-channels', st.channels || '-'],
			[_('PID'),          'oc-i-pid',      st.pid || '-'],
			[_('配置终端'),       'oc-i-pty',      st.pty_running ? '✅ ' + _('运行中') + ' (:' + (st.pty_port || '18793') + ')' : '⏹ ' + _('已停止')]
		];
		var tbody = E('tbody');
		rows.forEach(function(r) {
			tbody.appendChild(E('tr', {}, [
				E('td', {}, [r[0]]),
				E('td', { 'id': r[1] }, [r[2]])
			]));
		});
		return E('div', { 'class': 'oc-info' }, [
			E('div', { 'class': 'oc-info-title' }, [_('系统信息')]),
			E('table', {}, [tbody])
		]);
	},

	_actionBtns: function() {
		var self = this;
		var wrap = E('div', { 'class': 'oc-actions' });

		/* 主操作：启动 / 停止 / 重启 */
		wrap.appendChild(E('button', {
			'class': 'oc-btn oc-btn-s', 'id': 'oc-btn-start',
			'click': function() { self._svcCtl('start'); }
		}, ['▶ ' + _('启动')]));

		wrap.appendChild(E('button', {
			'class': 'oc-btn oc-btn-d', 'id': 'oc-btn-stop',
			'click': function() { self._svcCtl('stop'); }
		}, ['⏹ ' + _('停止')]));

		wrap.appendChild(E('button', {
			'class': 'oc-btn oc-btn-r', 'id': 'oc-btn-restart',
			'click': function() { self._svcCtl('restart'); }
		}, ['🔄 ' + _('重启')]));

		/* 设置齿轮：只放低频操作（重装 / 卸载） */
		var gearWrap = E('div', { 'class': 'oc-more-wrap' });
		gearWrap.appendChild(E('button', {
			'class': 'oc-btn oc-btn-g oc-btn-icon', 'title': _('更多操作'),
			'click': function(ev) {
				ev.stopPropagation();
				var m = document.getElementById('oc-more-menu');
				if (!m) return;
				if (m.style.display === 'block') { m.style.display = 'none'; return; }
				var rect = ev.currentTarget.getBoundingClientRect();
				m.style.display = 'block';
				var mh = m.offsetHeight;
				m.style.top = (rect.top - mh - 6) + 'px';
				m.style.left = 'auto';
				m.style.right = (window.innerWidth - rect.right) + 'px';
			}
		}, ['⚙']));

		gearWrap.appendChild(E('div', { 'class': 'oc-more-menu', 'id': 'oc-more-menu' }, [
			E('div', { 'class': 'oc-more-item', 'click': function() { self._closeMenu(); self._showSetupDialog(); } }, ['📦 ' + _('安装环境')]),
			E('div', { 'class': 'oc-more-sep' }),
			E('div', { 'class': 'oc-more-item', 'click': function() { self._closeMenu(); self._uninstall(); } }, ['🗑️ ' + _('卸载')])
		]));

		wrap.appendChild(gearWrap);
		return wrap;
	},

	_closeMenu: function() {
		var m = document.getElementById('oc-more-menu');
		if (m) m.style.display = 'none';
	},

	_logViewer: function() {
		return E('div', { 'class': 'oc-log-wrap', 'id': 'oc-log-wrap' }, [
			E('div', { 'class': 'oc-log-hdr' }, [
				E('span', { 'id': 'oc-log-title' }, ['📋 ' + _('日志')]),
				E('span', { 'class': 'oc-log-st', 'id': 'oc-log-st' })
			]),
			E('pre', { 'class': 'oc-log', 'id': 'oc-log' }),
			E('div', { 'id': 'oc-log-result' })
		]);
	},

	/* ═══ Settings Panel ═══ */
	_settings: function() {
		var self = this;
		var enabled = uci.get('openclaw', 'main', 'enabled') === '1';
		var port = uci.get('openclaw', 'main', 'port') || '18789';
		var bind = uci.get('openclaw', 'main', 'bind') || 'lan';
		var ptyPort = uci.get('openclaw', 'main', 'pty_port') || '18793';

		return E('div', { 'class': 'oc-panel', 'data-panel': 'settings' }, [
			E('div', { 'class': 'oc-form' }, [
				E('div', { 'class': 'oc-form-title' }, [_('基本设置')]),
				E('div', { 'class': 'oc-form-body' }, [
					this._formRow(_('启用服务'), this._toggle('oc-f-enabled', enabled)),
					this._formRow(_('网关端口'), this._input('oc-f-port', port, 'number', _('默认: 18789'))),
					this._formRow(_('监听接口'), this._select('oc-f-bind', bind, [
						['lan', 'LAN'],
						['loopback', 'Loopback'],
						['all', _('所有接口')]
					])),
					this._formRow(_('PTY 端口'), this._input('oc-f-pty-port', ptyPort, 'number', _('默认: 18793')))
				])
			]),
			E('div', { 'class': 'oc-actions' }, [
				E('button', { 'class': 'oc-btn oc-btn-p', 'click': function() { self._saveSettings(); } }, ['💾 ' + _('保存并应用')]),
				E('button', { 'class': 'oc-btn oc-btn-g', 'click': function() { location.reload(); } }, [_('重置')])
			])
		]);
	},

	_formRow: function(label, control) {
		return E('div', { 'class': 'oc-form-row' }, [
			E('div', { 'class': 'oc-form-lbl' }, [label]),
			E('div', { 'class': 'oc-form-ctl' }, [control])
		]);
	},

	_toggle: function(id, checked) {
		var lbl = E('label', { 'class': 'oc-switch' });
		lbl.innerHTML = '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="slider"></span>';
		return lbl;
	},

	_input: function(id, value, type, hint) {
		var wrap = E('div');
		wrap.appendChild(E('input', { 'type': type || 'text', 'id': id, 'value': value }));
		if (hint) wrap.appendChild(E('div', { 'class': 'oc-form-hint' }, [hint]));
		return wrap;
	},

	_select: function(id, value, opts) {
		var sel = E('select', { 'id': id });
		opts.forEach(function(o) {
			var opt = E('option', { 'value': o[0] }, [o[1]]);
			if (o[0] === value) opt.setAttribute('selected', 'selected');
			sel.appendChild(opt);
		});
		return sel;
	},

	/* ═══ Console Panel ═══ */
	_console: function(st) {
		var panel = E('div', { 'class': 'oc-panel', 'data-panel': 'console' });
		var container = E('div', { 'class': 'oc-iframe-wrap' });

		if (st.gateway_running) {
			var proto = window.location.protocol;
			var host = window.location.hostname;
			var base = proto + '//' + host + ':' + (st.port || '18789') + '/';

			/* 先加载占位，再异步拿 token 拼到 URL，避免登录弹窗 */
			container.innerHTML = '<div class="oc-iframe-msg"><div class="icon">⏳</div><div>' + _('正在连接...') + '</div></div>';
			callHelper(['get_token']).then(function(tok) {
				var url = base;
				if (tok && tok.token) url += '?token=' + encodeURIComponent(tok.token);
				container.innerHTML = '';
				container.appendChild(E('iframe', {
					'src': url,
					'id': 'oc-console-iframe',
					'allow': 'clipboard-read; clipboard-write',
					'style': 'width:100%;height:650px;border:none;display:block',
					'loading': 'lazy'
				}));
			});
		} else {
			container.innerHTML = '<div class="oc-iframe-msg">' +
				'<div class="icon">🖥️</div>' +
				'<div>' + _('Web 控制台不可用。') + '</div>' +
				'<div style="margin-top:8px;font-size:12px;color:#aaa">' + _('请先启动 OpenClaw 服务。') + '</div></div>';
		}
		panel.appendChild(container);
		return panel;
	},

	/* ═══ Terminal Panel ═══ */
	_terminal: function(st) {
		var panel = E('div', { 'class': 'oc-panel', 'data-panel': 'terminal' });
		var container = E('div', { 'class': 'oc-iframe-wrap' });

		if (st.pty_running) {
			var proto = window.location.protocol;
			var host = window.location.hostname;
			var ptyPort = st.pty_port || '18793';
			var url = proto + '//' + host + ':' + ptyPort + '/';

			/* Load PTY token then build iframe */
			callHelper(['get_token']).then(function(tok) {
				if (tok && tok.pty_token)
					url += '?pty_token=' + encodeURIComponent(tok.pty_token);
				container.innerHTML = '';
				container.appendChild(E('iframe', {
					'src': url,
					'allow': 'clipboard-read; clipboard-write',
					'style': 'width:100%;height:650px;border:none;display:block',
					'loading': 'lazy'
				}));
			});
			container.innerHTML = '<div class="oc-iframe-msg">' +
				'<div class="icon">⏳</div>' +
				'<div>' + _('正在连接配置终端...') + '</div></div>';
		} else {
			container.innerHTML = '<div class="oc-iframe-msg">' +
				'<div class="icon">⌨️</div>' +
				'<div>' + _('配置终端未运行。') + '</div>' +
				'<div style="margin-top:8px;font-size:12px;color:#aaa">' + _('请先启动 OpenClaw 服务。') + '</div></div>';
		}
		panel.appendChild(container);
		return panel;
	},

	/* ═══ Status Polling ═══ */
	_poll: function() {
		var self = this;
		return callHelper(['status']).then(function(st) {
			self._st = st;
			self._updateDisplay(st);
		});
	},

	_updateDisplay: function(st) {
		var el;
		/* Status card */
		el = document.getElementById('oc-c-status');
		if (el) el.innerHTML = this._badge(st);
		/* Port */
		el = document.getElementById('oc-c-port');
		if (el) el.textContent = st.port || '18789';
		/* Memory */
		el = document.getElementById('oc-c-memory');
		if (el) el.textContent = fmtMem(st.memory_kb);
		/* Uptime */
		el = document.getElementById('oc-c-uptime');
		if (el) el.textContent = st.uptime || '-';
		/* Info rows */
		var map = {
			'oc-i-node': st.node_version || _('未安装'),
			'oc-i-oc': st.oc_version || _('未安装'),
			'oc-i-plugin': st.plugin_version || '-',
			'oc-i-model': st.active_model || '-',
			'oc-i-channels': st.channels || '-',
			'oc-i-pid': st.pid || '-',
			'oc-i-pty': st.pty_running ? '✅ ' + _('运行中') + ' (:' + (st.pty_port || '18793') + ')' : '⏹ ' + _('已停止')
		};
		Object.keys(map).forEach(function(id) {
			el = document.getElementById(id);
			if (el) el.textContent = map[id];
		});
		/* Button states */
		var startBtn = document.getElementById('oc-btn-start');
		var stopBtn = document.getElementById('oc-btn-stop');
		if (startBtn) startBtn.disabled = !!st.gateway_running;
		if (stopBtn) stopBtn.disabled = !st.gateway_running;
	},

	/* ═══ Service Control ═══ */
	_svcCtl: function(action) {
		var self = this;
		ui.showModal(_('服务控制'), [
			E('p', {}, [_('正在执行: ') + action + '...']),
			E('div', { 'class': 'spinning' })
		]);
		return fs.exec('/etc/init.d/openclaw', [action]).then(function() {
			return new Promise(function(resolve) { window.setTimeout(resolve, 2500); });
		}).then(function() {
			return self._poll();
		}).then(function() {
			ui.hideModal();
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, [_('错误: ') + (e.message || e)]));
		});
	},

	/* ═══ Setup Dialog ═══ */
	_showSetupDialog: function() {
		var self = this;
		var choice = 'stable';

		var overlay = E('div', { 'class': 'oc-dialog-overlay', 'id': 'oc-setup-dlg' });
		var dlg = E('div', { 'class': 'oc-dialog' }, [
			E('h3', {}, ['📦 ' + _('安装环境')]),
			E('div', {
				'class': 'oc-dialog-opt sel', 'id': 'oc-opt-stable',
				'click': function() { choice = 'stable'; self._selOpt('stable'); }
			}, [
				E('strong', {}, ['✅ ' + _('稳定版（推荐）')]),
				E('small', {}, [_('经过测试验证，兼容性好')])
			]),
			E('div', {
				'class': 'oc-dialog-opt', 'id': 'oc-opt-latest',
				'click': function() { choice = 'latest'; self._selOpt('latest'); }
			}, [
				E('strong', {}, ['🆕 ' + _('最新版')]),
				E('small', {}, ['⚠️ ' + _('最新 npm 发布版，可能存在未测试问题')])
			]),
			E('div', { 'class': 'oc-dialog-btns' }, [
				E('button', { 'class': 'oc-btn oc-btn-g', 'click': function() { overlay.remove(); } }, [_('取消')]),
				E('button', { 'class': 'oc-btn oc-btn-p', 'click': function() { overlay.remove(); self._doSetup(choice); } }, [_('安装')])
			])
		]);
		overlay.appendChild(dlg);
		document.body.appendChild(overlay);
	},

	_selOpt: function(which) {
		var stable = document.getElementById('oc-opt-stable');
		var latest = document.getElementById('oc-opt-latest');
		if (stable) stable.classList.toggle('sel', which === 'stable');
		if (latest) latest.classList.toggle('sel', which === 'latest');
	},

	_doSetup: function(version) {
		var self = this;
		var logWrap = document.getElementById('oc-log-wrap');
		var logEl = document.getElementById('oc-log');
		var stEl = document.getElementById('oc-log-st');
		var resultEl = document.getElementById('oc-log-result');

		if (logWrap) logWrap.style.display = 'block';
		if (logEl) logEl.textContent = _('开始安装') + ' (' + version + ')...\n';
		if (stEl) stEl.innerHTML = '<span style="color:#1565c0">⏳ ' + _('安装中...') + '</span>';
		if (resultEl) { resultEl.innerHTML = ''; resultEl.className = ''; }

		callHelper(['setup', version]).then(function() {
			self._pollSetupLog();
		});
	},

	_pollSetupLog: function() {
		var self = this;
		var lastLen = 0;
		if (this._setupTimer) clearInterval(this._setupTimer);

		this._setupTimer = setInterval(function() {
			callHelper(['setup_log']).then(function(r) {
				var logEl = document.getElementById('oc-log');
				var stEl = document.getElementById('oc-log-st');
				var resultEl = document.getElementById('oc-log-result');
				if (!logEl) return;

				if (r.log && r.log.length > lastLen) {
					logEl.textContent += r.log.substring(lastLen);
					lastLen = r.log.length;
				}
				logEl.scrollTop = logEl.scrollHeight;

				if (r.state === 'running') {
					if (stEl) stEl.innerHTML = '<span style="color:#1565c0">⏳ ' + _('安装中...') + '</span>';
				} else if (r.state === 'success') {
					clearInterval(self._setupTimer);
					if (stEl) stEl.innerHTML = '<span style="color:#2e7d32">✅ ' + _('完成') + '</span>';
					if (resultEl) {
						resultEl.className = 'oc-log-result oc-log-ok';
						resultEl.innerHTML = '<strong>🎉 ' + _('安装成功！') + '</strong><br>' +
							'<span style="font-size:12px">' + _('刷新页面查看最新状态。') + '</span>' +
							'<br><button class="oc-btn oc-btn-p" style="margin-top:10px" onclick="location.reload()">🔄 ' + _('刷新') + '</button>';
					}
				} else if (r.state === 'failed') {
					clearInterval(self._setupTimer);
					if (stEl) stEl.innerHTML = '<span style="color:#c62828">❌ ' + _('失败') + '</span>';
					if (resultEl) {
						resultEl.className = 'oc-log-result oc-log-fail';
						resultEl.textContent = '❌ ' + _('安装失败，请查看上方日志了解详情。');
					}
				}
			});
		}, 1500);
	},

	/* ═══ Check Update ═══ */
	_checkUpdate: function() {
		var self = this;
		var btn = document.getElementById('oc-btn-update');
		if (btn) { btn.disabled = true; btn.textContent = '🔍 ' + _('检查中...'); }

		callHelper(['check_update']).then(function(r) {
			if (btn) { btn.disabled = false; btn.textContent = '🔍 ' + _('检查更新'); }
			if (r.plugin_has_update) {
				ui.showModal(_('有可用更新'), [
					E('p', {}, [_('当前版本: ') + (r.plugin_current || '-')]),
					E('p', {}, [_('最新版本: ') + (r.plugin_latest || '-')]),
					r.release_notes ? E('pre', { 'style': 'max-height:200px;overflow:auto;font-size:12px;background:#f5f5f5;padding:12px;border-radius:6px' }, [r.release_notes]) : E('span'),
					E('div', { 'style': 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
						E('button', { 'class': 'oc-btn oc-btn-g', 'click': function() { ui.hideModal(); } }, [_('稍后')]),
						E('button', { 'class': 'oc-btn oc-btn-p', 'click': function() { ui.hideModal(); self._doUpgrade(r.plugin_latest); } }, ['⬆️ ' + _('升级')])
					])
				]);
			} else {
				ui.addNotification(null, E('p', {}, ['✅ ' + _('已是最新版本')]));
			}
		});
	},

	_doUpgrade: function(version) {
		var self = this;
		var logWrap = document.getElementById('oc-log-wrap');
		var logEl = document.getElementById('oc-log');
		var stEl = document.getElementById('oc-log-st');
		if (logWrap) logWrap.style.display = 'block';
		if (logEl) logEl.textContent = _('正在升级到 ') + version + '...\n';
		if (stEl) stEl.innerHTML = '<span style="color:#1565c0">⏳ ' + _('升级中...') + '</span>';

		callHelper(['plugin_upgrade', version]).then(function() {
			self._pollUpgradeLog();
		});
	},

	_pollUpgradeLog: function() {
		var self = this;
		var lastLen = 0;
		if (this._upgradeTimer) clearInterval(this._upgradeTimer);

		this._upgradeTimer = setInterval(function() {
			callHelper(['plugin_upgrade_log']).then(function(r) {
				var logEl = document.getElementById('oc-log');
				var stEl = document.getElementById('oc-log-st');
				var resultEl = document.getElementById('oc-log-result');
				if (!logEl) return;
				if (r.log && r.log.length > lastLen) {
					logEl.textContent += r.log.substring(lastLen);
					lastLen = r.log.length;
				}
				logEl.scrollTop = logEl.scrollHeight;
				if (r.state === 'success') {
					clearInterval(self._upgradeTimer);
					if (stEl) stEl.innerHTML = '<span style="color:#2e7d32">✅ ' + _('升级完成') + '</span>';
					if (resultEl) {
						resultEl.className = 'oc-log-result oc-log-ok';
						resultEl.innerHTML = '<strong>🎉 ' + _('升级成功！') + '</strong>' +
							'<br><button class="oc-btn oc-btn-p" style="margin-top:10px" onclick="location.reload()">🔄 ' + _('刷新') + '</button>';
					}
				} else if (r.state === 'failed') {
					clearInterval(self._upgradeTimer);
					if (stEl) stEl.innerHTML = '<span style="color:#c62828">❌ ' + _('失败') + '</span>';
				}
			});
		}, 1500);
	},

	/* ═══ Uninstall ═══ */
	_uninstall: function() {
		var self = this;
		ui.showModal(_('确认卸载'), [
			E('p', { 'style': 'color:#c62828' }, [
				'⚠️ ' + _('这将删除 Node.js、OpenClaw 运行时及所有相关数据。')
			]),
			E('p', {}, [_('此操作不可撤销。')]),
			E('div', { 'style': 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px' }, [
				E('button', { 'class': 'oc-btn oc-btn-g', 'click': function() { ui.hideModal(); } }, [_('取消')]),
				E('button', { 'class': 'oc-btn oc-btn-d', 'click': function() {
					ui.hideModal();
					ui.showModal(_('卸载中...'), [E('div', { 'class': 'spinning' })]);
					callHelper(['uninstall']).then(function() {
						ui.hideModal();
						ui.addNotification(null, E('p', {}, ['✅ ' + _('环境已成功卸载')]));
						return self._poll();
					});
				} }, ['🗑️ ' + _('确认卸载')])
			])
		]);
	},

	/* ═══ Save Settings ═══ */
	_saveSettings: function() {
		var self = this;
		var enabled = document.getElementById('oc-f-enabled');
		var port = document.getElementById('oc-f-port');
		var bind = document.getElementById('oc-f-bind');
		var ptyPort = document.getElementById('oc-f-pty-port');

		uci.set('openclaw', 'main', 'enabled', enabled && enabled.checked ? '1' : '0');
		if (port) uci.set('openclaw', 'main', 'port', port.value);
		if (bind) uci.set('openclaw', 'main', 'bind', bind.value);
		if (ptyPort) uci.set('openclaw', 'main', 'pty_port', ptyPort.value);

		return uci.save().then(function() {
			return uci.apply();
		}).then(function() {
			ui.addNotification(null, E('p', {}, ['✅ ' + _('设置已保存')]));
			return self._poll();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, [_('错误: ') + (e.message || e)]));
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
