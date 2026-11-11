/* Static demo controller. No LuCI/RPC calls and no router credentials. */
(function () {
	'use strict';
	const P = window.CarbonPreview, T = P.T, C = window.Carbon;
	const params = new URLSearchParams(location.search);
	const overview = 'admin/status/overview';
	const requested = params.get('page') || (location.hash.startsWith('#admin/') ? location.hash.slice(1) : overview);
	const active = P.paths.includes(requested) ? requested : overview;
	const view = document.getElementById('view');
	const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
	const link = (path, label) => '<a href="' + esc(P.url(path)) + '">' + esc(label) + '</a>';
	const button = (label, action, style) => '<button type="button" class="btn cbi-button cbi-button-' + (style || 'neutral') + '" data-action="' + action + '">' + esc(label) + '</button>';
	const badge = (on) => '<span class="label' + (on ? ' success' : '') + '">' + T(on ? 'Enabled' : 'Disabled', on ? '已启用' : '已禁用') + '</span>';
	const section = (title, content) => '<section class="cbi-section"><h3>' + esc(title) + '</h3>' + content + '</section>';
	const table = (headers, rows) => '<div class="table cbi-section-table" role="table"><div class="tr cbi-section-table-titles" role="row">' + headers.map((v) => '<div class="th" role="columnheader">' + esc(v) + '</div>').join('') + '</div>' + rows.map((row) => '<div class="tr cbi-section-table-row" role="row">' + row.map((v, i) => '<div class="td" role="cell" data-title="' + esc(headers[i]) + '">' + v + '</div>').join('') + '</div>').join('') + '</div>';
	const field = (label, id, input, help) => '<div class="cbi-value"><label class="cbi-value-title" for="' + id + '">' + esc(label) + '</label><div class="cbi-value-field">' + input + (help ? '<div class="cbi-value-description">' + esc(help) + '</div>' : '') + '</div></div>';
	const input = (id, value, attrs) => '<input class="cbi-input-text" id="' + id + '" name="' + id + '" value="' + esc(value) + '" ' + (attrs || '') + '>';
	const check = (id, on) => '<input type="checkbox" id="' + id + '" name="' + id + '"' + (on ? ' checked' : '') + '>';
	const select = (id, options, current) => '<select id="' + id + '" name="' + id + '">' + options.map(([value, label]) => '<option value="' + value + '"' + (String(current) === value ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>';
	const form = (id, content) => '<form id="' + id + '"><div class="cbi-section-node">' + content + '</div><div class="cbi-page-actions"><button type="submit" class="btn cbi-button cbi-button-apply">' + T('Save & apply', '保存并应用') + '</button><button type="reset" class="btn cbi-button cbi-button-reset">' + T('Reset', '复位') + '</button></div></form>';
	const intro = (title, description) => '<div class="demo-intro"><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p></div>';
	let toastTimer;
	function toast(message) {
		const el = document.getElementById('demo-toast');
		el.textContent = message;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { el.textContent = ''; }, 4500);
	}
	const saved = () => toast(T('Demo settings saved for this tab.', '演示设置已保存到当前标签页。'));
	function download(name, content) {
		const blob = new Blob([content], { type: 'application/json' });
		const url = URL.createObjectURL(blob), a = document.createElement('a');
		a.href = url; a.download = name; a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	function confirmDemo(title, description, callback) {
		const dialog = document.createElement('dialog');
		dialog.className = 'demo-dialog';
		dialog.setAttribute('aria-labelledby', 'demo-dialog-title');
		dialog.innerHTML = '<h3 id="demo-dialog-title">' + esc(title) + '</h3><p>' + esc(description) + '</p><div class="demo-tools">' + button(T('Cancel', '取消'), 'cancel') + button(T('Confirm', '确认'), 'confirm', 'apply') + '</div>';
		document.body.appendChild(dialog);
		dialog.addEventListener('close', () => dialog.remove());
		dialog.querySelector('[data-action="cancel"]').onclick = () => dialog.close();
		dialog.querySelector('[data-action="confirm"]').onclick = () => { dialog.close(); callback(); };
		dialog.showModal();
	}

	/* [LuCI code, native name, short label, ?lang= value] */
	const DEMO_LANGUAGES = [
		['en', 'English', 'EN', 'en'], ['de', 'Deutsch', 'DE', 'de'], ['es', 'Español', 'ES', 'es'],
		['fr', 'Français', 'FR', 'fr'], ['it', 'Italiano', 'IT', 'it'], ['ja', '日本語', 'JA', 'ja'],
		['ko', '한국어', 'KO', 'ko'], ['pt_br', 'Português do Brasil', 'PT', 'pt-BR'], ['ru', 'Русский', 'RU', 'ru'],
		['tr', 'Türkçe', 'TR', 'tr'], ['vi', 'Tiếng Việt', 'VI', 'vi'],
		['zh_hans', '简体中文', '简', 'zh-Hans'], ['zh_hant', '繁體中文', '繁', 'zh-Hant']
	];
	/* keep a requested catalogue language (?lang=de); demo-only text is English or Chinese */
	if (/^zh/i.test(document.documentElement.lang)) document.documentElement.lang = /hant|tw|hk|mo/i.test(document.documentElement.lang) ? 'zh-Hant' : 'zh-Hans';
	document.body.dataset.page = active.replaceAll('/', '-');
	document.body.className = T('lang_en', 'lang_zh_Hans');
	document.title = P.title(active).filter(Boolean).join(' · ') + ' — Carbon Demo';
	document.querySelector('.cb-brand').href = P.url(overview);
	document.querySelector('.cb-brand-text strong').textContent = P.settings.hostname;
	document.getElementById('demo-banner').innerHTML = '<span><strong>CARBON DEMO</strong>' + T('Explore the theme with simulated data.', '使用模拟数据体验主题效果。') + '</span><div class="demo-links">' + link('admin/network/dhcp', T('Devices', '在线设备')) + link('admin/status/syslog', T('Logs', '系统日志')) + '<a href="https://github.com/mrjoechen/luci-theme-carbon" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>';
	document.getElementById('indicators').textContent = T('Demo', '演示模式');
	C.initShell({
		logoutUrl: 'login.html?lang=' + document.documentElement.lang,
		language: {
			current: document.documentElement.lang,
			/* every bundled catalogue, as LuCI lists installed languages (code → ?lang=) */
			load: () => Promise.resolve({
				options: DEMO_LANGUAGES.map(([code, label, short]) => ({ code: code, label: label, short: short })),
				selected: (DEMO_LANGUAGES.find(([, , , lang]) => lang.toLowerCase() === document.documentElement.lang.toLowerCase()) || DEMO_LANGUAGES[0])[0]
			}),
			set(code) {
				const next = new URL(location.href);
				next.searchParams.set('lang', code === 'auto' ? 'zh-Hans' : DEMO_LANGUAGES.find(([c]) => c === code)[3]);
				next.searchParams.set('page', active);
				location.assign(next.href);
				return new Promise(() => {});
			}
		}
	});
	C.renderNav(P.model(active));
	C.setTitle(P.title(active));
	if (requested !== active) toast(T('Page not found. Showing the overview.', '未找到该演示页面，已显示概览。'));

	async function render() {
		if (active === overview) {
			const board = await P.provider.board();
			view.innerHTML = section(T('System details', '系统详情'), table([T('Property', '项目'), T('Value', '值')], [
				[T('Hostname', '主机名'), esc(board.hostname)], [T('Model', '型号'), esc(board.model)],
				[T('Firmware', '固件'), esc(board.release.description)], [T('Kernel', '内核'), esc(board.kernel)]
			]));
			const host = document.createElement('div'); host.id = 'cb-dashboard';
			view.before(host);
			C.Dashboard.mount(host, P.provider, { urls: { network: P.url('admin/network/network'), wireless: P.url('admin/network/wireless'), devices: P.url('admin/network/dhcp') } });
			C.detailsToggle(host, C.mode.get() === 'pro');
			return;
		}
		if (active === 'admin/network/network') {
			const interfaces = (await P.provider.interfaces()).filter((it) => it.interface !== 'loopback');
			view.innerHTML = intro(T('Internet & Network', '上网与网络'), T('A sample dual-stack network with LAN, WAN and a guest interface.', '预览 LAN、WAN、IPv6 与访客网络的接口状态。')) + section(T('Interfaces', '网络接口'), table(['', T('Protocol', '协议'), T('Address', '地址'), T('Device', '设备'), T('Status', '状态')], interfaces.map((it) => [
				'<strong>' + esc(it.interface.toUpperCase()) + '</strong>', esc(it.proto), esc((it['ipv4-address'] || it['ipv6-address'] || []).map((a) => a.address + '/' + a.mask).join(', ') || '—'), esc(it.device), badge(it.up)
			]))) + section(T('Quick links', '快速访问'), '<div class="cbi-section-node demo-tools">' + link('admin/network/wireless', T('Configure Wi-Fi →', '配置无线网络 →')) + link('admin/network/dhcp', T('Connected devices →', '已连接设备 →')) + link('admin/network/diagnostics', T('Diagnostics →', '网络诊断 →')) + '</div>');
		}
		if (active === 'admin/network/wireless') {
			const s = P.settings;
			view.innerHTML = intro(T('Wireless', '无线网络'), T('Try editing the network name and channel. Changes only affect this demo tab.', '试着修改网络名称与信道，设置仅对当前演示标签页生效。')) + section(T('Wireless networks', '无线网络'), table([T('Network', '网络'), T('Band / Channel', '频段 / 信道'), T('Security', '加密方式'), T('Status', '状态')], [
				[esc(s.ssid), '2.4 GHz / ' + esc(s.channel), esc(s.encryption === 'psk2' ? 'WPA2-PSK' : 'WPA2/WPA3'), badge(s.enabled)],
				['Carbon-Home-5G', '5 GHz / 149', 'WPA2/WPA3', badge(true)], ['Carbon-Guest', '2.4 GHz / ' + esc(s.channel), 'WPA2-PSK', badge(s.guest)]
			])) + section(T('Interface configuration', '接口配置'), form('wireless-form',
				field(T('Enable 2.4 GHz', '启用 2.4 GHz'), 'enabled', check('enabled', s.enabled)) +
				field(T('Network name (SSID)', '网络名称 (SSID)'), 'ssid', input('ssid', s.ssid, 'required maxlength="32"')) +
				field(T('Demo password', '演示密码'), 'key', input('key', 'carbon-demo', 'type="password" required minlength="8" maxlength="63" autocomplete="off"'), T('8–63 characters. Use a sample password; it is not stored.', '8–63 位字符，请使用示例密码，演示不会保存密码。')) +
				field(T('Encryption', '加密方式'), 'encryption', select('encryption', [['psk2', 'WPA2-PSK'], ['sae-mixed', 'WPA2/WPA3']], s.encryption)) +
				field(T('Channel', '信道'), 'channel', select('channel', [['auto', T('Auto', '自动')], ['1', '1 (2412 MHz)'], ['6', '6 (2437 MHz)'], ['11', '11 (2462 MHz)']], s.channel)) +
				field(T('Guest network', '访客网络'), 'guest', check('guest', s.guest))
			));
			document.getElementById('wireless-form').onsubmit = (e) => {
				e.preventDefault(); const f = new FormData(e.target);
				const ssid = f.get('ssid').trim();
				if (!ssid || new TextEncoder().encode(ssid).length > 32) { toast(T('SSID must contain 1–32 UTF-8 bytes.', '网络名称需为 1–32 个 UTF-8 字节。')); return; }
				P.save({ ssid, channel: f.get('channel'), encryption: f.get('encryption'), enabled: f.has('enabled'), guest: f.has('guest') });
				render(); saved();
			};
		}
		if (active === 'admin/network/dhcp') {
			/* same id as LuCI's active-leases table, so Carbon adds brand avatars */
			const leaseTable = (headers, rows) => table(headers, rows).replace('<div class="table ', '<div id="lease_status_table" class="table ');
			const leases = (await P.provider.leases()).dhcp_leases;
			view.innerHTML = intro(T('Connected devices', '已连接设备'), T('16 sample clients on the home network.', '家庭网络中的 16 台模拟客户端。')) + '<div class="demo-tools"><label for="device-search">' + T('Search', '搜索') + '</label>' + input('device-search', '', 'type="search" placeholder="' + T('Name, IP or MAC', '名称、IP 或 MAC 地址') + '"') + '<span id="device-count" role="status"></span></div><div id="device-table"></div>';
			const filter = () => {
				const term = document.getElementById('device-search').value.toLowerCase();
				const rows = leases.filter((l) => [l.hostname, l.ipaddr, l.macaddr].join(' ').toLowerCase().includes(term));
				document.getElementById('device-count').textContent = rows.length + T(' devices', ' 台设备');
				document.getElementById('device-table').innerHTML = section(T('DHCP leases', 'DHCP 租约'), rows.length ? leaseTable([T('Hostname', '主机名'), 'IPv4', 'MAC', T('Lease', '租期')], rows.map((l) => [esc(l.hostname || T('Unknown device', '未知设备')), esc(l.ipaddr), '<span class="cb-mono">' + esc(l.macaddr) + '</span>', l.expires === false ? T('Static', '静态') : Math.round(l.expires / 3600) + T(' hours', ' 小时')])) : '<p class="cbi-section-node">' + T('No matching devices.', '没有匹配的设备。') + '</p>');
			};
			document.getElementById('device-search').oninput = filter; filter();
		}
		if (active === 'admin/system/system') {
			view.innerHTML = intro(T('System', '系统设置'), T('Preview the system configuration form.', '体验系统设置表单的样式与保存反馈。')) + section(T('General settings', '常规设置'), form('system-form',
			field(T('Hostname', '主机名'), 'hostname', input('hostname', P.settings.hostname, 'required maxlength="63" pattern="[A-Za-z0-9](?:[A-Za-z0-9\\-]{0,61}[A-Za-z0-9])?"')) +
				field(T('Model', '型号'), 'model', input('model', 'Xiaomi Redmi Router AX6000', 'readonly')) +
				field(T('Timezone', '时区'), 'timezone', input('timezone', 'Asia/Shanghai', 'readonly'))
			));
			document.getElementById('system-form').onsubmit = (e) => {
				e.preventDefault(); P.save({ hostname: new FormData(e.target).get('hostname') });
				document.querySelector('.cb-brand-text strong').textContent = P.settings.hostname; saved();
			};
		}
		if (active === 'admin/system/admin') {
			view.innerHTML = intro(T('Administration', '管理密码'), T('Try form validation using a sample password. Nothing is sent or stored.', '使用示例密码体验表单校验，内容不会发送或保存。')) + section(T('Router password', '路由器密码'), form('password-form',
				field(T('New demo password', '新演示密码'), 'password', input('password', '', 'type="password" required minlength="8" autocomplete="new-password"')) +
				field(T('Confirm password', '确认密码'), 'confirm-password', input('confirm-password', '', 'type="password" required minlength="8" autocomplete="new-password"'))
			));
			const f = document.getElementById('password-form'), confirm = document.getElementById('confirm-password');
			f.oninput = () => confirm.setCustomValidity(confirm.value === document.getElementById('password').value ? '' : T('Passwords do not match.', '两次输入的密码不一致。'));
			f.onreset = () => confirm.setCustomValidity('');
			f.onsubmit = (e) => { e.preventDefault(); f.reset(); toast(T('Validation passed. No password was changed.', '校验通过，演示未修改任何密码。')); };
		}
		if (active === 'admin/system/package-manager') {
			const packages = [ ['luci-theme-carbon', C.version, true], ['luci-base', '25.040.12345', true], ['dnsmasq', '2.90-r4', true], ['luci-app-ddns', '2.8.2-r1', false], ['luci-app-upnp', '1.0.0-r2', false] ];
			let installed = {};
			try { installed = JSON.parse(sessionStorage.getItem('carbon.demo.packages') || '{}'); } catch (e) { /* defaults */ }
			view.innerHTML = intro(T('Software', '软件包'), T('Browse a small sample catalogue and simulate package installation.', '浏览示例软件包列表，体验模拟安装。')) + '<div class="demo-tools"><label for="package-search">' + T('Filter', '筛选') + '</label>' + input('package-search', '', 'type="search" placeholder="luci"') + '</div><div id="package-table"></div>';
			const draw = () => {
				const rows = packages.filter((p) => p[0].includes(document.getElementById('package-search').value.toLowerCase()));
				document.getElementById('package-table').innerHTML = section(T('Packages', '软件包列表'), rows.length ? table([T('Name', '名称'), T('Version', '版本'), T('Status', '状态')], rows.map(([name, version, initial]) => [esc(name), esc(version), initial || installed[name] ? '<span class="label success">' + T('Installed', '已安装') + '</span>' : '<button type="button" class="btn cbi-button cbi-button-add" data-package="' + name + '">' + T('Install', '安装') + '</button>'])) : '<p>' + T('No matching packages.', '没有匹配的软件包。') + '</p>');
			};
			document.getElementById('package-search').oninput = draw;
			document.getElementById('package-table').onclick = (e) => {
				const btn = e.target.closest('[data-package]'); if (!btn) return;
				installed[btn.dataset.package] = true;
				try { sessionStorage.setItem('carbon.demo.packages', JSON.stringify(installed)); } catch (err) { /* memory only */ }
				draw(); toast(T('Simulated installation complete.', '模拟安装已完成。'));
			}; draw();
		}
		if (active === 'admin/system/flash') {
			view.innerHTML = intro(T('Backup & Upgrade', '备份与升级'), T('Explore the backup controls with a sample configuration file.', '体验备份操作，下载当前演示配置的示例文件。')) + section(T('Backup configuration', '备份配置'), '<div class="cbi-section-node"><p>' + T('The JSON download contains only demo settings. It is not an OpenWrt backup.', '下载的 JSON 仅包含演示设置，不是 OpenWrt 系统备份。') + '</p><div class="demo-tools">' + button(T('Download demo backup', '下载演示备份'), 'backup', 'apply') + button(T('Reset demo settings', '重置演示设置'), 'reset', 'reset') + '</div></div>') + section(T('Firmware', '固件升级'), '<div class="cbi-section-node"><p>OpenWrt 24.10.0 · ARMv8 · Xiaomi Redmi Router AX6000</p><p class="demo-muted">' + T('Firmware upload is unavailable in this static demo.', '静态演示不提供固件上传功能。') + '</p><a class="btn" href="https://github.com/mrjoechen/luci-theme-carbon/releases" target="_blank" rel="noopener noreferrer">' + T('Download Carbon releases ↗', '下载 Carbon 发布版本 ↗') + '</a></div>');
			view.querySelector('[data-action="backup"]').onclick = () => { download('carbon-demo-backup.json', JSON.stringify({ demo: true, settings: P.settings }, null, 2)); toast(T('Demo backup downloaded.', '演示备份已下载。')); };
			view.querySelector('[data-action="reset"]').onclick = () => confirmDemo(T('Reset demo settings?', '重置演示设置？'), T('Restore the sample configuration and package list for this tab.', '恢复当前标签页的示例配置和软件包列表。'), () => {
				try { sessionStorage.removeItem('carbon.demo.settings'); sessionStorage.removeItem('carbon.demo.packages'); } catch (e) { /* no persisted data */ }
				location.assign(P.url(overview));
			});
		}
		if (active === 'admin/system/reboot') {
			view.innerHTML = intro(T('Reboot', '重启'), T('Preview a confirmation dialog and the simulated reboot state.', '体验操作确认弹窗和模拟重启状态。')) + section(T('Restart device', '重启设备'), '<div class="cbi-section-node"><p>' + T('This action only runs a short demo animation.', '此操作仅演示短暂的重启等待效果。') + '</p>' + button(T('Simulate reboot', '模拟重启'), 'reboot', 'negative') + '<p id="reboot-status" role="status"></p></div>');
			const btn = view.querySelector('[data-action="reboot"]');
			btn.onclick = () => confirmDemo(T('Simulate a reboot?', '模拟重启？'), T('The demo will be ready again in two seconds.', '演示将在两秒后恢复就绪。'), () => {
				btn.disabled = true;
				document.getElementById('reboot-status').textContent = T('Restarting the demo…', '正在模拟重启…');
				setTimeout(() => { btn.disabled = false; document.getElementById('reboot-status').textContent = T('Demo ready. All services are online.', '演示已就绪，所有模拟服务均在线。'); }, 2000);
			});
		}
		if (active === 'admin/status/syslog') {
			view.innerHTML = intro(T('System Log', '系统日志'), T('A sample of typical network and system events.', '预览网络与系统事件的示例日志。')) + section(T('Recent events', '最近事件'), '<div class="cbi-section-node"><pre class="demo-output">' + esc([
				'09:41:00 daemon.notice netifd: Interface \'wan\' is now up',
				'09:41:01 daemon.info dnsmasq[1]: using nameserver 1.1.1.1#53',
				'09:41:02 daemon.notice hostapd: phy1-ap0: AP-ENABLED',
				'09:42:16 daemon.info dnsmasq-dhcp[1]: DHCPACK(br-lan) 192.168.1.23 iPhone-15-Pro',
				'09:43:08 daemon.info dnsmasq-dhcp[1]: DHCPACK(br-lan) 192.168.1.31 MacBook-Air',
				'09:44:00 user.info carbon: Demo data loaded; no router connected'
			].join('\n')) + '</pre></div>');
		}
		if (active === 'admin/network/diagnostics') {
			view.innerHTML = intro(T('Diagnostics', '网络诊断'), T('Run a simulated ping. No network request is made.', '运行模拟 Ping，不发送实际网络请求。')) + section('Ping', '<form id="ping-form" class="cbi-section-node"><div class="demo-tools"><label for="ping-host">' + T('Host', '目标主机') + '</label>' + input('ping-host', 'openwrt.org', 'required maxlength="253" pattern="[A-Za-z0-9.:\\-]+"') + '<button class="btn cbi-button cbi-button-apply" type="submit">' + T('Run ping', '执行 Ping') + '</button></div><pre id="ping-output" class="demo-output" role="status">' + T('Ready.', '就绪。') + '</pre></form>');
			document.getElementById('ping-form').onsubmit = (e) => {
				e.preventDefault(); const btn = e.target.querySelector('button'), out = document.getElementById('ping-output');
				const host = document.getElementById('ping-host').value; btn.disabled = true; out.textContent = T('Simulating ping…', '正在模拟 Ping…');
				setTimeout(() => { btn.disabled = false; out.textContent = 'PING ' + host + ' (192.0.2.1) — DEMO\n64 bytes: seq=0 ttl=56 time=12.4 ms\n64 bytes: seq=1 ttl=56 time=11.8 ms\n64 bytes: seq=2 ttl=56 time=12.1 ms\n\n3 packets transmitted, 3 received, 0% packet loss'; }, 900);
			};
		}
	}
	render().catch((error) => { view.textContent = T('Unable to load the demo. Please reload.', '演示加载失败，请刷新页面。'); console.error(error); }).finally(() => view.setAttribute('aria-busy', 'false'));
})();
