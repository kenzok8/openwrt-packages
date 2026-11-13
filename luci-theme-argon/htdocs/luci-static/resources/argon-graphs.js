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
			var pending = [];
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

				pending.push({ svg: svg, width: width, height: height });
			});

			pending.forEach(function(graph) {
				graphs.set(graph.svg, graph.width);
				graph.svg.setAttribute('viewBox', '0 0 ' + graph.width + ' ' + graph.height);
				graph.svg.setAttribute('preserveAspectRatio', 'none');
			});

			var labels = [];
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
					labels.push({ text: text, bounds: bounds, ratio: ratio, inverse: inverse, offset: offset });
				});
			});

			// Apply every provisional transform before measuring any label. Alternating
			// a style write and a bounds read forces layout once per chart label.
			labels.forEach(function(label) {
				label.text.style.transformOrigin = '0 0';
				label.text.style.transform = 'translateX(' + label.offset + 'px) scaleX(' + label.inverse + ')';
			});
			labels.forEach(function(label) {
				var bounds = label.text.getBoundingClientRect();
				label.shift = Math.max(0, label.bounds.left + 4 - bounds.left) -
					Math.max(0, bounds.right - label.bounds.right + 4);
			});
			labels.forEach(function(label) {
				if (label.shift)
					label.text.style.transform = 'translateX(' + (label.offset + label.shift / label.ratio) +
						'px) scaleX(' + label.inverse + ')';
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
