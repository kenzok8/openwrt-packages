/*   Copyright (C) 2021-2026 sirpdboy herboy2008@gmail.com https://github.com/sirpdboy/luci-app-ddns-go */
'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';
'require poll';
'require rpc';

const getDDNSGoInfo = rpc.declare({
    object: 'luci.ddns-go',
    method: 'get_ver',
    expect: { 'ver': {} }
});

const getUpdateInfo = rpc.declare({
    object: 'luci.ddns-go',
    method: 'last_update',
    expect: { 'update': {} }
});

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

function getVersionInfo() {
    return L.resolveDefault(getDDNSGoInfo(), {}).then(function(result) {
        //console.log('getVersionInfo result:', result);
        return result || {};
    }).catch(function(error) {
        console.error('Failed to get version:', error);
        return {};
    });
}

function checkUpdateStatus() {
    return L.resolveDefault(getUpdateInfo(), {}).then(function(result) {
        //console.log('checkUpdateStatus result:', result);
        return result || {};
    }).catch(function(error) {
        console.error('Failed to get update info:', error);
        return {};
    });
}

function renderStatus(isRunning, listen_port, noweb, version) {
    var statusText = isRunning ? _('RUNNING') : _('NOT RUNNING');
    var color = isRunning ? 'green' : 'red';
    var icon = isRunning ? '✓' : '✗';
    var versionText = version ? `v${version}` : '';
    
    var html = String.format(
        '<em><span style="color:%s">%s <strong>%s %s - %s</strong></span></em>',
        color, icon, _('DDNS-Go'), versionText, statusText
    );
    
    if (isRunning) {
        html += String.format('&#160;<a class="btn cbi-button" href="http://%s:%s" target="_blank">%s</a>', 
             window.location.hostname, listen_port, _('Open Web Interface'));
    }
    
    return html;
}

function renderUpdateStatus(updateInfo) {
    if (!updateInfo || !updateInfo.status) {
        return '<span style="color:orange"> ⚠ ' + _('Update status unknown') + '</span>';
    }
    
    var status = updateInfo.status;
    var message = updateInfo.message || '';
    
    switch(status) {
        case 'updated':
            return String.format('<span style="color:green">✓ %s</span>', message);
        case 'update_available':
            return String.format('<span style="color:blue">↻ %s</span>', message);
        case 'latest':
            return String.format('<span style="color:green">✓ %s</span>', message);
        case 'download_failed':
        case 'check_failed':
            return String.format('<span style="color:red">✗ %s</span>', message);
        default:
            return String.format('<span style="color:orange">? %s</span>', message);
    }
}

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('ddns-go')
        ]);
    },
    handleResetPassword: async function () {
    try {
        ui.showModal(_('Resetting Password'), [
            E('p', { 'class': 'spinning' }, _('Resetting admin username and password, please wait...'))
        ]);
        const result = await fs.exec('/usr/bin/ddns-go', ['-resetPassword', 'admin12345', '-c', '/etc/ddns-go/ddns-go-config.yaml']);
        const configFile = '/etc/ddns-go/ddns-go-config.yaml';
        const readResult = await fs.read(configFile);
        if (readResult && readResult.trim() !== '') {
            let configContent = readResult;
            configContent = configContent.replace(/(username:\s*).*/g, '$1admin');
            
            if (!configContent.includes('user:')) {
                configContent += '\nuser:\n    username: admin\n    password: $2a$10$G1xO1cVUYtSpPYwV/Jk3l.u7PxLUxo03wntWG6VA9BxAftNWfZEhK';
            }
            
            await fs.write(configFile, configContent);
        }

        ui.hideModal();

        if (result.code === 0) {
            ui.showModal(_('Username and Password Reset Successful'), [
                E('p', _('Username: admin, Password: admin12345')),
                E('p', _('You need to restart DDNS-Go service for the changes to take effect.')),
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn cbi-button cbi-button-positive',
                        'click': ui.createHandlerFn(this, function() {
                            ui.hideModal();
                            this.handleRestartService();
                        })
                    }, _('Restart Service Now')),
                    ' ',
                    E('button', {
                        'class': 'btn cbi-button cbi-button-neutral',
                        'click': ui.hideModal
                    }, _('Restart Later'))
                ])
            ]);
        } else {
            ui.showModal(_('Partial Reset'), [
                E('p', _('DDNS-Go command reset may have failed, but configuration file has been updated.')),
                E('p', _('Username: admin, Password: admin12345')),
                E('p', _('You may need to restart DDNS-Go service manually.')),
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn cbi-button cbi-button-positive',
                        'click': ui.createHandlerFn(this, function() {
                            ui.hideModal();
                            this.handleRestartService();
                        })
                    }, _('Restart Service Now')),
                    ' ',
                    E('button', {
                        'class': 'btn cbi-button cbi-button-neutral',
                        'click': ui.hideModal
                    }, _('Close'))
                ])
            ]);
        }
        
    } catch (error) {
        ui.hideModal();
        //console.error('Reset username/password failed:', error);
        alert(_('ERROR:') + '\n' + _('Resetusername/ password failed:') + '\n' + error.message);
    }
},
 
    handleRestartService: async function() {
    try {
        await fs.exec('/etc/init.d/ddns-go', ['stop']);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fs.exec('/etc/init.d/ddns-go', ['start']);
        
        alert(_('SUCCESS:') + '\n' + _('DDNS-Go service restarted successfully'));
        if (window.statusPoll) {
            window.statusPoll();
        }
    } catch (error) {
        alert(_('ERROR:') + '\n' + _('Failed to restart service:') + '\n' + error.message);
    }
    },

    
    handleUpdate: async function () {
        try {
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = '<span class="spinning"></span> ' + _('Updating, please wait...');
            }
            const updateInfo = await checkUpdateStatus();
            if (updateView) {
                updateView.innerHTML = renderUpdateStatus(updateInfo);
            }

            if (updateInfo.update_successful || updateInfo.status === 'updated') {
                if (window.statusPoll) {
                    window.statusPoll();
                }
                
                // 3秒后恢复显示版本信息
                setTimeout(() => {
                    var updateView = document.getElementById('update_status');
                    if (updateView) {
                        getVersionInfo().then(function(versionInfo) {
                            var version = versionInfo.version || '';
                            updateView.innerHTML = String.format('<span style="color:green">✓ %s v%s</span>', 
                                _('Current Version:'), version);
                        });
                    }
                }, 3000);
            }

        } catch (error) {
            console.error('Update failed:', error);
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = '<span style="color:red">✗ ' + _('Update failed') + '</span>';

                // 5秒后恢复显示版本信息
                setTimeout(() => {
                    getVersionInfo().then(function(versionInfo) {
                        var version = versionInfo.version || '';
                        updateView.innerHTML = String.format('<span>%s v%s</span>', 
                            _('Current Version:'), version);
                    });
                }, 5000);
            }
        }
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
            

            window.statusPoll = function() {
                return Promise.all([
                    checkProcess(),
                    getVersionInfo()
                ]).then(function(results) {
                    var [processInfo, versionInfo] = results;
                    var version = versionInfo.version || '';
                    statusView.innerHTML = renderStatus(processInfo.running, listen_port, noweb, version);
                }).catch(function(err) {
                    console.error('Status check failed:', err);
                    statusView.innerHTML = '<span style="color:orange">⚠ ' + _('Status check error') + '</span>';
                });
            };
            
            var pollInterval = poll.add(window.statusPoll, 5); // 每5秒检查一次
            
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
        };

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
	
        o = s.option(form.Button, '_newpassword', _('Reset account password'));
        o.inputtitle = _('Reset');
        o.inputstyle = 'apply';
        o.onclick = L.bind(this.handleResetPassword, this, data);

        o = s.option(form.Button, '_update', _('Update kernel'));
        o.inputtitle = _('Check Update');
        o.inputstyle = 'apply';
        o.onclick = L.bind(this.handleUpdate, this, data);

        o = s.option(form.DummyValue, '_update_status', _('Current Version'));
        o.rawhtml = true;
        var currentVersion = '';
	
        getVersionInfo().then(function(versionInfo) {
            currentVersion = versionInfo.version || '';
            var updateView = document.getElementById('update_status');
            if (updateView) {
                updateView.innerHTML = String.format('<span>v%s</span>', currentVersion);
            }
        });
        
        o.cfgvalue = function() {
            return E('div', { style: 'margin: 5px 0;' }, [
                E('span', { id: 'update_status' }, 
                    currentVersion ? String.format('v%s', currentVersion) : _('Loading...'))
            ]);
        };
        
        return m.render();
    }
});
