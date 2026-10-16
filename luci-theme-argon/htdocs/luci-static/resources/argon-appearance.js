'use strict';
'require baseclass';
'require rpc';
'require ui';

var callGet = rpc.declare({ object: 'luci.argon_appearance', method: 'get', expect: { '': {} }, raise: true });
var callSet = rpc.declare({ object: 'luci.argon_appearance', method: 'set', params: ['mode'], expect: { '': {} }, raise: true });
var callAccess = rpc.declare({ object: 'session', method: 'access', params: ['scope', 'object', 'function'], expect: { access: false }, raise: true });

return baseclass.extend({
	__init__: function() {
		this.root = document.getElementById('argon-appearance');
		if (!this.root)
			return;
		this.mode = document.documentElement.dataset.argonMode;
		this.busy = false;
		this.preference = window.matchMedia('(prefers-color-scheme: dark)');
		return Promise.all([ callGet(), callAccess('ubus', 'luci.argon_appearance', 'set') ]).then(function(data) {
			if (data[0].result !== 0 || !this.validMode(data[0].mode))
				return;
			this.writable = data[1] === true;
			this.render();
			this.applyMode(data[0].mode);
			this.root.hidden = false;
			var onSystemChange = function() {
				if (this.mode === 'normal')
					this.applyMode('normal');
			}.bind(this);
			if (this.preference.addEventListener)
				this.preference.addEventListener('change', onSystemChange);
			else
				this.preference.addListener(onSystemChange);
		}.bind(this)).catch(function() {
			// Leave the server-rendered theme intact when the service is unavailable.
		});
	},

	validMode: function(mode) {
		return [ 'normal', 'light', 'dark' ].includes(mode);
	},

	render: function() {
		this.labels = { light: _('Light mode'), dark: _('Dark mode'), normal: _('Follow system') };
		this.trigger = E('button', {
			type: 'button', 'class': 'argon-appearance-trigger',
			'aria-label': _('Theme mode'), 'aria-expanded': 'false', 'aria-controls': 'argon-appearance-options',
			click: function() { this.open(this.panel.hidden); }.bind(this)
		});
		this.radios = Object.keys(this.labels).map(function(mode) {
			return E('input', {
				type: 'radio', name: 'argon-appearance-mode', value: mode,
				'class': 'visually-hidden',
				disabled: !this.writable || null,
				change: function(event) {
					if (event.target.checked)
						this.saveMode(mode);
				}.bind(this)
			});
		}.bind(this));
		this.panel = E('fieldset', { id: 'argon-appearance-options', 'class': 'argon-appearance-panel', hidden: true }, [
			E('legend', { 'class': 'visually-hidden' }, _('Theme mode')),
			...this.radios.map(function(radio) {
				return E('label', { 'class': 'argon-appearance-option', 'data-mode': radio.value }, [
					radio, E('span', {}, this.labels[radio.value])
				]);
			}.bind(this)),
			!this.writable ? E('p', {}, _('Read-only')) : ''
		]);
		this.message = E('span', { 'class': 'visually-hidden', role: 'status' });
		this.root.appendChild(this.trigger);
		this.root.appendChild(this.panel);
		this.root.appendChild(this.message);
		this.root.addEventListener('keydown', function(event) {
			if (event.key === 'Escape' && !this.panel.hidden) {
				event.preventDefault();
				this.open(false, true);
			}
		}.bind(this));
		document.addEventListener('click', function(event) {
			if (!this.root.contains(event.target))
				this.open(false);
		}.bind(this));
		this.root.addEventListener('focusout', function(event) {
			if (event.relatedTarget && !this.root.contains(event.relatedTarget))
				this.open(false);
			// A pointer press on a label can leave focus on the page until release.
			// With no destination, wait for label activation or the outside click.
		}.bind(this));
		window.addEventListener('blur', function() { this.open(false); }.bind(this));
	},

	open: function(show, restoreFocus) {
		this.panel.hidden = !show;
		this.trigger.setAttribute('aria-expanded', String(show));
		if (show) {
			var checked = this.radios.find(function(radio) { return radio.checked && !radio.disabled; });
			if (checked)
				checked.focus();
		} else if (restoreFocus) {
			this.trigger.focus();
		}
	},

	applyMode: function(mode) {
		var html = document.documentElement;
		html.classList.add('argon-theme-changing');
		html.dataset.argonMode = mode;
		this.mode = mode;
		this.root.dataset.mode = mode;
		this.radios.forEach(function(radio) { radio.checked = radio.value === mode; });
		this.trigger.title = _('Theme mode') + ': ' + this.labels[mode];
		this.trigger.setAttribute('aria-label', this.trigger.title);
		// Update browser chrome as well as the CSS palette, including system mode.
		var dark = mode === 'dark' || (mode === 'normal' && this.preference.matches);
		var color = getComputedStyle(html).getPropertyValue(dark ? '--dark-primary' : '--light-primary').trim();
		document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta, index) {
			meta.removeAttribute('media');
			if (index === 0)
				meta.content = color;
			else
				meta.remove();
		});
		void html.offsetHeight;
		cancelAnimationFrame(this.frame);
		this.frame = requestAnimationFrame(function() {
			html.classList.remove('argon-theme-changing');
		});
	},

	saveMode: function(mode) {
		if (!this.writable || this.busy || !this.validMode(mode) || mode === this.mode)
			return Promise.resolve();
		var previous = this.mode;
		this.busy = true;
		this.radios.forEach(function(radio) { radio.disabled = true; });
		this.panel.setAttribute('aria-busy', 'true');
		this.message.textContent = _('Saving theme mode…');
		this.applyMode(mode);
		this.open(false, true);
		return callSet(mode).then(function(result) {
			if (result.result !== 0 || result.mode !== mode)
				throw new Error('save failed');
			this.saved(mode);
		}.bind(this)).catch(function() {
			// A lost reply may follow a successful commit; read back before reverting.
			return callGet().catch(function() { return {}; }).then(function(state) {
				this.applyMode(state.result === 0 && this.validMode(state.mode) ? state.mode : previous);
				if (state.result === 0 && state.mode === mode) {
					this.saved(mode);
					return;
				}
				this.message.textContent = _('Unable to save theme mode. Please try again.');
				ui.addNotification(null, E('p', { role: 'alert' }, this.message.textContent), 'error');
			}.bind(this));
		}.bind(this)).finally(function() {
			this.busy = false;
			this.panel.removeAttribute('aria-busy');
			this.radios.forEach(function(radio) { radio.disabled = !this.writable; }.bind(this));
		}.bind(this));
	},

	saved: function(mode) {
		this.message.textContent = _('Theme mode saved.');
		window.dispatchEvent(new CustomEvent('argon-appearance-saved', { detail: { mode: mode } }));
	}
});
