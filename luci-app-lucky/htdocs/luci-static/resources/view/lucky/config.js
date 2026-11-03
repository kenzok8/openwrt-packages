'use strict';
// SPDX-License-Identifier: Apache-2.0
'require view';
'require form';
'require rpc';
'require ui';
'require fs';
'require request';
'require session';

var HELPER = '/usr/libexec/lucky-call';
// Keep the fast status request out of the slow binary-query RPC batch.
var callHelper = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	nobatch: true
});
var resetInProgress = false;
var actionInProgress = false;
var refreshInProgress = false;
var refreshGeneration = 0;
var coreQueryInProgress = false;
var backupInProgress = false;
var watchdogState = { ready: false, busy: false, data: null, error: null };
var state = {
	installed: false,
	core: "unknown",
	running: false,
	infoReady: false,
	configReady: false,
	runtimeReady: false,
	loading: true,
	error: null,
	arch: '-',
	version: '-',
	date: '-',
	port: 16601,
	safeURL: '',
	allowInternet: null
};

function supportsLocalControl(version) {
	var parts = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
	return !!parts && (+parts[1] > 3 || (+parts[1] === 3 && +parts[2] >= 4));
}

function refreshCachedMenu() {
	// A direct visit after SSH installation may still use the pre-install menu
	// stored in this browser tab. Invalidate only that menu, then reload once.
	// Lua-only LuCI has no such cache and must not depend on this API.
	if (typeof session === 'undefined' || !session.getLocalData || !session.setLocalData || !ui.menu || !ui.menu.flushCache)
		return false;
	try {
		var cached = session.getLocalData('menu');
		if (!cached || typeof cached !== 'object') return false;
		var admin = cached.children && cached.children.admin;
		var services = admin && admin.children && admin.children.services;
		var lucky = services && services.children && services.children.lucky;
		if (lucky && lucky.title && lucky.satisfied !== false) {
			session.setLocalData('luckyMenuRefresh', null);
			return false;
		}
		// An ACL or dependency problem can also hide the freshly fetched menu.
		// Do not keep reloading if invalidating its cache did not resolve that.
		if (session.getLocalData('luckyMenuRefresh') || !session.setLocalData('luckyMenuRefresh', true))
			return false;
		ui.menu.flushCache();
		// A browser rejecting storage writes must not enter a reload loop.
		if (session.getLocalData('menu') != null) return false;
		window.location.reload();
		return true;
	}
	catch (e) { return false; }
}

function helper(args, program) {
	var command = program || HELPER;
	var configUpdate = command === HELPER && [ 'set-port', 'set-safe-url', 'set-internet', 'reset-auth' ].indexOf(args[0]) !== -1;
	if (configUpdate) command = '/usr/libexec/lucky-backup';
	// Stop/write/restart can exceed rpcd's file.exec deadline. Use the same
	// long-running transport as backup/restore; encode one argv envelope to
	// preserve empty values and avoid CGI command-line parsing differences.
	var task = configUpdate ? archiveCall('configure', encodeURIComponent(JSON.stringify(args))).then(function(result) {
		return { code: 0, stdout: JSON.stringify(result) };
	}) : callHelper(command, args);
	return task.then(function(res) {
		if (!res || typeof res !== 'object')
			throw new Error(rpc.getStatusText(res));
		if (typeof res.code === 'number' && res.code !== 0) {
			var detail = (res.stderr || res.stdout || '').trim() ||
				_('Command failed (exit code %s).').format(res.code);
			throw new Error(detail.substring(0, 400));
		}
		var output = (res.stdout || '').trim();
		if (configUpdate) {
			var result = parseJSON(output, 'Lucky configuration update');
			if (!result || !result.ok) throw new Error(result && result.error || _('The operation failed.'));
			if (result.warning) {
				if (args[0] !== 'reset-auth')
					throw new Error(_('Configuration saved, but Lucky could not restart. Start it manually.'));
				// Credentials have already changed. Preserve them even if the
				// outer service recovery disagrees with the old helper's result.
				var credentials = parseJSON(result.stdout || '', 'lucky-call reset-auth');
				credentials.restarted = false;
				return JSON.stringify(credentials);
			}
			return (result.stdout || '').trim();
		}
		return output;
	}).catch(function(err) {
		// Identify the failed helper without exposing arguments such as safe URLs.
		throw new Error(command + ' ' + args[0] + ': ' +
			(err && err.message ? err.message : _('The operation failed.')));
	});
}

function parseJSON(value, source) {
	try {
		return JSON.parse(value);
	}
	catch (e) {
		throw new Error(_('Invalid response from %s.').format(source));
	}
}

function applyBaseConfiguration(base) {
	var config = base.BaseConfigure || {};
	var port = Number(config.AdminWebListenPort);
	state.configReady = true;
	state.port = Math.floor(port) === port && port >= 1 && port <= 65535 ? port : 16601;
	state.safeURL = typeof config.SafeURL === 'string' ? config.SafeURL : '';
	state.allowInternet = typeof config.AllowInternetaccess === 'boolean' ? config.AllowInternetaccess : null;
}

function loadState() {
	if (refreshInProgress || backupInProgress || actionInProgress)
		return Promise.resolve();
	var generation = ++refreshGeneration;
	function current() { return generation === refreshGeneration; }
	refreshInProgress = true;
	state.loading = true;
	state.error = null;
	state.core = 'unknown';
	state.runtimeReady = false;
	state.configReady = false;
	state.installed = false;
	state.infoReady = false;
	state.version = state.date = "-";
	updateDashboard(false);
	function failed(err) {
		if (!current()) return;
		// Keep the first cause; dependent and later requests must not hide it.
		if (!state.error)
			state.error = err && err.message ? err.message : _('Unable to load Lucky data.');
		updateDashboard(false);
	}
	var coreQuery = helper([ 'core-status' ], '/usr/libexec/lucky-backup').then(function(value) {
		if (!current()) return null;
		var core = parseJSON(value, 'Core status');
		if (!core || !core.ok || [ 'ready', 'missing', 'permissions', 'unsafe' ].indexOf(core.status) === -1)
			throw new Error(core && core.error || _('Unable to inspect core.'));
		state.core = core.status;
		state.installed = core.status === 'ready';
		updateDashboard(false);
		return core;
	});
	function queryCore(operation) {
		return coreQuery.then(function(core) {
			if (!current() || !core || core.status !== 'ready') return null;
			// A single packed-core query can still exhaust 128/256 MiB devices.
			// Skip it when headroom is low; status and log reads never run the core.
			if (typeof core.available_memory_kib !== 'number' || core.available_memory_kib < 128 * 1024)
				throw new Error(_('Not enough available memory for core queries. Stop Lucky and refresh to retry. Service status and logs remain available.'));
			// Only an active binary query needs to finish before maintenance can
			// take the backend lock. Unavailable status RPCs must not block upload.
			coreQueryInProgress = true;
			updateDashboard(false);
			return helper([ 'core-' + operation ], '/usr/libexec/lucky-backup').then(function(value) {
				var result = parseJSON(value, 'Core ' + operation);
				if (!result || !result.ok) throw new Error(result && result.error || _('Unable to load Lucky data.'));
				return result;
			}).then(function(result) {
				coreQueryInProgress = false;
				updateDashboard(false);
				return result;
			}, function(err) {
				coreQueryInProgress = false;
				updateDashboard(false);
				throw err;
			});
		});
	}
	// A cache miss launches the core. Packed binaries can exhaust a small router
	// when queries run together, so finish the configuration query before -info.
	// Fast status/architecture reads stay independent of these two queries.
	var baseQuery = coreQuery.then(function(core) {
		if (!current() || !core || core.status !== 'ready') return null;
		if (core.base && core.base.BaseConfigure)
			return core.base;
		return queryCore('base');
	}).then(function(base) {
		if (!current() || !base) return;
		state.installed = true;
		applyBaseConfiguration(base);
		updateDashboard(true);
	}).catch(failed);
	var infoQuery = coreQuery.then(function(core) {
		if (!current() || !core || core.status !== 'ready') return null;
		// Validated on the router against the current executable. Cached metadata
		// is safe to show even when memory pressure prevents a fresh core query.
		if (core.info && typeof core.info.Version === 'string' && core.info.Version.length)
			return core.info;
		return baseQuery.then(function() { return queryCore('info'); });
	});

	return Promise.all([
		loadWatchdog(current),
		coreQuery.catch(failed),
		infoQuery.then(function(info) {
			if (!current() || !info) return;
			state.installed = true;
			state.infoReady = true;
			state.version = info.Version || '-';
			state.date = info.Date || '-';
			updateDashboard(false);
		}).catch(failed),
		baseQuery,
		helper([ 'status' ]).then(function(value) {
			if (!current()) return;
			state.running = value === 'true';
			state.runtimeReady = true;
			updateRuntimeStatus();
		}).catch(failed),
		helper([ 'arch' ]).then(function(value) {
			if (!current()) return;
			state.arch = value || '-';
			updateText('lucky-arch', state.arch);
		}).catch(failed)
	]).then(function() {
		if (!current()) return state;
		state.loading = false;
		refreshInProgress = false;
		updateDashboard(false);
		return state;
	});
}

function notifyError(err) {
	var message = err && err.message ? err.message : _('The operation failed.');
	ui.addNotification(null, E('p', {}, message));
}

function loadWatchdog(current) {
	return helper([ 'status' ], '/usr/libexec/lucky-watchdog').then(function(value) {
		if (current && !current()) return;
		watchdogState.data = parseJSON(value, 'Watchdog');
		watchdogState.ready = true;
		watchdogState.error = null;
	}).catch(function() {
		if (current && !current()) return;
		watchdogState.ready = false;
		watchdogState.error = _('Unable to read recovery settings. Install the matching updated Lucky core package.');
	}).then(updateWatchdog);
}

function updateWatchdog() {
	var button = document.getElementById('lucky-watchdog-toggle');
	var text = document.getElementById('lucky-watchdog-text');
	var status = document.getElementById('lucky-watchdog-status');
	if (!button || !text || !status) return;
	var data = watchdogState.data || {};
	var enabled = data.enabled === true;
	text.textContent = watchdogState.busy ? _('Updating recovery…') :
		enabled ? _('Recovery enabled') : _('Recovery disabled');
	button.setAttribute('aria-checked', enabled ? 'true' : 'false');
	button.setAttribute('aria-busy', watchdogState.busy ? 'true' : 'false');
	button.disabled = !watchdogState.ready || watchdogState.busy || refreshInProgress || backupInProgress || resetInProgress;
	var message = _('Scheduled recovery is off.');
	if (enabled) {
		message = data.paused ? _('Paused after stopping Lucky. Start Lucky to resume recovery.') :
			_('Checks every minute; repeated recovery attempts are at least five minutes apart.');
		if (!data.scheduled || !data.cron_running)
			message = _('Scheduled recovery is unavailable. Switch it off and on again to repair it.');
	}
	status.textContent = watchdogState.error || (!watchdogState.ready ? _('Collecting data…') : message);
}

function toggleWatchdog() {
	if (!watchdogState.ready || watchdogState.busy || refreshInProgress || backupInProgress || resetInProgress)
		return Promise.resolve();
	watchdogState.busy = true;
	updateWatchdog();
	var operation = watchdogState.data.enabled ? 'disable' : 'enable';
	return helper([ operation ], '/usr/libexec/lucky-watchdog').then(function(value) {
		watchdogState.data = parseJSON(value, 'Watchdog');
		watchdogState.error = null;
	}).catch(function(err) {
		notifyError(err);
		return loadWatchdog();
	}).then(function() {
		watchdogState.busy = false;
		updateWatchdog();
	});
}

function action(args, successMessage) {
	if (actionInProgress || refreshInProgress || resetInProgress || backupInProgress)
		return Promise.resolve();
	actionInProgress = true;
	updateDashboard(false);
	return helper(args).then(function() {
		ui.addNotification(null, E('p', {}, successMessage), 'info');
	}, notifyError).then(function() {
		actionInProgress = false;
		return loadState();
	});
}

function textRow(label, id) {
	return E('div', { 'class': 'lucky-stat' }, [
		E('div', { 'class': 'lucky-label' }, label),
		E('div', { 'class': 'lucky-value', 'id': id }, _('Collecting data…'))
	]);
}

function panelTitle(title) {
	// Only the page title uses a native h2. Some themes paint every h3 as a banner.
	return E('div', { 'class': 'lucky-panel-title', 'role': 'heading', 'aria-level': '3' }, title);
}

function serviceButton(label, css, operation) {
	return E('button', {
		'class': 'btn cbi-button ' + css,
		'id': 'lucky-service-' + operation,
		'type': 'button',
		'click': function() {
			if (!window.confirm(_('Are you sure you want to perform this service action?')))
				return;
			action([ 'service', operation ], _('Lucky service state updated.'));
		}
	}, label);
}

function hostForURL() {
	var host = window.location.hostname;
	return host.indexOf(':') > -1 && host.charAt(0) !== '[' ? '[' + host + ']' : host;
}

function adminURL() {
	return 'http://' + hostForURL() + ':' + state.port + state.safeURL;
}

function updateText(id, value, css) {
	var node = document.getElementById(id);
	if (!node)
		return;
	node.textContent = value;
	// Status updates must not turn helper text or file paths into bold metrics.
	if (css !== undefined)
		node.className = 'lucky-value' + (css ? ' lucky-state-' + css : '');
}

function setDisabled(id, disabled) {
	var node = document.getElementById(id);
	if (node)
		node.disabled = disabled;
}

function updateRuntimeStatus() {
	updateText('lucky-running', !state.runtimeReady ? (state.loading ? _('Collecting data…') : _('Unable to read service status.')) : (state.running ? _('Running') : _('Stopped')), state.runtimeReady && state.running ? 'success' : '');

	var link = document.getElementById('lucky-admin-link');
	var accessible = state.runtimeReady && state.running && state.configReady && !actionInProgress;
	if (link) {
		link.textContent = accessible ? _('Open admin panel') : (state.loading ? _('Collecting data…') : _('Available when the service is running'));
		updateText('lucky-admin-address', accessible ? adminURL() : '');
		link.style.pointerEvents = accessible ? '' : 'none';
		link.setAttribute('aria-disabled', accessible ? 'false' : 'true');
		if (accessible) {
			link.href = adminURL();
			link.removeAttribute('tabindex');
		}
		else {
			link.removeAttribute('href');
			link.setAttribute('tabindex', '-1');
		}
	}

	setDisabled('lucky-service-start', !state.installed || !state.runtimeReady || refreshInProgress || actionInProgress || state.running);
	setDisabled('lucky-service-restart', !state.installed || !state.runtimeReady || refreshInProgress || actionInProgress);
	setDisabled('lucky-service-stop', !state.runtimeReady || refreshInProgress || actionInProgress || !state.running);
}

function updateDashboard(updateInputs) {
	var refresh = document.getElementById('lucky-refresh');
	if (refresh) {
		refresh.disabled = refreshInProgress || resetInProgress;
		refresh.textContent = refreshInProgress ? _('Refreshing…') : _('Refresh');
	}
	updateText('lucky-install', state.error ? _('Load error: %s').format(state.error) : (state.installed ? _('Installed') : (state.loading ? _('Collecting data…') : _('Not installed'))), state.error ? 'error' : (state.installed ? 'success' : ''));
	var health = { ready: _('Executable'), missing: _('Core missing'), permissions: _('Execution permission missing'), unsafe: _('Unsafe core path'), unknown: _('Unable to inspect core.') };
	updateText('lucky-core-health', health[state.core] || health.unknown);
	setDisabled('lucky-core-fix', state.core !== 'permissions' || refreshInProgress || backupInProgress || resetInProgress);
	setDisabled('lucky-core-upload', coreQueryInProgress || backupInProgress || resetInProgress);
	if (state.core === 'missing' || state.core === 'permissions' || state.core === 'unsafe')
		updateText('lucky-install', health[state.core], 'error');
	updateText('lucky-arch', state.arch);
	updateText('lucky-version', !state.infoReady && state.loading ? _('Collecting data…') : state.version);
	updateText('lucky-date', !state.infoReady && state.loading ? _('Collecting data…') : state.date);
	updateText('lucky-access-hint', state.infoReady && supportsLocalControl(state.version) ?
		_('Access settings apply without restarting a running Lucky. A stopped service stays stopped.') :
		_('Saving access settings briefly stops Lucky. It starts again only if it was running.'));
	updateText('lucky-internet', !state.configReady ? (state.loading ? _('Collecting data…') : '-') :
		(state.allowInternet === null ? _('Not reported by this core') : (state.allowInternet ? _('Allowed') : _('Local access only'))),
		state.configReady && state.allowInternet ? 'warning' : '');

	var port = document.getElementById('lucky-port');
	var safeURL = document.getElementById('lucky-safe-url');
	var internet = document.getElementById('lucky-allow-internet');
	if (port && updateInputs)
		port.value = state.port;
	if (safeURL && updateInputs)
		safeURL.value = state.safeURL;
	if (internet && updateInputs) {
		internet.checked = state.allowInternet === true;
		internet.indeterminate = state.allowInternet === null;
	}
	if (!state.configReady && !state.loading) {
		if (port) port.value = '';
		if (safeURL) safeURL.value = '';
		if (internet) { internet.checked = false; internet.indeterminate = false; }
	}

	setDisabled('lucky-port', !state.configReady);
	setDisabled('lucky-safe-url', !state.configReady);
	setDisabled('lucky-allow-internet', !state.configReady);
	setDisabled('lucky-save-port', !state.configReady || refreshInProgress);
	setDisabled('lucky-save-safe-url', !state.configReady || refreshInProgress);
	setDisabled('lucky-save-internet', !state.configReady || refreshInProgress);
	setDisabled('lucky-reset-auth', !state.configReady || refreshInProgress || resetInProgress);
	setDisabled('lucky-backup', !state.installed || refreshInProgress || resetInProgress || backupInProgress);
	setDisabled('lucky-restore', !state.installed || refreshInProgress || resetInProgress || backupInProgress);
	setDisabled('lucky-clear', !state.installed || refreshInProgress || resetInProgress || backupInProgress);
	updateRuntimeStatus();
	updateRuleEditors();
	updateWatchdog();
	if (actionInProgress) {
		[ 'lucky-refresh', 'lucky-save-port', 'lucky-save-safe-url', 'lucky-save-internet',
			'lucky-reset-auth', 'lucky-backup', 'lucky-restore', 'lucky-clear',
			'lucky-core-fix', 'lucky-core-upload' ].forEach(function(id) { setDisabled(id, true); });
	}
}

function archiveCall(operation, token) {
	// cgi-exec avoids ubus output/time limits. The long-running operation owns
	// service recovery, so it does not depend on a second browser request.
	var command = '/usr/libexec/lucky-backup ' + operation + (token ? ' ' + token : '');
	return request.post(L.env.cgi_base + '/cgi-exec',
		'sessionid=' + encodeURIComponent(rpc.getSessionID()) + '&command=' + encodeURIComponent(command), {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 0
		}).then(function(response) {
			if (response.status !== 200)
				throw new Error(_('Backup operation failed.'));
			var result = response.json();
			if (result.warning && operation !== 'configure')
				ui.addNotification(null, E('p', {}, result.warning), 'warning');
			if (!result.ok)
				throw new Error(result.error || _('Backup operation failed.'));
			return result;
		});
}

function coreMaintenance(upload) {
	if (backupInProgress || resetInProgress || actionInProgress || coreQueryInProgress || (!upload && refreshInProgress))
		return Promise.resolve();
	if (upload && !window.confirm(_('Upload a trusted Lucky Linux tar.gz release for this device. Only the core executable will be replaced; configuration is preserved. Continue?')))
		return Promise.resolve();
	var refreshPending = refreshInProgress || state.loading;
	// An upload can repair a missing or undetectable core. Discard late reads
	// from the old refresh so they cannot launch queries or undo its result.
	++refreshGeneration;
	refreshInProgress = false;
	state.loading = false;
	backupInProgress = true;
	var token, installedInfo, saved = [];
	// Refresh untouched fields when a valid cache becomes available, while
	// preserving edits made before maintenance started.
	var syncPort = !state.configReady || String(document.getElementById('lucky-port').value) === String(state.port);
	var syncSafeURL = !state.configReady || document.getElementById('lucky-safe-url').value === state.safeURL;
	var internetInput = document.getElementById('lucky-allow-internet');
	var syncInternet = !state.configReady || (state.allowInternet === null ? internetInput.indeterminate : internetInput.checked === state.allowInternet);
	Array.prototype.forEach.call(document.querySelectorAll('.lucky-page button, .lucky-page input, .lucky-page select'), function(node) {
		if (node.id && node.id.indexOf('lucky-diagnostics-') === 0) return;
		saved.push([node, node.disabled]); node.disabled = true;
	});
	return (upload ? archiveCall('core-prepare').then(function(result) {
		if (!/^[a-f0-9]{32}$/.test(result.token)) throw new Error(_('Backup operation failed.'));
		token = result.token;
		return ui.uploadFile('/tmp/lucky-luci-backup/' + token + '/core.tar.gz');
	}).then(function() {
		ui.showModal(_('Core maintenance'), [ E('p', { 'class': 'spinning' }, _('Checking core archive and architecture…')) ]);
		return archiveCall('core-check', token);
	}).then(function(info) {
		return new Promise(function(resolve) {
			ui.showModal(_('Replace core'), [
				E('p', {}, _('Core size: %s bytes').format(info.bytes)),
				E('p', {}, _('Lucky will stop before running the new core for validation. Only /usr/bin/lucky will be replaced; configuration is preserved. Success or failure restores the original running state.')),
				E('div', { 'class': 'right' }, [
					E('button', { 'type': 'button', 'class': 'btn', 'click': function() { resolve(false); } }, _('Cancel')), ' ',
					E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-negative', 'click': function() { resolve(true); } }, _('Stop, validate and replace'))
				])
			]);
		});
	}).then(function(confirmed) {
		if (!confirmed) return;
		ui.showModal(_('Core maintenance'), [ E('p', { 'class': 'spinning' }, _('Stopping Lucky, validating and replacing core…')) ]);
		return archiveCall('core-install', token).then(function(result) {
			installedInfo = { Version: result.version, Date: result.date || '-' };
			state.installed = state.infoReady = true;
			state.version = result.version;
			state.date = result.date || '-';
			ui.addNotification(null, E('p', {}, _('Core replaced: %s').format(result.version) + ' ' + (result.running ? _('Running') : _('Service remains stopped.'))), 'info');
		});
	}) : archiveCall('core-fix').then(function() {
		ui.addNotification(null, E('p', {}, _('Core execution permissions repaired.')), 'info');
	})).catch(notifyError).then(function() {
		return token ? archiveCall('cleanup', token).catch(notifyError) : null;
	}).then(function() {
		ui.hideModal();
		state.runtimeReady = false;
		state.error = null;
		updateRuntimeStatus();
		function unavailableCore() {
			state.installed = state.infoReady = state.configReady = false;
			state.version = state.date = '-';
		}
		function failed(err) {
			if (!state.error) state.error = err && err.message ? err.message : _('Unable to load Lucky data.');
			notifyError(err);
		}
		// Reuse the stopped-core probe's metadata. Running -info/-baseConfInfo
		// alongside the restarted service can OOM on 256 MiB devices.
		return Promise.all([
			refreshPending ? loadWatchdog() : null,
			refreshPending ? helper([ 'arch' ]).then(function(value) {
				state.arch = value || '-';
			}).catch(failed) : null,
			helper([ 'status' ]).then(function(value) {
				state.running = value === 'true'; state.runtimeReady = true;
			}).catch(failed),
			helper([ 'core-status' ], '/usr/libexec/lucky-backup').then(function(value) {
				var core = parseJSON(value, 'Core status');
				if (!core || !core.ok || [ 'ready', 'missing', 'permissions', 'unsafe' ].indexOf(core.status) === -1)
					throw new Error(core && core.error || _('Unable to inspect core.'));
				state.core = core.status;
				state.installed = core.status === 'ready';
				if (!state.installed) unavailableCore();
				else {
					// The core or configuration may have changed during maintenance.
					// Use only validated cache entries or this installation's probe.
					var info = core.info || installedInfo;
					state.infoReady = !!(info && typeof info.Version === 'string' && info.Version.length);
					state.version = state.infoReady ? info.Version : '-';
					state.date = state.infoReady ? info.Date || '-' : '-';
					state.configReady = false;
					if (core.base && core.base.BaseConfigure) applyBaseConfiguration(core.base);
				}
			}).catch(function(err) {
				state.core = 'unknown'; unavailableCore(); failed(err);
			})
		]).then(function() {
			backupInProgress = false;
			saved.forEach(function(item) { item[0].disabled = item[1]; });
			if (state.configReady) {
				if (syncPort) document.getElementById('lucky-port').value = state.port;
				if (syncSafeURL) document.getElementById('lucky-safe-url').value = state.safeURL;
				if (syncInternet) {
					internetInput.checked = state.allowInternet === true;
					internetInput.indeterminate = state.allowInternet === null;
				}
			}
			updateDashboard(false);
		});
	});
}

function confirmRestore(info, clearing) {
	return new Promise(function(resolve) {
		function choose(value) { ui.hideModal(); resolve(value); }
		function files(label, names) {
			names = Array.isArray(names) ? names : [];
			return E('details', { 'open': names.length ? '' : null }, [
				E('summary', {}, label + ' (' + names.length + ')'),
				E('pre', { 'class': 'lucky-archive-list' }, names.length ? names.join('\n') : _('None'))
			]);
		}
		ui.showModal(clearing ? _('Clear configuration') : _('Confirm full-directory restore'), [
			E('p', {}, _('Configuration directory: %s').format(info.directory)),
			E('p', {}, clearing ? _('This permanently deletes ALL files, including hidden files and subdirectories. Back up first. Lucky will remain stopped after clearing; start it manually to create fresh configuration.') : _('This will stop Lucky and replace ALL files in the saved configuration directory. Files absent from the backup will be deleted. Continue?')),
			files(_('Files to delete'), info.removed),
			clearing ? '' : files(_('Files to replace'), info.replaced),
			clearing ? '' : files(_('Files to create'), info.added),
			E('div', { 'class': 'right' }, [
				E('button', { 'type': 'button', 'class': 'btn', 'click': function() { choose(false); } }, _('Cancel')),
				' ', E('button', { 'type': 'button', 'class': 'btn cbi-button cbi-button-negative',
					'click': function() { choose(true); } }, clearing ? _('Confirm clear') : _('Confirm restore'))
			])
		]);
	});
}

function configurationArchive(restore) {
	var clearing = restore === 'clear';
	if (backupInProgress || refreshInProgress || resetInProgress)
		return Promise.resolve();
	if (!restore && !window.confirm(_('Lucky will be stopped while creating the backup. Continue?')))
		return Promise.resolve();
	backupInProgress = true;
	var token, savedButtons = [];
	Array.prototype.forEach.call(document.querySelectorAll('.lucky-page button, .lucky-page input, .lucky-page select'), function(node) {
		if (node.id && node.id.indexOf('lucky-diagnostics-') === 0) return;
		savedButtons.push([node, node.disabled]);
		node.disabled = true;
	});
	var status = document.getElementById('lucky-backup-status');
	status.textContent = clearing ? _('Checking configuration directory…') : restore ? _('Select a LuCI directory backup to restore.') : _('Stopping Lucky and creating backup…');
	if (!restore)
		ui.showModal(_('Configuration backup and restore'), [ E('p', { 'class': 'spinning' }, status.textContent) ]);
	return archiveCall('prepare').then(function(result) {
		if (!/^[a-f0-9]{32}$/.test(result.token))
			throw new Error(_('Backup operation failed.'));
		token = result.token;
		if (!restore) {
			return archiveCall('backup', token).then(function(result) {
				return fs.read_direct('/tmp/lucky-luci-backup/' + token + '/backup.zip', 'blob').then(function(blob) {
					var url = URL.createObjectURL(blob);
					var link = E('a', { href: url, download: result.filename });
					document.body.appendChild(link);
					link.click();
					link.parentNode.removeChild(link);
					window.setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
					ui.addNotification(null, E('p', {}, _('Configuration backup downloaded.')), 'info');
				});
			});
		}
		return (clearing ? archiveCall('clear-check', token) : ui.uploadFile('/tmp/lucky-luci-backup/' + token + '/upload.zip').then(function() {
			status.textContent = _('Checking backup…');
			ui.showModal(_('Configuration backup and restore'), [ E('p', { 'class': 'spinning' }, status.textContent) ]);
			return archiveCall('check', token);
		})).then(function(info) {
			return confirmRestore(info, clearing).then(function(confirmed) {
				if (!confirmed) return;
				status.textContent = clearing ? _('Stopping Lucky and clearing configuration…') : _('Stopping Lucky and restoring configuration…');
				ui.showModal(_('Configuration backup and restore'), [ E('p', { 'class': 'spinning' }, status.textContent) ]);
				return archiveCall(clearing ? 'clear' : 'restore', token).then(function() {
					ui.addNotification(null, E('p', {}, clearing ? _('Configuration cleared. Lucky remains stopped. Start it manually when ready.') : _('Configuration restored.')), 'info');
				});
			});
		});
	}).catch(notifyError).then(function() {
		return token ? archiveCall('cleanup', token).catch(notifyError) : null;
	}).then(function() {
		ui.hideModal();
		backupInProgress = false;
		savedButtons.forEach(function(item) { item[0].disabled = item[1]; });
		status.textContent = '';
		return loadState();
	});
}

function showResetCredentials(result) {
	ui.showModal(_('Admin credentials reset'), [
		E('p', {}, _('Internet access was disabled before the credentials were changed.')),
		result.restarted ? '' : E('p', { 'class': 'alert-message warning' },
			_('Lucky could not restart automatically. Restart it manually after saving this password.')),
		E('p', {}, [ E('strong', {}, _('Account:')), ' ' + result.account ]),
		E('p', {}, [ E('strong', {}, _('New password:')), ' ', E('code', {}, result.password) ]),
		E('div', { 'class': 'right' }, [
			E('button', {
				'class': 'btn cbi-button cbi-button-primary',
				'type': 'button',
				'click': ui.hideModal
			}, _('Close'))
		])
	]);

	return loadState();
}

function resetCredentials() {
	if (resetInProgress)
		return Promise.resolve();

	resetInProgress = true;
	setDisabled('lucky-refresh', true);
	setDisabled('lucky-reset-auth', true);
	return helper([ 'reset-auth' ]).then(function(output) {
		var result = parseJSON(output, 'lucky-call reset-auth');
		if (result.account !== 'admin' || !/^[0-9a-f]{24}$/.test(result.password) || typeof result.restarted !== 'boolean')
			throw new Error(_('Lucky returned an invalid temporary password.'));
		return showResetCredentials(result);
	}).catch(notifyError).then(function() {
		resetInProgress = false;
		setDisabled('lucky-refresh', refreshInProgress);
		setDisabled('lucky-reset-auth', !state.configReady || refreshInProgress);
	});
}

var ruleEditors = {};
var tabNames = ['overview', 'rules', 'maintenance'];
function selectTab(name) {
 tabNames.forEach(function(key) {
  var button = document.getElementById('lucky-tab-' + key);
  var panel = document.getElementById('lucky-tab-panel-' + key);
  button.setAttribute('aria-selected', key === name ? 'true' : 'false');
  button.setAttribute('tabindex', key === name ? '0' : '-1');
  panel.hidden = key !== name;
 });
}
function supportsAllowlist() {
 var v = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(state.version);
 return !!v && (Number(v[1]) > 3 || (Number(v[1]) === 3 && Number(v[2]) >= 1));
}
function updateRuleEditors() {
 ['localips', 'allowlist'].forEach(function(key) {
  var editor = ruleEditors[key]; if (!editor) return;
  var allowed = key === 'localips' || supportsAllowlist();
  var busy = backupInProgress || refreshInProgress || resetInProgress;
  setDisabled('lucky-rules-load-' + key, busy || !allowed);
  setDisabled('lucky-rules-save-' + key, busy || !allowed || !editor.token);
  setDisabled('lucky-rules-text-' + key, busy || !allowed || !editor.token);
  setDisabled('lucky-rules-defaults-' + key, busy || !editor.token);
  if (!allowed) updateText('lucky-rules-status-' + key, _('Requires Lucky 3.1.0 or later; refresh core information after upgrading.'));
  else if (editor.blocked) updateText('lucky-rules-status-' + key, '');
  editor.blocked = !allowed;
 });
}
function rulesAction(key, save) {
 var editor = ruleEditors[key];
 if (backupInProgress || refreshInProgress || resetInProgress) return Promise.resolve();
 if (!save && editor.dirty && !window.confirm(_('Discard unsaved rule changes and reload?'))) return Promise.resolve();
 backupInProgress = true; updateDashboard(false);
 var task;
 if (save) {
  var content = document.getElementById('lucky-rules-text-' + key).value;
  task = fs.write('/tmp/lucky-luci-backup/' + editor.token + '/rules.json', JSON.stringify({content: content})).then(function() {
   return archiveCall('rules-save', editor.token);
  }).then(function() {
   editor.dirty = false;
   updateText('lucky-rules-status-' + key, _('Saved. Lucky loads rule changes automatically; older cores may need a restart after clearing localips.'));
   return archiveCall('cleanup', editor.token).then(function() { editor.token = null; });
  });
 } else {
  task = (editor.token ? archiveCall('cleanup', editor.token) : Promise.resolve()).then(function() {
   editor.token = null;
   return archiveCall('rules-' + key);
  }).then(function(result) {
   editor.token = result.token; editor.dirty = false;
   document.getElementById('lucky-rules-text-' + key).value = result.content;
   updateText('lucky-rules-path-' + key, result.directory + '/' + result.name);
   updateText('lucky-rules-status-' + key, _('Loaded from the saved configuration directory.'));
  });
 }
 return task.catch(notifyError).then(function() { backupInProgress = false; updateDashboard(false); });
}
function ruleEditor(key, title, description, format) {
 ruleEditors[key] = {token: null, dirty: false};
 return E('section', {'class':'cbi-section lucky-panel lucky-rule-panel', 'aria-label':title}, [
  E('div', {'class':'lucky-panel-heading'}, [panelTitle(title), E('code', {'class':'lucky-file-name'}, key === 'allowlist' ? 'ip-allowlist.txt' : 'localips')]),
  E('p', {'class':'lucky-hint lucky-rule-description'}, description),
  E('div', {'id':'lucky-rules-path-' + key, 'class':'lucky-value lucky-file-path'}),
  E('label', {'for':'lucky-rules-text-' + key}, _('File contents')),
  E('textarea', {'id':'lucky-rules-text-' + key, 'class':'lucky-rules-text', 'rows':10, 'spellcheck':'false', 'disabled':true,
   'input':function() { ruleEditors[key].dirty = true; }}),
  E('div', {'class':'lucky-actions'}, [
   E('button', {'type':'button','id':'lucky-rules-save-' + key,'class':'btn cbi-button cbi-button-save', 'click':function() { return rulesAction(key,true); }}, _('Save file')),
   E('button', {'type':'button','id':'lucky-rules-load-' + key,'class':'btn cbi-button', 'click':function() { return rulesAction(key,false); }}, _('Load / Reload')),
   key === 'localips' ? E('button', {'type':'button','id':'lucky-rules-defaults-' + key,'class':'btn cbi-button','click':function() {
    document.getElementById('lucky-rules-text-localips').value = '10.0.0.0/8\n172.16.0.0/12\n169.254.0.0/16\n192.168.0.0/16\n'; ruleEditors.localips.dirty = true;
   }}, _('Fill default networks')) : ''
  ]),
  E('p', {'id':'lucky-rules-status-' + key,'class':'lucky-hint','role':'status','aria-live':'polite'}),
  E('details', {'class':'lucky-format-help'}, [
   E('summary', {}, _('Format and behavior')),
   E('p', {'class':'lucky-hint'}, format)
  ])
 ]);
}

var diagnosticsBusy = false, diagnosticsLoaded = false;
function readDiagnostics() {
	if (diagnosticsBusy) return Promise.resolve();
	diagnosticsBusy = true;
	setDisabled('lucky-diagnostics-refresh', true);
	setDisabled('lucky-diagnostics-copy', true);
	var status = document.getElementById('lucky-diagnostics-status');
	var output = document.getElementById('lucky-diagnostics-text');
	status.textContent = _('Reading recent logs…');
	return helper([ 'read' ], '/usr/libexec/lucky-diagnostics').then(function(value) {
		var data = parseJSON(value, 'Lucky diagnostics');
		if (!data || !Array.isArray(data.sources)) throw new Error(_('Unable to read diagnostics.'));
		var labels = { oom: _('OOM: Lucky was selected for termination'), crash: _('Crash evidence'),
			restart_loop: _('Repeated exits / restart limit'), exit: _('Exit record; cause unknown') };
		var sourceStatus = { ok: _('Read successfully'), unavailable: _('Tool unavailable'),
			failed: _('Read failed or permission denied'), timeout: _('Read timed out; results may be incomplete'),
			limited: _('Scan limit reached; results may be incomplete') };
		var events = Array.isArray(data.events) ? data.events : [];
		var lines = data.sources.map(function(source) {
			return source.name + ': ' + (sourceStatus[source.status] || _('Unable to read diagnostics.')) +
				(source.truncated ? ' · ' + _('Only a bounded recent excerpt is retained.') : '');
		});
		lines.push('', events.length ? _('Related excerpts: %s').format(events.length) : _('No matching records found; this does not rule out an unexpected exit.'));
		events.forEach(function(event) {
			lines.push('', '[' + event.source + ' · ' + (labels[event.kind] || _('Exit record; cause unknown')) + ']', event.text);
		});
		output.value = lines.join('\n');
		status.textContent = _('Last read: %s').format(new Date().toLocaleString());
		diagnosticsLoaded = true;
	}).catch(function(err) {
		status.textContent = _('Unable to read diagnostics.') + ' ' + (err.message || '');
		// Clear stale data so it cannot be mistaken for a successful fresh read.
		output.value = '';
		diagnosticsLoaded = false;
	}).then(function() {
		diagnosticsBusy = false;
		setDisabled('lucky-diagnostics-refresh', false);
		setDisabled('lucky-diagnostics-copy', !output.value);
	});
}

function copyDiagnostics() {
	var output = document.getElementById('lucky-diagnostics-text');
	var status = document.getElementById('lucky-diagnostics-status');
	function fallback() {
		output.focus(); output.select();
		var copied = false;
		try { copied = document.execCommand('copy'); } catch (e) {}
		status.textContent = copied ? _('Logs copied.') : _('Logs selected. Use your browser copy command.');
	}
	if (!output.value || diagnosticsBusy) return;
	// LuCI is frequently served over HTTP, where the Clipboard API is absent.
	if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText)
		return navigator.clipboard.writeText(output.value).then(function() { status.textContent = _('Logs copied.'); }).catch(fallback);
	fallback();
}

function diagnosticsPanel() {
	return E('section', { 'class': 'cbi-section lucky-panel lucky-diagnostics-panel' }, [
		E('details', { 'class': 'lucky-diagnostics', 'id': 'lucky-diagnostics', 'toggle': function() {
			if (this.open && !diagnosticsLoaded) return readDiagnostics();
		} }, [
			E('summary', {}, _('Recent unexpected exit logs')),
			E('p', { 'class': 'lucky-hint' }, _('Read on demand only. Reboots or log rotation can erase records. These excerpts do not prove the cause of the latest stop; service actions can also produce exit records.')),
			E('p', { 'class': 'lucky-hint' }, _('Each source keeps its own log order and timestamps. Excerpts and stack traces may be shortened. Check for private information before sharing.')),
			E('div', { 'class': 'lucky-actions' }, [
				E('button', { 'type': 'button', 'id': 'lucky-diagnostics-refresh', 'class': 'btn cbi-button', 'click': readDiagnostics }, _('Refresh logs')),
				E('button', { 'type': 'button', 'id': 'lucky-diagnostics-copy', 'class': 'btn cbi-button', 'disabled': true, 'click': copyDiagnostics }, _('Copy logs'))
			]),
			E('p', { 'id': 'lucky-diagnostics-status', 'class': 'lucky-hint', 'role': 'status', 'aria-live': 'polite' }, _('Expand to read recent logs.')),
			E('textarea', { 'id': 'lucky-diagnostics-text', 'class': 'lucky-rules-text lucky-log-text', 'readonly': true, 'rows': 14, 'spellcheck': false, 'aria-label': _('Recent unexpected exit logs') })
		])
	]);
}

function recoveryPanel() {
	return E('section', { 'class': 'cbi-section lucky-panel lucky-recovery', 'aria-label': _('Recover after unexpected exit') }, [
		E('div', { 'class': 'lucky-watchdog-row' }, [
			E('div', { 'class': 'lucky-recovery-copy' }, [
				E('label', { 'id': 'lucky-watchdog-label', 'for': 'lucky-watchdog-toggle' }, _('Recover after unexpected exit')),
				E('p', { 'id': 'lucky-watchdog-status', 'class': 'lucky-hint', 'role': 'status', 'aria-live': 'polite' }, _('Collecting data…'))
			]),
			E('button', { 'type': 'button', 'id': 'lucky-watchdog-toggle', 'class': 'btn cbi-button', 'role': 'switch', 'aria-checked': 'false', 'aria-busy': 'false', 'aria-labelledby': 'lucky-watchdog-label', 'aria-describedby': 'lucky-watchdog-status', 'disabled': true, 'click': toggleWatchdog }, [
				E('span', { 'class': 'lucky-switch-track', 'aria-hidden': 'true' }),
				E('span', { 'id': 'lucky-watchdog-text' }, _('Recovery disabled'))
			])
		]),
		E('details', { 'class': 'lucky-format-help' }, [
			E('summary', {}, _('Recovery behavior')),
			E('p', { 'class': 'lucky-hint' }, _('Adds a fallback to system supervision. Manual stop and maintenance pause recovery. Uninstalling the Lucky core package removes its scheduled task.'))
		])
	]);
}

function renderPage(formNode) {
	var layout = 'columns';
	try {
		if (window.localStorage.getItem('luci-app-lucky.layout') === 'stacked')
			layout = 'stacked';
	}
	catch (e) { /* Browser storage may be unavailable. Keep the default layout. */ }
	var dashboard = E('div', { 'class': 'lucky-dashboard' }, [
		// LuCI versions its view scripts, but custom stylesheet URLs need their own revision.
		E('link', { 'rel': 'stylesheet', 'href': L.resource('view/lucky/config.css') }),
		E('div', { 'class': 'lucky-toolbar' }, [
		E('div', {'class':'lucky-tabs','role':'tablist','aria-label':_('Lucky sections')}, tabNames.map(function(key, index) {
			return E('button', {'type':'button','id':'lucky-tab-' + key,'role':'tab','aria-controls':'lucky-tab-panel-' + key,'aria-selected':index === 0 ? 'true' : 'false','tabindex':index === 0 ? '0' : '-1','click':function() { selectTab(key); },'keydown':function(event) {
				var next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
				if (next >= 0) { event.preventDefault(); selectTab(tabNames[next]); document.getElementById('lucky-tab-' + tabNames[next]).focus(); }
			}}, [_('Overview'), _('Access rules'), _('Maintenance')][index]);
		})),
			E('div', { 'class': 'lucky-toolbar-actions' }, [
				E('div', { 'class': 'lucky-layout-control' }, [
					E('label', { 'for': 'lucky-layout' }, _('Layout')),
					E('select', {
						'id': 'lucky-layout',
						'change': function(event) {
							var value = event.target.value === 'stacked' ? 'stacked' : 'columns';
							// Reflow existing panels without reloading data or discarding edits.
							page.setAttribute('data-layout', value);
							try { window.localStorage.setItem('luci-app-lucky.layout', value); }
							catch (e) { /* The selection still applies for this page. */ }
						}
					}, [
						E('option', { 'value': 'columns', 'selected': layout === 'columns' ? '' : null }, _('Side by side')),
						E('option', { 'value': 'stacked', 'selected': layout === 'stacked' ? '' : null }, _('Vertical'))
					])
				]),
				E('button', {
					'class': 'btn cbi-button lucky-refresh', 'id': 'lucky-refresh', 'type': 'button',
					'click': function() { return loadState(); }
				}, _('Refresh'))
			])
		]),
		E('div', {'id':'lucky-tab-panel-overview','role':'tabpanel','aria-labelledby':'lucky-tab-overview'}, [
		E('div', { 'class': 'lucky-overview-layout' }, [
		E('section', { 'class': 'cbi-section lucky-panel lucky-service-panel', 'aria-label': _('Service overview') }, [
			E('div', { 'class': 'lucky-panel-heading' }, [
				panelTitle(_('Service overview')),
				E('div', { 'role': 'status', 'aria-live': 'polite' }, [
					E('span', { 'class': 'lucky-sr-only' }, _('Running status') + ': '),
					E('span', { 'id': 'lucky-running', 'class': 'lucky-value' }, _('Collecting data…'))
				])
			]),
			E('div', { 'class': 'lucky-stats', 'role': 'status', 'aria-live': 'polite' }, [
				textRow(_('Installation status'), 'lucky-install'),
				textRow(_('Lucky version'), 'lucky-version'),
				textRow(_('Package architecture'), 'lucky-arch'),
				textRow(_('Build date'), 'lucky-date')
			]),
			E('div', { 'class': 'lucky-actions lucky-service-actions' }, [
				serviceButton(_('Start'), 'cbi-button-apply', 'start'),
				serviceButton(_('Restart'), '', 'restart'),
				serviceButton(_('Stop'), 'cbi-button-negative', 'stop')
			])
		]),
		E('section', { 'class': 'cbi-section lucky-panel lucky-admin-panel', 'aria-label': _('Admin panel') }, [
			panelTitle(_('Admin panel')),
			E('p', { 'class': 'lucky-hint lucky-panel-intro' }, _('Open Lucky to manage its services and rules.')),
			textRow(_('Admin access policy'), 'lucky-internet'),
			E('a', {
				'class': 'btn cbi-button cbi-button-action lucky-admin-link',
				'id': 'lucky-admin-link',
				'target': '_blank',
				'rel': 'noopener noreferrer',
				'aria-disabled': 'true',
				'tabindex': '-1'
			}, _('Available when the service is running')),
			E('div', { 'id': 'lucky-admin-address', 'class': 'lucky-value' }),
			E('details', { 'class': 'lucky-settings' }, [
				E('summary', {}, _('Access settings')),
				E('p', { 'class': 'lucky-hint', 'id': 'lucky-access-hint' }),
				E('div', { 'class': 'lucky-inline' }, [
					E('label', { 'for': 'lucky-port' }, _('Admin HTTP port')),
					E('input', { 'id': 'lucky-port', 'class': 'cbi-input-text', 'type': 'number', 'min': '1', 'max': '65535' }),
					E('button', {
						'class': 'btn cbi-button cbi-button-save',
						'id': 'lucky-save-port',
						'type': 'button',
						'click': function() {
							var port = document.getElementById('lucky-port').value;
							if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
								notifyError(new Error(_('Enter a port from 1 to 65535.')));
								return;
							}
							action([ 'set-port', port ], _('Admin port saved.'));
						}
					}, _('Save'))
				]),
				E('div', { 'class': 'lucky-inline' }, [
					E('label', { 'for': 'lucky-safe-url' }, _('Admin safe URL')),
					E('input', { 'id': 'lucky-safe-url', 'class': 'cbi-input-text', 'type': 'text', 'maxlength': '256', 'placeholder': '/secret-path' }),
					E('button', {
						'class': 'btn cbi-button cbi-button-save',
						'id': 'lucky-save-safe-url',
						'type': 'button',
						'click': function() {
							var value = document.getElementById('lucky-safe-url').value;
							if (value && (value.charAt(0) !== '/' || /\s/.test(value))) {
								notifyError(new Error(_('The safe URL must be empty or begin with / and contain no spaces.')));
								return;
							}
							action([ 'set-safe-url', value ], _('Admin safe URL saved.'));
						}
					}, _('Save'))
				]),
				E('div', { 'class': 'lucky-inline' }, [
					E('label', { 'for': 'lucky-allow-internet' }, _('Allow Internet access to the admin panel')),
					E('input', { 'id': 'lucky-allow-internet', 'type': 'checkbox' }),
					E('button', {
						'class': 'btn cbi-button cbi-button-save',
						'id': 'lucky-save-internet',
						'type': 'button',
						'click': function() {
							var enabled = document.getElementById('lucky-allow-internet').checked;
							if (enabled && !window.confirm(_('Exposing the admin panel to the Internet increases risk. Continue?')))
								return;
							action([ 'set-internet', enabled ? 'true' : 'false' ], _('Admin access policy saved.'));
						}
					}, _('Save'))
				]),
				E('div', { 'class': 'lucky-reset' }, [
					E('p', { 'class': 'lucky-hint' }, _('Only reset credentials if you cannot sign in.')),
					E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'id': 'lucky-reset-auth',
						'type': 'button',
						'click': function() {
							if (window.confirm(_('Reset the Lucky admin account and generate a new password?')))
								resetCredentials();
						}
					}, _('Reset admin credentials'))
				])
			])
		])
		]),
		recoveryPanel()
		]),
		E('div', {'id':'lucky-tab-panel-rules','role':'tabpanel','aria-labelledby':'lucky-tab-rules','hidden':true}, [
			E('p', {'class':'lucky-tab-description'}, _('Included in full-directory backups. One entry per line; limit 64 KiB. Load before editing.')),
			E('div', {'class':'lucky-rules-layout'}, [
				ruleEditor('allowlist', _('Absolute IP allowlist'), _('Allow individual IPs before the global blacklist. Requires Lucky 3.1.0 or later.'), _('Absolute IP allowlist, ahead of the global blacklist. Single IP addresses only; # starts a comment line. No CIDR, domains or ports. Only direct peers are matched; login and other protections remain active.')),
				ruleEditor('localips', _('LAN networks'), _('Define local IPs and networks. A non-empty file replaces the built-in networks.'), _('Custom LAN IPs and CIDR networks replace built-in networks. Do not add public networks unless intended. Fill defaults to restore the standard LAN ranges.'))
			])
		]),
		E('div', {'id':'lucky-tab-panel-maintenance','role':'tabpanel','aria-labelledby':'lucky-tab-maintenance','hidden':true}, [
		E('div', { 'class': 'lucky-maintenance-layout' }, [
		E('section', { 'class': 'cbi-section lucky-panel lucky-core-panel', 'aria-label': _('Core maintenance') }, [
			panelTitle(_('Core maintenance')),
			textRow(_('Core file status'), 'lucky-core-health'),
			E('p', { 'class': 'lucky-hint' }, _('Repair missing execution permissions, or upload a trusted Lucky Linux tar.gz release to install or replace the core. Configuration is preserved. Archive limit: 64 MiB.')),
			E('div', { 'class': 'lucky-actions' }, [
				E('button', { 'type': 'button', 'id': 'lucky-core-fix', 'class': 'btn cbi-button', 'click': function() { return coreMaintenance(false); } }, _('Repair execution permissions')),
				E('button', { 'type': 'button', 'id': 'lucky-core-upload', 'class': 'btn cbi-button cbi-button-action', 'click': function() { return coreMaintenance(true); } }, _('Upload core'))
			])
		]),
		E('section', { 'class': 'cbi-section lucky-panel lucky-backup-panel', 'aria-label': _('Configuration and backups') }, [
			panelTitle(_('Configuration and backups')),
			E('p', { 'class': 'lucky-hint' }, _('Back up every file in the saved configuration directory. Restore replaces the entire directory. Lucky is stopped during the operation and restarted only if it was running.')),
			E('div', { 'class': 'lucky-actions' }, [
				E('button', { 'type': 'button', 'id': 'lucky-backup', 'class': 'btn cbi-button cbi-button-action',
					'click': function() { return configurationArchive(false); } }, _('Download backup')),
				E('button', { 'type': 'button', 'id': 'lucky-restore', 'class': 'btn cbi-button',
					'click': function() { return configurationArchive(true); } }, _('Restore backup')),
			]),
			E('details', { 'class': 'lucky-format-help' }, [
				E('summary', {}, _('Backup format and restore requirements')),
				E('p', { 'class': 'lucky-hint' }, _('Only LuCI full-directory ZIP backups are supported here, not backups exported by the Lucky admin panel. ZIP limit: 64 MiB; up to 10000 entries.')),
				E('p', { 'class': 'lucky-hint' }, _('Restore is allowed only into an empty directory or one containing a regular .lkcf file at its root. You will review the file changes before confirming.'))
			]),
			E('details', { 'class': 'lucky-settings lucky-config' }, [
				E('summary', {}, _('Configuration directory')),
				E('p', { 'class': 'lucky-hint' }, _('Backups and rule files use the saved directory. Save and apply directory changes separately.')),
				E('div', { 'class': 'lucky-config-form' }, [formNode, E('div', { 'id': 'lucky-config-actions' })])
			]),
			E('details', { 'class': 'lucky-settings lucky-danger-settings' }, [
				E('summary', {}, _('Clear configuration')),
				E('div', { 'class': 'lucky-danger-row' }, [
					E('p', { 'class': 'lucky-hint' }, _('Clearing removes every configuration file and leaves Lucky stopped.')),
					E('button', { 'type': 'button', 'id': 'lucky-clear', 'class': 'btn cbi-button cbi-button-negative',
						'click': function() { return configurationArchive('clear'); } }, _('Clear configuration'))
				])
			]),
			E('p', { 'id': 'lucky-backup-status', 'class': 'lucky-hint', 'role': 'status', 'aria-live': 'polite' })
		])
		]),
		diagnosticsPanel()
		])
	]);

	var page = E('div', { 'class': 'cbi-map lucky-page', 'id': 'lucky-page', 'data-layout': layout }, [
		E('h2', {}, _('Lucky')),
		E('div', { 'class': 'cbi-map-descr' }, _('Service and admin panel')),
		dashboard
	]);

	Array.prototype.forEach.call(dashboard.querySelectorAll('button, input'), function(node) {
		if (node.id && node.id !== 'lucky-core-upload' && node.id.indexOf('lucky-') === 0 && node.id.indexOf('lucky-tab-') !== 0 && node.id.indexOf('lucky-diagnostics-') !== 0) node.disabled = true;
	});
	// Do not hold LuCI's view loader open while starting the Lucky binary.
	window.setTimeout(loadState, 0);
	return page;
}

return view.extend({
	addFooter: function() {
		// Keep LuCI's native save/apply handlers, beside the only UCI form.
		var footer = this.super('addFooter', arguments);
		var actions = document.getElementById('lucky-config-actions');
		if (!actions) return footer;
		actions.appendChild(footer);
		return E([]);
	},
	render: function() {
		if (refreshCachedMenu())
			return E('p', { 'class': 'spinning' }, _('Refreshing…'));
		var map = new form.Map('lucky');
		// Native LuCI saves the directory through UCI. Lua-only LuCI performs
		// the same invalidation in its config endpoint instead.
		if (typeof map.save === 'function') {
			var save = map.save;
			map.save = function() {
				return Promise.resolve(save.apply(this, arguments)).then(function(result) {
					return helper([ 'base-invalidate' ], '/usr/libexec/lucky-backup').then(function(value) {
						var cleared = parseJSON(value, 'Base cache invalidation');
						if (!cleared || !cleared.ok) throw new Error(cleared && cleared.error || _('The operation failed.'));
						return result;
					});
				});
			};
		}
		var section = map.section(form.TypedSection, 'lucky');
		section.anonymous = true;
		section.addremove = false;

		var option = section.option(form.Value, 'configdir', _('Configuration directory'));
		option.default = '/etc/config/lucky.daji';
		option.rmempty = false;
		option.validate = function(sectionId, value) {
			if (!value || value.charAt(0) !== '/' || value.length > 512 || /[\x00-\x1f\x7f]/.test(value))
				return _('The configuration directory must be a safe absolute path.');
			if (value === '/' || /^\/\//.test(value) || /^\/(proc|sys|dev|run)(\/|$)/.test(value) || /\/\.\.?($|\/)/.test(value))
				return _('This configuration directory is not allowed.');
			return true;
		};

		return map.render().then(renderPage);
	}
});
