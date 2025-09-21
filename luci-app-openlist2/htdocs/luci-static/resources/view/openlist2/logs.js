'use strict';
'require dom';
'require fs';
'require poll';
'require uci';
'require view';

var scrollPosition = 0;
var userScrolled = false;
var logTextarea;
var log_path;

uci.load('openlist2').then(function() {
	log_path = uci.get('openlist2', '@openlist2[0]', 'log_path') || '/var/log/openlist2.log';
});

function pollLog() {
	return Promise.all([
		fs.read_direct(log_path, 'text').then(function (res) {
			return res.trim().split(/\n/).join('\n').replace(/\u001b\[33mWARN\u001b\[0m/g, '').replace(/\u001b\[36mINFO\u001b\[0m/g, '').replace(/\u001b\[31mERRO\u001b\[0m/g, '');
		}),
	]).then(function (data) {
		logTextarea.value = data[0] || _('No log data.');

		if (!userScrolled) {
			logTextarea.scrollTop = logTextarea.scrollHeight;
		} else {
			logTextarea.scrollTop = scrollPosition;
		}
	});
};

return view.extend({
	handleCleanLogs: function () {
		return fs.write(log_path, '')
			.catch(function (e) { ui.addNotification(null, E('p', e.message)) });
	},

	render: function () {
		logTextarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'wrap': 'off',
			'readonly': 'readonly',
			'style': 'width: calc(100% - 20px);height: 535px;margin: 10px;overflow-y: scroll;',
		});

		logTextarea.addEventListener('scroll', function () {
			userScrolled = true;
			scrollPosition = logTextarea.scrollTop;
		});

		var log_textarea_wrapper = E('div', { 'id': 'log_textarea' }, logTextarea);

		setTimeout(function () {
			poll.add(pollLog);
		}, 100);

		var clear_logs_button = E('input', { 'class': 'btn cbi-button-action', 'type': 'button', 'style': 'margin-left: 10px; margin-top: 10px;', 'value': _('Clear logs') });
		clear_logs_button.addEventListener('click', this.handleCleanLogs.bind(this));

		return E([
			E('div', { 'class': 'cbi-map' }, [
				E('div', { 'class': 'cbi-section' }, [
					clear_logs_button,
					log_textarea_wrapper,
					E('div', { 'style': 'text-align:right' },
						E('small', {}, _('Refresh every %s seconds.').format(L.env.pollinterval))
					)
				])
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
