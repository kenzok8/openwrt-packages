// SPDX-License-Identifier: GPL-2.0
// Install OpenWrt to EMMC
//
// The dropdown lists common devices from the backend model database, plus an
// "Enter the dtb file name" option. When the user picks the manual option and
// fills in dtb / soc / uboot_overload, the frontend assembles the string
// "id@dtb:soc:uboot" and passes it to the start_install RPC, which invokes
// openwrt-install-amlogic to perform the actual installation. The install log
// tail is polled while the work runs.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require poll';
'require view.amlogic.shared as amlogicShared';

// Read the model database (parsed by the backend from
// /usr/share/amlogic/model_database.txt).
const callDB         = rpc.declare({ object: 'luci.amlogic', method: 'model_database',
                                     expect: { entries: [] } });
// Start install; the parameter is the composed string "id@dtb:soc:uboot",
// kept compatible with the original Lua plugin.
const callStartInst  = rpc.declare({ object: 'luci.amlogic', method: 'start_install',
                                     params: ['amlogic_install_sel'] });
// Read the last line of the named log (here we use the 'install' log).
const callLogTail    = rpc.declare({ object: 'luci.amlogic', method: 'read_log_tail',
                                     params: ['name'], expect: { line: '' } });

return view.extend({
	handleSave:      null,
	handleSaveApply: null,
	handleReset:     null,

	load: function () {
		return callDB();
	},

	render: function (entries) {
		amlogicShared.ensureCss();
		// Model dropdown: 0 = placeholder, 99 = manual entry, anything in between
		// is a model from the database.
		const sel = E('select', { style: 'width:auto', name: 'amlogic_soc', id: 'amlogic_soc' });
		sel.appendChild(E('option', { value: '0' }, _('Select List')));
		(entries || []).forEach(function (e) {
			sel.appendChild(E('option', { value: e.id },
			                  '[ ' + e.id + ' ] ' + e.name));
		});
		sel.appendChild(E('option', { value: '99' }, _('Enter the dtb file name')));

		// The three manual fields are only required when the user picks 99.
		const dtbInput = E('input', { type: 'text', class: 'cbi-input-text',
		                              style: 'width:235px', id: 'amlogic_dtb' });
		const socInput = E('input', { type: 'text', class: 'cbi-input-text',
		                              style: 'width:235px', id: 'amlogic_socname' });
		const ubootInput = E('input', { type: 'text', class: 'cbi-input-text',
		                                style: 'width:235px', id: 'amlogic_uboot' });

		const trDtb = E('tr', { style: 'display:none' }, [
			E('td', { width: '30%', align: 'right' }, _('Enter the dtb file name:')),
			E('td', { width: '70%', align: 'left' }, dtbInput)
		]);
		const trSoc = E('tr', { style: 'display:none' }, [
			E('td', { width: '30%', align: 'right' }, _('Enter the soc name:')),
			E('td', { width: '70%', align: 'left' }, socInput)
		]);
		const trUboot = E('tr', { style: 'display:none' }, [
			E('td', { width: '30%', align: 'right' }, _('Enter the uboot_overload name:')),
			E('td', { width: '70%', align: 'left' }, ubootInput)
		]);

		sel.addEventListener('change', function () {
			// On selection change, dynamically show/hide the three manual rows.
			const show = (sel.value === '99') ? '' : 'none';
			trDtb.style.display = show;
			trSoc.style.display = show;
			trUboot.style.display = show;
		});

		// Status / log line shown next to the install button while it runs.
		// 'installing' tracks whether the background install is in progress.
		const logSpan = E('span');
		var installing = false;
		var installDone = false;
		const btn = E('input', {
			type: 'button', class: 'cbi-button cbi-button-reload',
			value: _('Install'),
			click: ui.createHandlerFn(this, function (ev) {
				if (installing) return;
				const text = sel.options[sel.selectedIndex].text;
				// Confirm twice: install only proceeds after the user clicks
				// "Start install?".
				if (!confirm(_('You have chosen:') + ' ' + text + ', ' + _('Start install?')))
					return;
				// When manual entries are blank, dtb falls back to auto_dtb so the
				// backend can autodetect.
				const dtbVal = dtbInput.value || 'auto_dtb';
				const socVal = socInput.value || '';
				const ubVal  = ubootInput.value || '';
				// Compose the "id@dtb:soc:uboot" string the backend expects.
				const composed = sel.value + '@' + dtbVal + ':' + socVal + ':' + ubVal;
				const target = ev.currentTarget;
				target.disabled = true;
				target.value = _('Installing...');
				installing = true;
				installDone = false;
				// Fire the background install — result comes via log polling.
				return callStartInst(composed).catch(function () {
					target.value = _('Install Failed');
					target.disabled = false;
					installing = false;
				});
			})
		});

		// Poll the install log tail once per second to surface backend progress
		// and detect terminal success/failure keywords.
		poll.add(function () {
			return callLogTail('install').then(function (line) {
				if (!line || line === '\n') {
					dom.content(logSpan, '');
					return;
				}
				dom.content(logSpan, E('span', { class: 'amlogic-status-info' }, ' ' + line));
				if (installing && !installDone) {
					if (line.indexOf('Successfully') !== -1 || line.indexOf('successful') !== -1) {
						installDone = true;
						installing = false;
						btn.value = _('Successful Install');
						btn.disabled = false;
						dom.content(logSpan, E('span', { class: 'amlogic-status-ok' }, ' ' + line));
					} else if (line.indexOf('Failed') !== -1 || line.indexOf('failed') !== -1 ||
					           line.indexOf('Error') !== -1 || line.indexOf('error') !== -1) {
						installDone = true;
						installing = false;
						btn.value = _('Install Failed');
						btn.disabled = false;
						dom.content(logSpan, E('span', { class: 'amlogic-status-err' }, ' ' + line));
					}
				}
			});
		}, 1);

		return E('div', {}, [
			E('h2', _('Install OpenWrt')),
			E('p', _('Install OpenWrt to EMMC, Please select the device model, Or enter the dtb file name.')),
			E('div', { class: 'cbi-section' }, [
				E('table', { class: 'amlogic-row-table' }, [
					E('tr', [
						E('td', { width: '35%', align: 'right' }, _('Select the device model:')),
						E('td', { width: '65%', align: 'left' }, sel)
					]),
					trDtb, trSoc, trUboot,
					E('tr', [
						E('td', { width: '30%', align: 'right' }, _('Install OpenWrt:')),
						E('td', { width: '70%', align: 'left' }, [btn, '　', logSpan])
					])
				])
			])
		]);
	}
});
