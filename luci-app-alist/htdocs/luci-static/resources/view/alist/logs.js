'use strict';
'require dom';
'require fs';
'require poll';
'require view';

function pollLog(e) {
	return Promise.all([
		fs.read_direct('/var/log/alist.log', 'text').then(function (res) {
			return res.trim().split(/\n/).join('\n').replace(/\u001b\[33mWARN\u001b\[0m/g, '').replace(/\u001b\[36mINFO\u001b\[0m/g, '');
		}),
	]).then(function (data) {
		var logTextarea = E('textarea', { 'class': 'cbi-input-textarea', 'wrap': 'off', 'readonly': 'readonly', 'style': 'width: calc(100% - 20px);height: 500px;margin: 10px;overflow-y: scroll;' }, [
			data[0] || _('No log data.')
		]);

		// Store the current scroll position
		var storedScrollTop = e.querySelector('textarea') ? e.querySelector('textarea').scrollTop : null;

		dom.content(e, logTextarea);

		// If the storedScrollTop is not null, it means we have a previous scroll position
		if (storedScrollTop !== null) {
			logTextarea.scrollTop = storedScrollTop;
		}

		// Add event listener to save the scroll position when scrolling stops
		var timer;
		logTextarea.addEventListener('scroll', function () {
			clearTimeout(timer);
			timer = setTimeout(function () {
				storeScrollPosition(logTextarea.scrollTop);
			}, 150);
		});

		function storeScrollPosition(scrollPos) {
			localStorage.setItem("scrollPosition", JSON.stringify({ "log": scrollPos }));
		}

	});
};

return view.extend({
	handleCleanLogs: function () {
		return fs.write('/var/log/alist.log', '')
			.catch(function (e) { ui.addNotification(null, E('p', e.message)) });
	},

	render: function () {
		var log_textarea = E('div', { 'id': 'log_textarea' },
			E('img', {
				'src': L.resource(['icons/loading.gif']),
				'alt': _('Loading'),
				'style': 'vertical-align:middle'
			}, _('Collecting data...'))
		);

		poll.add(pollLog.bind(this, log_textarea));
		var clear_logs_button = E('input', { 'class': 'btn cbi-button-action', 'type': 'button', 'style': 'margin-left: 10px; margin-top: 10px;', 'value': _('Clear logs') });
		clear_logs_button.addEventListener('click', this.handleCleanLogs.bind(this));
		return E([
			E('div', { 'class': 'cbi-map' }, [
				E('div', { 'class': 'cbi-section' }, [
					clear_logs_button,
					log_textarea,
					E('div', { 'style': 'text-align:right' },
						E('small', {}, _('Refresh every %s seconds.').format(L.env.pollinterval))
					)
				])])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
