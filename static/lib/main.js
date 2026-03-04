'use strict';
/* global utils, app */

$(function () {
	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'register' && utils.param('error')) {
			app.alertError('Registration failed. Please check your license key and try again.');
		}
	});
});
