// SPDX-License-Identifier: GPL-2.0
// Backup file list editor
//
// Purpose: edit /etc/amlogic_backup_list.conf which controls which files/dirs
// the openwrt-backup script archives. If the file is missing or empty, the
// backend seeds it from the default BACKUP_LIST in /usr/sbin/openwrt-backup.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (save_backup_list, prime_backup_list).

'use strict';
'require view';
'require rpc';
'require ui';
'require fs';

// Persist the user-edited content back to /etc/amlogic_backup_list.conf.
const callSave = rpc.declare({ object: 'luci.amlogic', method: 'save_backup_list',
                               params: ['content'] });
// Seed the list file from defaults embedded in openwrt-backup if missing or empty.
const callPrime = rpc.declare({ object: 'luci.amlogic', method: 'prime_backup_list' });

// This page uses its own Save button; hide LuCI's default Save/Apply/Reset.
return view.extend({
	// This page uses its own Save button; hide LuCI's default Save/Apply/Reset.
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	// Load the existing backup list content to pre-fill the editor. If the file is
    load: function () {
		// Run prime first (idempotent), then read the file content.
		return callPrime().then(function () {
			return fs.read('/etc/amlogic_backup_list.conf').catch(function () { return ''; });
		});
	},

	// Render a full-width textarea pre-filled with the existing content, and a Save button
    // that persists the changes via RPC. Also include a Back button to return to the main Backup page.
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
						// Navigate back after a short delay so the success message is visible.
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
