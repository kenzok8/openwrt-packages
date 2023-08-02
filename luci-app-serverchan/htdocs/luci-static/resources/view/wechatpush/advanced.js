'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require rpc';
'require form';
'require tools.widgets as widgets';
'require tools.firewall as fwtool';

return view.extend({
	render: function (data) {
		var m, s, o;
		var programPath = '/usr/share/wechatpush/wechatpush';

		m = new form.Map('wechatpush', _(''))
		m.description = _("If you are not familiar with the meanings of these options, please do not modify them.<br/><br/>")

		s = m.section(form.NamedSection, 'config', 'wechatpush', _(''));
		s.anonymous = true
		s.addremove = false

		o = s.option(form.Value, 'up_timeout', _('Device online detection timeout (s)'));
		o.placeholder = "2"
		o.optional = false
		o.datatype = "uinteger"
		o.rmempty = false;

		o = s.option(form.Value, "down_timeout", _('Device offline detection timeout (s)'))
		o.placeholder = "10"
		o.optional = false
		o.datatype = "uinteger"
		o.rmempty = false;

		o = s.option(form.Value, "timeout_retry_count", _('Offline detection count'))
		o.placeholder = "2"
		o.optional = false
		o.datatype = "uinteger"
		o.rmempty = false;
		o.description = _("If the device has good signal strength and no Wi-Fi sleep issues, you can reduce the above values.<br/>Due to the mysterious nature of Wi-Fi sleep during the night, if you encounter frequent disconnections, please adjust the parameters accordingly.<br/>..╮(╯_╰）╭..")

		o = s.option(form.Flag, "only_timeout_push", _("Offline timeout applies only to the devices that receive push notifications"))
		o.default = 0
		o.rmempty = true
		o.description = _("When this option is selected, the offline timeout and offline detection count apply only to the devices that require push notifications. Other devices will use default values, which can significantly reduce the time required for detection. However, it may result in inaccurate online time displayed in the online devices list. It is recommended to enable this option only when there are many devices and frequent offline occurrences are observed for specific devices of interest.")

		o = s.option(form.Flag, "passive_mode", _("Disable active detection"))
		o.default = 0
		o.rmempty = true
		o.description = _("Disable active detection of client online status. Enabling this feature will no longer prompt device online/offline events.<br/>Suitable for users who are not sensitive to online devices but need other features.")

		o = s.option(form.Value, "thread_num", _('Maximum concurrent processes'))
		o.placeholder = "3"
		o.datatype = "uinteger"
		o.rmempty = false;
		o.description = _("Do not change the setting value for low-performance devices, or reduce the parameters as appropriate.")

		o = s.option(form.Value, "soc_code", _('Custom temperature reading command'))
		o.rmempty = true
		o.value("", _("Default"))
		o.value("pve", _("Proxmox Virtual Environment"))
		o.description = _("If you need to use special symbols such as quotes, $, !, etc. in custom commands, you need to escape them yourself.<br/>You can use the command eval echo $(uci get wechatpush.wechatpush.soc_code) to view command output and error information.<br/>The execution result should be a pure number (including decimals) for temperature comparison.<br/>Here is an example that does not require escaping:<br/>cat /sys/class/thermal/thermal_zone0/temp|sort -nr|head -n1|cut -c-2")

		o = s.option(form.Value, "server_host", _("Host machine address"))
		o.rmempty = true
		o.default = "10.0.0.2"
		o.depends('soc_code', 'pve');

		o = s.option(form.Value, "server_port", _("Host machine SSH port"))
		o.rmempty = true
		o.default = "22"
		o.description = _('The default SSH port is 22. If you have a custom port, please fill in the custom SSH port.<br/>Please make sure you have set up key-based login, otherwise it may cause script errors.<br/>Install the sensors command on PVE by searching on the internet.<br/>Example for key-based login (modify the address and port number accordingly):<br/>opkg update # Update package list<br/>opkg install openssh-client openssh-keygen # Install openssh client<br/>echo -e \"\\n\" | ssh-keygen -t rsa # Generate key file (no passphrase)<br/>pve_host=`uci get wechatpush.config.server_host` || pve_host=\"10.0.0.3\" # Read the PVE host address from the configuration file, If not saved, please fill in by yourself.<br/>pve_port=`uci get wechatpush.config.server_port` || pve_host=\"22\" # Read the PVE host SSH port number from the configuration file, If not saved, please fill in by yourself.<br/>ssh -o StrictHostKeyChecking=yes root@${pve_host} -p ${pve_port} \"tee -a ~/.ssh/OpenWrt_id_rsa.pub\" < ~/.ssh/id_rsa.pub # Transfer public key to PVE<br/>ssh root@${pve_host} -p ${pve_port} \"cat ~/.ssh/OpenWrt_id_rsa.pub >> ~/.ssh/authorized_keys\" # Write public key to PVE<br/>ssh -i /root/.ssh/id_rsa root@${pve_host} -p ${pve_port} sensors # To avoid script errors during the initial connection, please use a private key to connect to PVE and test the temperature command for its proper functioning.<br/>For users who frequently flash firmware, please add /root/.ssh/ to the backup list to avoid duplicate operations.');
		o.depends('soc_code', 'pve');

		o = s.option(form.Button, '_soc', _('Test temperature command'), _('You may need to save the configuration before sending.'));
		o.inputstyle = 'action';
		o.onclick = function () {
			var _this = this;
			return fs.exec(programPath, ['soc']).then(function (res) {
				if (!res.stdout) {
					throw new Error(_('Returned temperature value is empty'));
				}
				_this.description = res.stdout.trim();
				return _this.map.reset();
			}).catch(function (err) {
				_this.description = _('Fetch failed：') + err.message;
				return _this.map.reset();
			});
		};

		o = s.option(form.MultiValue, 'device_info_helper', _('Assist in obtaining device information'));
		o.value('gateway_info', _('Retrieve hostname list from modem'));
		o.value('scan_local_ip', _('Scan local IP'));
		o.modalonly = true;
		o.description = _('When OpenWrt is used as a bypass gateway and cannot obtain device hostnames or a complete list of local network devices.<br/>the \"Retrieve hostname list from modem\" option has only been tested with HG5143F/HN8145V China Telecom gateways and may not be universally applicable.<br/>The \"Scan local IP\" option may not retrieve hostnames, so please use device name annotations in conjunction with it.');

		o = s.option(form.Value, "gateway_host_url", _('Optical modem login URL'));
		o.rmempty = true;
		o.default = "http://192.168.1.1/cgi-bin/luci";
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_info_url", _('Device list JSON URL'));
		o.rmempty = true;
		o.default = "http://192.168.1.1/cgi-bin/luci/admin/allInfo";
		o.description = _('Use F12 console to capture<br/>ip, devName, model are mandatory fields. Example JSON file information:<br/>{\"pc1\":{\"devName\":\"RouterOS\",\"model\":\"\",\"type\":\"pc\",\"ip\":\"192.168.1.7\"}}');
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_logout_url", _('Optical modem logout URL'))
		o.rmempty = true
		o.default = "http://192.168.1.1/cgi-bin/luci/admin/logout"
		o.description = _("Not a mandatory field, but it may affect other users logging into the web management page, e.g., HG5143F")
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_username_id", _('Login page account input box ID'))
		o.rmempty = true
		o.default = "username"
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_password_id", _('Login page password input box ID'))
		o.rmempty = true
		o.default = "psd"
		o.description = _("Right-click in the browser and select 'Inspect Element'")
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_username", _('Optical modem login account'))
		o.rmempty = true
		o.default = "useradmin"
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "gateway_password", _('Optical modem login password'))
		o.rmempty = true
		o.description = _("Use a regular account, no need for super password")
		o.depends({ device_info_helper: "gateway_info", '!contains': true });

		o = s.option(form.Value, "scan_ip_range", _('IP range to be scanned'))
		o.rmempty = true
		o.placeholder = _('192.168.1.1-100');
		o.depends({ device_info_helper: "scan_local_ip", '!contains': true });

		o = s.option(form.Value, 'device_info_helper_sleeptime', _('Interval for capturing info'));
		o.rmempty = false;
		o.placeholder = '600';
		o.datatype = 'and(uinteger,min(60))'
		o.description = _("Generally, frequent capturing is not necessary. Adjust it as needed.")
		o.depends({ device_info_helper: "gateway_info", '!contains': true });
		o.depends({ device_info_helper: "scan_local_ip", '!contains': true });

		o = s.option(form.Flag, "unattended_enable", _("Unattended tasks"))
		o.default = 0
		o.rmempty = true
		o.description = _("Please make sure the script can run properly, otherwise it may cause frequent restarts and other errors!")

		o = s.option(form.Flag, 'zerotier_helper', _('Restart zerotier after IP change'));
		o.description = _('An old issue with zerotier<br/>Cannot reconnect after disconnection, emmm, I don\'t know if it has been fixed now.');
		o.depends('unattended_enable', '1');

		o = s.option(form.Flag, "unattended_only_on_disturb_time", _("Redial only during Do-Not-Disturb period"))
		o.default = 0
		o.rmempty = true
		o.description = _("Avoid redialing network during the day to prevent waiting for DDNS domain resolution. This feature does not affect disconnection detection.<br/>Due to the issue of certain apps consuming excessive data at night, this feature may be unstable.")
		o.depends('unattended_enable', '1');

		o = s.option(form.DynamicList, "unattended_device_aliases", _("Followed device list"))
		o.rmempty = true
		o.description = _("Will only be executed when none of the devices in the list are online.<br/>After an hour of Do-Not-Disturb period, if the devices in the focus list have low traffic (around 100kb/m) for five minutes, they will be considered offline.")
		//nt.mac_hints(function(mac, name) o :value(mac, "%s (%s)" %{ mac, name }) end)
		o.depends('unattended_enable', '1');

		o = s.option(form.ListValue, "network_disconnect_event", _("When the network is disconnected"))
		o.default = ""
		o.value("", _("No operation"))
		o.value("1", _("Restart the router"))
		o.value("2", _("Redialing network"))
		o.description = _("The restart operation will occur ten minutes after the network disconnection and will be attempted a maximum of two times. If the option to log in to the optical modem is available, this operation will attempt to restart the optical modem.<br/>【!!This feature cannot guarantee compatibility!!】")
		o.depends('unattended_enable', '1');

		o = s.option(form.ListValue, "unattended_autoreboot_mode", _("Scheduled reboot"))
		o.default = ""
		o.value("", _("No operation"))
		o.value("1", _("Restart the router"))
		o.value("2", _("Redialing network"))
		o.depends('unattended_enable', '1');

		o = s.option(form.Value, "autoreboot_system_uptime", _("System uptime greater than"))
		o.rmempty = true
		o.default = "24"
		o.datatype = "uinteger"
		o.description = _("Unit: hours")
		o.depends('unattended_autoreboot_mode', '1');

		o = s.option(form.Value, "autoreboot_network_uptime", _("Network uptime greater than"))
		o.rmempty = true
		o.default = "24"
		o.datatype = "uinteger"
		o.description = _("Unit: hours")
		o.depends('unattended_autoreboot_mode', '2');

		return m.render();
	}
});
