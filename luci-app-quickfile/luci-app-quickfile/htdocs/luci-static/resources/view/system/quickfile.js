'use strict';
'require form';
'require view';
'require ui';

return view.extend({
	render: function () {
		const m = new form.Map('system', '');
		const s = m.section(form.NamedSection, 'iframe_section', 'settings');
		s.anonymous = true;

		s.render = function () {
			const host = window.location.origin;

			const iframeContainer = E('div', {
				'class': 'iframe-container',
				'style': `
					display: flex;
					flex-direction: column;
					width: 100%;
					max-width: 1600px;
					height: 800px;
					overflow: hidden;
					border-radius: 10px;
				`
			}, [
				E('iframe', {
					'src': `/cgi-bin/luci/quickfile?host=${encodeURIComponent(host)}`,
					'style': `
						width: 100%;
						height: 100%;
						border: none;
						border-radius: 10px;
					`
				})
			]);

			return iframeContainer;
		};

		return m.render();
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
