// SPDX-License-Identifier: GPL-2.0
// Shared helper module for all luci-app-amlogic JS views.
//
// Purpose: inject the theme-aware stylesheet amlogic.css into <head> on first
// page load so every view can use .amlogic-status-* / .amlogic-snap-* classes
// and prefers-color-scheme dark mode overrides without duplicating inline styles.

'use strict';
'require baseclass';

return baseclass.extend({
	// Inject amlogic.css once; guarded by element id to prevent duplicates.
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
