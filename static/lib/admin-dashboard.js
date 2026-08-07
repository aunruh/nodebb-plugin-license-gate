'use strict';

/* global $, ajaxify */

(function () {
	function number(value) {
		return Number(value || 0).toLocaleString();
	}

	function metric(label, value, note) {
		return '<div class="col-6 col-xl-3">' +
			'<div class="border rounded p-3 h-100">' +
				'<div class="text-body-secondary text-xs text-uppercase fw-semibold">' + label + '</div>' +
				'<div class="fs-3 fw-semibold mt-1">' + number(value) + '</div>' +
				'<div class="small text-body-secondary">' + note + '</div>' +
			'</div>' +
		'</div>';
	}

	function tableRow(label, value) {
		return '<div class="d-flex justify-content-between gap-3 border-bottom py-2">' +
			'<span>' + label + '</span><strong>' + number(value) + '</strong>' +
		'</div>';
	}

	function renderAnalytics(data) {
		var html = '<div class="row g-3 mb-3">' +
			metric('Forum visitors', data.overview.visitors, 'unique non-admin accounts') +
			metric('Unable to post', data.overview.blockedUsers, data.overview.blockedRate + '% of visitors') +
			metric('Actually blocked', data.overview.postingBlockedUsers, number(data.overview.postingBlockAttempts) + ' posting attempts') +
			metric('Support Pass buyers', data.payments.paidUsers, data.payments.blockedConversionRate + '% of gated users') +
		'</div>' +
		'<div class="row g-4 text-sm">' +
			'<div class="col-12 col-xl-4"><h6 class="fw-bold">Support status</h6>' +
				'<p class="small text-body-secondary">Accounts may appear in more than one state if their status changed.</p>' +
				tableRow('No connected license', data.overview.noLicenseUsers) +
				tableRow('Included support expired', data.overview.expiredLicenseUsers) +
				tableRow('Support active', data.overview.activeUsers) +
			'</div>' +
			'<div class="col-12 col-xl-4"><h6 class="fw-bold">License connections</h6>' +
				'<p class="small text-body-secondary">' + number(data.licenses.claimUsers) + ' accounts entered a key.</p>' +
				tableRow('No key → support active', data.licenses.noLicenseToActive) +
				tableRow('No key → still expired', data.licenses.noLicenseToExpired) +
				tableRow('Expired key → active with new key', data.licenses.expiredToActive) +
				tableRow('Expired key → still expired', data.licenses.expiredToExpired) +
			'</div>' +
			'<div class="col-12 col-xl-4"><h6 class="fw-bold">Support Pass conversion</h6>' +
				tableRow('Checkout opened', data.payments.checkoutUsers) +
				tableRow('Paid', data.payments.paidUsers) +
				tableRow('Gated account → paid', data.payments.blockedToPaidUsers) +
				tableRow('Failed checkout', data.payments.failedOrders) +
				'<div class="d-flex justify-content-between gap-3 pt-2"><span>Checkout conversion</span><strong>' + data.payments.checkoutConversionRate + '%</strong></div>' +
			'</div>' +
		'</div>';
		$('#license-gate-dashboard-body').html(html);
	}

	function loadAnalytics(days) {
		var $body = $('#license-gate-dashboard-body');
		$body.html('<div class="py-4 text-center text-body-secondary"><i class="fa fa-circle-o-notch fa-spin me-2"></i>Loading support analytics…</div>');
		var relativePath = window.config?.relative_path || '';
		window.fetch(relativePath + '/api/v3/plugins/license-gate/admin/analytics?days=' + days, {
			credentials: 'same-origin',
			headers: { accept: 'application/json' },
		})
			.then(function (response) {
				return response.json().then(function (payload) {
					if (!response.ok) {
						throw new Error(payload?.status?.message || payload?.error?.message || 'Support analytics are temporarily unavailable.');
					}
					return payload.response || payload;
				});
			})
			.then(renderAnalytics)
			.catch(function (error) {
				$body.empty().append(
					$('<div class="alert alert-warning mb-0"></div>').text(error.message || 'Support analytics are temporarily unavailable.')
				);
			});
	}

	function addDashboard() {
		var $column = $('.row.dashboard > .col-lg-8').first();
		if (!$column.length || $('#license-gate-support-funnel').length) {
			return;
		}

		var periods = [1, 7, 30, 90, 365].map(function (days) {
			var label = days === 1 ? 'Today' : (days === 365 ? '1 year' : days + ' days');
			return '<button type="button" class="btn btn-sm btn-outline-secondary' + (days === 30 ? ' active' : '') + '" data-support-days="' + days + '">' + label + '</button>';
		}).join('');
		var html = '<div id="license-gate-support-funnel" class="card mb-3">' +
			'<div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">' +
				'<div><strong>Lay Theme support funnel</strong><div class="small text-body-secondary fw-normal">Conversion from support gate to license or Support Pass</div></div>' +
				'<div class="d-flex flex-wrap align-items-center gap-2"><div class="btn-group" role="group">' + periods + '</div>' +
				'<a class="btn btn-sm btn-light" href="' + (window.config?.relative_path || '') + '/admin/plugins/license-gate">Settings &amp; details</a></div>' +
			'</div>' +
			'<div class="card-body" id="license-gate-dashboard-body"></div>' +
		'</div>';
		$column.prepend(html);
		$('#license-gate-support-funnel').on('click', '[data-support-days]', function () {
			var $button = $(this);
			$button.closest('.btn-group').find('.active').removeClass('active');
			$button.addClass('active');
			loadAnalytics(Number($button.attr('data-support-days')));
		});
		loadAnalytics(30);
	}

	function isDashboard(data) {
		return data?.tpl_url === 'admin/dashboard' || window.location.pathname.endsWith('/admin') || window.location.pathname.endsWith('/admin/dashboard');
	}

	$(window).on('action:ajaxify.end', function (_event, data) {
		if (isDashboard(data)) {
			addDashboard();
		}
	});

	$(function () {
		if (isDashboard(typeof ajaxify === 'undefined' ? null : ajaxify.data)) {
			addDashboard();
		}
	});
}());
