'use strict';
'require view';
'require rpc';
'require uci';
'require form';

var callStatus = rpc.declare({
	object: 'luci.filebrowser',
	method: 'status',
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return uci.load('filebrowser');
	},

	render: function() {
		var m = new form.Map('filebrowser', _('File Browser'), _('FileBrowser - a web-based file manager'));
		
		var s = m.section(form.NamedSection, 'global', 'global', _('Running Status'));
		s.anonymous = true;
		
		var o = s.option(form.Value, 'port', _('Port'));
		o.optional = true;
		o.default = '8088';
		
		var status = s.option(form.DummyValue, '_status', _('Status'));
		status.load = function() {
			return callStatus().then(function(res) {
				this._running = res.status;
			}.bind(this));
		};
		status.render = function() {
			var running = this._running;
			var cls = running ? 'green' : 'red';
			var text = running ? _('RUNNING') : _('NOT RUNNING');
			return E('p', {}, E('span', { style: 'color:' + cls + ';' }, text));
		};
		
		return m.render();
	}
});