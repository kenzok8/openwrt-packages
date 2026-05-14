// SPDX-License-Identifier: GPL-2.0
// Online Download Update + Rescue Kernel
//
// Purpose: check / download / install plugin, kernel, and firmware updates online.
// Log tail is polled at 1 Hz; the last log line drives a state machine
// (idle → checking → button → installing → done). Terminal log lines contain
// raw HTML <input> button strings which are parsed and rendered as DOM buttons.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (state, check_*, start_*, read_log_tail).

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require poll';
'require view.amlogic.shared as amlogicShared';

// ── RPCs ─────────────────────────────────────────────────────────────────────
// Query system state (firmware / plugin / kernel versions).
const callState         = rpc.declare({ object: 'luci.amlogic', method: 'state' });
// Run plugin / kernel / firmware version check and write progress to the log.
const callCheckPlugin   = rpc.declare({ object: 'luci.amlogic', method: 'check_plugin',   params: ['options'] });
const callCheckKernel   = rpc.declare({ object: 'luci.amlogic', method: 'check_kernel',   params: ['options'] });
const callCheckFirmware = rpc.declare({ object: 'luci.amlogic', method: 'check_firmware', params: ['options'] });
const callStartPlugin   = rpc.declare({ object: 'luci.amlogic', method: 'start_plugin' });
const callStartKernel   = rpc.declare({ object: 'luci.amlogic', method: 'start_kernel' });
const callStartUpdate   = rpc.declare({ object: 'luci.amlogic', method: 'start_update',   params: ['amlogic_update_sel'] });
const callStartRescue   = rpc.declare({ object: 'luci.amlogic', method: 'start_rescue' });
// Read the last line (up to 4096 bytes) of the named log file.
const callLogTail       = rpc.declare({ object: 'luci.amlogic', method: 'read_log_tail',  params: ['name'], expect: { line: '' } });

// ── Log-line HTML button parser ──────────────────────────────────────────────
// Parse an <input> button string from the log; return null for plain-text lines.
// Returned object: { type, param, label } where type identifies the action.
function parseButtonLine(line) {
	if (!line || line.indexOf('<input') === -1) return null;

	// Extract value="..."
	var valueMatch  = line.match(/value="([^"]*)"/);
	var onclickMatch = line.match(/onclick="([^"]*)"/);
	if (!valueMatch || !onclickMatch) return null;

	var value   = valueMatch[1];
	var onclick = onclickMatch[1];

	// Text after the self-closing tag
	var labelMatch = line.match(/\/>(.*)$/);
	var label = labelMatch ? labelMatch[1].trim() : '';

	// Plugin download: b_check_plugin(this, 'download_VERSION')
	if (value === 'Download' && onclick.indexOf('b_check_plugin') !== -1) {
		var m = onclick.match(/b_check_plugin\s*\(\s*this\s*,\s*'([^']*)'\s*\)/);
		return { type: 'plugin-download', param: m ? m[1] : null, label: label };
	}

	// Firmware download: b_check_firmware(this, 'PARAM')
	if (value === 'Download' && onclick.indexOf('b_check_firmware') !== -1) {
		var m = onclick.match(/b_check_firmware\s*\(\s*this\s*,\s*'([^']*)'\s*\)/);
		return { type: 'firmware-download', param: m ? m[1] : null, label: label };
	}

	// Kernel download: b_check_kernel(this, 'PARAM')
	if (value === 'Download' && onclick.indexOf('b_check_kernel') !== -1) {
		var m = onclick.match(/b_check_kernel\s*\(\s*this\s*,\s*'([^']*)'\s*\)/);
		return { type: 'kernel-download', param: m ? m[1] : null, label: label };
	}

	// Firmware install: amlogic_update(this, 'PARAM')
	if (value === 'Update' && onclick.indexOf('amlogic_update') !== -1) {
		var m = onclick.match(/amlogic_update\s*\(\s*this\s*,\s*'([^']*)'\s*\)/);
		return { type: 'firmware-update', param: m ? m[1] : null, label: label };
	}

	// Kernel install: amlogic_kernel(this)
	if (value === 'Update' && onclick.indexOf('amlogic_kernel') !== -1) {
		return { type: 'kernel-update', param: null, label: label };
	}

	// Plugin install: amlogic_plugin(this)
	if (value === 'Update' && onclick.indexOf('amlogic_plugin') !== -1) {
		return { type: 'plugin-update', param: null, label: label };
	}

	return null;
}

// ── Per-action state machine ──────────────────────────────────────────────────
// States: 'idle' | 'checking' | 'button' | 'installing' | 'done'

// Action object factory: { name, statusEl, state, subBtn }
function makeAction(name, statusEl) {
	return { name: name, statusEl: statusEl, state: 'idle', subBtn: null };
}

// Update the status span with a text string (blue info style).
function showInfo(el, text) {
	dom.content(el, E('span', { class: 'amlogic-status-info' }, text));
}

// Update the status span with a success string (green).
function showOk(el, text) {
	dom.content(el, E('span', { class: 'amlogic-status-ok' }, text));
}

// Update the status span with an error string (red).
function showErr(el, text) {
	dom.content(el, E('span', { class: 'amlogic-status-err' }, text));
}

// Replace statusEl contents with a real DOM button + optional label text.
// onClick is called when the user presses it.
function showSubButton(el, btnLabel, labelText, onClick) {
	var btn = E('input', {
		type: 'button',
		class: 'cbi-button cbi-button-reload',
		value: btnLabel,
		click: onClick
	});
	var nodes = [btn];
	if (labelText) nodes.push(E('span', { class: 'amlogic-status-info' }, '  ' + labelText));
	dom.content(el, nodes);
	return btn;
}

// ── Poll handler (called at 1 Hz) ────────────────────────────────────────────
// Inspect the last non-empty log line and advance the action state machine.
function handlePoll(action) {
	if (action.state === 'done') return;

	return callLogTail(action.name).then(function (raw) {
		// Only inspect the last non-empty line to avoid false-positive
		// 'Failed'/'error' matches from intermediate opkg/apk output.
		var lines = (raw || '').split('\n');
		var line = '';
		for (var i = lines.length - 1; i >= 0; i--) {
			var l = lines[i].trim();
			if (l) { line = l; break; }
		}

		if (action.state === 'idle') {
			return;
		}

		if (action.state === 'button') {
			// Waiting for user to click sub-button; don't re-render on every poll.
			return;
		}

		if (action.state === 'installing') {
			// Show progress lines; detect terminal keywords.
			if (!line) return;
			// Skip if line is the same HTML button (stale log from check phase).
			if (line.indexOf('<input') !== -1) return;
			if (line.indexOf('Successfully updated') !== -1 ||
			    line.indexOf('Successful Update') !== -1 ||
			    line.indexOf('Successful') !== -1) {
				showOk(action.statusEl, line);
				action.state = 'done';
			} else if (line.indexOf('Failed') !== -1 || line.indexOf('failed') !== -1 ||
			           line.indexOf('Error') !== -1 || line.indexOf('error') !== -1) {
				showErr(action.statusEl, line);
				action.state = 'done';
			} else {
				// Show current progress line (may change rapidly).
				showInfo(action.statusEl, line);
			}
			return;
		}

		// state === 'checking': look for HTML button line or plain progress text.
		var parsed = parseButtonLine(line);
		if (parsed) {
			action.state = 'button';
			action._parsed = parsed;
			renderParsedButton(action);
		} else if (line) {
			showInfo(action.statusEl, line);
		}
	});
}

// Render the sub-button parsed from the log line and wire up the second-phase RPC.
function renderParsedButton(action) {
	var parsed = action._parsed;
	var el     = action.statusEl;

	switch (parsed.type) {

	case 'plugin-download':
		showSubButton(el, _('Download'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Downloading...');
			action.state = 'checking';
			callCheckPlugin(parsed.param).then(function () {});
		});
		break;

	case 'firmware-download':
		showSubButton(el, _('Download'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Downloading...');
			action.state = 'checking';
			callCheckFirmware(parsed.param).then(function () {});
		});
		break;

	case 'kernel-download':
		showSubButton(el, _('Download'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Downloading...');
			action.state = 'checking';
			callCheckKernel(parsed.param).then(function () {});
		});
		break;

	case 'firmware-update':
		showSubButton(el, _('Update'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Updating...');
			// Transition to 'installing'; terminal result comes via log polling.
			action.state = 'installing';
			dom.content(el, E('span', { class: 'amlogic-status-info' }, _('Starting update...')));
			callStartUpdate(parsed.param).catch(function () {
				// Only show error if the trigger call itself fails (rare).
				showErr(el, _('Failed to start update'));
				action.state = 'done';
			});
		});
		break;

	case 'kernel-update':
		showSubButton(el, _('Update'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Updating...');
			action.state = 'installing';
			dom.content(el, E('span', { class: 'amlogic-status-info' }, _('Starting kernel update...')));
			callStartKernel().catch(function () {
				showErr(el, _('Failed to start kernel update'));
				action.state = 'done';
			});
		});
		break;

	case 'plugin-update':
		showSubButton(el, _('Update'), parsed.label, function (ev) {
			ev.currentTarget.disabled = true;
			ev.currentTarget.value = _('Updating...');
			action.state = 'installing';
			dom.content(el, E('span', { class: 'amlogic-status-info' }, _('Starting plugin update...')));
			callStartPlugin().catch(function () {
				showErr(el, _('Failed to start plugin update'));
				action.state = 'done';
			});
		});
		break;

	default:
		showInfo(el, parsed.label || '');
	}
}

// ── Main view ────────────────────────────────────────────────────────────────
return view.extend({
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	render: function () {
		amlogicShared.ensureCss();

		// Version display spans (left persistent, filled by state RPC)
		var verFirmware = E('span', _('Collecting data...'));
		var verPlugin   = E('span', _('Collecting data...'));
		var verKernel   = E('span', _('Collecting data...'));
		var verRescue   = E('span', _('Collecting data...'));

		// Per-action status spans (right side, updated by poll)
		var statusFw = E('span');
		var statusPl = E('span');
		var statusKn = E('span');
		var statusRs = E('span');

		// State machines
		var actPlugin   = makeAction('plugin',   statusPl);
		var actKernel   = makeAction('kernel',   statusKn);
		var actFirmware = makeAction('firmware', statusFw);
		var actRescue   = makeAction('rescue',   statusRs);

		// ── Action buttons (left column) ──────────────────────────────────

		// Helper: reset an action back to idle so it can be re-run after 'done'.
		function resetAction(action, btn, idleLabel) {
			action.state = 'idle';
			action.subBtn = null;
			dom.content(action.statusEl, '');
			btn.disabled = false;
			btn.value = idleLabel;
		}

		// Each button triggers the first-phase RPC to start the check/download/install process,
        // then the poll handler picks up log lines to advance the state machine and render sub-buttons as needed.
        var btnPlugin = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Only update Amlogic Service'),
			click: ui.createHandlerFn(this, function (ev) {
				var btn = ev.currentTarget;
				// Allow re-run after completion by resetting 'done' → 'idle'
				if (actPlugin.state === 'done')
					resetAction(actPlugin, btn, _('Only update Amlogic Service'));
				if (actPlugin.state !== 'idle') return;
				btn.disabled = true;
				btn.value = _('Checking...');
				actPlugin.state = 'checking';
				dom.content(actPlugin.statusEl, '');
				return callCheckPlugin('check').then(function () {
					btn.disabled = false;
					btn.value = _('Only update Amlogic Service');
				}).catch(function () {
					btn.disabled = false;
					btn.value = _('Only update Amlogic Service');
					showErr(actPlugin.statusEl, _('Check Failed'));
					actPlugin.state = 'idle';
				});
			})
		});

		// The kernel and firmware buttons have similar logic, just different RPCs and labels.
        var btnKernel = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Update system kernel only'),
			click: ui.createHandlerFn(this, function (ev) {
				var btn = ev.currentTarget;
				if (actKernel.state === 'done')
					resetAction(actKernel, btn, _('Update system kernel only'));
				if (actKernel.state !== 'idle') return;
				btn.disabled = true;
				btn.value = _('Checking...');
				actKernel.state = 'checking';
				dom.content(actKernel.statusEl, '');
				return callCheckKernel('check').then(function () {
					btn.disabled = false;
					btn.value = _('Update system kernel only');
				}).catch(function () {
					btn.disabled = false;
					btn.value = _('Update system kernel only');
					showErr(actKernel.statusEl, _('Check Failed'));
					actKernel.state = 'idle';
				});
			})
		});

		// Firmware update may include both kernel and plugin updates, so it has a more generic label.
        var btnFirmware = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Complete system update'),
			click: ui.createHandlerFn(this, function (ev) {
				var btn = ev.currentTarget;
				if (actFirmware.state === 'done')
					resetAction(actFirmware, btn, _('Complete system update'));
				if (actFirmware.state !== 'idle') return;
				btn.disabled = true;
				btn.value = _('Checking...');
				actFirmware.state = 'checking';
				dom.content(actFirmware.statusEl, '');
				return callCheckFirmware('check').then(function () {
					btn.disabled = false;
					btn.value = _('Complete system update');
				}).catch(function () {
					btn.disabled = false;
					btn.value = _('Complete system update');
					showErr(actFirmware.statusEl, _('Check Failed'));
					actFirmware.state = 'idle';
				});
			})
		});

		// Rescue button: triggers the rescue RPC which starts mutual recovery; the log will show progress and terminal status.
        var btnRescue = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Rescue the original system kernel'),
			click: ui.createHandlerFn(this, function (ev) {
				var btn = ev.currentTarget;
				if (actRescue.state === 'done')
					resetAction(actRescue, btn, _('Rescue the original system kernel'));
				if (actRescue.state !== 'idle') return;
				btn.disabled = true;
				btn.value = _('Rescuing...');
				// Set installing state before the call so the poller picks up log lines.
				actRescue.state = 'installing';
				showInfo(actRescue.statusEl, _('Starting rescue...'));
				return callStartRescue().then(function () {
					btn.disabled = false;
					btn.value = _('Rescue the original system kernel');
				}).catch(function () {
					btn.disabled = false;
					btn.value = _('Rescue the original system kernel');
					showErr(actRescue.statusEl, _('Failed to start rescue'));
					actRescue.state = 'idle';
				});
			})
		});

		// ── Layout ────────────────────────────────────────────────────────

		var body = E('div', {}, [
			E('h2', _('Check Update')),
			E('p', _('Provide OpenWrt Firmware, Kernel and Plugin online check, download and update service.')),
			E('div', { class: 'cbi-section' }, [
				E('p', { style: 'text-align:center' }, [
					_('Update plugins first, then update the kernel or firmware. More options can be configured in [Plugin Settings].')
				]),
				E('table', { class: 'amlogic-row-table' }, [
					E('tr', [
						E('td', { width: '35%', align: 'right' }, btnPlugin),
						E('td', { width: '65%', align: 'left'  }, [verPlugin,   '　', statusPl])
					]),
					E('tr', [
						E('td', { width: '35%', align: 'right' }, btnKernel),
						E('td', { width: '65%', align: 'left'  }, [verKernel,   '　', statusKn])
					]),
					E('tr', [
						E('td', { width: '35%', align: 'right' }, btnFirmware),
						E('td', { width: '65%', align: 'left'  }, [verFirmware, '　', statusFw])
					])
				])
			]),
			E('h2', _('Rescue Kernel')),
			E('p', _('When a kernel update fails and causes the OpenWrt system to be unbootable, the kernel can be restored by mutual recovery from eMMC/NVMe/sdX.')),
			E('div', { class: 'cbi-section' }, [
				E('table', { class: 'amlogic-row-table' }, [
					E('tr', [
						E('td', { width: '35%', align: 'right' }, btnRescue),
						E('td', { width: '65%', align: 'left'  }, [verRescue, '　', statusRs])
					])
				])
			])
		]);

		// ── Populate version spans ────────────────────────────────────────

		callState().then(function (s) {
			dom.content(verFirmware, s && s.current_firmware_version
				? E('span', { class: 'amlogic-status-ok' }, _('Current Version') + ' [ ' + s.current_firmware_version + ' ] ')
				: E('span', { class: 'amlogic-status-err' }, _('Invalid value.')));
			dom.content(verPlugin, s && s.current_plugin_version
				? E('span', { class: 'amlogic-status-ok' }, _('Current Version') + ' [ ' + s.current_plugin_version + ' ] ')
				: E('span', { class: 'amlogic-status-err' }, _('Invalid value.')));
			dom.content(verKernel, s && s.current_kernel_version
				? E('span', { class: 'amlogic-status-ok' }, _('Current Version') + ' [ ' + s.current_kernel_version + ' ] ')
				: E('span', { class: 'amlogic-status-err' }, _('Invalid value.')));

			// Rescue row: show same kernel version directly via the verRescue span
			dom.content(verRescue, s && s.current_kernel_version
				? E('span', { class: 'amlogic-status-ok' }, _('Current Version') + ' [ ' + s.current_kernel_version + ' ] ')
				: E('span', { class: 'amlogic-status-err' }, _('Invalid value.')));
		});

		// ── 1 Hz poll ─────────────────────────────────────────────────────

		poll.add(function () {
			return Promise.all([
				handlePoll(actPlugin),
				handlePoll(actKernel),
				handlePoll(actFirmware),
				handlePoll(actRescue)
			]);
		}, 1);

		return body;
	}
});
