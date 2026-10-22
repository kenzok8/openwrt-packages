'use strict';
'require baseclass';
'require rpc';
'require ui';
'require poll';

var callGet = rpc.declare({ object: 'luci.argon_update', method: 'get', expect: { '': {} }, raise: true });
var callCheck = rpc.declare({ object: 'luci.argon_update', method: 'check', expect: { '': {} }, raise: true });
var callStatus = rpc.declare({ object: 'luci.argon_update', method: 'status', expect: { '': {} }, raise: true });
var callStart = rpc.declare({ object: 'luci.argon_update', method: 'start', params: ['tag', 'package'], expect: { '': {} }, raise: true });
var releases = 'https://github.com/jerrykuku/luci-theme-argon/releases';

function version(value) {
	if (typeof value !== 'string' || value.length > 80)
		return null;
	var m = value.match(/^v?([0-9]+(?:\.[0-9]+){1,3})(?:(?:~|_)(alpha|beta|rc)([0-9]+)|-(alpha|beta|rc)\.([0-9]+))?(?:-r?([0-9]+))?$/);
	if (!m)
		return null;
	var parts = m[1].split('.').map(Number);
	while (parts.length < 4)
		parts.push(0);
	parts.push(m[2] || m[4] ? { alpha: 0, beta: 1, rc: 2 }[m[2] || m[4]] : 3);
	parts.push(Number(m[3] || m[5] || 0), Number(m[6] || 1));
	return parts.every(function(n) { return Number.isSafeInteger(n); }) ? parts : null;
}

function compare(a, b) {
	for (var i = 0; i < a.length; i++) {
		if (a[i] !== b[i])
			return a[i] < b[i] ? -1 : 1;
	}
	return 0;
}

function release(state) {
	if (!state || typeof state.tag !== 'string' || !/^v?[0-9]+(?:\.[0-9]+){1,3}$/.test(state.tag))
		return null;
	var manager = state.package_manager;
	var file = state[manager === 'opkg' ? 'ipk' : 'apk'];
	var match = typeof file === 'string' && (manager === 'opkg' ?
		file.match(/^luci-theme-argon_([0-9][0-9.~a-z-]*)_all\.ipk$/) : manager === 'apk' ?
			file.match(/^luci-theme-argon-([0-9][0-9._a-z-]*)\.apk$/) : null);
	var parsed = match && version(match[1]);
	var tag = version(state.tag);
	if (!parsed || !tag || parsed[4] !== 3 || parsed.slice(0, 4).join('.') !== tag.slice(0, 4).join('.'))
		match = null;
	return { tag: state.tag, file: match ? file : null, version: match ? match[1] : state.tag,
		parsed: match ? parsed : null };
}

return baseclass.extend({
	load: function() {
		return callGet().catch(function() { return null; });
	},

	render: function(state, map) {
		var loadedVersion = state && state.current_version;
		var observedInstallation = !!(state && state.upgrade && state.upgrade.active);
		var lastPhase = state && state.upgrade && state.upgrade.phase;
		var busy = false;
		var monitoring = false;
		var confirming = false;
		var starting = false;
		var attached = false;
		var current = E('dd');
		var latest = E('dd');
		var statusIcon = E('span', { 'class': 'argon-update-status-icon', 'aria-hidden': 'true', 'hidden': true }, '✓');
		var statusText = E('span');
		var status = E('p', { 'class': 'argon-update-status', 'role': 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, [statusIcon, statusText]);
		var checked = E('p', { 'class': 'argon-update-checked' });
		var notes = E('pre', { 'class': 'argon-update-notes' });
		var details = E('details', { 'class': 'argon-update-details', 'hidden': true }, [
			E('summary', {}, _('Release notes')), notes
		]);
		var releaseLink = E('a', { 'class': 'cbi-button cbi-button-neutral', 'href': releases + '/latest', 'target': '_blank', 'rel': 'noopener noreferrer' }, _('View release'));
		var downloadLink = E('a', { 'class': 'cbi-button cbi-button-neutral', 'hidden': true, 'target': '_blank', 'rel': 'noopener noreferrer' }, _('Download package'));
		var button = E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-action', 'click': check }, _('Check for updates'));
		var installButton = E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-action', 'hidden': true, 'click': confirmInstall }, _('Update now'));
		var reloadButton = E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-neutral', 'hidden': true,
			'click': function() { window.location.reload(); } }, _('Reload page'));
		var installHint = E('p', { 'class': 'argon-update-checked', 'hidden': true },
			_('Automatic installation is unavailable. Download the package to update manually.'));
		var installLog = E('pre', { 'class': 'argon-update-notes' });
		var logDetails = E('details', { 'class': 'argon-update-details', 'hidden': true }, [
			E('summary', {}, _('Installation log')), installLog
		]);
		var content = E('div', { 'class': 'argon-update-content' }, [
			status,
			E('dl', { 'class': 'argon-update-versions' }, [
				E('div', {}, [E('dt', {}, _('Current version')), current]),
				E('div', {}, [E('dt', {}, _('Latest stable version')), latest])
			]),
			E('div', { 'class': 'argon-update-actions' }, [button, installButton, reloadButton, releaseLink, downloadLink]),
			installHint, checked, logDetails, details
		]);

		function needsReload() {
			return !!(state && state.upgrade && state.upgrade.phase === 'complete' &&
				(observedInstallation || loadedVersion && state.current_version !== loadedVersion));
		}

		function showStatus(message, kind) {
			statusText.textContent = message;
			status.setAttribute('data-state', kind || 'idle');
			statusIcon.hidden = kind !== 'current' && kind !== 'complete';
		}

		function checkError(retryAt) {
			var message = _('Unable to check for updates. Check the router\'s network connection and try again.');
			if (Number.isSafeInteger(retryAt) && retryAt > Date.now() / 1000)
				message += ' ' + _('Try again after %s.').format(new Date(retryAt * 1000).toLocaleTimeString());
			return message;
		}

		function mayInstall() {
			var remote = release(state);
			var local = version(state && state.current_version);
			return !!(remote && remote.file && remote.parsed && local && compare(local, remote.parsed) < 0 &&
				state.can_upgrade && map && !map.readonly && !needsReload());
		}

		function refresh() {
			var remote = release(state);
			var local = version(state && state.current_version);
			var job = state && state.upgrade || {};
			if (job.active)
				observedInstallation = true;
			var active = !!job.active || monitoring;
			var order = remote && remote.parsed && local ? compare(local, remote.parsed) : null;
			var available = order !== null && order < 0;
			var reloadNeeded = needsReload();
			if (job.phase === 'complete' && lastPhase !== 'complete') {
				details.open = false;
				logDetails.open = false;
			}
			lastPhase = job.phase;
			current.textContent = state && state.current_version || _('Unknown version');
			latest.textContent = remote ? remote.version : _('Not checked yet.');
			button.disabled = busy || active || confirming;
			button.className = 'cbi-button ' + (remote ? 'cbi-button-neutral' : 'cbi-button-action');
			installButton.hidden = !mayInstall();
			installButton.disabled = busy || active || confirming;
			installHint.hidden = !(available && !state.can_upgrade && map && !map.readonly && !active && !reloadNeeded);
			reloadButton.hidden = !reloadNeeded || active;
			button.textContent = busy ? _('Checking for updates...') : _('Check for updates');
			content.setAttribute('aria-busy', String(busy));
			releaseLink.href = remote ? releases + '/tag/' + encodeURIComponent(remote.tag) : releases + '/latest';
			downloadLink.hidden = !(remote && remote.file) || active || reloadNeeded || order !== null && order >= 0;
			if (!downloadLink.hidden)
				downloadLink.href = releases + '/download/' + encodeURIComponent(remote.tag) + '/' + encodeURIComponent(remote.file);
			checked.hidden = !(remote && Number.isSafeInteger(state.checked_at) && state.checked_at > 0);
			if (!checked.hidden)
				checked.textContent = _('Last checked: %s').format(new Date(state.checked_at * 1000).toLocaleString());
			details.hidden = !remote;
			notes.textContent = remote && typeof state.notes === 'string' && state.notes.trim() ?
				state.notes.slice(0, 32768) + (state.notes.length > 32768 ? '\n…' : '') : _('No release notes were published.');
			logDetails.hidden = typeof job.log !== 'string' || !job.log.trim();
			installLog.textContent = typeof job.log === 'string' ? job.log.slice(-8192) : '';
			if (active || job.phase === 'failed' || reloadNeeded)
				showStatus(jobMessage(job), active ? 'working' : reloadNeeded ? 'complete' : 'error');
			else if (busy)
				showStatus(_('Checking for updates...'), 'working');
			else if (!state || state.result !== 0)
				showStatus(checkError(state && state.retry_at), 'error');
			else if (!remote)
				showStatus(_('Not checked yet.'));
			else if (!local || !remote.parsed)
				showStatus(_('Unable to compare this version. View the release for details.'));
			else
				showStatus(order < 0 ? _('Update available.') : order === 0 ?
					_('Your theme is up to date.') : _('The installed version is newer than the latest stable release.'),
					order === 0 ? 'current' : available ? 'available' : 'idle');
		}

		function jobMessage(job) {
			var phases = {
				starting: _('Preparing the update...'),
				downloading: _('Downloading the update...'),
				verifying: _('Verifying the package...'),
				installing: _('Installing the update. Please wait...'),
				complete: _('Update installed. Reload the page to use the new version.')
			};
			var errors = {
				network: _('Download failed. Check the router\'s connection to GitHub and try again.'),
				checksum: _('Package verification failed. Check for updates and try again.'),
				space: _('Not enough free space to install the update.'),
				version: _('The installed version has changed. Check for updates again.'),
				metadata: _('Release information has changed or expired. Check for updates again.'),
				interrupted: _('The update was interrupted. Check the installed version before trying again.'),
				install: _('Installation failed. See the installation log for details.')
			};
			return job.phase === 'failed' ? errors[job.error] || errors.install :
				phases[job.phase] || _('Preparing the update...');
		}

		function stopMonitoring() {
			monitoring = false;
			poll.remove(watch);
		}

		function watch() {
			if (!content.isConnected) {
				if (attached)
					stopMonitoring();
				return Promise.resolve();
			}
			attached = true;
			return callStatus().then(function(result) {
				if (result.result !== 0 || !result.upgrade)
					throw new Error('status unavailable');
				state = Object.assign({}, state, { current_version: result.current_version, upgrade: result.upgrade });
				if (result.upgrade.active) {
					refresh();
					return;
				}
				if (starting)
					return;
				stopMonitoring();
				return callGet().then(function(result) {
					if (result.result === 0)
						state = result;
				}).catch(function() {}).then(function() {
					if (state.upgrade && state.upgrade.active)
						monitor();
					refresh();
				});
			}).catch(function() {
				showStatus(_('Unable to read update progress. Reconnecting...'), 'error');
			});
		}

		function monitor() {
			if (!monitoring) {
				monitoring = true;
				poll.add(watch, 2);
			}
		}

		function install() {
			var remote = release(state);
			if (busy || monitoring || !mayInstall())
				return Promise.resolve();
			starting = true;
			monitor();
			refresh();
			return callStart(remote.tag, remote.file).then(function(result) {
				starting = false;
				if (result.result !== 0) {
					stopMonitoring();
					refresh();
					showStatus(result.result === 3 ? _('Release information has changed or expired. Check for updates again.') :
						result.result === 5 ? _('The installed version has changed. Check for updates again.') :
						_('Unable to start the update. Check for updates and try again.'), 'error');
					if (result.result === 3 || result.result === 5) {
						state.can_upgrade = false;
						installButton.hidden = true;
					}
					if (result.result === 4) {
						monitor();
						return watch();
					}
					return;
				}
				state.upgrade = result.upgrade;
				monitor();
				refresh();
			}).catch(function() {
				starting = false;
				// A lost reply does not mean the worker failed to start. Poll before
				// allowing another installation request.
				showStatus(_('Unable to read update progress. Reconnecting...'), 'error');
			});
		}

		function confirmInstall() {
			var remote = release(state);
			if (busy || monitoring || confirming || !mayInstall())
				return;
			confirming = true;
			refresh();
			ui.showModal(_('Update Argon to %s?').format(remote.version), [
				E('p', {}, _('The theme will be updated using the system package manager. Your Argon settings will be preserved.')),
				E('div', { 'class': 'right' }, [
					E('button', { 'type': 'button', 'class': 'btn', 'click': function() {
						confirming = false;
						ui.hideModal();
						refresh();
					} }, _('Cancel')),
					' ',
					E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-action', 'click': function() {
						confirming = false;
						ui.hideModal();
						return install();
					} }, _('Update now'))
				])
			]);
		}

		function check() {
			if (busy || monitoring || confirming)
				return Promise.resolve();
			busy = true;
			refresh();
			return callCheck().then(function(result) {
				if (result.result !== 0 || !release(result)) {
					if (state)
						state.can_upgrade = false;
					var error = new Error('update check failed');
					error.retry_at = result.retry_at;
					throw error;
				}
				state = result;
				busy = false;
				refresh();
				var remote = release(state);
				var local = version(state.current_version);
				details.open = !!(remote && remote.parsed && local && compare(local, remote.parsed) < 0 && !needsReload());
				if (state.upgrade && state.upgrade.active)
					monitor();
			}).catch(function(error) {
				busy = false;
				refresh();
				showStatus(checkError(error.retry_at), 'error');
			});
		}
		if (state && state.upgrade && state.upgrade.active)
			monitor();
		refresh();
		return E('div', { 'class': 'cbi-section', 'id': 'argon-update' }, [
			E('h3', {}, _('Theme updates')), content
		]);
	}
});
