// SPDX-License-Identifier: GPL-2.0
// CPU Freq Settings page
//
// Purpose: configure scaling governor and min/max frequency per CPU policy
// (cluster). After save, the backend script fixcpufreq.pl is invoked so the
// new values take effect immediately. The backing RPC is exposed by
// /usr/share/rpcd/ucode/luci.amlogic.

'use strict';
'require view';
'require form';
'require rpc';
'require uci';

// Query CPU cluster info (each policy: core type, available governors, freqs).
const callPolicies  = rpc.declare({ object: 'luci.amlogic', method: 'cpu_policies',
                                    expect: { policies: [] } });
// Tell backend to apply the new governor / frequency limits right after save.
const callReloadCpu = rpc.declare({ object: 'luci.amlogic', method: 'reload_cpu' });

return view.extend({
	// Load in parallel: CPU policy info + UCI config (we will read/write it).
	load: function () {
		return Promise.all([
			callPolicies(),
			uci.load('amlogic')
		]);
	},

	render: function (data) {
		const policies = data[0] || [];

		// Auto-create the armcpu section when missing, so that on a fresh
		// install/upgrade the user can save without first creating the section
		// manually.
		if (!uci.get('amlogic', 'armcpu')) {
			uci.add('amlogic', 'settings', 'armcpu');
		}

		// Build CBI Map bound to the amlogic.armcpu NamedSection.
		const m = new form.Map('amlogic', _('CPU Freq Settings'),
			_('Set CPU Scaling Governor to Max Performance or Balance Mode'));
		const s = m.section(form.NamedSection, 'armcpu', 'settings');
		s.anonymous = true;

		// Render an independent tab + form options per CPU cluster (big/little).
		policies.forEach(function (p) {
			const tabId = 'tab' + p.id;
			s.tab(tabId, p.name);

			// Microarchitecture (read-only display, inline so it aligns with the label).
			const ct = s.taboption(tabId, form.DummyValue, 'core_type' + p.id,
			                       _('Microarchitectures:'));
			ct.cfgvalue = function () { return p.core_type; };
			ct.renderWidget = function (section_id) {
				return E('span', { style: 'line-height:2em; display:inline-block; vertical-align:middle' },
				         this.cfgvalue(section_id) || '');
			};

			// CPU scaling governor: list of governors exposed by the kernel
			// (performance / schedutil / etc).
			const gov = s.taboption(tabId, form.ListValue, 'governor' + p.id,
			                        _('CPU Scaling Governor:'));
			(p.governors || []).forEach(function (e) { gov.value(e, e.toUpperCase()); });
			gov.default = 'schedutil';
			gov.rmempty = false;

			// Minimum running frequency (kHz).
			const minF = s.taboption(tabId, form.ListValue, 'minfreq' + p.id, _('Min Freq:'));
			(p.freqs || []).forEach(function (e) { minF.value(e); });
			minF.default = '500000';
			minF.rmempty = false;

			// Maximum running frequency (kHz).
			const maxF = s.taboption(tabId, form.ListValue, 'maxfreq' + p.id, _('Max Freq:'));
			(p.freqs || []).forEach(function (e) { maxF.value(e); });
			maxF.default = '1512000';
			maxF.rmempty = false;
		});

		// Wrap the default saveApply: after a successful UCI commit, trigger
		// reload_cpu so the new governor and frequency limits take effect
		// without the user manually restarting the service.
		const origHandle = m.handleSaveApply;
		m.handleSaveApply = function () {
			return origHandle.apply(this, arguments)
				.then(function (r) { callReloadCpu(); return r; });
		};

		return m.render();
	}
});
