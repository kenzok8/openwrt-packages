'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require view';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('filebrowser'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['filebrowser']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, port) {
	var spanTemp = '<span style="color:%s"><strong>%s %s</strong></span>';
	var renderHTML;
	if (isRunning) {
		var button = String.format('&#160;<a class="btn cbi-button" href="http://%s:%s" target="_blank" rel="noreferrer noopener">%s</a>',
			window.location.hostname, port, _('Open Web Interface'));
		renderHTML = spanTemp.format('green', _('FileBrowser'), _('RUNNING')) + button;
	} else {
		renderHTML = spanTemp.format('red', _('FileBrowser'), _('NOT RUNNING'));
	}

	return renderHTML;
}

return view.extend({
	load: function() {
		return uci.load('filebrowser');
	},

	render: function(data) {
		var m, s, o;
		var webport = (uci.get(data, 'config', 'listen_port') || '8989');

		m = new form.Map('filebrowser', _('FileBrowser'),
			_('FileBrowser provides a file managing interface within a specified directory and it can be used to upload, delete, preview, rename and edit your files..'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res, webport);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		}

		s = m.section(form.NamedSection, 'config', 'filebrowser');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'listen_port', _('Listen port'));
		o.datatype = 'port';
		o.default = '8989';
		o.rmempty = false;

		o = s.option(form.Value, 'root_path', _('Root directory'));
		o.default = '/mnt';
		o.rmempty = false;

		o = s.option(form.Flag, 'disable_exec', _('Disable Command Runner feature'));
		o.default = o.enabled;
		o.rmempty = false;

		return m.render();
	}
});
