'use strict';
/* global utils, app, config, ajaxify */

$(function () {
	var cachedStatus = null;
	var statusPromise = null;

	function escapeHtml(value) {
		return $('<div>').text(value == null ? '' : String(value)).html();
	}

	function formatDate(value) {
		if (!value) {
			return '—';
		}
		return new Intl.DateTimeFormat('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		}).format(new Date(value));
	}

	function formatLongDate(value) {
		return new Intl.DateTimeFormat('en-GB', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		}).format(new Date(value));
	}

	function formatDuration(months) {
		if (months % 12 === 0) {
			var years = months / 12;
			return years + ' year' + (years === 1 ? '' : 's');
		}
		return months + ' month' + (months === 1 ? '' : 's');
	}

	function formatPrice(minor, currency) {
		var amount = Number(minor || 0) / 100;
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: currency || 'EUR',
			minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2,
		}).format(amount);
	}

	function renderSupportPolicy(status) {
		var policy = status.policy || {
			effectiveAt: '2026-07-29T00:00:00.000Z',
			standardMonths: 12,
			legacyMonths: 24,
			paidMonths: 12,
			priceMinor: 2000,
			currency: 'EUR',
		};
		return '<div class="mt-4">' +
			'<h5 class="fw-semibold">Thank you for using Lay Theme</h5>' +
			'<p>Lay Theme has always included free updates and personal forum support. I still release updates—often every week—and I love that many people come back to rebuild their websites with Lay Theme years later.</p>' +
			'<p>When I first offered free support, I honestly did not expect support questions to continue five, six, or even ten years after a purchase. I completely understand why a new website can bring new questions, but providing personal support indefinitely is no longer sustainable for a small independent project.</p>' +
			'<p>To keep support personal and reliable, purchases or renewals from <strong>' + escapeHtml(formatLongDate(policy.effectiveAt)) + '</strong> include <strong>' + escapeHtml(formatDuration(policy.standardMonths)) + '</strong> of forum support. Earlier purchases include <strong>' + escapeHtml(formatDuration(policy.legacyMonths)) + '</strong> after the most recent purchase or renewal. After that, a <strong>' + escapeHtml(formatPrice(policy.priceMinor, policy.currency)) + ' support pass</strong> provides another ' + escapeHtml(formatDuration(policy.paidMonths)) + '.</p>' +
			'<p class="mb-0">Lay Theme updates remain free, and you can always continue reading the forum.</p>' +
		'</div>';
	}

	function addSupportButtons() {
		if (!app.user || !app.user.uid) {
			return;
		}
		$('ul#logged-in-menu').each(function () {
			var menu = $(this);
			if (menu.children('[component="license-gate/support"]').length) {
				return;
			}
			var item = $(
				'<li component="license-gate/support" class="nav-item mx-2" title="Lay Theme support">' +
					'<button type="button" class="nav-link d-flex gap-2 align-items-center text-truncate border-0 bg-transparent w-100" aria-label="Open Lay Theme support status">' +
						'<span class="position-relative"><i class="fa fa-fw fa-life-ring" data-support-icon></i></span>' +
						'<span class="nav-text small visible-open fw-semibold text-truncate" data-support-label>Support</span>' +
					'</button>' +
				'</li>'
			);
			menu.prepend(item);
		});
		updateSupportButtons(cachedStatus);
	}

	function updateSupportButtons(status) {
		var items = $('[component="license-gate/support"]');
		items.find('[data-support-icon]').removeClass('text-success text-warning text-secondary');
		if (!status) {
			items.find('[data-support-label]').text('Support');
			items.find('[data-support-icon]').addClass('text-secondary');
			return;
		}
		if (status.unavailable) {
			items.find('[data-support-label]').text('Support unavailable');
			items.find('[data-support-icon]').addClass('text-secondary');
			return;
		}
		if (status.canPost) {
			var unit = status.monthsRemaining === 1 ? 'month' : 'months';
			items.find('[data-support-label]').text(status.monthsRemaining + ' ' + unit + ' left');
			items.find('[data-support-icon]').addClass('text-success');
		} else {
			items.find('[data-support-label]').text('Support expired');
			items.find('[data-support-icon]').addClass('text-warning');
		}
	}

	function loadStatus(force) {
		if (!force && cachedStatus) {
			return Promise.resolve(cachedStatus);
		}
		if (statusPromise) {
			return statusPromise;
		}
		statusPromise = new Promise(function (resolve) {
			require(['api'], function (api) {
				api.get('/plugins/license-gate/support-status')
					.then(function (status) {
						cachedStatus = status;
						updateSupportButtons(status);
						resolve(status);
					})
					.catch(function (error) {
						cachedStatus = { unavailable: true, message: error.message || String(error) };
						updateSupportButtons(cachedStatus);
						resolve(cachedStatus);
					})
					.finally(function () {
						statusPromise = null;
					});
			});
		});
		return statusPromise;
	}

	function renderKeys(keys) {
		if (!keys || !keys.length) {
			return '<p class="text-body-secondary mb-0">No license has been connected to this forum account yet.</p>';
		}
		return '<div class="list-group list-group-flush border rounded-2">' + keys.map(function (key) {
			var renewal = key.renewedAt ? '<div class="small text-body-secondary">Renewed ' + escapeHtml(formatDate(key.renewedAt)) + '</div>' : '';
			return '<div class="list-group-item">' +
				'<div class="d-flex justify-content-between gap-3">' +
					'<strong>' + escapeHtml(key.key) + '</strong>' +
					'<span class="badge text-bg-light text-capitalize">' + escapeHtml(key.status) + '</span>' +
				'</div>' +
				'<div class="small text-body-secondary">Purchased ' + escapeHtml(formatDate(key.purchasedAt)) + '</div>' +
				renewal +
			'</div>';
		}).join('') + '</div>';
	}

	function renderStatus(status) {
		if (status.unavailable) {
			return '<div class="alert alert-secondary mb-3"><strong>Support status is unavailable.</strong><br><span class="small">' + escapeHtml(status.message || 'Please try again later.') + '</span></div>';
		}
		var summary = status.canPost ?
			'<div class="alert alert-success"><strong>Support is active.</strong><br>You can post support questions for another ' + escapeHtml(status.monthsRemaining) + ' month' + (status.monthsRemaining === 1 ? '' : 's') + ', until ' + escapeHtml(formatDate(status.supportUntil)) + '.</div>' :
			'<div class="alert alert-warning"><strong>Your included forum support has ended.</strong><br>You can continue reading the forum and receiving free Lay Theme updates. A one-year support pass will be available here soon.</div>' + renderSupportPolicy(status);

		return summary +
			'<h6 class="fw-semibold mt-4">Connected licenses</h6>' + renderKeys(status.keys) +
			'<hr class="my-4">' +
			'<h6 class="fw-semibold">Connect another license</h6>' +
			'<p class="small text-body-secondary">If the license uses another email address, we will send a confirmation link to the license owner.</p>' +
			'<form data-support-claim-form>' +
				'<label class="form-label" for="lay-support-license-key">License key</label>' +
				'<div class="input-group">' +
					'<input id="lay-support-license-key" name="licenseKey" class="form-control" type="text" autocomplete="off" required placeholder="Enter your license key">' +
					'<button class="btn btn-primary" type="submit">Connect license</button>' +
				'</div>' +
			'</form>';
	}

	function bindClaimForm(modal) {
		modal.find('[data-support-claim-form]').on('submit', function (event) {
			event.preventDefault();
			var form = $(this);
			var button = form.find('button[type="submit"]');
			var licenseKey = String(form.find('[name="licenseKey"]').val() || '').trim();
			if (!licenseKey) {
				return;
			}
			button.prop('disabled', true).text('Connecting…');
			require(['api', 'alerts'], function (api, alerts) {
				api.post('/plugins/license-gate/license-claims', { licenseKey: licenseKey })
					.then(function (result) {
						if (result.status === 'verification_required') {
							alerts.success('A confirmation email was sent to ' + result.sentTo + '.');
						} else {
							alerts.success('Your license has been connected.');
						}
						cachedStatus = null;
						return loadStatus(true);
					})
					.then(function (status) {
						modal.find('.bootbox-body').html(renderStatus(status));
						bindClaimForm(modal);
					})
					.catch(function (error) {
						alerts.error(error);
						button.prop('disabled', false).text('Connect license');
					});
			});
		});
	}

	function openSupportModal() {
		require(['bootbox'], function (bootbox) {
			var modal = bootbox.dialog({
				title: 'Lay Theme support',
				message: '<div class="d-flex align-items-center gap-2"><i class="fa fa-spinner fa-spin"></i><span>Loading support status…</span></div>',
				size: 'large',
				buttons: {
					close: { label: 'Close', className: 'btn-secondary' },
				},
			});
			loadStatus(false).then(function (status) {
				modal.find('.bootbox-body').html(renderStatus(status));
				bindClaimForm(modal);
			});
		});
	}

	$(document).on('click', '[component="license-gate/support"] button', function (event) {
		event.preventDefault();
		openSupportModal();
	});

	addSupportButtons();
	if (app.user && app.user.uid) {
		loadStatus(false);
	}

	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'register' && utils.param('error')) {
			app.alertError('Registration failed. Please check your license key and try again.');
		}
		addSupportButtons();
	});
});
