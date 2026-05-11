// SPDX-License-Identifier: GPL-2.0
//
// Shared helper module for all luci-app-amlogic JS views.
// Purpose: on first page load, inject the theme-aware stylesheet amlogic.css
// into <head> (which contains .amlogic-status-* status colors, .amlogic-snap-*
// snapshot cards, and prefers-color-scheme dark mode overrides) so every view
// can rely on the same set of classes instead of duplicating inline styles.

'use strict';
'require baseclass';

return baseclass.extend({
	// Inject the shared stylesheet (idempotent).
	// We tag the <link> element with a fixed id 'amlogic-shared-css' so that
	// subsequent calls return immediately and avoid appending it twice. The
	// stylesheet path is resolved via L.resource() to
	// /luci-static/resources/view/amlogic/amlogic.css.
	ensureCss: function () {
		if (document.getElementById('amlogic-shared-css')) return;
		const link = document.createElement('link');
		link.id   = 'amlogic-shared-css';
		link.rel  = 'stylesheet';
		link.type = 'text/css';
		link.href = L.resource('view/amlogic/amlogic.css');
		document.head.appendChild(link);
	}
});
