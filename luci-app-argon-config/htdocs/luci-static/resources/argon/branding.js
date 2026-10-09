'use strict';
'require baseclass';
'require fs';
'require rpc';
'require ui';

var callGet = rpc.declare({ object: 'luci.argon_branding', method: 'get', expect: { '': {} }, raise: true });
var callSet = rpc.declare({ object: 'luci.argon_branding', method: 'set', params: ['target', 'token'], expect: { '': {} }, raise: true });
var callReset = rpc.declare({ object: 'luci.argon_branding', method: 'reset', params: ['target'], expect: { '': {} }, raise: true });

return baseclass.extend({
	load: function() {
		return callGet().catch(function() { return null; });
	},

	render: function(map, state) {
		var busy = false;
		var buttons = [];
		var previews = {};
		var defaults = {
			favicon: L.resource('../argon/icon/favicon-32x32.png'),
			logo: L.resource('../argon/img/argon.svg')
		};
		var labels = { favicon: _('Browser icon'), logo: _('Login logo') };
		var available = state && state.result === 0;

		function assetUrl(kind) {
			return state && /^image-[0-9a-f]{64}\.png$/.test(state[kind] || '') ?
				L.resource('../argon/branding/' + state[kind]) : defaults[kind];
		}

		function refresh() {
			Object.keys(previews).forEach(function(kind) {
				previews[kind].src = assetUrl(kind);
			});
			buttons.forEach(function(button) {
				button.node.disabled = !!(map.readonly || busy || !available ||
					(button.reset && !state[button.target]));
			});
		}

		function update(target, upload) {
			if (map.readonly || busy || !available)
				return Promise.resolve();
			busy = true;
			refresh();
			var file;
			return Promise.resolve().then(function() {
				if (!upload)
					return callReset(target);
				var token = Array.from(crypto.getRandomValues(new Uint32Array(4)), function(n) {
					return ('00000000' + n.toString(16)).slice(-8);
				}).join('');
				file = '/tmp/argon_branding_' + token + '.png';
				return ui.uploadFile(file).then(function() {
					return callSet(target, token);
				});
			}).then(function(result) {
				if (result.result === 2)
					throw new Error(_('Invalid PNG image or dimensions.'));
				if (result.result === 3)
					throw new Error(_('Another update is running. Please try again.'));
				if (result.result !== 0)
					throw new Error(_('Unable to save custom branding.'));
				state = result;
			}).catch(function(error) {
				ui.addNotification(null, E('p', {}, error.message), 'error');
			}).finally(function() {
				return (file ? L.resolveDefault(fs.remove(file)) : Promise.resolve()).finally(function() {
					busy = false;
					refresh();
				});
			});
		}

		function action(target, upload, label) {
			var node = E('button', {
				'type': 'button',
				'class': 'btn cbi-button ' + (upload ? 'cbi-button-action' : 'cbi-button-reset'),
				'style': 'max-width:100%;height:auto;white-space:normal',
				'click': function() { return update(target, upload); }
			}, label);
			buttons.push({ node: node, target: target, reset: !upload });
			return node;
		}

		var cards = Object.keys(labels).map(function(kind) {
			var preview = E('img', {
				'src': assetUrl(kind), 'alt': labels[kind], 'width': 64, 'height': 64,
				'style': 'object-fit:contain;flex-shrink:0',
				'error': function() { if (this.getAttribute('src') !== defaults[kind]) this.src = defaults[kind]; }
			});
			previews[kind] = preview;
			return E('div', { 'style': 'flex:1 1 18rem;min-width:0' }, [
				E('h4', { 'style': 'padding:0;margin:0 0 .75rem' }, labels[kind]),
				E('div', { 'style': 'display:flex;align-items:center;flex-wrap:wrap;gap:1rem' }, [
					preview,
					E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5rem' }, [
						action(kind, true, _('Upload PNG...')),
						action(kind, false, _('Restore default'))
					])
				])
			]);
		});
		var content = E('div', { 'style': 'padding:0 1.25rem 1.25rem' }, [
			E('p', { 'style': 'padding:0;margin:0 0 1rem;line-height:1.5' }, _('PNG images, 16–1024 pixels per side, up to 1 MiB. Browser icons must be square.')),
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:1.5rem;margin-bottom:1rem' }, cards),
			action('both', true, _('Upload for both...')),
			E('p', { 'style': 'padding:0;margin:1rem 0 0;line-height:1.5' }, _('Changes apply immediately. Reload open pages to update their icons.'))
		]);
		if (!available)
			content.appendChild(E('p', { 'class': 'error', 'style': 'padding:0;margin:1rem 0 0' }, _('Unable to load custom branding. Update the theme and configuration packages.')));
		refresh();
		return E('div', { 'class': 'cbi-section', 'id': 'argon-branding' }, [
			E('h3', {}, _('Custom branding')), content
		]);
	}
});
