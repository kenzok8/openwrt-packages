// Copyright 2023-2026 sirpdboy
'use strict';
'require view';
'require form';
'require network';
'require uci';
'require validation';
'require rpc';
'require fs';
'require dom';
'require poll';
'require tools.widgets as widgets';

var callExecRPC = rpc.declare({
    object: 'file',
    method: 'exec',
    params: ['command', 'params'],
    expect: { '': {} }
});


return view.extend({
    load: function() {
        return Promise.all([
            network.getDevices(),
            uci.changes(),
            L.resolveDefault(uci.load('wireless'), null),
            uci.load('network'),
            uci.load('netwizard')
        ]);
    },

    render: function(data) {
        var devices = data[0] || [];
        var has_wifi = false;
        var m, o, s;

        try {
            var wirelessSections = uci.sections('wireless', 'wifi-device');
            if (wirelessSections && wirelessSections.length > 0) {
                has_wifi = true;
            } else {
                var wifiIfaces = uci.sections('wireless', 'wifi-iface');
                if (wifiIfaces && wifiIfaces.length > 0) {
                    has_wifi = true;
                }
            }
        } catch (e) {
            has_wifi = false;
        }

        var physicalIfaces = 0;
        var physicalInterfaces = [];
        
        for (var i = 0; i < devices.length; i++) {
            var iface = devices[i].getName();
            if (!iface.match(/_ifb$/) && !iface.match(/^ifb/) && 
                !iface.match(/^veth/) && !iface.match(/^tun/) &&
                !iface.match(/^tap/) && !iface.match(/^gre/) &&
                !iface.match(/^gretap/) && !iface.match(/^lo$/) &&
                !iface.match(/^br-/) &&
                (iface.match(/^(eth|en|usb)/) || iface.match(/^wlan|^wl/))) {
                
                physicalIfaces++;
                physicalInterfaces.push(iface);
            }
        }

        var lan_ip = uci.get('netwizard', 'default', 'lan_ipaddr');
        var lan_mask = uci.get('netwizard', 'default', 'lan_netmask');
        var wan_face = uci.get('netwizard', 'default', 'wan_interface');
        var wanproto = uci.get('netwizard', 'default', 'wan_proto');
        var LanHTTPS = uci.get('netwizard', 'default', 'https') || '0';

        if (!lan_ip) {
            lan_ip = uci.get('network', 'lan', 'ipaddr') || '192.168.10.1/24' ;
            lan_ip = (lan_ip + '');
            if (lan_ip.indexOf('/') > -1) {
                lan_ip = lan_ip.split('/')[0];
            }
        }

        if (!lan_mask) {
            lan_mask = uci.get('network', 'lan', 'netmask') || '255.255.255.0' ;
        }

        if (!wan_face) {
            wan_face = uci.get('network', 'wan', 'device') || 'eth1';
        }
        
        if (!wanproto) {
            wanproto = uci.get('network', 'wan', 'proto') || 'siderouter';
        }
        
        this.devices = devices;
        this.has_wifi = has_wifi;
        this.physicalIfaces = physicalIfaces;
        this.physicalInterfaces = physicalInterfaces;
        this.lan_mask = lan_mask;
        this.lan_ip = lan_ip;
        this.LanHTTPS = LanHTTPS;
        this.wan_face = wan_face;
        this.wanproto = wanproto;
        
        this.addStyles();

        var params = new URLSearchParams(window.location.search);
        var selectedMode = params.get('selectedMode');
        
        if (selectedMode) {
            return this.renderConfigForm(selectedMode);
        } else {
            return this.renderModeSelection();
        }
    },

    addStylesnobnt: function() {
        if (document.getElementById('netwizard-mode-styles-nobnt')) {
            return;
        }
        
        var stylen = E('style', { 'id': 'netwizard-mode-styles-nobnt' }, `
          #view .cbi-page-actions {
                display: none;
            }
        `);
        
        document.head.appendChild(stylen);
    },

    addStyles: function() {
        if (document.getElementById('netwizard-mode-styles')) {
            return;
        }
        
        var style = E('style', { 'id': 'netwizard-mode-styles' }, `
            .mode-selection-container {
                margin-top: 5rem;
                padding: 1rem;
            }
            
            .mode-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                margin: 30px 0;
                justify-content: center;
            }
            
            .mode-card {
                border-radius: 8px;
                padding: 4rem 1rem;
                cursor: pointer;
                transition: all 0.3s;
                text-align: center;
                flex: 1;
                min-width: 180px;
                max-width: 180px;
                box-shadow: 0 0.3rem 0.5rem var(--input-boxcolor);
                display: flex;
                flex-direction: column;
                align-items: center;
                border: 2px solid transparent;
            }
            
            .mode-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .mode-card[data-mode="pppoe"] {
                background: rgba(255,107,107,0.7);
                border-color: rgba(255,107,107,0.7);
                color: white;
            }
            
            .mode-card[data-mode="pppoe"]:hover {
                border-color: #ff3838;
                box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
            }
            
            .mode-card[data-mode="dhcp"] {
                background: rgba(51,154,240,0.7);
                border-color: rgba(51,154,240,0.7);
                color: white;
            }
            
            .mode-card[data-mode="dhcp"]:hover {
                border-color: #01b7ff;
                box-shadow: 0 4px 12px rgba(34, 139, 230, 0.3);
            }
            
            .mode-card[data-mode="siderouter"] {
                background: rgba(81,207,102,0.7);
                border-color: rgba(81,207,102,0.7);
                color: white;
            }
            
            .mode-card[data-mode="siderouter"]:hover {
                border-color: #27f94d;
                box-shadow: 0 4px 12px rgba(64, 192, 87, 0.3);
            }
            
            .mode-icon-container {
                width: 64px;
                height: 64px;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255,1);
                border-radius: 10%;
                padding: 10px;
                box-shadow: 0 0.3rem 0.5rem rgba(0,0,0,0.22);
            }
            
            .mode-icon {
                width: 48px;
                height: 48px;
                object-fit: contain;
            }
            
            .mode-title {
                font-size: 16px;
                font-weight: 600;
                margin-top: 10px;
                text-align: center;
            }
            
            .mode-description {
                font-size: 13px;
                line-height: 1.4;
                margin-bottom: 15px;
                min-height: 60px;
                text-align: center;
                opacity: 0.9;
            }
            
            .quick-nav-buttons {
                display: flex;
                justify-content: center;
                gap: 10px;
                margin: 20px;
                flex-wrap: wrap;
            }
            
            .quick-nav-btn {
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                line-height: 1rem;
                cursor: pointer;
                transition: background 0.3s;
                text-decoration: none;
                display: inline-block;
            }
            
            .mode-info-header {
                border-radius: 8px;
                padding: 1rem;
                margin: 0 2% 2% 2%;
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .mode-info-content {
                flex: 1;
            }
            
            .mode-info-header[data-mode="pppoe"] {
                background: rgba(255,107,107,0.7);
            }
            
            .mode-info-header[data-mode="dhcp"] {
                background: rgba(51,154,240,0.7);
            }
            
            .mode-info-header[data-mode="siderouter"] {
                background: rgba(81,207,102,0.7);
            }
            
            @media (max-width: 768px) {
                .mode-selection-container {
                    margin-top: 0;
                    padding: 0;
                }
                .mode-grid {
                    flex-direction: column;
                    align-items: center;
                }
                
                .mode-card {
                    min-width: 90%;
                    max-width: 90%;
                }
                
                .quick-nav-buttons {
                    flex-direction: column;
                }
                
                .quick-nav-btn {
                    width: 90%;
                    text-align: center;
                }
                
                .mode-info-header {
                    flex-direction: column;
                    text-align: center;
                }
            }
        `);
        
        document.head.appendChild(style);
    },

    getModeIcon: function(mode) {
        var svgCode;
        var color = this.getModeColor(mode);
        
        switch(mode) {
            case 'pppoe':
                svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="48" height="48"><path fill="${color}" d="M493.4 24.6l-104-24c-11.3-2.6-22.9 3.3-27.5 13.9l-48 112c-4.2 9.8-1.4 21.3 6.9 28l60.6 49.6c-36 76.7-98.9 140.5-177.2 177.2l-49.6-60.6c-6.8-8.3-18.2-11.1-28-6.9l-112 48C3.9 366.5-2 378.1.6 389.4l24 104C27.1 504.2 36.7 512 48 512c256.1 0 464-207.5 464-464 0-11.2-7.7-20.9-18.6-23.4z"/></svg>`;
                break;
            case 'dhcp':
                svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768" width="48" height="48">
<path fill="${color}" d="M506.666 629.335v-82.417h-82.418v82.417h82.418zM362.916 629.335v-82.417h-80.501v82.417h80.501zM221.083 629.335v-82.417h-82.417v82.417h82.417zM669.584 424.25q32.584 0 57.5 24.916t24.916 57.5v162.916q0 32.584-24.916 57.5t-57.5 24.917h-571.169q-32.584 0-57.5-24.917t-24.916-57.5v-162.916q0-32.584 24.916-57.5t57.5-24.916h408.252v-162.917h82.418v162.917h80.5zM683 167.416l-32.584 32.584q-40.25-40.25-103.501-40.25-61.334 0-101.584 40.25l-32.584-32.584q57.5-57.5 134.168-57.5 78.584 0 136.084 57.5zM719.417 134.833q-78.584-69-172.501-69-92 0-170.585 69l-32.584-32.584q86.25-86.25 203.167-86.25 118.834 0 205.085 86.25z"></path>
</svg>`;
                break;
            case 'siderouter':
                svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768" width="48" height="48">
<path fill="${color}" d="M496.5 463.5v84l-112.5 141-370.5-465 9-7.5q9-6 18.75-12.75t26.25-17.25 35.25-19.5 42.75-20.25 51-19.5 56.25-15.75 63-11.25 68.25-3.75 68.25 3.75 63 11.25 56.25 15.75 51 19.5 42.75 20.25 35.25 19.5 26.25 17.25 18.75 12.75l9 7.5-66 84q-9-3-33-3-67.5 0-113.25 45.75t-45.75 113.25zM703.5 511.5v-48q0-19.5-14.25-33.75t-33.75-14.25-33.75 14.25-14.25 33.75v48h96zM736.5 511.5q12 0 21.75 10.5t9.75 22.5v127.5q0 12-9.75 21.75t-21.75 9.75h-160.5q-12 0-21.75-9.75t-9.75-21.75v-127.5q0-12 9.75-22.5t21.75-10.5v-48q0-34.5 22.5-57t57-22.5 57.75 23.25 23.25 56.25v48z"></path>
</svg>`;
                break;
        }
        
        var svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgCode)));
        return '<img src="' + svgUrl + '" alt="' + mode + ' icon" class="mode-icon">';
    },

    getModeTitle: function(mode) {
        switch(mode) {
            case 'pppoe': return _('PPPoE Dial-up');
            case 'dhcp': return _('DHCP Client');
            case 'siderouter': return _('Side Router');
            default: return _('WAN Settings');
        }
    },

    getModeDescription: function(mode) {
        switch(mode) {
            case 'pppoe': return _('Fiber broadband that requires username/password');
            case 'dhcp': return _('Connect to router as a subordinate router to internet');
            case 'siderouter': return _('Configure as side router in same network as main router');
            default: return _('Network connection mode');
        }
    },

    getModeColor: function(mode) {
        switch(mode) {
            case 'pppoe': return '#ff6b6b';
            case 'dhcp': return '#339af0';
            case 'siderouter': return '#51cf66';
            default: return '#36c';
        }
    },

    renderModeSelection: function() {
        var container = E('div', { 'class': 'mode-selection-container' }, [
            E('h2', { 'style': 'margin-top: 4%;margin-bottom: 15px;text-align: center;padding: 1rem;font-size: 1.8rem;font-weight: 600;' },
                _('Select Network Connection Mode')),
            E('p', { 'style': 'margin-bottom: 1rem;text-align: center;font-size: 1.1rem;' },
                _('Choose the connection mode that matches your network environment'))
        ]);
        
        var modeGrid = E('div', { 'class': 'mode-grid' });
        
        var modes = [
            { id: 'pppoe' },
            { id: 'dhcp' },
            { id: 'siderouter' }
        ];
        
        var self = this;
        modes.forEach(function(mode) {
            var iconDiv = E('div', { 
                'class': 'mode-icon-container'
            });
            
            iconDiv.innerHTML = self.getModeIcon(mode.id);
            
            var card = E('div', {
                'class': 'mode-card',
                'data-mode': mode.id
            }, [
                iconDiv,
                E('div', { 'class': 'mode-title' }, self.getModeTitle(mode.id)),
            ]);
            
            card.addEventListener('click', function() {
                self.selectMode(mode.id);
            });
            self.addStylesnobnt();
            modeGrid.appendChild(card);
        });
        
        container.appendChild(modeGrid);
        return container;
    },

    selectMode: function(mode) {
        uci.set('netwizard', 'default', 'wan_proto', mode);
        uci.save();
        var currentUrl = window.location.pathname;
        var newUrl = currentUrl + '?selectedMode=' + mode + '&tab=wansetup';
        window.location.href = newUrl;
    },

    renderConfigForm: function(selectedMode) {
        var wanproto = selectedMode || this.wanproto;
        
        var m = new form.Map('netwizard', _('Quick Network Setup Wizard'),
            _('Quick network setup wizard. If you need more settings, please enter network - interface to set.'));
        
        var s = m.section(form.NamedSection, 'default');
        s.addremove = false;
        s.anonymous = true;

        s.tab('modesetup', _('Network Mode'));
        s.tab('wansetup', _('WAN Settings'));
        if (this.has_wifi) {
            s.tab('wifisetup', _('Wireless Settings'), _('Set the router\'s wireless name and password. For more advanced settings, please go to the Network-Wireless page.'));
        }
        s.tab('othersetup', _('Other Settings'));

        var modeTitle = this.getModeTitle(wanproto);
        var modeIcon = this.getModeIcon(wanproto);
        var modeDescription = this.getModeDescription(wanproto);
        var modeColor = this.getModeColor(wanproto);
        
        var o = s.taboption('modesetup', form.DummyValue, 'current_mode', _('Current Network Mode'));
        o.rawhtml = true;
        o.default = '<div style="display: flex;align-items: center;flex-direction: column;">' +
                    '<div class="mode-icon-container">' + modeIcon + '</div>' +
                    '<h3 >' + modeTitle + '</h3>' +
                    '<p >' + modeDescription + '</p>' +
                    '<div class="quick-nav-buttons">' +
                    '<button onclick="switchToTab(\'wansetup\')" class="quick-nav-btn cbi-button cbi-button-apply" style="background: ' + modeColor + ';">' +
                    '⚙️ ' + _('Go to WAN Settings') + '</button>' +
                    '<a href="' + window.location.pathname + '" class="quick-nav-btn cbi-button cbi-button-reset">' +
                    '↻ ' + _('Change Mode') + '</a>' +
                    '</div>' +
                    '</div>';

        var modeInfoHeader = s.taboption('wansetup', form.DummyValue, 'mode_info_header', '');
        modeInfoHeader.rawhtml = true;
        modeInfoHeader.default = '<div class="mode-info-header" data-mode="' + wanproto + '">' +
                                 '<div class="mode-icon-container cbi-value-title">' + modeIcon + '</div>' +
                                 '<div class="mode-info-content cbi-value-field">' +
                                 '<h4 style="margin: 0 0 5px 0; color: #fff;">' + modeTitle + '</h4>' +
                                 '<p style="margin: 0; font-size: 14px; color: #fff;">' + modeDescription + '</p>' +
                                 '<div style="margin: 10px;">' +
                    '<a href="' + window.location.pathname + '" class="quick-nav-btn cbi-button cbi-button-reset">' +
                    '↻ ' + _('Change Mode') + '</a>' +
                                 '</div>' +
                                 '</div>' +
                                 '</div>';

        o = s.taboption('modesetup', form.ListValue, 'wan_proto', _('Protocol'), 
            _('Three different ways to access the Internet, please choose according to your own situation.'));
        o.default = wanproto;
        o.value('dhcp', _('DHCP Client'));
        o.value('pppoe', _('PPPoE Dial-up'));
        o.value('siderouter', _('Side Router'));
        o.rmempty = false;
        o.readonly = true;
    
        o = s.taboption('wansetup', form.Flag, 'setlan', _('Add LAN port configuration'));
        o.depends('wan_proto', 'pppoe');
        o.depends('wan_proto', 'dhcp');
        o.default = 0;
        o.rmempty = false;
	
        o = s.taboption('wansetup', form.ListValue, 'lan_proto', _('LAN IP Address Mode'), 
            _('Warning: Setting up automatic IP address retrieval requires checking the IP address on the higher-level router'));
        o.default = 'static';
        o.value('static', _('Static IP address (Specify non conflicting IP addresses)'));
        o.value('dhcp', _('DHCP client (Main router assigns IP)'));
        o.depends('wan_proto', 'siderouter');
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'lan_ipaddr', _('LAN IPv4 Address'), 
            _('You must specify the IP address of this machine, which is the IP address of the web access route'));
        o.default = this.lan_ip;
        o.datatype = 'ip4addr';
        o.rmempty = false;
        o.depends({'wan_proto':'pppoe','setlan': '1'});
        o.depends({'wan_proto': 'dhcp' ,'setlan': '1'});
        o.depends({'wan_proto': 'siderouter', 'lan_proto': 'static' });

        o = s.taboption('wansetup', form.Value, 'lan_netmask', _('LAN IPv4 Netmask'));
        o.datatype = 'ip4addr';
        o.value('255.255.255.0');
        o.value('255.255.0.0');
        o.value('255.0.0.0');
        o.default = this.lan_mask;
        o.depends({'wan_proto': 'siderouter', 'lan_proto': 'static'});
        o.depends({'wan_proto': 'pppoe','setlan': '1'});
        o.depends({'wan_proto': 'dhcp','setlan': '1'});
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'lan_gateway', _('LAN IPv4 Gateway'), 
            _('Please enter the main routing IP address. The bypass gateway is not the same as the login IP of this bypass WEB and is in the same network segment'));
        o.depends({'wan_proto': 'siderouter', 'lan_proto': 'static'});
        o.datatype = 'ip4addr';
        o.rmempty = false;

        o = s.taboption('wansetup', form.ListValue, 'dhcp_proto', _('WAN interface IP address mode'), 
            _('Choose how to get IP address for WAN interface'));
        o.default = 'dhcp';
        o.value('static', _('Static IP address (Specify non conflicting IP addresses)'));
        o.value('dhcp', _('DHCP client (existing router assigns IP)'));
        o.depends('wan_proto', 'dhcp');
        o.rmempty = false;
	
        o = s.taboption('wansetup', form.DynamicList, 'lan_dns', _('Use Custom SideRouter DNS'));
        o.value('223.5.5.5', _('Ali DNS: 223.5.5.5'));
        o.value('180.76.76.76', _('Baidu DNS: 180.76.76.76'));
        o.value('114.114.114.114', _('114 DNS: 114.114.114.114'));
        o.value('8.8.8.8', _('Google DNS: 8.8.8.8'));
        o.value('1.1.1.1', _('Cloudflare DNS: 1.1.1.1'));
        o.depends({'wan_proto': 'siderouter'});
        o.datatype = 'ip4addr';
        o.default = '223.5.5.5';
        o.rmempty = false;
	
        o = s.taboption('wansetup', widgets.DeviceSelect, 'wan_interface', 
            _('Device'), 
            _('Allocate the physical interface of WAN port'));
        o.depends({'wan_proto': 'pppoe','setlan': '1'});
        o.depends({'wan_proto': 'dhcp','setlan': '1'});
        o.default = this.wan_face;
        o.ucioption = 'wan_interface';
        o.nobridges = false;
        o.rmempty = false;
        
        o = s.taboption('wansetup', form.Value, 'wan_pppoe_user', _('PAP/CHAP Username'));
        o.depends('wan_proto', 'pppoe');
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'wan_pppoe_pass', _('PAP/CHAP Password'));
        o.depends('wan_proto', 'pppoe');
        o.password = true;
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'wan_ipaddr', _('WAN IPv4 Address'));
        o.depends({'wan_proto': 'dhcp', 'dhcp_proto': 'static'});
        o.datatype = 'ip4addr';
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'wan_netmask', _('WAN IPv4 Netmask'));
        o.depends({'wan_proto': 'dhcp', 'dhcp_proto': 'static'});
        o.datatype = 'ip4addr';
        o.value('255.255.255.0');
        o.value('255.255.0.0');
        o.value('255.0.0.0');
        o.default = '255.255.255.0';
        o.rmempty = false;

        o = s.taboption('wansetup', form.Value, 'wan_gateway', _('WAN IPv4 Gateway'));
        o.depends({'wan_proto': 'dhcp', 'dhcp_proto': 'static'});
        o.datatype = 'ip4addr';
        o.rmempty = false;

        o = s.taboption('wansetup', form.DynamicList, 'wan_dns', _('Use custom DNS servers'));
        o.value('', _('Auto-fetch'));
        o.value('223.5.5.5', _('Ali DNS: 223.5.5.5'));
        o.value('180.76.76.76', _('Baidu DNS: 180.76.76.76'));
        o.value('114.114.114.114', _('114 DNS: 114.114.114.114'));
        o.value('8.8.8.8', _('Google DNS: 8.8.8.8'));
        o.value('1.1.1.1', _('Cloudflare DNS: 1.1.1.1'));
        o.depends({'wan_proto': 'dhcp'});
        o.depends('wan_proto', 'pppoe');
        o.datatype = 'ip4addr';

        o = s.taboption('wansetup', form.Flag, 'ipv6', _('Enable IPv6'));
        o.default = '0';
        o.rmempty = false;

        o = s.taboption('wansetup', form.Flag, 'lan_dhcp', _('Disable DHCP Server'), 
            _('Selecting means that the DHCP server is not enabled. In a network, only one DHCP server is needed to allocate and manage client IPs. If it is a siderouter route, it is recommended to turn off the primary routing DHCP server.'));
        o.default = '0';
        o.rmempty = false;

        o = s.taboption('wansetup', form.Flag, 'dnsset', _('Enable DNS Notifications (IPv4/IPv6)'),
            _('Forcefully specify the DNS server for this router'));
        o.depends('lan_dhcp', '0');
        o.default = '0';
        o.rmempty = false;

        o = s.taboption('wansetup', form.ListValue, 'dns_tables', _('Use custom DNS servers'));
        o.value('1', _('Use local IP for DNS (default)'));
        o.value('223.5.5.5', _('Ali DNS: 223.5.5.5'));
        o.value('180.76.76.76', _('Baidu DNS: 180.76.76.76'));
        o.value('114.114.114.114', _('114 DNS: 114.114.114.114'));
        o.value('8.8.8.8', _('Google DNS: 8.8.8.8'));
        o.value('1.1.1.1', _('Cloudflare DNS: 1.1.1.1'));
        o.depends('dnsset', '1');
        o.rmempty = false;

        o = s.taboption('wansetup', form.Flag, 'https', _('Redirect to HTTPS'),
            _('Enable automatic redirection of HTTP requests to HTTPS port.'));
        o.default = '0';
        o.rmempty = false;
        
        if (this.has_wifi) {
            var wifi_ssid = s.taboption('wifisetup', form.Value, 'wifi_ssid', _('<abbr title="Extended Service Set Identifier">ESSID</abbr>'));
            wifi_ssid.datatype = 'maxlength(32)';

            var wifi_key = s.taboption('wifisetup', form.Value, 'wifi_key', _('Key'));
            wifi_key.datatype = 'wpakey';
            wifi_key.password = true;
        }

        o = s.taboption('othersetup', form.Flag, 'synflood', _('Enable SYN-flood Defense'),
            _('Enable Firewall SYN-flood defense [Suggest opening]'));
        o.default = '1';
        o.rmempty = false;
	
        o = s.taboption('othersetup', form.Flag, 'updatacheck', _('Enable detection update prompts'));
        o.default = '0';
        o.rmempty = false;
	
        var originalSave = m.save;
        var currentLanIP = this.lan_ip;
        var currentHTTPS = this.LanHTTPS;
        var self = this;

        function getNewLanIP() {
            var selectors = [
                'input[id="widget.cbid.netwizard.default.lan_ipaddr"]',
                'input[name="widget.cbid.netwizard.default.lan_ipaddr"]',
                'input[data-option="lan_ipaddr"]',
                'input[placeholder*="IP"]',
                '.cbi-input-text[type="text"]'
            ];
            
            for (var i = 0; i < selectors.length; i++) {
                var inputs = document.querySelectorAll(selectors[i]);
                for (var j = 0; j < inputs.length; j++) {
                    var input = inputs[j];
                    if (input && input.value) {
                        var ipMatch = input.value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
                        if (ipMatch) {
                            var valid = true;
                            for (var k = 1; k <= 4; k++) {
                                var part = parseInt(ipMatch[k]);
                                if (part < 0 || part > 255) {
                                    valid = false;
                                    break;
                                }
                            }
                            if (valid) {
                                return input.value;
                            }
                        }
                    }
                }
            }
            
            return null;
        }

        function getLanproto() {
            return new Promise(function(resolve, reject) {
                try {
                    var selectors = [
                        'select[id="widget.cbid.netwizard.default.lan_proto"]',
                        'select[name="widget.cbid.netwizard.default.lan_proto"]'
                    ];
                    
                    for (var i = 0; i < selectors.length; i++) {
                        var selects = document.querySelectorAll(selectors[i]);
                        for (var j = 0; j < selects.length; j++) {
                            var select = selects[j];
                            if (select && select.value) {
                                resolve(select.value === 'dhcp');
                                return;
                            }
                        }
                    }

                    var lanProtoConfig = uci.get('netwizard', 'default', 'lan_proto');
                    if (lanProtoConfig) {
                        resolve(lanProtoConfig === 'dhcp');
                        return;
                    }
                    
                    resolve(false);
                    
                } catch (error) {
                    resolve(false);
                }
            });
        }

        function getNewhttps() {
            var selectors = [
                'input[data-widget-id="widget.cbid.netwizard.default.https"]'
            ];
            
            for (var i = 0; i < selectors.length; i++) {
                var inputs = document.querySelectorAll(selectors[i]);
                for (var j = 0; j < inputs.length; j++) {
                    var input = inputs[j];
                    if (input.type === 'checkbox') {
                        return input.checked ? '1' : '0';
                    } else if (input.type === 'hidden') {
                        return input.value === '1' ? '1' : '0';
                    }
                }
            }
            return '0';
        }

        function showDHCPWarningMessage() {
            var overlay = document.createElement('div');
            overlay.id = 'netwizard-dhcp-warning-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: Arial, sans-serif;
            `;
            
            var messageBox = document.createElement('div');
            messageBox.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 2%;
                border-radius: 15px;
                text-align: center;
                min-width: 300px;
                max-width: 600px;
                box-shadow: rgba(255, 255, 255, 0.2) 0px 20px 40px;
            `;
            
            var warningIcon = document.createElement('div');
            warningIcon.innerHTML = '⚠️';
            warningIcon.style.cssText = `
                font-size: 60px;
                margin-bottom: 10px;
                animation: pulse 2s infinite;
            `;
            
            var style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);

            var title = document.createElement('h2');
            title.textContent = _('Set LAN to DHCP mode');
            title.style.cssText = `
                margin: 0 0 20px 0;
                color: #FFD700;
                font-size: 28px;
            `;

            var message = document.createElement('div');
            message.innerHTML = _('The router is now configured to obtain IP address via DHCP.') +
                               '<div style="background: rgba(255,255,255,0.2); border-radius: 10px; padding: 20px; margin: 20px 0; text-align: left;">' +
                               '<strong style="color: #FFD700;">' + _('Important Note:') + '</strong><br>' +
                               '1. ' + _('The current router IP address will be assigned by the DHCP server of the superior router') + '<br>' +
                               '2. ' + _('Please login to the superior router to view the DHCP client list') + '<br>' +
                               '3. ' + _('Or access using the original IP address on the current router') + '<br>' +
                               '4. ' + _('Unable to automatically redirect to the new IP address') +
                               '</div>' +
                               '<div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 15px;">' +
                               _('Configuration has been saved successfully. You can manually access the router management interface.') +
                               '</div>';
            
            message.style.cssText = `
                color: rgba(255,255,255,0.9);
                line-height: 1.5rem;
                font-size: 0.875rem;
            `;

            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                justify-content: center;
                margin-top: 1rem;
                flex-wrap: wrap;
            `;

            var closeButton = document.createElement('button');
            closeButton.textContent = _('Close');
            closeButton.style.cssText = `
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 50px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
		padding: 0 30px;
                transition: all 0.3s ease;
                box-shadow: 0 5px 15px rgba(76, 175, 80, 0.4);
            `;
            
            closeButton.onmouseover = function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 8px 20px rgba(76, 175, 80, 0.6)';
            };
            
            closeButton.onmouseout = function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 5px 15px rgba(76, 175, 80, 0.4)';
            };
            
            closeButton.onclick = function() {
                document.body.removeChild(overlay);
            };

            messageBox.appendChild(warningIcon);
            messageBox.appendChild(title);
            messageBox.appendChild(message);
            buttonContainer.appendChild(closeButton);
            messageBox.appendChild(buttonContainer);
            overlay.appendChild(messageBox);

            document.body.appendChild(overlay);
        }

        function showRedirectMessage(newIP, useHTTPS, isDHCP) {
            if (isDHCP) {
                showDHCPWarningMessage();
                return;
            }
            
            var overlay = document.createElement('div');
            overlay.id = 'netwizard-redirect-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: Arial, sans-serif;
            `;
            
            var messageBox = document.createElement('div');
            messageBox.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 1rem;
                border-radius: 15px;
                text-align: center;
                min-width: 350px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                color: white;
            `;
            
            var icon = document.createElement('div');
            icon.innerHTML = '✓';
            icon.style.cssText = `
                font-size: 60px;
                color: #4CAF50;
                background: white;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-weight: bold;
                box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            `;

            var title = document.createElement('h2');
            title.textContent = _('Configuration Applied Successfully!');
            title.style.cssText = `
                margin: 0 0 20px 0;
                color: white;
            `;
            
            var protocolText = useHTTPS === '1' ? 'HTTPS' : 'HTTP';
            var message = document.createElement('div');

            message.innerHTML = _('The network configuration has been saved and applied.<br><br>') +
                               '<div style="background: rgba(255,255,255,0.2);border-radius: 10px;padding: 0 10px;margin: 0 10px;">' +
                               _('Redirecting to') + ' ' +
                               '<strong style="color: #FFD700; font-size: 22px;">'+  newIP + '</strong><br>' +
                               _('Access Protocol:') + ' ' +
                               '<strong style="color: #FFD700; font-size: 18px;">' +' ' + protocolText + '</strong>' +
                               '</div><br>' +
                               _('The page will automatically redirect in') + ' ' +
                               '<span id="netwizard-countdown" style="color: #FFD700; font-size: 28px; font-weight: bold;">10</span>' + ' ' +
                               _('seconds...');

            message.style.cssText = `
                color: rgba(255,255,255,0.9);
                line-height: 1.8;
                margin: 20px 0;
                font-size: 16px;
            `;
            
            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                justify-content: center;
                gap: 15px;
                margin-bottom: 2rem;
                flex-wrap: wrap;
            `;

            var redirectButton = document.createElement('button');
            redirectButton.textContent = _('Redirect Now');
            redirectButton.style.cssText = `
                background: #4CAF50;
                color: white;
                border: none;
                padding: 0 30px;
                border-radius: 50px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 5px 15px rgba(76, 175, 80, 0.4);
            `;
            
            redirectButton.onmouseover = function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 8px 20px rgba(76, 175, 80, 0.6)';
            };
            
            redirectButton.onmouseout = function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 5px 15px rgba(76, 175, 80, 0.4)';
            };
            
            redirectButton.onclick = function() {
                redirectToNewIP(newIP, useHTTPS);
            };

            messageBox.appendChild(icon);
            messageBox.appendChild(title);
            messageBox.appendChild(message);
            buttonContainer.appendChild(redirectButton);
            messageBox.appendChild(buttonContainer);
            overlay.appendChild(messageBox);

            document.body.appendChild(overlay);

            var countdown = 10;
            var countdownElement = document.getElementById('netwizard-countdown');

            var countdownInterval = setInterval(function() {
                countdown--;
                if (countdownElement) {
                    countdownElement.textContent = countdown;

                    if (countdown <= 3) {
                        countdownElement.style.color = (countdown % 2 === 0) ? '#FF6B6B' : '#FFD700';
                    }
                }

                if (countdown <= 0) {
                    clearInterval(countdownInterval);
                    redirectToNewIP(newIP, useHTTPS);
                }
            }, 1000);
            
            overlay._countdownInterval = countdownInterval;
        }

        function hideRedirectMessage() {
            var overlay = document.getElementById('netwizard-redirect-overlay');
            if (overlay) {
                if (overlay._countdownInterval) {
                    clearInterval(overlay._countdownInterval);
                }
                document.body.removeChild(overlay);
            }
        }

        function redirectToNewIP(newIP, useHTTPS) {
            hideRedirectMessage();
            
            var protocol = useHTTPS === '1' ? 'https:' : 'http:';
            var currentPort = window.location.port ? ':' + window.location.port : '';
            var newURL = protocol + '//' + newIP + currentPort + '/';

            var jumpMsg = document.createElement('div');
            jumpMsg.id = 'netwizard-jump-msg';
            jumpMsg.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                z-index: 10000;
                font-weight: bold;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                animation: slideIn 0.5s ease;
            `;

            var style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);

            jumpMsg.textContent = _('Redirecting to') + ' ' + (useHTTPS === '1' ? 'HTTPS://' : 'HTTP://') + newIP + '...';
            document.body.appendChild(jumpMsg);

            setTimeout(function() {
                try {
                    window.location.href = newURL;
                } catch (e) {
                    alert(_('Failed to redirect to') + ' ' + newIP + 
                          _('\nPlease manually access:\n') + newURL);
                    
                    var jumpMsg = document.getElementById('netwizard-jump-msg');
                    if (jumpMsg) {
                        document.body.removeChild(jumpMsg);
                    }
                }
            }, 1000);
        }

        m.save = function() {
            var newLanIP = getNewLanIP();
            var useHTTPS = getNewhttps();
            var self = this;
            
            var savingMsg = document.createElement('div');
            savingMsg.id = 'netwizard-saving-msg';
            savingMsg.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.9);
                color: white;
                padding: 20px 40px;
                border-radius: 10px;
                z-index: 9998;
                font-size: 16px;
            `;
            savingMsg.textContent = _('Saving configuration...');
            document.body.appendChild(savingMsg);
            
            var startTime = Date.now();
            
            function cleanup() {
                if (savingMsg && savingMsg.parentNode) {
                    document.body.removeChild(savingMsg);
                }
            }
            
            function applywait(wtime) {
                return new Promise(function(resolve) {
                    setTimeout(resolve, wtime);
                });
            }
            
            return getLanproto()
                .then(async function(isDHCP) {
                    savingMsg.textContent = _('Saving configuration...');
                    var result = await originalSave.call(m);
                    
                    savingMsg.textContent = _('Applying configuration...'); 
                    await applywait(2000);
                    
                    var totalTime = Date.now() - startTime;
                    // console.log('Save time:', totalTime + 'ms');
                    cleanup();
                    
                    return { 
                        result: result, 
                        newLanIP: newLanIP || currentLanIP,
                        isDHCP: isDHCP,
                        useHTTPS: useHTTPS
                    };
                })
                .then(function(data) {
                    var result = data.result;
                    var actualNewLanIP = data.newLanIP;
                    var isDHCP = data.isDHCP;
                    var useHTTPS = data.useHTTPS;
                    
                    var ipChanged = actualNewLanIP && currentLanIP !== actualNewLanIP;
                    var HTTPSChanged = currentHTTPS !== useHTTPS;
                    var isHTTP = useHTTPS === '0';
                    var needRedirect = true;

                    if (isHTTP && !ipChanged && !HTTPSChanged && !isDHCP) {
                        needRedirect = false;
                    }

                    if (!needRedirect) {
                        var successMsg = document.createElement('div');
                        successMsg.id = 'netwizard-success-msg';
                        successMsg.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: #4CAF50;
                            color: white;
                            padding: 15px 25px;
                            border-radius: 10px;
                            z-index: 9999;
                            font-weight: bold;
                            animation: slideIn 0.5s ease;
                        `;
                        successMsg.textContent = _('Configuration saved successfully!');
                        document.body.appendChild(successMsg);
                        
                        setTimeout(function() {
                            if (successMsg && successMsg.parentNode) {
                                document.body.removeChild(successMsg);
                            }
                        }, 3000);

                        return result;
                    }
                    
                    showRedirectMessage(actualNewLanIP, useHTTPS, isDHCP);
                    
                    return result;
                })
                .catch(function(err) {
                    var msg = document.getElementById('netwizard-saving-msg');
                    if (msg && msg.parentNode) {
                        document.body.removeChild(msg);
                    }
                    
                    var errorMsg = document.createElement('div');
                    errorMsg.id = 'netwizard-error-msg';
                    errorMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #f44336;
                        color: white;
                        padding: 15px 25px;
                        border-radius: 10px;
                        z-index: 9999;
                        font-weight: bold;
                        animation: slideIn 0.5s ease;
                    `;
                    errorMsg.textContent = _('Failed to save configuration');
                    document.body.appendChild(errorMsg);
                    
                    setTimeout(function() {
                        var msg = document.getElementById('netwizard-error-msg');
                        if (msg && msg.parentNode) {
                            document.body.removeChild(msg);
                        }
                    }, 5000);
                    
                    throw err;
                });
        };

        var script = document.createElement('script');
        script.textContent = `
            function switchToTab(tabName) {
                var tabs = document.querySelectorAll('.cbi-tabmenu a');
                for (var i = 0; i < tabs.length; i++) {
                    var tab = tabs[i];
                    var tabText = tab.textContent || tab.innerText;
                    if ((tabName === 'wansetup' && (tabText.trim() === 'WAN Settings' || tabText.includes('WAN') || tabText.includes('网络设置'))) ||
                        (tabName === 'modesetup' && (tabText.trim() === 'Network Mode' || tabText.includes('Mode') || tabText.includes('网络模式'))) ||
                        (tabName === 'wifisetup' && (tabText.trim() === 'Wireless Settings' || tabText.includes('Wireless') || tabText.includes('无线设置'))) ||
                        (tabName === 'othersetup' && (tabText.trim() === 'Other Settings' || tabText.includes('Other') || tabText.includes('其他设置')))) {
                        tab.click();
                        var tabItems = document.querySelectorAll('.cbi-tabmenu li');
                        tabItems.forEach(function(item) {
                            item.classList.remove('cbi-tab-active');
                        });
                        tab.parentNode.classList.add('cbi-tab-active');
                        break;
                    }
                }
            }
            
            if (window.location.search.includes('selectedMode')) {
                setTimeout(function() {
                    switchToTab('wansetup');
                }, 200);
                
                document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(function() {
                        switchToTab('wansetup');
                    }, 100);
                });
            }
        `;
        
        document.head.appendChild(script);
        
        return m.render();
    }
});