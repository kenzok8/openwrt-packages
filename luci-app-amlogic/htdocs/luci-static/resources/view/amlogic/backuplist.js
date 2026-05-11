// SPDX-License-Identifier: GPL-2.0
// Backup file list editor
//
// Edits /etc/amlogic_backup_list.conf, which controls which files / directories
// the openwrt-backup script archives. On load, if the file does not exist or
// is empty, the backend prime_backup_list extracts the default BACKUP_LIST
// from /usr/sbin/openwrt-backup as a starting template.

'use strict';
'require view';
'require rpc';
'require ui';
'require fs';

// Persist the user-edited content back to /etc/amlogic_backup_list.conf.
const callSave = rpc.declare({ object: 'luci.amlogic', method: 'save_backup_list',
                               params: ['content'] });
// Pre-fill: if the list file is missing or empty, seed it from the defaults
// embedded in the openwrt-backup script (idempotent: existing content stays).
const callPrime = rpc.declare({ object: 'luci.amlogic', method: 'prime_backup_list' });

return view.extend({
	// This page uses its own Save button; hide LuCI's default Save/Apply/Reset.
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	load: function () {
		// Run prime first (idempotent), then read the file content.
		return callPrime().then(function () {
			return fs.read('/etc/amlogic_backup_list.conf').catch(function () { return ''; });
		});
	},

	render: function (text) {
		// Full-width multi-line editor pre-filled with the existing list.
		const ta = E('textarea', {
			rows: '30',
			style: 'width:100%; font-family:monospace'
		}, text || '');

		// Status hint area (saved successfully / failed).
		const status = E('span', { style: 'margin-left:1em' });
		const saveBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Save'),
			click: ui.createHandlerFn(this, function (ev) {
				const btn = ev.currentTarget;
				btn.disabled = true;
				return callSave(ta.value).then(function (r) {
					if (r && (r.ok || r.code == 0)) {
						status.textContent = _('Successfully saved.');
						// Wait 0.7s before navigating back so the success text is visible.
						setTimeout(function () {
							location.href = L.url('admin/system/amlogic/backup');
						}, 700);
					} else {
						status.textContent = _('Save Failed');
					}
				}).catch(function (e) {
					status.textContent = _('Save Failed') + ': ' + (e && e.message ? e.message : String(e));
				}).finally(function () { btn.disabled = false; });
			})
		});
		// Return to the Backup main page (without saving).
		const backBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reset',
			value: _('Back'),
			click: function () { location.href = L.url('admin/system/amlogic/backup'); }
		});

		return E('div', {}, [
			E('h2', _('Edit list of backup files')),
			E('p', _('In this list, you can manually add the file or directory list of files that need to be backed up. Please confirm that the format and content of the file are correct.')),
			E('div', { class: 'cbi-section' }, [ta]),
			E('div', { class: 'cbi-page-actions' }, [saveBtn, ' ', backBtn, status])
		]);
	}
});
