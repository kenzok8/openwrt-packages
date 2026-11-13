'use strict';
'require baseclass';

// Firefox ESR 115 predates :has(). Keep common form controls usable without
// changing browser preferences or running a selector polyfill on every page.
return baseclass.extend({
	__init__: function() {
		if (CSS.supports('selector(:has(*))'))
			return;
		var root = document.body;
		if (!root)
			return;
		var sectionSelector = '.cbi-tblsection, .cbi-tblsection .table';
		var update = function(records) {
			var groups = new Set(), sections = new Set();
			var collect = function(node) {
				if (node.nodeType !== 1)
					return;
				if (node.matches('.control-group'))
					groups.add(node);
				if (node.matches(sectionSelector))
					sections.add(node);
				node.querySelectorAll('.control-group').forEach(function(group) { groups.add(group); });
				node.querySelectorAll(sectionSelector).forEach(function(section) { sections.add(section); });
			};
			if (!records)
				collect(root);
			else records.forEach(function(record) {
				// Counter/text updates cannot change these structural relationships.
				if (!Array.from(record.addedNodes).concat(Array.from(record.removedNodes))
					.some(function(node) { return node.nodeType === 1; }))
					return;
				for (var parent = record.target; parent && parent !== root; parent = parent.parentElement) {
					if (parent.matches('.control-group'))
						groups.add(parent);
					if (parent.matches(sectionSelector))
						sections.add(parent);
				}
				record.addedNodes.forEach(collect);
			});
			groups.forEach(function(group) {
				var input = group.firstElementChild;
				group.classList.toggle('argon-joined-control', !!(input && input.matches('input') &&
					input.nextElementSibling && input.nextElementSibling.matches('.cbi-button')));
			});
			sections.forEach(function(section) {
				section.classList.toggle('argon-dropdown-section', !!section.querySelector('.cbi-dropdown'));
			});
		};
		// Observe native LuCI renders and modal contents, including dependent fields.
		new MutationObserver(update).observe(root, { childList: true, subtree: true });
		update();
	}
});
