// SPDX-License-Identifier: GPL-2.0
// Service log viewer
//
// Purpose: read the full amlogic service log into a read-only textarea and
// refresh it every 2 seconds; provide controls to pause/resume polling, clear
// the log, and download the current contents as a plain-text file.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (read_log_full, del_log).

'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require view.amlogic.shared as amlogicShared';

// Read the full log content (entire text).
const callLogFull = rpc.declare({ object: 'luci.amlogic', method: 'read_log_full',
                                  params: ['name'], expect: { content: '' } });
// Clear the service main log.
const callDelLog  = rpc.declare({ object: 'luci.amlogic', method: 'del_log' });

// This page uses its own Start/Stop Refresh buttons and does not need the default Save/Apply/Reset buttons,
// so we disable them by setting the handlers to null.
return view.extend({
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	render: function () {
		amlogicShared.ensureCss();
		// Read-only, no-wrap, monospace log display area.
		const ta = E('textarea', {
			rows: '20', readonly: 'readonly', wrap: 'off',
			style: 'width:100%; font-family:monospace; white-space:pre'
		});
		// Status hint: Running / Stopped.
		const status = E('span', { class: 'amlogic-status-ok', style: 'margin-left:1em' });
		// Polling is enabled by default when the page opens.
		let polling = true;

		// Refresh the full log and scroll to the bottom.
		function refresh() {
			return callLogFull('main').then(function (txt) {
				ta.value = txt || '';
				ta.scrollTop = ta.scrollHeight;
			});
		}
		const view = this;

		const stopBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reset',
			value: _('Stop Refresh'),
			click: function () { polling = false; status.textContent = _('Stopped'); }
		});
		const startBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-apply',
			value: _('Start Refresh'),
			click: function () { polling = true; status.textContent = _('Running'); refresh(); }
		});
		const cleanBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-remove',
			value: _('Clean Log'),
			click: ui.createHandlerFn(view, function () {
				return callDelLog().then(refresh);
			})
		});
		const dlBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Download Log'),
			click: function () {
				// Wrap textarea content in a Blob and trigger a browser download via a temporary <a>.
				const blob = new Blob([ta.value || ''], { type: 'text/plain' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = 'amlogic_service.log';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		});

		// Polling: only refresh while polling is true; runs once every 2s.
		poll.add(function () { if (polling) return refresh(); }, 2);
		refresh();
		status.textContent = _('Running');

		return E('div', {}, [
			E('h2', _('Service Log')),
			E('p', _('Display the log of plug-in service operation.')),
			E('div', { class: 'cbi-section' }, [ta]),
			E('div', { class: 'cbi-page-actions' },
			  [stopBtn, ' ', startBtn, ' ', cleanBtn, ' ', dlBtn, status])
		]);
	}
});
