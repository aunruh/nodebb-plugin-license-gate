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

	function formatDayCount(days) {
		return days + ' day' + (days === 1 ? '' : 's');
	}

	function daysSince(value) {
		if (!value) {
			return 0;
		}
		return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
	}

	function getLicenseTier(key) {
		var product = String(key.productRef || '').toLowerCase();
		if (product.indexOf('studio') !== -1 || key.maxAllowedDomains >= 10) {
			return 'Studio';
		}
		if (product.indexOf('pro') !== -1 || key.maxAllowedDomains >= 2) {
			return 'Pro';
		}
		if (product.indexOf('single') !== -1 || key.maxAllowedDomains === 1) {
			return 'Single';
		}
		return 'Lay Theme';
	}

	function getConnectionLabel(value) {
		return value === 'matching_email' ? 'Matched through your forum email' : 'Added and verified by you';
	}

	function maskedKey(key) {
		return '•••• ' + String(key.keyLastFour || String(key.key || '').slice(-4));
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
			'<p>To keep support personal and reliable, purchases or paid license upgrades from <strong>' + escapeHtml(formatLongDate(policy.effectiveAt)) + '</strong> include <strong>' + escapeHtml(formatDuration(policy.standardMonths)) + '</strong> of forum support. Earlier purchases and upgrades include <strong>' + escapeHtml(formatDuration(policy.legacyMonths)) + '</strong>. After that, a <strong>' + escapeHtml(formatPrice(policy.priceMinor, policy.currency)) + ' support pass</strong> provides another ' + escapeHtml(formatDuration(policy.paidMonths)) + '.</p>' +
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
						'<span class="position-relative"><i class="fa fa-fw fa-headset" data-support-icon></i></span>' +
						'<span class="nav-text small visible-open fw-semibold text-truncate" data-support-label>Support</span>' +
					'</button>' +
				'</li>'
			);
			menu.prepend(item);
		});
		updateSupportButtons(cachedStatus);
	}

	function addSupportSummary() {
		if (!app.user || !app.user.uid) {
			return;
		}
		var header = $('.brand-container > .col-12').first();
		if (!header.length || header.children('[component="license-gate/support-summary"]').length) {
			return;
		}
		header.append(
			'<div component="license-gate/support-summary" class="license-gate-support-summary ms-auto d-flex align-items-center gap-3">' +
				'<span class="license-gate-support-dot bg-secondary" data-support-dot aria-hidden="true"></span>' +
				'<span class="d-none d-md-flex flex-column lh-sm">' +
					'<strong class="small" data-support-summary-title>Checking forum support…</strong>' +
					'<span class="text-body-secondary" data-support-summary-date></span>' +
				'</span>' +
				'<button type="button" class="btn btn-sm btn-outline-secondary text-nowrap">Support &amp; licenses</button>' +
			'</div>'
		);
		updateSupportButtons(cachedStatus);
	}

	function updateSupportButtons(status) {
		var items = $('[component="license-gate/support"]');
		var summary = $('[component="license-gate/support-summary"]');
		items.find('[data-support-icon]').removeClass('text-success text-warning text-secondary');
		summary.find('[data-support-dot]').removeClass('bg-success bg-warning bg-secondary');
		if (!status) {
			items.find('[data-support-label]').text('Support');
			items.find('[data-support-icon]').addClass('text-secondary');
			summary.find('[data-support-dot]').addClass('bg-secondary');
			summary.find('[data-support-summary-title]').text('Checking forum support…');
			summary.find('[data-support-summary-date]').text('');
			return;
		}
		if (status.unavailable) {
			items.find('[data-support-label]').text('Support unavailable');
			items.find('[data-support-icon]').addClass('text-secondary');
			summary.find('[data-support-dot]').addClass('bg-secondary');
			summary.find('[data-support-summary-title]').text('Support status unavailable');
			summary.find('[data-support-summary-date]').text('Please try again later');
			return;
		}
		if (status.canPost) {
			items.find('[data-support-label]').text(formatDayCount(status.daysRemaining) + ' left');
			items.find('[data-support-icon]').addClass('text-success');
			summary.find('[data-support-dot]').addClass('bg-success');
			summary.find('[data-support-summary-title]').text('Forum support active · ' + formatDayCount(status.daysRemaining) + ' remaining');
			summary.find('[data-support-summary-date]').text('Available until ' + formatDate(status.supportUntil));
		} else {
			var elapsed = daysSince(status.supportUntil);
			items.find('[data-support-label]').text('Support expired');
			items.find('[data-support-icon]').addClass('text-warning');
			summary.find('[data-support-dot]').addClass('bg-warning');
			summary.find('[data-support-summary-title]').text(elapsed ? 'Forum support ended ' + formatDayCount(elapsed) + ' ago' : 'Forum support ended today');
			summary.find('[data-support-summary-date]').text(status.supportUntil ? 'Ended on ' + formatDate(status.supportUntil) : 'Connect a license to check your support');
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

	function renderKey(key, status, featured) {
		var fullKey = String(key.key || '');
		var hiddenKey = maskedKey(key);
		var tier = getLicenseTier(key);
		var upgrade = key.upgradedAt ?
			'<div class="small text-body-secondary">Upgraded to ' + escapeHtml(tier) + ' on ' + escapeHtml(formatDate(key.upgradedAt)) + '</div>' : '';
		var supportNote = featured && status.supportUntil ?
			'<div class="small mt-2"><i class="fa fa-check-circle text-success me-1" aria-hidden="true"></i>This ' + (key.upgradedAt ? 'upgrade' : 'purchase') + ' is used for your included support until ' + escapeHtml(formatDate(status.supportUntil)) + '.</div>' : '';
		var revealButton = fullKey ?
			'<button type="button" class="btn btn-sm btn-ghost p-1" data-license-key-toggle aria-label="Show full license key" title="Show full license key"><i class="fa fa-eye" aria-hidden="true"></i></button>' : '';

		return '<div class="list-group-item ' + (featured ? 'license-gate-featured-license' : '') + '">' +
			'<div class="d-flex justify-content-between align-items-start gap-3">' +
				'<div class="min-w-0">' +
					'<div class="d-flex align-items-center gap-2 flex-wrap">' +
						'<strong>' + escapeHtml(tier) + ' License</strong>' +
						(featured ? '<span class="badge text-bg-primary">Used for included support</span>' : '') +
					'</div>' +
					'<div class="d-flex align-items-center gap-1 mt-1">' +
						'<code class="text-body" data-license-key data-license-key-hidden="' + escapeHtml(hiddenKey) + '" data-license-key-full="' + escapeHtml(fullKey) + '">' + escapeHtml(hiddenKey) + '</code>' +
						revealButton +
					'</div>' +
				'</div>' +
			'</div>' +
			'<div class="small text-body-secondary mt-2">Purchased ' + escapeHtml(formatDate(key.purchasedAt)) + '</div>' +
			upgrade +
			'<div class="small text-body-secondary">' + escapeHtml(getConnectionLabel(key.connectedBy)) + '</div>' +
			supportNote +
		'</div>';
	}

	function renderKeys(keys, status) {
		if (!keys || !keys.length) {
			return '<p class="text-body-secondary mb-0">No license has been connected to this forum account yet.</p>';
		}
		var featured = keys.find(function (key) { return key.determinesSupport; }) || keys[0];
		var others = keys.filter(function (key) { return key.id !== featured.id; });
		var result = '<div class="list-group border rounded-2 overflow-hidden">' + renderKey(featured, status, true) + '</div>';
		if (others.length) {
			result += '<details class="license-gate-other-licenses border rounded-2 mt-3">' +
				'<summary class="fw-semibold p-3">Other connected licenses (' + others.length + ')</summary>' +
				'<div class="list-group list-group-flush border-top">' + others.map(function (key) {
					return renderKey(key, status, false);
				}).join('') + '</div>' +
			'</details>';
		}
		return result;
	}

	function renderStatus(status) {
		if (status.unavailable) {
			return '<div class="alert alert-secondary mb-3"><strong>Support status is unavailable.</strong><br><span class="small">' + escapeHtml(status.message || 'Please try again later.') + '</span></div>';
		}
		var summary = status.canPost ?
			'<div class="alert alert-success"><strong>Your forum support is active.</strong><br>You can post support questions until ' + escapeHtml(formatDate(status.supportUntil)) + ' — ' + escapeHtml(formatDayCount(status.daysRemaining)) + ' remaining.</div>' :
			'<div class="alert alert-warning"><strong>Your included forum support ended' + (status.supportUntil ? ' on ' + escapeHtml(formatDate(status.supportUntil)) : '') + '.</strong><br>You can continue reading the forum and receiving free Lay Theme updates. A one-year support pass will be available here soon.</div>' + renderSupportPolicy(status);

		var forumEmail = app.user && app.user.email ? String(app.user.email) : '';
		var emailDescription = forumEmail ?
			'Your forum account uses <strong>' + escapeHtml(forumEmail) + '</strong>. If the license is registered to this email address, we will connect it immediately. If it is registered to a different email address, we will send a confirmation link to the license owner. Once confirmed, the license will be connected and included when we calculate your support availability.' :
			'If the license is registered to your forum account email, we will connect it immediately. If it is registered to a different email address, we will send a confirmation link to the license owner. Once confirmed, the license will be connected and included when we calculate your support availability.';

		return summary +
			'<h6 class="fw-semibold mt-4">Your licenses</h6>' +
			'<p class="small text-body-secondary">We use your most recent license purchase or paid upgrade to calculate included support.</p>' +
			renderKeys(status.keys, status) +
			'<hr class="my-4">' +
			'<h6 class="fw-semibold">Connect another license</h6>' +
			'<p class="small text-body-secondary">' + emailDescription + '</p>' +
			'<form data-support-claim-form>' +
				'<label class="form-label" for="lay-support-license-key">License key</label>' +
				'<div class="input-group">' +
					'<input id="lay-support-license-key" name="licenseKey" class="form-control" type="text" autocomplete="off" required placeholder="Enter your license key">' +
					'<button class="btn btn-primary" type="submit">Connect license</button>' +
				'</div>' +
			'</form>';
	}

	function bindClaimForm(modal) {
		modal.off('click.licenseGateKey').on('click.licenseGateKey', '[data-license-key-toggle]', function () {
			var button = $(this);
			var key = button.siblings('[data-license-key]');
			var showing = button.attr('aria-label') === 'Hide full license key';
			key.text(showing ? key.attr('data-license-key-hidden') : key.attr('data-license-key-full'));
			button.attr('aria-label', showing ? 'Show full license key' : 'Hide full license key');
			button.attr('title', showing ? 'Show full license key' : 'Hide full license key');
			button.find('i').toggleClass('fa-eye', showing).toggleClass('fa-eye-slash', !showing);
		});
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
				title: 'Support & licenses',
				message: '<div class="d-flex align-items-center gap-2"><i class="fa fa-spinner fa-spin"></i><span>Loading support status…</span></div>',
				size: 'large',
				buttons: {
					close: { label: 'Close', className: 'btn-secondary' },
				},
			});
			modal.addClass('license-gate-modal');
			modal.find('.modal-dialog').addClass('modal-dialog-scrollable');
			loadStatus(false).then(function (status) {
				modal.find('.bootbox-body').html(renderStatus(status));
				bindClaimForm(modal);
			});
		});
	}

	$(document).on('click', '[component="license-gate/support"] button, [component="license-gate/support-summary"] button', function (event) {
		event.preventDefault();
		openSupportModal();
	});

	addSupportButtons();
	addSupportSummary();
	if (app.user && app.user.uid) {
		loadStatus(false);
	}

	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'register' && utils.param('error')) {
			app.alertError('Registration failed. Please check your license key and try again.');
		}
		addSupportButtons();
		addSupportSummary();
		updateSupportButtons(cachedStatus);
	});
});
