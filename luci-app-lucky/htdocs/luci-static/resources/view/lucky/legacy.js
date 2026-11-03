/* SPDX-License-Identifier: Apache-2.0 */
/* Only the Lua-only entry loads this adapter. The panel source and CSS remain
 * shared with native LuCI; no system LuCI objects or files are replaced. */
(function() {
	'use strict';
	var mount = document.getElementById('lucky-legacy-root');
	if (!mount) return;
	var settings = JSON.parse(document.getElementById('lucky-legacy-settings').textContent);
	var _ = function(text) { return settings.strings[text] || text; };
	var modal, lastFocus, map, footerBusy = false;
	var notifications = document.createElement('div');
	notifications.className = 'lucky-legacy-notifications';
	notifications.setAttribute('aria-live', 'polite');
	mount.parentNode.insertBefore(notifications, mount);

	// Lua-era themes may not load LuCI's standard string formatting helper.
	if (typeof String.prototype.format !== 'function') {
		Object.defineProperty(String.prototype, 'format', { configurable: true, writable: true,
			value: function() {
				var args = arguments, index = 0;
				return String(this).replace(/%[%s]/g, function(value) {
					return value === '%%' ? '%' : String(args[index++]);
				});
			} });
	}

	function E(tag, attributes, children) {
		var node = Array.isArray(tag) ? document.createDocumentFragment() : document.createElement(tag);
		if (Array.isArray(tag)) children = tag;
		Object.keys(attributes || {}).forEach(function(key) {
			var value = attributes[key];
			if (typeof value === 'function') node.addEventListener(key, value);
			else if (value != null && value !== false) node.setAttribute(key, value === true ? '' : String(value));
		});
		function append(value) {
			if (Array.isArray(value)) value.forEach(append);
			else if (value != null) node.appendChild(value instanceof Node ? value : document.createTextNode(String(value)));
		}
		append(children);
		return node;
	}
	function failure(error) { ui.addNotification(null, E('p', {}, error.message || String(error))); }
	function send(operation, body, headers) {
		return fetch(settings.api + '/' + operation, {
			method: 'POST', credentials: 'same-origin', cache: 'no-store',
			headers: headers, body: body
		}).then(function(response) {
			if (response.status === 403) throw new Error(_('Session expired. Reload this page and sign in again.'));
			if (!response.ok) return response.text().then(function(text) {
				var message;
				try { message = JSON.parse(text).error; } catch (ignore) {}
				throw new Error(message || _('The operation failed.'));
			});
			return response;
		});
	}
	function api(operation, data) {
		return send(operation, JSON.stringify(Object.assign({ csrf: settings.token }, data)), { 'Content-Type': 'application/json' }).then(function(response) {
			return response.json();
		});
	}
	function fileParts(path, name) {
		var parts = /^\/tmp\/lucky-luci-backup\/([a-f0-9]{32})\/([^/]+)$/.exec(path);
		if (!parts || (name && parts[2] !== name)) throw new Error(_('The operation failed.'));
		return parts;
	}
	function upload(path, data) {
		var parts = fileParts(path);
		var metadata = JSON.stringify({ csrf: settings.token, workspace: parts[1], name: parts[2] });
		return send('upload', new Blob([metadata + '\n', data]), { 'Content-Type': 'application/octet-stream' })
			.then(function(response) { return response.json(); });
	}
	function modalColors() {
		var node = document.querySelector('.lucky-panel') || mount;
		var color = window.getComputedStyle(node).color;
		while (node) {
			var background = window.getComputedStyle(node).backgroundColor;
			if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') return { color: color, background: background };
			node = node.parentElement;
		}
		return { color: color, background: 'Canvas' };
	}
	var ui = {
		addNotification: function(title, body, level) {
			var notice = E('div', { 'class': 'alert-message ' + (level || 'warning') }, [
				E('button', { 'type': 'button', 'class': 'lucky-legacy-dismiss', 'aria-label': _('Close'),
					'click': function() { notice.remove(); } }, '×'), body
			]);
			notifications.appendChild(notice);
		},
		showModal: function(title, contents) {
			if (!modal) {
				lastFocus = document.activeElement;
				modal = E('dialog', { 'class': 'lucky-legacy-modal', 'aria-labelledby': 'lucky-legacy-modal-title' });
				modal.addEventListener('cancel', function(event) { event.preventDefault(); });
				document.body.appendChild(modal);
			}
			modal.replaceChildren(E('h3', { 'id': 'lucky-legacy-modal-title' }, title), E('div', {}, contents));
			var colors = modalColors(); modal.style.color = colors.color; modal.style.backgroundColor = colors.background;
			if (!modal.open) modal.showModal();
		},
		hideModal: function() {
			if (!modal) return;
			modal.close(); modal.remove(); modal = null;
			if (lastFocus && lastFocus.isConnected) lastFocus.focus();
		},
		uploadFile: function(path) {
			return new Promise(function(resolve, reject) {
				var file = E('input', { 'type': 'file', 'aria-label': _('Choose file'),
					'accept': path.endsWith('core.tar.gz') ? '.gz,.tar.gz' : '.zip' });
				var status = E('p', { 'role': 'status', 'aria-live': 'polite' });
				var submit = E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-action', 'disabled': true,
					'click': function() {
						var selected = file.files[0];
						if (!selected || !selected.size || selected.size > 64 * 1024 * 1024) {
							status.textContent = _('Choose a non-empty file no larger than 64 MiB.'); return;
						}
						submit.disabled = cancel.disabled = file.disabled = true;
						status.textContent = _('Uploading…');
						upload(path, selected).then(function(result) { ui.hideModal(); resolve(result); }, function(error) {
							ui.hideModal(); reject(error);
						});
					} }, _('Upload'));
				var cancel = E('button', { 'type': 'button', 'class': 'btn cbi-button', 'click': function() {
					ui.hideModal(); reject(new Error(_('Upload cancelled.')));
				} }, _('Cancel'));
				file.addEventListener('change', function() { submit.disabled = !file.files.length; });
				ui.showModal(_('Upload file'), [ file, status, E('div', { 'class': 'right' }, [ cancel, ' ', submit ]) ]);
			});
		}
	};

	// The only UCI form in the shared panel is Lucky's configuration directory.
	// Keep save/stage, apply/reload and reset distinct, like LuCI's native form.
	function ConfigMap() { map = this; this.option = {}; }
	ConfigMap.prototype.section = function() {
		var self = this;
		return { option: function(type, key, label) { self.label = label; return self.option; } };
	};
	ConfigMap.prototype.render = function() {
		var self = this;
		return api('config', { operation: 'get' }).then(function(data) {
			self.input = E('input', { 'type': 'text', 'id': 'cbid.lucky.legacy.configdir', 'class': 'cbi-input-text', 'maxlength': '512' });
			self.input.value = data.configdir;
			return E('div', { 'class': 'cbi-section-node' }, [ E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': self.input.id }, self.label),
				E('div', { 'class': 'cbi-value-field' }, self.input)
			]) ]);
		});
	};
	function configAction(operation) {
		if (footerBusy) return;
		var value = map.input.value, valid = map.option.validate('legacy', value);
		if (operation !== 'get' && valid !== true) { failure(new Error(valid)); return; }
		footerBusy = true;
		var controls = Array.from(document.querySelectorAll('.lucky-page button, .lucky-page input, .lucky-page select'))
			.map(function(node) { var saved = [node, node.disabled]; node.disabled = true; return saved; });
		return api('config', { operation: operation, value: value }).then(function(data) {
			map.input.value = data.configdir;
			if (operation !== 'get') ui.addNotification(null, E('p', {}, operation === 'apply' ? _('Configuration applied.') : _('Changes saved. Apply them to reload Lucky.')), 'info');
		}).catch(failure).then(function() {
			footerBusy = false; controls.forEach(function(saved) { saved[0].disabled = saved[1]; });
		});
	}
	function footer() {
		return E('div', { 'class': 'cbi-page-actions' }, [
			E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-apply', 'click': function() { return configAction('apply'); } }, _('Save & Apply')), ' ',
			E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-save', 'click': function() { return configAction('save'); } }, _('Save')), ' ',
			E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-reset', 'click': function() { return configAction('get'); } }, _('Reset'))
		]);
	}
	var rpc = {
		declare: function() { return function(command, args) { return api('rpc', { command: command, args: args }); }; },
		getStatusText: function() { return _('The operation failed.'); }, getSessionID: function() { return ''; }
	};
	var fs = {
		write: function(path, value) { return upload(path, new Blob([value], { type: 'application/json' })); },
		read_direct: function(path) {
			return send('download', JSON.stringify({ csrf: settings.token, workspace: fileParts(path, 'backup.zip')[1] }),
				{ 'Content-Type': 'application/json' }).then(function(response) { return response.blob(); });
		}
	};
	var request = { post: function(url, body) {
		var command = new URLSearchParams(body).get('command');
		var parts = /^\/usr\/libexec\/lucky-backup ([a-z-]+)(?: ([^\s]+))?$/.exec(command || '');
		if (!parts) return Promise.reject(new Error(_('The operation failed.')));
		var data = { operation: parts[1] };
		data[parts[1] === 'configure' ? 'argument' : 'workspace'] = parts[2];
		return api('archive', data).then(function(result) {
			return { status: 200, json: function() { return result; } };
		});
	} };
	var L = { env: { cgi_base: '' }, resource: function(path) { return settings.resource + '/' + path; } };
	var view = { extend: function(panel) { panel.super = footer; return panel; } };
	var form = { Map: ConfigMap, TypedSection: function() {}, Value: function() {} };
	var style = E('link', { 'rel': 'stylesheet', 'href': L.resource('view/lucky/legacy.css') });
	document.head.appendChild(style);
	// LuCI's module source already accepts these dependencies. The local loader
	// supplies only the APIs this page uses; all feature logic stays in config.js.
	fetch(L.resource('view/' + settings.view + '.js'), { credentials: 'same-origin' }).then(function(response) {
		if (!response.ok) throw new Error(_('Unable to load the Lucky page. Reload to retry.'));
		return response.text();
	}).then(function(source) {
		var panel = new Function('view', 'form', 'rpc', 'ui', 'fs', 'request', 'L', 'E', '_', source)(view, form, rpc, ui, fs, request, L, E, _);
		return panel.render().then(function(node) { mount.replaceChildren(node); panel.addFooter(); });
	}).catch(function(error) {
		mount.replaceChildren(E('div', { 'class': 'alert-message warning' }, error.message || String(error)));
	});
})();
