'use strict';
'require form';
'require view';
'require uci';
'require ui';

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('wireless')
        ]);
    },

    render: function() {
        const m = new form.Map('wireless', _('Guest WiFi'),
            _('Guest WiFi provides a separate wireless network for guest access with isolated permissions.'));

        const s = m.section(form.TypedSection, 'wifi-iface', _('Guest WiFi Settings'));
        s.anonymous = true;
        s.addremove = true;

        s.option(form.Flag, 'guest_wifi', _('Enable'),
            _('Enable guest WiFi network'));

        s.option(form.Value, 'ssid', _('Network Name (SSID)'));

        const o = s.option(form.ListValue, 'encryption', _('Encryption'));
        o.value('none', _('No Encryption'));
        o.value('psk2', _('WPA2-PSK'));
        o.value('sae', _('WPA3-SAE'));
        o.value('sae-mixed', _('WPA2/WPA3-Mixed'));
        o.default = 'psk2';

        const key = s.option(form.Value, 'key', _('Password'));
        key.depends('encryption', 'psk2');
        key.depends('encryption', 'sae');
        key.depends('encryption', 'sae-mixed');
        key.datatype = 'wpakey';
        key.password = true;

        s.option(form.Flag, 'isolate', _('AP Isolation'),
            _('Prevents wireless clients from communicating with each other'));

        return m.render();
    }
});