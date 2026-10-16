'use strict';
'require baseclass';

// Native realtime plots retain the coordinates calculated on first render.
// Scale that coordinate system on resize, keeping text and strokes readable.
return baseclass.extend({
	__init__: function() {
		var view = document.querySelector('#view');
		if (!view || !window.ResizeObserver)
			return;

		var graphs = new Map();
		var frame = null;
		var update = function() {
			frame = null;
			view.querySelectorAll('svg').forEach(function(svg) {
				if (graphs.has(svg) || svg.hasAttribute('viewBox'))
					return;

				// An inactive tab may first become measurable after the window
				// has resized. Read the native plot extent, not today's viewport.
				var width = 0;
				svg.querySelectorAll('polyline').forEach(function(line) {
					for (var i = 0; i < line.points.numberOfItems; i++)
						width = Math.max(width, line.points.getItem(i).x);
				});
				var height = svg.clientHeight;
				if (width <= 0 || !(height > 0))
					return;

				graphs.set(svg, width);
				svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
				svg.setAttribute('preserveAspectRatio', 'none');
			});

			graphs.forEach(function(width, svg) {
				if (!svg.isConnected) {
					graphs.delete(svg);
					return;
				}

				var bounds = svg.getBoundingClientRect();
				if (bounds.width <= 0)
					return;
				var ratio = bounds.width / width;
				var inverse = 1 / ratio;
				svg.querySelectorAll('text').forEach(function(text) {
					var x = parseFloat(text.getAttribute('x')) || 0;
					var offset = x * (1 - inverse);
					var transform = function(shift) {
						text.style.transform = 'translateX(' + shift + 'px) scaleX(' + inverse + ')';
					};
					text.style.transformOrigin = '0 0';
					transform(offset);
					var label = text.getBoundingClientRect();
					var shift = Math.max(0, bounds.left + 4 - label.left) -
						Math.max(0, label.right - bounds.right + 4);
					if (shift)
						transform(offset + shift / ratio);
				});
			});
		};
		var schedule = function() {
			if (frame === null)
				frame = requestAnimationFrame(update);
		};

		new ResizeObserver(schedule).observe(view);
		new MutationObserver(schedule).observe(view, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: [ 'data-tab-active', 'hidden', 'points' ]
		});
		schedule();
	}
});
