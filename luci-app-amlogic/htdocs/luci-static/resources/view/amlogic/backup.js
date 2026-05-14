// SPDX-License-Identifier: GPL-2.0
// Backup Firmware Config + Snapshot management + (optional) KVM switch
//
// Purpose: pack current /etc config into openwrt_config.tar.gz and download it;
// manage system snapshots (list / create / restore / delete); optionally show
// KVM dual-partition switch when the platform reports has_kvm.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (backup_create, snapshot_*, platform_info, kvm_switch).

'use strict';
'require view';
'require rpc';
'require ui';
'require fs';
'require view.amlogic.shared as amlogicShared';

// Generate one openwrt_config.tar.gz on the server and return its path so the
// frontend can stream it back via fs.read_direct.
const callBackup     = rpc.declare({ object: 'luci.amlogic', method: 'backup_create' });
// List existing snapshot names (e.g. etc-000 / etc-001 / etc-202401...).
const callSnapList   = rpc.declare({ object: 'luci.amlogic', method: 'snapshot_list',
                                     expect: { names: [] } });
// Create a new snapshot (the backend chooses its name).
const callSnapCreate = rpc.declare({ object: 'luci.amlogic', method: 'snapshot_create' });
// Delete a snapshot by short name (without the etc- prefix).
const callSnapDel    = rpc.declare({ object: 'luci.amlogic', method: 'snapshot_delete',
                                     params: ['name'] });
// Restore the given snapshot and reboot.
const callSnapRest   = rpc.declare({ object: 'luci.amlogic', method: 'snapshot_restore',
                                     params: ['name'] });
// Read platform info (this page only consumes has_kvm to decide whether to
// show the KVM switch row).
const callPlatform   = rpc.declare({ object: 'luci.amlogic', method: 'platform_info' });
// Switch active KVM partition.
const callKvmSwitch  = rpc.declare({ object: 'luci.amlogic', method: 'kvm_switch' });

// The view object for the Backup & Snapshot page.
return view.extend({
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	// Load in parallel: platform info + current snapshot list.
	load: function () {
		amlogicShared.ensureCss();
		return Promise.all([callPlatform(), callSnapList()]);
	},

	// Render the page: backup config section + snapshot management section + (optional) KVM switch section.
	render: function (data) {
		const platform = data[0] || {};
		const snapNames = data[1] || [];
		const view = this;

		const editListBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Open List'),
			// Navigate to the backuplist page to edit the backup file list.
			click: function () {
				location.href = L.url('admin/system/amlogic/backuplist');
			}
		});

		// Download status hint; updated to success color after generation completes.
		const downloadStatus = E('span', { class: 'amlogic-status-err' });
		const downloadBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Download Backup'),
			click: ui.createHandlerFn(view, function (ev) {
				const btn = ev.currentTarget;
				btn.disabled = true;
				btn.value = _('Generating...');
				// Step 1: ask the server to pack /etc into openwrt_config.tar.gz.
				return callBackup().then(function (r) {
					if (!r || !r.ok) {
						downloadStatus.textContent = _("Couldn't open file:") + ' ' + (r ? r.path : '');
						return;
					}
					// Switch to success color before streaming the blob
					downloadStatus.className = 'amlogic-status-ok';
					downloadStatus.textContent = _('The file Will download automatically.') + ' ' + r.path;
					// Fetch the file blob via fs.read_direct and trigger browser download.
					return fs.read_direct(r.path, 'blob').then(function (blob) {
						const url = URL.createObjectURL(blob);
						const a = document.createElement('a');
						a.href = url;
						a.download = 'openwrt_config.tar.gz';
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
					});
				}).catch(function (e) {
					downloadStatus.textContent = _('Create upload file error.') +
						' ' + (e && e.message ? e.message : '');
				}).finally(function () {
					btn.disabled = false;
					btn.value = _('Download Backup');
				});
			})
		});

		// Navigate to the upload page where the user can upload a backup file to restore.
        const restoreBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Upload Backup'),
			click: function () {
				location.href = L.url('admin/system/amlogic/upload');
			}
		});

		// Snapshot grid; styles adapt to the current theme via amlogic-snap-* classes.
		const snapDiv = E('div', { class: 'amlogic-snap-list' });

		// Render snapshot cards; etc-000/001 are read-only (no Delete button).
		// Backend expects the short name without the "etc-" prefix.
		function renderSnapshots(names) {
			snapDiv.innerHTML = '';
			if (!names || !names.length) {
				snapDiv.appendChild(E('span', { class: 'amlogic-status-err' },
					_('Currently OpenWrt does not support the snapshot function.') +
					_('Please use this plugin to reinstall or upgrade OpenWrt to enable the snapshot function.')));
				return;
			}
			names.forEach(function (n) {
				let title;
				if (n === 'etc-000') title = _('Initialize Snapshot');
				else if (n === 'etc-001') title = _('Update Snapshot');
				else title = n;
				const restoreSnapBtn = E('input', {
					type: 'button', class: 'cbi-button cbi-button-apply',
					value: _('Restore Snap'),
					click: ui.createHandlerFn(view, function (ev) {
						const short = n.replace(/^etc-/, '');
						if (!confirm(_('You selected a snapshot:') + ' [ ' + n + ' ] , ' +
						             _('Confirm recovery and restart OpenWrt?')))
							return;
						// Capture btn before entering async chain; ev.currentTarget becomes null after await.
						const btn = ev.currentTarget;
						btn.disabled = true;
						btn.value = _('Restoring...');
						return callSnapRest(short).then(function (r) {
							if (r && r.code == 0) {
								btn.value = _('Successfully Restored');
								ui.addNotification(null,
									E('p', { class: 'amlogic-status-err' },
									  _('Snapshot restored. The system will reboot now.')));
							} else {
								btn.value = _('Restore Failed');
							}
						}).catch(function () { btn.value = _('Restore Failed'); });
					})
				});
				const item = E('div', {
					class: 'amlogic-snap-item',
					id: 'snapshots_div_' + n
				}, [
					E('div', { class: 'amlogic-snap-line' }, title),
					E('div', { class: 'amlogic-snap-line' }, restoreSnapBtn)
				]);
				if (n !== 'etc-000' && n !== 'etc-001') {
					const delBtn = E('input', {
						type: 'button', class: 'cbi-button cbi-button-remove',
						value: _('Delete Snap'),
						click: ui.createHandlerFn(view, function (ev) {
							const short = n.replace(/^etc-/, '');
							if (!confirm(_('You selected a snapshot:') + ' [ ' + n + ' ] , ' +
							             _('Confirm delete?')))
								return;
							// Capture btn before entering async chain; ev.currentTarget becomes null after await.
							const btn = ev.currentTarget;
							btn.disabled = true;
							btn.value = _('Deleting...');
							return callSnapDel(short).then(function (r) {
								if (r && r.code == 0) {
									btn.value = _('Successfully Deleted');
									item.style.display = 'none';
								} else {
									btn.value = _('Delete Failed');
								}
							}).catch(function () { btn.value = _('Delete Failed'); });
						})
					});
					item.appendChild(E('div', { class: 'amlogic-snap-line' }, delBtn));
				}
				snapDiv.appendChild(item);
			});
		}
		renderSnapshots(snapNames);

		// Create snapshot button above the grid.
        const createSnapBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-save',
			value: _('Create Snapshot'),
			click: ui.createHandlerFn(view, function (ev) {
				const btn = ev.currentTarget;
				btn.disabled = true;
				return callSnapCreate().then(function () {
					return callSnapList();
				}).then(function (r) {
					renderSnapshots(Array.isArray(r) ? r : (r && r.names) || []);
				}).finally(function () { btn.disabled = false; });
			})
		});

		// If the platform supports KVM dual partitions, show a button to trigger partition switch.
        const sections = [
			E('h2', _('Backup Firmware Config')),
			E('p', _('Backup OpenWrt config (openwrt_config.tar.gz). Use this file to restore the config in [Manually Upload Update].')),
			E('div', { class: 'cbi-section' }, [
				E('table', { class: 'amlogic-row-table' }, [
					E('tr', [
						E('td', { width: '20%', align: 'right' }, _('Edit List:')),
						E('td', { width: '80%', align: 'left' }, editListBtn)
					]),
					E('tr', [
						E('td', { width: '20%', align: 'right' }, _('Backup Config:')),
						E('td', { width: '80%', align: 'left' }, [downloadBtn, ' ', downloadStatus])
					]),
					E('tr', [
						E('td', { width: '20%', align: 'right' }, _('Restore Backup:')),
						E('td', { width: '80%', align: 'left' }, restoreBtn)
					])
				])
			]),
			E('h2', _('Snapshot Management')),
			E('p', _('Create a snapshot of the current system configuration, or restore to a snapshot.')),
			E('div', { class: 'cbi-section' }, [
				E('div', { style: 'margin-bottom:10px' }, createSnapBtn),
				snapDiv
			])
		];

		// If the platform supports KVM dual partitions, show a button to trigger partition switch.
        if (platform.has_kvm) {
			const kvmBtn = E('input', {
				type: 'button', class: 'cbi-button cbi-button-save',
				value: _('Switch System'),
				click: ui.createHandlerFn(view, function (ev) {
					if (!confirm(_('Are you sure you want to switch systems?'))) return;
					ev.currentTarget.disabled = true;
					ui.showModal(_('System is switching...'), [
						E('p', { class: 'spinning' }, _('Waiting for system switching...'))
					]);
					return callKvmSwitch().then(function () {
						if (ui.awaitReconnect) {
							ui.awaitReconnect();
						} else {
							// Fallback for older LuCI builds without awaitReconnect
							setTimeout(function () { location.reload(); }, 5000);
						}
					});
				})
			});
			sections.push(E('h2', _('KVM dual system switching')));
			sections.push(E('p', _('You can freely switch between KVM dual partitions, using OpenWrt systems in different partitions.')));
			sections.push(E('div', { class: 'cbi-section' }, [kvmBtn]));
		}

		return E('div', {}, sections);
	}
});
