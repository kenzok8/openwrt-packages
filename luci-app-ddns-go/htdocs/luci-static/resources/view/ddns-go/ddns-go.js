/*   Copyright (C) 2021-2025 sirpdboy herboy2008@gmail.com https://github.com/sirpdboy/luci-app-ddns-go */

'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';
'require poll';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
    load: function() {
        return uci.load('ddns-go');
    },

    render: function() {
        return fs.exec('/bin/pidof', ['ddns-go']).then(function(res) {
            var isRunning = res.code === 0;
            var port = uci.get('ddns-go', 'basic', 'port') || '[::]:9876';
            var noweb = uci.get('ddns-go', 'basic', 'noweb') || '0';
            port = port.split(':').pop();
            
            var container = E('div');
            
            var status = E('div', { style: 'text-align: center; padding: 2em;' }, [
            E('img', {
                src: 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgd2lkdGg9IjEwMjQiIGhlaWdodD0iMTAyNCIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCI+PHBhdGggZmlsbD0iI2RmMDAwMCIgZD0iTTk0Mi40MjEgMjM0LjYyNGw4MC44MTEtODAuODExLTE1My4wNDUtMTUzLjA0NS04MC44MTEgODAuODExYy03OS45NTctNTEuNjI3LTE3NS4xNDctODEuNTc5LTI3Ny4zNzYtODEuNTc5LTI4Mi43NTIgMC01MTIgMjI5LjI0OC01MTIgNTEyIDAgMTAyLjIyOSAyOS45NTIgMTk3LjQxOSA4MS41NzkgMjc3LjM3NmwtODAuODExIDgwLjgxMSAxNTMuMDQ1IDE1My4wNDUgODAuODExLTgwLjgxMWM3OS45NTcgNTEuNjI3IDE3NS4xNDcgODEuNTc5IDI3Ny4zNzYgODEuNTc5IDI4Mi43NTIgMCA1MTItMjI5LjI0OCA1MTItNTEyIDAtMTAyLjIyOS0yOS45NTItMTk3LjQxOS04MS41NzktMjc3LjM3NnpNMTk0Ljk0NCA1MTJjMC0xNzUuMTA0IDE0MS45NTItMzE3LjA1NiAzMTcuMDU2LTMxNy4wNTYgNDggMCA5My40ODMgMTAuNjY3IDEzNC4yMjkgMjkuNzgxbC00MjEuNTQ3IDQyMS41NDdjLTE5LjA3Mi00MC43ODktMjkuNzM5LTg2LjI3Mi0yOS43MzktMTM0LjI3MnpNNTEyIDgyOS4wNTZjLTQ4IDAtOTMuNDgzLTEwLjY2Ny0xMzQuMjI5LTI5Ljc4MWw0MjEuNTQ3LTQyMS41NDdjMTkuMDcyIDQwLjc4OSAyOS43ODEgODYuMjcyIDI5Ljc4MSAxMzQuMjI5LTAuMDQzIDE3NS4xNDctMTQxLjk5NSAzMTcuMDk5LTMxNy4wOTkgMzE3LjA5OXoiLz48L3N2Zz4=',
                style: 'width: 100px; height: 100px; margin-bottom: 1em;'
            }),
            E('h2', {}, _('DDNS-GO Service Not Running')),
            E('p', {}, _('Please enable the DDNS-GO service'))
        ]);
            
            
            if (isRunning && noweb !== '1') {
                var iframe = E('iframe', {
                    src: window.location.origin + ':' + port,
                    style: 'width: 100%; min-height: 100vh; border: none; border-radius: 3px;'
                });
                container.appendChild(iframe);
            } else
	    {
             container.appendChild(status);
	    }
            
            // Add polling to refresh status
            poll.add(function() {
                return fs.exec('/bin/pidof', ['ddns-go']).then(function(res) {
                    var newIsRunning = res.code === 0;
                    if (newIsRunning !== isRunning) {
                        window.location.reload();
                    }
                });
            }, 5);
            
            poll.start();
           
            return container;
        }).catch(function(err) {
            return E('div', { class: 'error' }, _('Error checking DDNS-Go status: ') + err.message);
        });
    }
});