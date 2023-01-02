/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 */

'use strict';
'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require ui';
'require view';

return view.extend({
	render: function() {
		var m, s, o;

		var unm_helper = '/usr/share/unblockneteasemusic/update.sh';

		m = new form.Map('unblockneteasemusic');

		s = m.section(form.NamedSection, 'config', 'unblockneteasemusic', _('核心管理'));
		s.anonymous = true;

		o = s.option(form.DummyValue, '_core_version', _('核心版本'));
		o.cfgvalue = function() {
			var _this = this;
			var spanTemp = '<div style="color:%s;margin-top:5px;"><strong>%s</strong></div>';

			return fs.exec(unm_helper, [ 'check_version' ]).then(function(res) {
				if (res.code === 0)
					_this.default = String.format(spanTemp, 'green', res.stdout.trim());
				else if (res.code === 2)
					_this.default = String.format(spanTemp, 'red', _('未安装'));
				else {
					ui.addNotification(null, E('p', [ _('获取版本信息失败：%s。').format(res) ]));
					_this.default = String.format(spanTemp, 'red', _('未知错误'));
				}

				return null;
			}).catch(function(err) {
				ui.addNotification(null, E('p', [ _('未知错误：%s。').format(err) ]));
				_this.default = String.format(spanTemp, 'red', _('未知错误'));

				return null;
			});
		}
		o.rawhtml = true;

		o = s.option(form.Button, '_remove_core', _('删除核心'),
			_('删除核心后，需手动点击下面的按钮重新下载，有助于解决版本冲突问题。'));
		o.inputstyle = 'remove';
		o.onclick = function() {
			var _this = this;

			return fs.exec(unm_helper, [ 'remove_core' ]).then(function(res) {
				_this.description = '删除完毕。'
				return _this.map.reset();
			}).catch(function(err) {
				ui.addNotification(null, E('p', [ _('未知错误：%s。').format(err) ]));
				_this.description = '删除失败。'
				return _this.map.reset();
			});
		}

		o = s.option(form.Button, '_update_core', _('更新核心'),
			_('更新完毕后会自动在后台重启插件，无需手动重启。'));
		o.inputstyle = 'action';
		o.onclick = function() {
			var _this = this;

			return fs.exec(unm_helper, [ 'update_core' ]).then(function (res) {
				if (res.code === 0)
					_this.description = _('更新成功。');
				else if (res.code === 1)
					_this.description = _('更新失败。');
				else if (res.code === 2)
					_this.description = _('更新程序正在运行中。');
				else if (res.code === 3)
					_this.description = _('当前已是最新版本。');

				return _this.map.reset();
			}).catch(function (err) {
				ui.addNotification(null, E('p', [ _('未知错误：%s。').format(err) ]));
				_this.description = _('更新失败。');
				return _this.map.reset();
			});
		}

		o = s.option(form.Button, '_debug_log', _('调试报告'),
			_('若您遇到使用上的问题，请点此打印调试报告，并将其附在您的 issue 中。'));
		o.inputstyle = 'action';
		o.inputtitle = _('打印报告');
		o.onclick = function() {
			var log_modal = ui.showModal(_('打印调试报告'), [
				E('p', { 'class': 'spinning' },
					_('正在打印调试报告中...'))
			]);

			return fs.exec_direct('/usr/bin/unm-debug', 'text').then(function (res) {
				log_modal.removeChild(log_modal.lastChild);

				if (res) {
					log_modal.appendChild(E('p', _('提交 issue 时，您只需附上最后的链接，无需提供整个输出。')));
					log_modal.appendChild(E('textarea', {
						'id': 'content_debugLog',
						'class': 'cbi-input-textarea',
						'style': 'font-size:13px; resize: none',
						'readonly': 'readonly',
						'wrap': 'soft',
						'rows': '30'
						}, [ res.trim() ])
					);
				} else {
					log_modal.appendChild(E('p', _('错误')));
					log_modal.appendChild(E('pre', { 'class': 'errors' }, [ _('无法打印调试报告。') ]));
				}

				var log_element = document.getElementById('content_debugLog') || null;
				if (log_element)
					log_element.scrollTop = log_element.scrollHeight;

				log_modal.appendChild(E('div', { 'class': 'right' }, [
					log_element ? E('button', {
						'class': 'btn cbi-button-action',
						'click': ui.createHandlerFn(this, function() {
							var links = log_element.value.match(/https:\/\/(litter.catbox.moe|transfer.sh)\/.*.txt/g);

							var textarea = document.createElement('textarea');
							document.body.appendChild(textarea);

							textarea.style.position = 'absolute';
							textarea.style.clip = 'rect(0 0 0 0)';
							textarea.value = links ? links.join('\n'): log_element.value;
							textarea.select()

							document.execCommand('copy', true);
							document.body.removeChild(textarea);
						})
					}, _('复制')) : '',
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, _('关闭'))
				]));

				return null;
			}).catch(function (err) {
				ui.addNotification(null, E('p', _('无法打印调试报告：%s。').format(err)));
				ui.hideModal();

				return null;
			});
		}

		o = s.option(form.DummyValue, '_logview');
		o.render = function() {
			/* Thanks to luci-app-aria2 */
			var css = '					\
				#log_textarea {				\
					padding: 10px;			\
					text-align: left;		\
				}					\
				#log_textarea pre {			\
					padding: .5rem;			\
					word-break: break-all;		\
					margin: 0;			\
				}					\
				.description {				\
					background-color: #33ccff;	\
				}';

			var log_textarea = E('div', { 'id': 'log_textarea' },
				E('img', {
					'src': L.resource(['icons/loading.gif']),
					'alt': _('Loading'),
					'style': 'vertical-align:middle'
				}, _('Collecting data...'))
			);

			poll.add(L.bind(function() {
				return fs.read('/tmp/unblockneteasemusic.log', 'text')
				.then(function(res) {
					var log = E('pre', { 'wrap': 'pre' }, [
						res.trim() || _('当前无日志。')
					]);

					dom.content(log_textarea, log);
				}).catch(function(err) {
					if (err.toString().includes('NotFoundError'))
						var log = E('pre', { 'wrap': 'pre' }, [
							_('日志文件不存在。')
						]);
					else
						var log = E('pre', { 'wrap': 'pre' }, [
							_('未知错误：%s。').format(err)
						]);

					dom.content(log_textarea, log);
				});
			}));

			return E([
				E('style', [ css ]),
				E('div', {'class': 'cbi-map'}, [
					E('h3', {'name': 'content'}, _('运行日志')),
					E('div', {'class': 'cbi-section'}, [
						log_textarea,
						E('div', {'style': 'text-align:right'},
							E('small', {}, _('每 %s 秒刷新。').format(L.env.pollinterval))
						)
					])
				])
			]);
		}

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
