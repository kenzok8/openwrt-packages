'use strict';
'require baseclass';

// Keep the native counters and tooltip, adding structure after each poll render.
return baseclass.extend({
	__init__: function() {
		var view = document.querySelector('#view');
		if (!view)
			return;

		var frame = null;
		var update = function() {
			frame = null;
			view.querySelectorAll('.ifacebox:has(> .ifacebox-body > img[src*="/icons/port_"]) > .ifacebox-body:last-child > .cbi-tooltip-container').forEach(function(container) {
				if (container.querySelector('.argon-port-traffic'))
					return;

				var values = {};
				var nodes = Array.from(container.childNodes);
				nodes.forEach(function(node) {
					if (node.nodeType !== 3)
						return;
					var text = node.textContent.trim();
					if (text.charAt(0) === '▲' || text.charAt(0) === '▼')
						values[text.charAt(0)] = text.slice(1).trim();
				});
				if (!values['▲'] || !values['▼'])
					return;

				var list = document.createElement('dl');
				list.className = 'argon-port-traffic';
				[
					[ 'tx', 'TX', _('Transmitted bytes'), values['▲'] ],
					[ 'rx', 'RX', _('Received bytes'), values['▼'] ]
				].forEach(function(entry) {
					var row = document.createElement('div');
					var label = document.createElement('dt');
					var value = document.createElement('dd');
					row.dataset.direction = entry[0];
					label.textContent = entry[1];
					label.title = entry[2];
					value.textContent = entry[3];
					row.append(label, value);
					list.append(row);
				});
				nodes.forEach(function(node) {
					if (node.nodeType === 3 || node.nodeName === 'BR')
						node.remove();
				});
				container.prepend(list);
			});
		};
		var schedule = function() {
			if (frame === null)
				frame = requestAnimationFrame(update);
		};
		new MutationObserver(schedule).observe(view, { childList: true, subtree: true, characterData: true });
		schedule();
	}
});
