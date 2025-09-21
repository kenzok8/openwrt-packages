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
	return L.resolveDefault(callServiceList('openlist2'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['openlist2']['instances']['openlist2']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, protocol, webport, site_url) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		var buttonUrl = '';
		if (site_url && site_url.trim() !== '') {
			buttonUrl = site_url;
		} else {
			buttonUrl = String.format('%s//%s:%s/', protocol, window.location.hostname, webport);
		}
		var button = String.format('<input class="cbi-button-reload" type="button" style="margin-left: 50px" value="%s" onclick="window.open(\'%s\')">',
			_('Open Web Interface'), buttonUrl);
		renderHTML = spanTemp.format('green', 'OpenList', _('RUNNING')) + button;
	} else {
		renderHTML = spanTemp.format('red', 'OpenList', _('NOT RUNNING'));
	}

	return renderHTML;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('openlist2')
		]);
	},

	handleResetPassword: async function (data) {
		var data_dir = uci.get(data[0], '@openlist2[0]', 'data_dir') || '/etc/openlist2';
		try {
			var newpassword = await fs.exec('/usr/bin/openlist2', ['admin', 'random', '--data', data_dir]);
			var new_password = newpassword.stdout.match(/password:\s*(\S+)/)[1];

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
		var webport = uci.get(data[0], '@openlist2[0]', 'port') || '5244';
		var ssl = uci.get(data[0], '@openlist2[0]', 'ssl') || '0';
		var protocol;
		if (ssl === '0') {
			protocol = 'http:';
		} else if (ssl === '1') {
			protocol = 'https:';
		}
		var site_url = uci.get(data[0], '@openlist2[0]', 'site_url') || '';

		m = new form.Map('openlist2', _('OpenList'),
			_('A file list program that supports multiple storage.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.addremove = false;

		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res, protocol, webport, site_url);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		}

		s = m.section(form.NamedSection, '@openlist2[0]', 'openlist2');

		s.tab('basic', _('Basic Settings'));
		s.tab('global', _('Global Settings'));
		s.tab("log", _("Logs"));
		s.tab("database", _("Database"));
		s.tab("scheme", _("Web Protocol"));
		s.tab('tasks', _('Task threads'));
		s.tab('cors', _('CORS Settings'));
		s.tab('s3', _('Object Storage'));
		s.tab('ftp', _('FTP'));
		s.tab('sftp', _('SFTP'));

		// init
		o = s.taboption('basic', form.Flag, 'enabled', _('Enabled'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'port', _('Port'));
		o.datatype = 'and(port,min(1))';
		o.default = '5244';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'delayed_start', _('Delayed Start (seconds)'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('basic', form.Flag, 'allow_wan', _('Open firewall port'));
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'data_dir', _('Data directory'));
		o.default = '/etc/openlist2';

		o = s.taboption('basic', form.Value, 'temp_dir', _('Cache directory'));
		o.default = '/tmp/openlist2';
		o.rmempty = false;

		o = s.taboption('basic', form.Button, '_newpassword', _('Reset Password'),
			_('Generate a new random password.'));
		o.inputtitle = _('Reset Password');
		o.inputstyle = 'apply';
		o.onclick = L.bind(this.handleResetPassword, this, data);

		// global
		o = s.taboption('global', form.Flag, 'force', _('Force read config'),
			_('Setting this to true will force the program to read the configuration file, ignoring environment variables.'));
		o.default = true;
		o.rmempty = false;

		o = s.taboption('global', form.Value, 'site_url', _('Site URL'),
			_('When the web is reverse proxied to a subdirectory, this option must be filled out to ensure proper functioning of the web. Do not include \'/\' at the end of the URL'));

		o = s.taboption('global', form.Value, 'cdn', _('CDN URL'));
		o.default = '';

		o = s.taboption('global', form.Value, 'jwt_secret', _('JWT Key'));
		o.default = '';

		o = s.taboption('global', form.Value, 'token_expires_in', _('Login Validity Period (hours)'));
		o.datatype = 'uinteger';
		o.default = '48';
		o.rmempty = false;

		o = s.taboption('global', form.Value, 'max_connections', _('Max Connections'),
			_('0 is unlimited, It is recommend to set a low number of concurrency (10-20) for poor performance device'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.rmempty = false;

		o = s.taboption('global', form.Value, 'max_concurrency', _('Max concurrency of local proxies'),
			_('0 is unlimited, Limit the maximum concurrency of local agents. The default value is 64'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.rmempty = false;

		o = s.taboption('global', form.Flag, 'tls_insecure_skip_verify', _('Disable TLS Verify'));
		o.default = true;
		o.rmempty = false;

		// Logs
		o = s.taboption('log', form.Flag, 'log', _('Enable Logs'));
		o.default = 1;
		o.rmempty = false;

		o = s.taboption('log', form.Value, 'log_path', _('Log path'));
		o.default = '/var/log/openlist2.log';
		o.rmempty = false;
		o.depends('log', '1');

		o = s.taboption('log', form.Value, 'log_max_size', _('Max Size (MB)'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.rmempty = false;
		o.depends('log', '1');

		o = s.taboption('log', form.Value, 'log_max_backups', _('Max backups'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;
		o.depends('log', '1');

		o = s.taboption('log', form.Value, 'log_max_age', _('Max age'));
		o.datatype = 'uinteger';
		o.default = '28';
		o.rmempty = false;
		o.depends('log', '1');

		o = s.taboption('log', form.Flag, 'log_compress', _('Log Compress'));
		o.default = 'false';
		o.rmempty = false;
		o.depends('log', '1');

		// database
		o = s.taboption('database', form.ListValue, 'database_type', _('Database Type'));
		o.default = 'sqlite3';
		o.value('sqlite3', _('SQLite'));
		o.value('mysql', _('MySQL'));
		o.value('postgres', _('PostgreSQL'));

		o = s.taboption('database', form.Value, 'mysql_host', _('Database Host'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_port', _('Database Port'));
		o.datatype = 'port';
		o.default = '3306';
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_username', _('Database Username'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_password', _('Database Password'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_database', _('Database Name'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_table_prefix', _('Database Table Prefix'));
		o.default = 'x_';
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_ssl_mode', _('Database SSL Mode'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		o = s.taboption('database', form.Value, 'mysql_dsn', _('Database DSN'));
		o.depends('database_type', 'mysql');
		o.depends('database_type', 'postgres');

		// scheme
		o = s.taboption('scheme', form.Flag, 'ssl', _('Enable SSL'));
		o.rmempty = false;

		o = s.taboption('scheme', form.Flag, 'force_https', _('Force HTTPS'));
		o.rmempty = false;
		o.depends('ssl', '1');

		o = s.taboption('scheme', form.Value, 'ssl_cert', _('SSL cert'),
			_('SSL certificate file path'));
		o.rmempty = false;
		o.depends('ssl', '1');

		o = s.taboption('scheme', form.Value, 'ssl_key', _('SSL key'),
			_('SSL key file path'));
		o.rmempty = false;
		o.depends('ssl', '1');

		// tasks
		o = s.taboption('tasks', form.Value, 'download_workers', _('Download Workers'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'download_max_retry', _('Download Max Retry'));
		o.datatype = 'uinteger';
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'transfer_workers', _('Transfer Workers'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'transfer_max_retry', _('Transfer Max Retry'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'upload_workers', _('Upload Workers'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'upload_max_retry', _('Upload Max Retry'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'copy_workers', _('Copy Workers'));
		o.datatype = 'uinteger';
		o.default = '5';
		o.rmempty = false;

		o = s.taboption('tasks', form.Value, 'copy_max_retry', _('Copy Max Retry'));
		o.datatype = 'uinteger';
		o.default = '2';
		o.rmempty = false;

		// cors
		o = s.taboption('cors', form.Value, 'cors_allow_origins', _('Allow Origins'));
		o.default = '*';
		o.rmempty = false;

		o = s.taboption('cors', form.Value, 'cors_allow_methods', _('Allow Methods'));
		o.default = '*';
		o.rmempty = false;

		o = s.taboption('cors', form.Value, 'cors_allow_headers', _('Allow Headers'));
		o.default = '*';
		o.rmempty = false;

		// s3
		o = s.taboption('s3', form.Flag, 's3', _('Enabled S3'));
		o.rmempty = false;

		o = s.taboption('s3', form.Value, 's3_port', _('Port'));
		o.datatype = 'and(port,min(1))';
		o.default = 5246;
		o.rmempty = false;

		o = s.taboption('s3', form.Flag, 's3_ssl', _('Enable SSL'));
		o.rmempty = false;

		// ftp
		o = s.taboption('ftp', form.Flag, 'ftp', _('Enabled FTP'));
		o.rmempty = false;

		o = s.taboption('ftp', form.Value, 'ftp_port', _('FTP Port'));
		o.datatype = 'and(port,min(1))';
		o.default = 5221;
		o.rmempty = false;

		o = s.taboption('ftp', form.Value, 'find_pasv_port_attempts', _('Max retries on port conflict during passive transfer'));
		o.datatype = 'uinteger';
		o.default = '50';
		o.rmempty = false;

		o = s.taboption('ftp', form.Flag, 'active_transfer_port_non_20', _('Enable non-20 port for active transfer'));
		o.rmempty = false;

		o = s.taboption('ftp', form.Value, 'idle_timeout', _('Client idle timeout (seconds)'));
		o.datatype = 'uinteger';
		o.default = '900';
		o.rmempty = false;

		o = s.taboption('ftp', form.Value, 'connection_timeout', _('Connection timeout (seconds)'));
		o.datatype = 'uinteger';
		o.default = '900';
		o.rmempty = false;

		o = s.taboption('ftp', form.Flag, 'disable_active_mode', _('Disable active transfer mode'));
		o.rmempty = false;

		o = s.taboption('ftp', form.Flag, 'default_transfer_binary', _('Enable binary transfer mode'));
		o.rmempty = false;

		o = s.taboption('ftp', form.Flag, 'enable_active_conn_ip_check', _('Client IP check in active transfer mode'));
		o.rmempty = false;

		o = s.taboption('ftp', form.Flag, 'enable_pasv_conn_ip_check', _('Client IP check in passive transfer mode'));
		o.rmempty = false;

		// sftp
		o = s.taboption('sftp', form.Flag, 'sftp', _('Enabled SFTP'));
		o.rmempty = false;

		o = s.taboption('sftp', form.Value, 'sftp_port', _('SFTP Port'));
		o.datatype = 'and(port,min(1))';
		o.default = 5222;
		o.rmempty = false;

		return m.render();
	}
});
