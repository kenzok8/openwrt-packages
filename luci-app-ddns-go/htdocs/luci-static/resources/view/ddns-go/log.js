// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2022-2026 sirpdboy <herboy2008@gmail.com>
 */
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
			#log_textarea pre {
				padding: 10px; /* 内边距 */
				border-bottom: 1px solid #ddd; /* 边框颜色 */
				font-size: small;
				line-height: 1.3; /* 行高 */
				white-space: pre-wrap;
				word-wrap: break-word;
				overflow-y: auto;
			}
			.cbi-section small {
				margin-left: 1rem;
				font-size: small; 
			}
			.log-container {
				display: flex;
				flex-direction: column;
				max-height: 1200px;
				overflow-y: auto;
				border-radius: 3px;
				margin-top: 10px;
				padding: 5px;
			}
			.log-line {
				padding: 3px 0;
				font-family: monospace;
				font-size: 12px;
				line-height: 1.4;
			}
			.log-line:last-child {
				border-bottom: none;
			}
			.log-timestamp {
				margin-right: 10px;
			}

		`;

		var log_container = E('div', { 'class': 'log-container', 'id': 'log_container' },
			E('img', {
				'src': L.resource(['icons/loading.gif']),
				'alt': _('Loading...'),
				'style': 'vertical-align:middle'
			}, _('Collecting data ...'))
		);

		var log_path = '/var/log/ddns-go.log';
		var lastLogContent = '';
		var lastScrollTop = 0;
		var isScrolledToTop = true; 

		// 解析日志行的时间戳
		function parseLogTimestamp(logLine) {
			// 匹配格式: 2026/01/21 22:35:13 Listening on :9876
			var timestampMatch = logLine.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
			if (timestampMatch) {
				var dateStr = timestampMatch[1].replace(/\//g, '-');
				return new Date(dateStr).getTime();
			}
			return Date.now();
		}

		function reverseLogLines(logContent) {
			if (!logContent || logContent.trim() === '') {
				return logContent;
			}
			
			var lines = logContent.split('\n');
			
			lines = lines.filter(function(line) {
				return line.trim() !== '';
			});
			
			lines.sort(function(a, b) {
				var timeA = parseLogTimestamp(a);
				var timeB = parseLogTimestamp(b);
				return timeB - timeA; // 降序排列
			});
			
			return lines.join('\n');
		}
		function formatLogLines(logContent, isNewContent) {
			if (!logContent || logContent.trim() === '') {
				return E('div', { 'class': 'log-line' }, _('Log is clean.'));
			}
			
			var lines = logContent.split('\n');
			var formattedLines = [];
			
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i].trim();
				if (line === '') continue;
				
				var timestampMatch = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
				var timestampSpan = null;
				var messageSpan = null;
				var lineClass = 'log-line';

				
				if (timestampMatch) {
					timestampSpan = E('span', { 
						'class': 'log-timestamp',
						'title': timestampMatch[1]
					}, timestampMatch[0] + ' ');
					messageSpan = E('span', {}, line.substring(timestampMatch[0].length + 1));
				} else {
					messageSpan = E('span', {}, line);
				}
				
				var lineDiv = E('div', { 'class': lineClass }, [
					timestampSpan,
					messageSpan
				].filter(function(el) { return el !== null; }));
				
				formattedLines.push(lineDiv);
			}
			
			return E('div', {}, formattedLines);
		}

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
							var logContent = _('Log is clean.');
							lastLogContent = logContent;
							dom.content(log_container, formatLogLines(logContent, false));
							isScrolledToTop = true; // 清空日志后，保持在顶部
						})
						.catch(function () {
							button.textContent = _('Failed to clear log.');
							button.disabled = false;
							button.textContent = _('Clear Logs');
						});
				}
			}, _('Clear Logs'))
		]);

		log_container.addEventListener('scroll', function() {
			lastScrollTop = this.scrollTop;
			isScrolledToTop = this.scrollTop <= 1;
		});

		poll.add(L.bind(function () {
			return fs.read_direct(log_path, 'text')
				.then(function (res) {
					var logContent = res.trim();
					if (logContent === '') {
						logContent = _('Log is clean.');
					}
					
					// 检查内容是否有变化
					if (logContent !== lastLogContent) {
						var isNewContent = lastLogContent !== '' && lastLogContent !== _('Log is clean.');
						
						var reversedLog = reverseLogLines(logContent);
						// 格式化为HTML
						var formattedLog = formatLogLines(reversedLog, isNewContent);
						
						var prevScrollHeight = log_container.scrollHeight;
						var prevScrollTop = log_container.scrollTop;
						
						dom.content(log_container, formattedLog);
						lastLogContent = logContent;
						
						if (isScrolledToTop || isNewContent) {
							log_container.scrollTop = 0;
						} else {
							var newScrollHeight = log_container.scrollHeight;
							var heightDiff = newScrollHeight - prevScrollHeight;
							log_container.scrollTop = prevScrollTop + heightDiff;
						}
					}
				}).catch(function (err) {
					var logContent;
					if (err.toString().includes('NotFoundError')) {
						logContent = _('Log file does not exist.');
					} else {
						logContent = _('Unknown error: %s').format(err);
					}
					
					if (logContent !== lastLogContent) {
						dom.content(log_container, formatLogLines(logContent, false));
						lastLogContent = logContent;
					}
				});
		}));

		// 启动轮询
		poll.start();
		return E('div', { 'class': 'cbi-map' }, [
			E('style', [css]),
			E('div', { 'class': 'cbi-section' }, [
				clear_log_button,
				log_container,
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