'use strict';
'require form';
'require view';
'require uci';

return view.extend({
	load: function() {
		return uci.load('wireless');
	},

	render: function() {
		var m = new form.Map('wireless', _('Guest WiFi'),
			_('Guest WiFi provides a separate wireless network for guest access with isolated permissions.'));

		var s = m.section(form.TypedSection, 'wifi-iface', _('Guest WiFi Settings'));
		s.anonymous = true;
		s.addremove = true;
		s.filter = function(section_id) {
			return uci.get('wireless', section_id, 'guest_wifi') === '1';
		};
		s.cfgvalue = function(section_id) {
			return uci.get('wireless', section_id, 'guest_wifi');
		};
		s.handleApply = function(section, ev) {
			uci.save(function() {
				uci.apply(function() {
					uci.load('wireless');
					XHR.poll(2);
				});
			});
		};

		var o = null;

		o = s.option(form.Flag, 'guest_wifi', _('Enable'),
			_('Enable guest WiFi network'));
		o.rmempty = false;
		o.default = '0';

		o = s.option(form.Value, 'ssid', _('Network Name (SSID)'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'encryption', _('Encryption'));
		o.value('none', _('No Encryption'));
		o.value('psk2', _('WPA2-PSK'));
		o.value('sae', _('WPA3-SAE'));
		o.value('sae-mixed', _('WPA2/WPA3-Mixed'));
		o.rmempty = false;
		o.default = 'psk2';

		o = s.option(form.Value, 'key', _('Password'));
		o.depends('encryption', 'psk2');
		o.depends('encryption', 'sae');
		o.depends('encryption', 'sae-mixed');
		o.datatype = 'wpakey';
		o.rmempty = false;
		o.password = true;

		o = s.option(form.Flag, 'isolate', _('AP Isolation'),
			_('Prevents wireless clients from communicating with each other'));
		o.rmempty = false;
		o.default = '1';

		return m.render();
	}
});
