// SPDX-License-Identifier: GPL-2.0
// Manually Upload Update
//
// Purpose: upload local files (firmware / kernel / ipk / config backup) to the server,
// list them, and trigger install / restore / update actions. Chunked upload uses
// a custom ubus RPC instead of cgi-upload to avoid session ACL issues.
// Backend RPC: /usr/share/rpcd/ucode/luci.amlogic (upload_path, list_uploads, upload_chunk,
//   delete_upload, install_upload, start_update, start_kernel, read_log_tail, state).

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require poll';
'require fs';
'require view.amlogic.shared as amlogicShared';

// Query the upload directory the backend allows (default /tmp/upload/, the backend ensures it exists).
const callUploadPath = rpc.declare({ object: 'luci.amlogic', method: 'upload_path', expect: { path: '/tmp/upload/' } });
// List files in the upload dir plus flags about installable firmware/kernel/cfg.
const callList       = rpc.declare({ object: 'luci.amlogic', method: 'list_uploads' });
// Delete a named file in the upload dir.
const callDelete     = rpc.declare({ object: 'luci.amlogic', method: 'delete_upload', params: ['name'] });
// Install one uploaded file (ipk) or restore a config backup; the backend dispatches by suffix.
const callInstall    = rpc.declare({ object: 'luci.amlogic', method: 'install_upload', params: ['name'] });
// Chunked upload via our own RPC (sidesteps cgi-upload's session ACL flow).
const callUploadChunk = rpc.declare({ object: 'luci.amlogic', method: 'upload_chunk', params: ['name', 'data', 'append'] });
// Run the full firmware update flow with parameters auto@updated@/tmp.
const callStartUpd   = rpc.declare({ object: 'luci.amlogic', method: 'start_update', params: ['amlogic_update_sel'] });
// Run the kernel-only replace flow.
const callStartKnl   = rpc.declare({ object: 'luci.amlogic', method: 'start_kernel' });
// Tail a named log to surface progress during install/update.
const callLogTail    = rpc.declare({ object: 'luci.amlogic', method: 'read_log_tail', params: ['name'], expect: { line: '' } });
// Read system state (this page only uses current_firmware_version).
const callState      = rpc.declare({ object: 'luci.amlogic', method: 'state' });

// This page uses its own Upload/Install buttons and does not need the default Save/Apply/Reset buttons,
// so we disable them by setting the handlers to null.
return view.extend({
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	// On load, ensure the CSS is injected and load the upload path from the backend.
	load: function () {
		amlogicShared.ensureCss();
		return callUploadPath();
	},

	// Render the upload page: file input + upload button, table of existing uploads with Remove + Install/Restore buttons,
	// and firmware/kernel update buttons if applicable. Also start polling the install/update log tails.
	render: function (path) {
		const view = this;

		const tableContainer = E('div');
		const descSpan = E('span', { class: 'amlogic-status-ok', style: 'font-weight:bold' });
		const fwBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Update OpenWrt firmware'), style: 'display:none',
			click: ui.createHandlerFn(this, function (ev) {
				return doButton(ev.currentTarget,
					_('Updating...'), _('Update Failed'),
					function () { return callStartUpd('auto@updated@/tmp'); });
			})
		});
		const knBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Replace OpenWrt Kernel'), style: 'display:none; margin-left:5px',
			click: ui.createHandlerFn(this, function (ev) {
				return doButton(ev.currentTarget,
					_('Updating...'), _('Update Failed'),
					function () { return callStartKnl(); });
			})
		});
		const fwLog = E('span');
		const knLog = E('span');
		const fwVer = E('span', _('Collecting data...'));

		function doButton(btn, busyText, fail, fn) {
			// Shared button state machine: disabled → RPC → busyText or fail label.
			// On success (code==0) the button stays in busyText state (device rebooting);
			// on failure, re-enable so the user can retry.
			btn.disabled = true; btn.value = busyText;
			return Promise.resolve(fn()).then(function (r) {
				if (!r || r.code !== 0) {
					btn.value = fail;
					btn.disabled = false;
				}
				// code == 0 → keep busyText + disabled (update in progress)
			}).catch(function () {
				btn.value = fail;
				btn.disabled = false;
			});
		}

		function refreshList() {
			// Refresh the file table; show/hide firmware/kernel update buttons
			// based on has_firmware / has_kernel flags from the backend.
			return callList().then(function (info) {
				dom.content(tableContainer, buildTable(info.items || [], info.path));
				let parts = [];
				if (info.has_config)
					parts.push(_('There are config file in the upload directory, and you can restore the config. '));
				if (info.has_kernel)
					parts.push(_('There are kernel files in the upload directory, and you can replace the kernel.'));
				if (info.has_firmware)
					parts.push(_('There are openwrt firmware file in the upload directory, and you can update the openwrt.'));
				descSpan.textContent = parts.length ? ' Tip: ' + parts.join('') : '';
				fwBtn.style.display = info.has_firmware ? '' : 'none';
				knBtn.style.display = info.has_kernel ? '' : 'none';
			});
		}

		// Helper to build the file table with Remove + Install/Restore buttons per row.
		function buildTable(items, dir) {
			// File table: expose Remove + Install (ipk) / Restore (config backup) per row.
			const tbl = E('table', { class: 'table cbi-section-table' }, [
				E('tr', { class: 'tr cbi-section-table-titles' }, [
					E('th', { class: 'th' }, _('File name')),
					E('th', { class: 'th' }, _('Modify time')),
					E('th', { class: 'th' }, _('Attributes')),
					E('th', { class: 'th' }, _('Size')),
					E('th', { class: 'th' }, _('Remove')),
					E('th', { class: 'th' }, _('Install'))
				])
			]);
			items.forEach(function (it) {
				const removeBtn = E('input', {
					type: 'button', class: 'cbi-button cbi-button-remove',
					value: _('Remove'),
					click: ui.createHandlerFn(view, function (ev) {
						return callDelete(it.name).then(refreshList);
					})
				});
				let installCell;
				if (it.ipk) {
					// ipk: "Install" calls install_upload to install one package.
					installCell = E('input', {
						type: 'button', class: 'cbi-button cbi-button-apply',
						value: _('Install'),
						click: ui.createHandlerFn(view, function (ev) {
							ev.currentTarget.disabled = true;
							return callInstall(it.name).then(function (r) {
								if (r && r.code !== 0 && r.output)
									ui.addNotification(null,
										E('p', { class: 'amlogic-status-err' }, [
											r.output, E('br'),
											E('b', _('Please refresh the page to see the changes.'))
										]));
								else if (r && r.code === 0)
									ui.addNotification(null,
										E('p', { class: 'amlogic-status-ok' },
											_('Package installed successfully. Please refresh the page to see the changes.')));
								return refreshList();
							});
						})
					});
				} else if (it.cfg) {
					// Config backup (openwrt-config.tar.gz): "Restore" makes the
					// backend roll the config back and reboot.
					installCell = E('input', {
						type: 'button', class: 'cbi-button cbi-button-apply',
						value: _('Restore'),
						click: ui.createHandlerFn(view, function (ev) {
							ev.currentTarget.disabled = true;
							ui.addNotification(null,
							E('p', { class: 'amlogic-status-ok' },
								  _('Tip: The config is being restored, and it will automatically restart after completion.')));
							return callInstall(it.name);
						})
					});
				} else {
					installCell = E('span', '-');
				}
				tbl.appendChild(E('tr', { class: 'tr cbi-rowstyle-1' }, [
					E('td', { class: 'td' }, it.name),
					E('td', { class: 'td' }, it.mtime),
					E('td', { class: 'td' }, it.modestr),
					E('td', { class: 'td' }, it.size),
					E('td', { class: 'td' }, removeBtn),
					E('td', { class: 'td' }, installCell)
				]));
			});
			if (!items.length)
				tbl.appendChild(E('tr', [E('td', { class: 'td', colspan: '6' }, _('No specify upload file.'))]));
			return tbl;
		}

		// Chunked file upload via luci.amlogic.upload_chunk RPC (avoids cgi-upload session ACL).
		// 32 KB raw per chunk → ~44 KB base64, safely under the ubus per-request size limit.
		const CHUNK_SIZE = 32 * 1024;
		const uploadStatus = E('span');
		const uploadFileName = E('span', { style: 'margin-right:1em' });

		// Encode a Uint8Array as base64 in 32 KB slices to avoid call-stack limits.
		function bytesToB64(buf) {
			let s = '';
			for (let i = 0; i < buf.length; i += 0x8000)
				s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
			return btoa(s);
		}

		// Upload a file in chunks; on success, refresh the file list to show the new upload.
		function uploadFile(file, target, basename) {
			const total = file.size;
			let offset = 0;
			let first = true;
			function step() {
				if (offset >= total) {
					uploadStatus.textContent = _('File saved to') + ' ' + target;
					return refreshList();
				}
				const slice = file.slice(offset, offset + CHUNK_SIZE);
				return slice.arrayBuffer().then(function (buf) {
					const b64 = bytesToB64(new Uint8Array(buf));
					const append = !first;
					first = false;
					return callUploadChunk(basename, b64, append).then(function (r) {
						if (!r || !r.ok)
							throw new Error((r && r.error) || _('upload chunk failed'));
						offset += CHUNK_SIZE;
						const pct = Math.min(100, (offset / total) * 100);
						uploadStatus.textContent = _('Uploading file…') +
							' ' + pct.toFixed(1) + '%';
						return step();
					});
				});
			}
			return step();
		}

		// Hidden file input to trigger the file picker dialog; on file selection, start the chunked upload.
		const hiddenFileInput = E('input', {
			type: 'file', style: 'display:none',
			change: ui.createHandlerFn(this, function (ev) {
				const file = ev.target.files && ev.target.files[0];
				if (!file) return;
				const basename = file.name.replace(/^.*[\\\/]/, '');
				const target   = path.replace(/\/+$/, '') + '/' + basename;
				uploadFileName.textContent = basename;
				uploadStatus.textContent = _('Uploading file…') + ' 0%';
				return uploadFile(file, target, basename).catch(function (e) {
					uploadStatus.textContent = _('Create upload file error.') +
						' ' + (e && e.message ? e.message : e);
				}).finally(function () {
					hiddenFileInput.value = '';
				});
			})
		});
		const uploadBtn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-apply',
			value: _('Upload file...'),
			click: function () { hiddenFileInput.click(); }
		});

		// Polling: pull firmware and kernel log tails once per second.
		poll.add(function () {
			return Promise.all([
				callLogTail('firmware').then(function (l) {
					dom.content(fwLog, l && l !== '\n'
						? E('span', { class: 'amlogic-status-info' }, ' ' + l) : '');
				}),
				callLogTail('kernel').then(function (l) {
					dom.content(knLog, l && l !== '\n'
						? E('span', { class: 'amlogic-status-info' }, ' ' + l) : '');
				})
			]);
		}, 1);
		callState().then(function (s) {
			dom.content(fwVer, s.current_firmware_version
				? E('span', { class: 'amlogic-status-ok' }, _('Current Version') + ' [ ' + s.current_firmware_version + ' ] ')
				: E('span', { class: 'amlogic-status-err' }, _('Invalid value.')));
		});
		refreshList();

		return E('div', {}, [
			E('h2', _('Upload')),
			E('p', _('Update plugins first, then update the kernel or firmware.')),
			E('p', _('After uploading [Firmware], [Kernel], [IPK] or [Backup Config], the operation buttons will be displayed.')),
			E('div', { class: 'cbi-section' }, [
				E('label', { style: 'display:inline-block;width:150px' },
				  _('Choose local file:')),
				uploadBtn, ' ', uploadFileName, hiddenFileInput,
				E('br'), uploadStatus
			]),
			E('h3', _('Upload file list')),
			E('div', { class: 'cbi-section' }, [descSpan, tableContainer]),
			E('div', { class: 'cbi-section' }, [
				E('p', { style: 'text-align:center' },
				  _('After uploading firmware (.img/.img.gz/.img.xz/.7z suffix) or kernel files (3 kernel files), the update button will be displayed.')),
				// Single centered cell: when fwBtn / knBtn are hidden the row would otherwise show an empty left column.
				E('div', { style: 'text-align:center' },
				  [fwBtn, knBtn, ' ', fwVer, '　', fwLog, knLog])
			])
		]);
	}
});
