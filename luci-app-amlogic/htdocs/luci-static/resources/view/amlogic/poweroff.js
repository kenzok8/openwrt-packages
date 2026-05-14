// SPDX-License-Identifier: GPL-2.0
// Safe Power Off page
//
// Purpose: call the backend poweroff RPC then run a 5-second on-page countdown;
// switch status to "Powered off" and show a power-off icon when done.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (poweroff).

'use strict';
'require view';
'require rpc';
'require ui';
'require view.amlogic.shared as amlogicShared';

// Trigger the backend poweroff RPC.
const callPoweroff = rpc.declare({ object: 'luci.amlogic', method: 'poweroff' });

// This page uses its own PowerOff button and does not need the default Save/Apply/Reset buttons,
// so we disable them by setting the handlers to null.
return view.extend({
    handleSave:      null,
    handleSaveApply: null,
    handleReset:     null,

	render: function () {
		amlogicShared.ensureCss();
		// Status text; amlogic-status-err color adapts to dark mode automatically.
		const status = E('span', { class: 'amlogic-status-err', style: 'margin-left:1em' });
		// Power-off icon, hidden by default; shown only after the countdown ends.
		const icon = E('img', {
			src: L.resource('amlogic/poweroff.png'),
			width: '32', height: '32',
			style: 'width:32px; height:32px; max-width:32px; display:none; margin-left:1em; vertical-align:middle'
		});

		// PowerOff button click handler: confirm twice, then call RPC and start countdown on success.
        const btn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-remove',
			value: _('Perform PowerOff'),
			click: ui.createHandlerFn(this, function (ev) {
				// Confirm twice to avoid accidental clicks.
				if (!confirm(_('Are you sure you want to power off the device?')))
					return;
				ev.currentTarget.disabled = true;
				return callPoweroff().then(function () {
					// Show a 5-second countdown; replace with "Powered off" and icon when done.
					status.textContent = _('Powering off, please wait...');
					let n = 5;
					const t = setInterval(function () {
						if (--n <= 0) {
							clearInterval(t);
							status.textContent = _('Powered off.');
							icon.style.display = 'inline-block';
						} else {
							status.textContent = _('Powering off, please wait...') + ' ' + n;
						}
					}, 1000);
				});
			})
		});

		return E('div', {}, [
			E('h2', _('Power Off')),
			E('p', _('Click the button below to safely power off the device.')),
			E('div', { class: 'cbi-section' }, [btn, status, icon])
		]);
	}
});
