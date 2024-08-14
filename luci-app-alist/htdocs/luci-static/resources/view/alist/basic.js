'use strict';
'require form';
'require fs';
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
	return L.resolveDefault(callServiceList('alist'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['alist']['instances']['alist']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, protocol, webport) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		var button = String.format('<input class="cbi-button-reload" type="button" style="margin-left: 50px" value="%s" onclick="window.open(\'%s//%s:%s/\')">',
			_('Open Web Interface'), protocol, window.location.hostname, webport);
		renderHTML = spanTemp.format('green', 'Alist', _('RUNNING')) + button;
	} else {
		renderHTML = spanTemp.format('red', 'Alist', _('NOT RUNNING'));
	}

	return renderHTML;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('alist')
		]);
	},

	handleResetPassword: async function (data) {
		var data_dir = uci.get(data[0], '@alist[0]', 'data_dir') || '/etc/alist';
		try {
			var newpassword = await fs.exec('/usr/bin/alist', ['admin', 'random', '--data', data_dir]);
			var new_password = newpassword.stderr.match(/password:\s*(\S+)/)[1];
			const textArea = document.createElement('textarea');
			textArea.value = new_password;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			alert(_('Username:') + 'admin\n' + _('New Password:') + new_password + '\n\n' + _('New password has been copied to clipboard.'));
		} catch (error) {
			console.error('Failed to reset password: ', error);
		}
	},

	render: function (data) {
		var m, s, o;
		var webport = uci.get(data[0], '@alist[0]', 'port') || '5244';
		var ssl = uci.get(data[0], '@alist[0]', 'ssl') || '0';
		var protocol;
		if (ssl === '0') {
			protocol = 'http:';
		} else if (ssl === '1') {
			protocol = 'https:';
		}

		m = new form.Map('alist', _('Alist'),
			_('A file list program that supports multiple storage.') +
			'<br><a href="https://alist.nn.ci/zh/guide/drivers/local.html" target="_blank">' +
			_('User Manual') +
			'</a>');

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.addremove = false;

		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res, protocol, webport);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		}

		s = m.section(form.NamedSection, '@alist[0]', 'alist');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'port', _('Port'));
		o.datatype = 'and(port,min(1))';
		o.default = '5244';
		o.rmempty = false;

		o = s.option(form.Flag, 'log', _('Enable Logs'));
		o.default = 1;
		o.rmempty = false;

		o = s.option(form.Flag, 'ssl', _('Enable SSL'));
		o.rmempty = false;

		o = s.option(form.Value, 'ssl_cert', _('SSL cert'),
			_('SSL certificate file path'));
		o.rmempty = false;
		o.depends('ssl', '1');

		o = s.option(form.Value, 'ssl_key', _('SSL key'),
			_('SSL key file path'));
		o.rmempty = false;
		o.depends('ssl', '1');

		o = s.option(form.Flag, 'mysql', _('Enable Database'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'mysql_type', _('Database Type'));
		o.default = 'mysql';
		o.depends('mysql', '1');
		o.value('mysql', _('MySQL'));
		o.value('postgres', _('PostgreSQL'));

		o = s.option(form.Value, 'mysql_host', _('Database Host'));
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_port', _('Database Port'));
		o.datatype = 'port';
		o.default = '3306';
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_username', _('Database Username'));
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_password', _('Database Password'));
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_database', _('Database Name'));
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_table_prefix', _('Database Table Prefix'));
		o.default = 'x_';
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_ssl_mode', _('Database SSL Mode'));
		o.depends('mysql', '1');

		o = s.option(form.Value, 'mysql_dsn', _('Database DSN'));
		o.depends('mysql', '1');

		o = s.option(form.Flag, 'allow_wan', _('Allow Access From Internet'));
		o.rmempty = false;

		o = s.option(form.Value, 'site_url', _('Site URL'),
			_('When the web is reverse proxied to a subdirectory, this option must be filled out to ensure proper functioning of the web. Do not include \'/\' at the end of the URL'));

		o = s.option(form.Value, 'max_connections', _('Max Connections'),
			_('0 is unlimited, It is recommend to set a low number of concurrency (10-20) for poor performance device'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.rmempty = false;

		o = s.option(form.Value, 'token_expires_in', _('Login Validity Period (hours)'));
		o.datatype = 'uinteger';
		o.default = '48';
		o.rmempty = false;

		o = s.option(form.Value, 'delayed_start', _('Delayed Start (seconds)'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Value, 'data_dir', _('Data directory'));
		o.default = '/etc/alist';

		o = s.option(form.Value, 'temp_dir', _('Cache directory'));
		o.default = '/tmp/alist';
		o.rmempty = false;

		o = s.option(form.Button, '_newpassword', _('Reset Password'),
			_('Generate a new random password.'));
		o.inputtitle = _('Reset Password');
		o.inputstyle = 'apply';
		o.onclick = L.bind(this.handleResetPassword, this, data);

		return m.render();
	}
});
