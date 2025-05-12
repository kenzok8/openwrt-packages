/*   Copyright (C) 2021-2025 sirpdboy herboy2008@gmail.com https://github.com/sirpdboy/luci-app-ddns-go */
'use strict';
'require dom';
'require fs';
'require poll';
'require uci';
'require view';
'require form';

return view.extend({
	render: function () {
		var css = `
			/* 日志框文本区域 */
			#log_textarea pre {
				padding: 10px; /* 内边距 */
				border-bottom: 1px solid #ddd; /* 边框颜色 */
				font-size: small;
				line-height: 1.3; /* 行高 */
				white-space: pre-wrap;
				word-wrap: break-word;
				overflow-y: auto;
			}
			/* 5s 自动刷新文字 */
			.cbi-section small {
				margin-left: 1rem;
				font-size: small; 
				color: #666; /* 深灰色文字 */
			}
		`;

		var log_textarea = E('div', { 'id': 'log_textarea' },
			E('img', {
				'src': L.resource(['icons/loading.gif']),
				'alt': _('Loading...'),
				'style': 'vertical-align:middle'
			}, _('Collecting data ...'))
		);

		var log_path = '/var/log/ddns-go.log';
		var lastLogContent = '';

		var clear_log_button = E('div', {}, [
			E('button', {
				'class': 'cbi-button cbi-button-remove',
				'click': function (ev) {
					ev.preventDefault();
					var button = ev.target;
					button.disabled = true;
					button.textContent = _('Clear Logs...');
					fs.exec_direct('/usr/libexec/ddns-go-call', ['clear_log'])
						.then(function () {
							button.textContent = _('Logs cleared successfully!');
							button.disabled = false;
							button.textContent = _('Clear Logs');
							// 立即刷新日志显示框
							var log = E('pre', { 'wrap': 'pre' }, [_('Log is clean.')]);
							dom.content(log_textarea, log);
							lastLogContent = '';
						})
						.catch(function () {
							button.textContent = _('Failed to clear log.');
							button.disabled = false;
							button.textContent = _('Clear Logs');
						});
				}
			}, _('Clear Logs'))
		]);

		poll.add(L.bind(function () {
			return fs.read_direct(log_path, 'text')
				.then(function (res) {
					var newContent = res.trim() || _('Log is clean.');

					if (newContent !== lastLogContent) {
						var log = E('pre', { 'wrap': 'pre' }, [newContent]);
						dom.content(log_textarea, log);
						log.scrollTop = log.scrollHeight;
						lastLogContent = newContent;
					}
				}).catch(function (err) {
					var log;
					if (err.toString().includes('NotFoundError')) {
						log = E('pre', { 'wrap': 'pre' }, [_('Log file does not exist.')]);
					} else {
						log = E('pre', { 'wrap': 'pre' }, [_('Unknown error: %s').format(err)]);
					}
					dom.content(log_textarea, log);
				});
		}));

		return E('div', { 'class': 'cbi-map' }, [
			E('style', [css]),
			E('div', { 'class': 'cbi-section' }, [
				clear_log_button,
				log_textarea,
				E('small', {}, _('Refresh every 5 seconds.').format(L.env.pollinterval)),
				E('div', { 'class': 'cbi-section-actions cbi-section-actions-right' })
			]),
		E('div', { 'style': 'text-align: right;  font-style: italic;' }, [
                E('span', {}, [
                    _('© github '),
                    E('a', { 
                        'href': 'https://github.com/sirpdboy', 
                        'target': '_blank',
                        'style': 'text-decoration: none;'
                    }, 'by sirpdboy')
                ])
            ])


		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
