'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require request';
'require carbon.markdown as markdown';

/*
 * System → Carbon Theme Settings. Every section talks to the
 * luci.carbon_update rpcd backend; status() returns what all of them show.
 */
const call = (method, params) => rpc.declare({ object: 'luci.carbon_update', method: method, params: params, expect: { '': {} }, raise: true });
const status = call('status');
const check = call('check');
const upgrade = call('upgrade', [ 'version' ]);
const configure = call('configure', [ 'mirror' ]);
const setLogo = call('logo', [ 'action' ]);

/* Must match the rpcd backend and its ACL (the only file cgi-upload may write). */
const LOGO_UPLOAD = '/tmp/carbon-logo.upload';
const LOGO_MAX = 262144;
/* fixed path: this page also works while another theme is active */
const LOGO_DEFAULT = '/luci-static/carbon/logo.svg';
const LOGO_TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml)$/;
const LOGO_NAMES = /\.(png|jpe?g|gif|webp|svg)$/i;
const MIRROR_RE = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?(\/[A-Za-z0-9._~%+-]+)*\/?$/;

/* Theme strings: Carbon's bundled catalogue when the theme is active, otherwise
   LuCI's (luci-i18n-carbon-* packages built from po/). */
const N_ = s => s;
const tr = (s, ...args) => (window.Carbon && typeof window.Carbon.t === 'function') ?
	window.Carbon.t(s, ...args) : (args.length ? _(s).format(...args) : _(s));
/* backend error codes → messages */
const errors = {
	/* updates */
	network: N_('Download failed. Check internet access, DNS, router time and GitHub availability.'),
	metadata: N_('Release metadata or package version is invalid. Nothing was installed.'),
	checksum: N_('The downloaded file failed its size or SHA-256 check. Nothing was installed.'),
	signature: N_('APK signature verification failed. Nothing was installed; signature checks remain enabled.'),
	install: N_('The package manager could not finish installation. See the log below.'),
	version: N_('The installed version does not match the release. Check the installation log.'),
	settings: N_('The package was installed, but restoring theme preferences failed. Check System → Language and Style.'),
	interrupted: N_('The update was interrupted. Check the installed version before trying again.'),
	stale: N_('The release changed, expired, or is no longer newer. Check for updates again.'),
	invalid: N_('Invalid update request.'),
	busy: N_('Another update operation is running.'),
	dependencies: N_('Install curl, ca-bundle and flock, and restore the Carbon public key if missing.'),
	manual_install: N_('apk/opkg has no record of this Carbon install (for example, it was copied by an older carbon-install.sh). Run the latest carbon-install.sh once, or install the APK/IPK package, to enable online upgrades.'),
	space: N_('Not enough temporary storage or unable to create update files.'),
	state: N_('Unable to access update state storage.'),
	invalid_mirror: N_('Enter an HTTPS mirror prefix such as https://mirror.example.com/ (letters, digits and . _ ~ % + - only).'),
	/* logo */
	logo_missing: N_('The uploaded file did not reach the router. Try again.'),
	logo_size: N_('The logo must be at most 256 KB.'),
	logo_type: N_('Unsupported file. Use a PNG, JPEG, WebP, GIF or SVG image.'),
	logo_unsafe: N_('This SVG contains scripts, event handlers, links or embedded documents and was rejected. Save it as a plain SVG or PNG.'),
	logo_denied: N_('Permission denied. Log out and log in again once after updating Carbon, then retry.')
};
const message = code => errors[code] ? tr(errors[code]) : String(code || '');
const writable = () => L.hasViewPermission();

/* LuCI's E() renders a null array item as the text "null": never pass one */
const section = (title, description, children) => E('section', { 'class': 'cbi-section' },
	[E('h3', {}, [].concat(title))].concat(description ? [E('p', { 'class': 'cbi-section-descr' }, description)] : [], children));
/* "?" toggletip: hover or keyboard focus shows the text, a click or tap pins it,
   Esc or a click elsewhere closes it. Keeps long explanations off the page. */
let hintSeq = 0;
function hint(text) {
	const id = 'cb-hint-' + (++hintSeq);
	let wrap = null;
	const outside = (e) => { if (!wrap.contains(e.target)) setOpen(false); };
	const setOpen = (on) => {
		wrap.classList.toggle('open', on);
		button.setAttribute('aria-expanded', on ? 'true' : 'false');
		if (on) document.addEventListener('pointerdown', outside, true);
		else document.removeEventListener('pointerdown', outside, true);
	};
	const button = E('button', {
		'type': 'button', 'class': 'cb-hint-btn', 'aria-label': tr('About this setting'),
		'aria-describedby': id, 'aria-expanded': 'false',
		'click': () => setOpen(!wrap.classList.contains('open')),
		'keydown': (e) => { if (e.key === 'Escape') setOpen(false); }
	}, ['?']);
	wrap = E('span', { 'class': 'cb-hint' }, [button, E('span', { 'class': 'cb-hint-bubble', 'id': id, 'role': 'tooltip' }, [text])]);
	return wrap;
}
const actions = (children) => E('div', { 'class': 'cb-update-actions' }, children);
const external = (href, text) => E('a', { 'href': href, 'target': '_blank', 'rel': 'noopener noreferrer' }, text);

/* ---- custom logo: preview, upload (cgi-upload → rpcd validation), restore default ---- */
function logoSection(data) {
	let logoUrl = data.logo || '';
	const preview = E('img', { 'class': 'cb-logo-preview', 'alt': tr('Current logo') });
	const state = E('span', { 'class': 'cb-update-note', 'role': 'status', 'aria-live': 'polite' });
	const input = E('input', {
		'type': 'file', 'id': 'carbon-logo-file', 'hidden': true,
		'accept': 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg',
		'change': () => {
			const file = input.files && input.files[0];
			input.value = '';
			if (!file) return;
			if (!LOGO_TYPES.test(file.type) && !LOGO_NAMES.test(file.name)) { state.textContent = message('logo_type'); return; }
			if (!file.size || file.size > LOGO_MAX) { state.textContent = message('logo_size'); return; }
			return apply(() => upload(file), tr('Logo saved.'));
		}
	});
	const uploadButton = E('button', { 'class': 'cbi-button cbi-button-action', 'click': () => input.click() }, tr('Upload logo…'));
	const resetButton = E('button', { 'class': 'cbi-button cbi-button-reset', 'click': () => apply(() => setLogo('reset'), tr('The default logo is restored.')) }, tr('Restore default'));

	const paint = () => {
		const src = logoUrl || LOGO_DEFAULT;
		preview.src = src;
		uploadButton.disabled = !writable();
		resetButton.disabled = !logoUrl || !writable();
		/* the rest of the page follows without a reload */
		document.querySelectorAll('.cb-brand-logo, .cb-hero-icon img').forEach((img) => {
			img.src = src;
			if (logoUrl) img.setAttribute('data-custom', ''); else img.removeAttribute('data-custom');
		});
		document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
			link.href = src;
			if (logoUrl) link.removeAttribute('type');
		});
	};
	async function upload(file) {
		const form = new FormData();
		form.append('sessionid', rpc.getSessionID());
		form.append('filename', LOGO_UPLOAD);
		form.append('filedata', file);
		const res = await request.post(L.env.cgi_base + '/cgi-upload', form, { timeout: 0 });
		if (res.status === 403) return { error: 'logo_denied' };
		if (!res.ok) throw new Error(res.statusText || ('HTTP ' + res.status));
		return setLogo('set');
	}
	async function apply(action, done) {
		uploadButton.disabled = resetButton.disabled = true;
		state.textContent = tr('Saving…');
		try {
			const result = await action();
			if (result.error) state.textContent = message(result.error);
			else { logoUrl = result.logo || ''; state.textContent = done; }
		}
		catch (e) { state.textContent = e.message; }
		paint();
	}
	paint();

	return section(tr('Logo'), tr('Shown in the sidebar, on the login page, on the overview and as the browser icon. PNG, JPEG, WebP, GIF or SVG up to 256 KB; a square image of at least 128 × 128 pixels looks best. The logo is kept across theme updates and firmware upgrades that keep settings.'), [
		E('div', { 'class': 'cb-logo-row' }, [preview, E('div', { 'class': 'cb-logo-actions' }, [uploadButton, resetButton, input, state])])
	]);
}

/* ---- download mirror for online updates ---- */
function mirrorSection(data) {
	const input = E('input', {
		'class': 'cbi-input-text', 'id': 'carbon-mirror', 'type': 'url', 'inputmode': 'url', 'maxlength': '200',
		'placeholder': 'https://mirror.example.com/', 'spellcheck': 'false', 'autocomplete': 'off', 'value': data.mirror || ''
	});
	const state = E('span', { 'class': 'cb-update-note', 'role': 'status', 'aria-live': 'polite' });
	const save = E('button', { 'class': 'cbi-button cbi-button-save', 'click': async () => {
		const value = input.value.trim();
		if (value && !MIRROR_RE.test(value)) { state.textContent = message('invalid_mirror'); return; }
		save.disabled = true;
		try {
			const result = await configure(value);
			if (result.error) state.textContent = message(result.error);
			else {
				input.value = result.mirror || '';
				state.textContent = result.mirror ? tr('Saved. Downloads try the mirror first, then GitHub.') : tr('Saved. Downloads use GitHub directly.');
			}
		}
		catch (e) { state.textContent = e.message; }
		finally { save.disabled = !writable(); }
	} }, tr('Save'));
	if (!writable()) { input.disabled = true; save.disabled = true; }

	return section([tr('Download mirror'), hint(tr('Optional. If GitHub downloads are slow or blocked, enter an HTTPS prefix that proxies GitHub links, for example https://mirror.example.com/ for https://mirror.example.com/https://github.com/…. Release information is still read from GitHub, and the downloaded file must match the size and SHA-256 published there; GitHub is tried if the mirror fails.'))], null, [
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'carbon-mirror' }, tr('Mirror prefix')),
			E('div', { 'class': 'cbi-value-field cb-update-field' }, [input, save, state])
		])
	]);
}

/* ---- online updates: status polled every 2 s; returns the sections and the poll ---- */
function updateSections(data) {
	let current = data, pending = false, renderedNotes;
	const installedText = E('strong');
	const latestText = E('strong');
	const stateText = E('p', { 'role': 'status', 'aria-live': 'polite' });
	const errorText = E('p', { 'role': 'alert', 'class': 'alert-message warning', 'hidden': true });
	const securityText = E('p', { 'class': 'cbi-section-descr' });
	const notes = E('div', { 'class': 'cb-release-notes', 'tabindex': '0', 'role': 'region', 'aria-label': tr('Release notes') });
	const logs = E('pre', { 'style': 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:16rem;overflow:auto' });
	const refresh = E('button', { 'class': 'cbi-button cbi-button-action', 'click': () => {
		ui.menu.flushCache();
		window.location.reload();
	} }, tr('Reload page'));
	const checkButton = E('button', { 'class': 'cbi-button cbi-button-action', 'click': () => run(check) }, tr('Check for updates'));
	const updateButton = E('button', { 'class': 'cbi-button cbi-button-positive', 'click': () => {
		if (!current.can_upgrade || current.busy || pending || !writable()) return;
		const version = current.latest;
		ui.showModal(tr('Update Carbon'), [
			E('p', {}, tr('Install version %s? Your theme preferences will be retained. Do not power off the router during installation.', version)),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, tr('Cancel')), ' ',
				E('button', { 'class': 'cbi-button cbi-button-positive', 'click': () => { ui.hideModal(); return run(() => upgrade(version)); } }, tr('Confirm update'))
			])
		]);
	} }, tr('Install update'));

	function paint(value) {
		current = value;
		installedText.textContent = value.current || tr('Unknown');
		latestText.textContent = value.latest || tr('Not checked');
		const labels = {
			checking: N_('Checking for updates…'), downloading: N_('Downloading update…'),
			verifying: N_('Verifying update…'), installing: N_('Installing update…'),
			success: N_('Update complete. Reload this page to use the new version.'),
			failed: N_('Update failed.')
		};
		stateText.textContent = labels[value.state] ? tr(labels[value.state]) :
			value.can_upgrade ? tr('A new version is available.') :
			value.latest && value.current === value.latest ? tr('You are using the latest version.') : tr('Check the latest stable Carbon release.');
		const issue = value.error || value.reason;
		errorText.textContent = message(issue); errorText.hidden = !issue;
		securityText.textContent = value.manager === 'apk' ?
			tr('APK signature, SHA-256 and file size are verified before installation. Your signature checks remain enabled.') :
			tr('IPK updates are downloaded over HTTPS and checked against the release SHA-256 and file size.');
		// Keep selection, focus and scroll position while status polls every 2s.
		const nextNotes = value.notes || '';
		if (nextNotes !== renderedNotes) {
			if (nextNotes) notes.innerHTML = markdown.render(nextNotes);
			else notes.textContent = tr('Release notes will appear after checking.');
			renderedNotes = nextNotes;
		}
		logs.textContent = value.log || tr('No installation log yet.');
		checkButton.disabled = pending || value.busy || !!value.reason;
		updateButton.disabled = pending || value.busy || !value.can_upgrade || !writable();
		refresh.hidden = value.state !== 'success';
	}
	async function sync() {
		try { paint(await status()); }
		catch (e) {
			errorText.hidden = false;
			errorText.textContent = tr('Connection interrupted. Progress will resume when LuCI reconnects. %s', e.message);
			checkButton.disabled = true; updateButton.disabled = true;
		}
	}
	async function run(action) {
		if (pending) return;
		pending = true; paint(current);
		let issue;
		try { const result = await action(); if (result.error) issue = message(result.error); }
		catch (e) { issue = e.message; }
		finally { pending = false; await sync(); }
		if (issue) { errorText.textContent = issue; errorText.hidden = false; }
	}
	paint(data);

	return {
		sync: sync,
		main: section(tr('Updates'), null, [
			E('div', { 'class': 'cb-update-versions' }, [
				E('div', {}, [E('p', {}, tr('Installed version')), installedText]),
				E('div', {}, [E('p', {}, tr('Latest stable version')), latestText])
			]), stateText, errorText, securityText,
			actions([checkButton, updateButton, refresh]),
			external('https://github.com/mrjoechen/luci-theme-carbon/releases', tr('View releases on GitHub'))
		]),
		notes: section(tr('Release notes'), null, [notes]),
		log: E('details', { 'class': 'cbi-section' }, [E('summary', {}, tr('Installation log')), logs])
	};
}

return view.extend({
	load() { return status(); },
	render(data) {
		const updates = updateSections(data);
		this.pollStatus = updates.sync;
		poll.add(updates.sync, 2);
		return E('div', { 'class': 'cbi-map cb-update' }, [
			E('h2', {}, tr('Carbon Theme Settings')),
			E('p', { 'class': 'cbi-map-descr' }, tr('Personalise the logo and update the theme without changing your router configuration.')),
			logoSection(data),
			updates.main,
			updates.notes,
			mirrorSection(data),
			updates.log
		]);
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
