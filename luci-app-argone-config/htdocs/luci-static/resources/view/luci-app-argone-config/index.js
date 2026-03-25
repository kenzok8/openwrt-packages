'use strict';
'require view';
'require rpc';

var callStatus = rpc.declare({
	object: 'luci',
	method: 'get_status',
	params: ['name'],
	expect: { '': {} }
});

return view.extend({
	load: function() {},

	render: function() {
		var m = new form.Map('config', _('Settings'));
		var s = m.section(form.NamedSection, 'main', 'main', _('Configuration'));
		s.anonymous = true;
		
		var o = s.option(form.Value, 'name', _('Name'));
		
		return m.render();
	}
});
