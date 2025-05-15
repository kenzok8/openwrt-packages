/*   Copyright (C) 2021-2025 sirpdboy herboy2008@gmail.com https://github.com/sirpdboy/luci-app-ddns-go */
'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';
'require poll';


 async function checkProcess() {
    // 先尝试用 pidof
    try {
        const pidofRes = await fs.exec('/bin/pidof', ['ddns-go']);
        if (pidofRes.code === 0) {
            return {
                running: true,
                pid: pidofRes.stdout.trim()
            };
        }
    } catch (err) {
        // pidof 失败，继续尝试 ps
    }

    // 回退到 ps
    try {
        const psRes = await fs.exec('/bin/ps', ['-C', 'ddns-go', '-o', 'pid=']);
        const pid = psRes.stdout.trim();
        return {
            running: pid !== '',
            pid: pid || null
        };
    } catch (err) {
        return { running: false, pid: null };
    }
   }
function renderStatus(isRunning, listen_port, noweb) {
    var statusText = isRunning ? _('RUNNING') : _('NOT RUNNING');
    var color = isRunning ? 'green' : 'red';
    var icon = isRunning ? '✓' : '✗';
    var html = String.format(
        '<em><span style="color:%s">%s <strong>%s %s</strong></span></em>',
        color, icon, _('DDNS-Go'), statusText
    );
    
    if (isRunning && res.pid) {
        html += ' <small>(PID: ' + res.pid + ')</small>';
    }
    
    if (isRunning && noweb !== '1') {
        html += String.format(
            '&#160;<a class="btn cbi-button" href="%s:%s" target="_blank">%s</a>',
            window.location.origin, 
            listen_port, 
            _('Open Web Interface')
        );
    }
    
    return html;
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('ddns-go')
        ]);
    },

    render: function(data) {
        var m, s, o;
        var listen_port = (uci.get('ddns-go', 'config', 'port') || '[::]:9876').split(':').slice(-1)[0];
        var noweb = uci.get('ddns-go', 'config', 'noweb') || '0';

        m = new form.Map('ddns-go', _('DDNS-GO'),
            _('DDNS-GO automatically obtains your public IPv4 or IPv6 address and resolves it to the corresponding domain name service.'));

        // 状态显示部分
        s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = function() {
            var statusView = E('p', { id: 'control_status' }, 
                '<span class="spinning"></span> ' + _('Checking status...'));
            
            var pollInterval = poll.add(function() {
                return checkProcess()
                    .then(function(res) {
                        statusView.innerHTML = renderStatus(res.running, listen_port, noweb);
                    })
                    .catch(function(err) {
                        console.error('Status check failed:', err);
                        statusView.innerHTML = '<span style="color:orange">⚠ ' + _('Status check error') + '</span>';
                    });
            }, 5); // 每5秒检查一次
            
            return E('div', { class: 'cbi-section', id: 'status_bar' }, [
                statusView,
                E('div', { 'style': 'text-align: right; font-style: italic;' }, [
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
        }


		s = m.section(form.NamedSection, 'config', 'basic');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'port', _('Listen port'));
		o.default = '[::]:9876';
		o.rmempty = false;

		o = s.option(form.Value, 'time', _('Update interval'));
		o.default = '300';

		o = s.option(form.Value, 'ctimes', _('Compare with service provider N times intervals'));
		o.default = '5';

		o = s.option(form.Value, 'skipverify', _('Skip verifying certificates'));
		o.default = '0';

		o = s.option(form.Value, 'dns', _('Specify DNS resolution server'));
		o.value('223.5.5.5', _('Ali DNS 223.5.5.5'));
		o.value('223.6.6.6', _('Ali DNS 223.6.6.6'));
		o.value('119.29.29.29', _('Tencent DNS 119.29.29.29'));
		o.value('1.1.1.1', _('CloudFlare DNS 1.1.1.1'));
		o.value('8.8.8.8', _('Google DNS 8.8.8.8'));
		o.value('8.8.4.4', _('Google DNS 8.8.4.4'));
		o.datatype = 'ipaddr'; 

		o = s.option(form.Flag, 'noweb', _('Do not start web services'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Value, 'delay', _('Delayed Start (seconds)'));
		o.default = '60';

		return m.render();
	}
});
