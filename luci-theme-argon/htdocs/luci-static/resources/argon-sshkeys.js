'use strict';
'require baseclass';

return baseclass.extend({
	__init__: function() {
		var view = document.querySelector('#view');
		if (!view)
			return;

		var frame = null;
		var update = function() {
			frame = null;
			view.querySelectorAll('.cbi-dynlist > .item[data-key]').forEach(function(item) {
				if (item.querySelector('.argon-key-details'))
					return;

				var name = item.querySelector(':scope > strong');
				var metadata = item.querySelector(':scope > small');
				if (!name || !metadata)
					return;

				// The native preview is abbreviated base64, not a key fingerprint.
				var preview = metadata.lastElementChild;
				if (preview && preview.tagName === 'CODE') {
					if (preview.previousSibling && preview.previousSibling.nodeName === 'BR')
						preview.previousSibling.remove();
					preview.remove();
				}

				var remove = document.createElement('button');
				remove.type = 'button';
				remove.className = 'cbi-button cbi-button-remove argon-key-delete';
				remove.textContent = _('Delete');
				remove.setAttribute('aria-label', _('Delete key') + ': ' + name.textContent);
				remove.disabled = !L.hasViewPermission();
				remove.addEventListener('click', function(ev) {
					ev.stopPropagation();
					// Dispatch on the original item so its native confirmation keeps
					// the exact data-key and the original authorization checks.
					item.click();
				});

				var details = document.createElement('details');
				var summary = document.createElement('summary');
				var key = document.createElement('pre');
				details.className = 'argon-key-details';
				summary.textContent = _('Public key');
				key.textContent = item.getAttribute('data-key');
				details.append(summary, key);
				// Expanding or selecting the key must not open Delete confirmation.
				details.addEventListener('click', function(ev) { ev.stopPropagation(); });
				item.append(remove, details);
				item.classList.add('argon-key-item');
			});
		};
		var schedule = function() {
			if (frame === null)
				frame = requestAnimationFrame(update);
		};
		new MutationObserver(schedule).observe(view, { childList: true, subtree: true });
		schedule();
	}
});
