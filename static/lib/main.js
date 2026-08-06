'use strict';
/* global utils, app, config, ajaxify, socket */

$(function () {
	var cachedStatus = null;
	var statusPromise = null;

	function escapeHtml(value) {
		return $('<div>').text(value == null ? '' : String(value)).html();
	}

	function formatDate(value) {
		if (!value) {
			return 'Not available';
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

	function formatRelativeAge(value) {
		if (!value) {
			return '';
		}
		var days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
		if (days === 0) {
			return 'today';
		}
		if (days === 1) {
			return '1 day ago';
		}
		if (days < 31) {
			return days + ' days ago';
		}
		var months = Math.floor(days / 30.4375);
		if (months < 12) {
			return months + ' month' + (months === 1 ? '' : 's') + ' ago';
		}
		var years = Math.floor(months / 12);
		var remainingMonths = months % 12;
		return years + ' year' + (years === 1 ? '' : 's') +
			(remainingMonths ? ', ' + remainingMonths + ' month' + (remainingMonths === 1 ? '' : 's') : '') + ' ago';
	}

	function daysSince(value) {
		if (!value) {
			return 0;
		}
		return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
	}

	function isAwaitingFirstLicense(status) {
		return Boolean(status &&
			!status.unavailable &&
			(!status.keys || !status.keys.length) &&
			(!status.supportPasses || !status.supportPasses.length) &&
			!status.supportUntil);
	}

	function requiresEmailConfirmation() {
		return Boolean(app.user && app.user.uid && !app.user['email:confirmed']);
	}

	function getEmailConfirmationStatus() {
		return { emailConfirmationRequired: true };
	}

	function renderEmailConfirmationNotice() {
		var changeEmailUrl = (config.relative_path || '') + '/me/edit/email';
		return '<div component="license-gate/email-confirmation" class="container-lg px-md-4 mt-3">' +
			'<div class="alert alert-warning mb-0 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3" role="status">' +
				'<div>' +
					'<h5 class="alert-heading fw-semibold mb-1">Confirm your email to finish setting up your account</h5>' +
					'<p class="mb-1">Please click the confirmation link we sent you. Once confirmed, we can connect your Lay Theme license and calculate your forum support access. You can already read all forum topics.</p>' +
					'<p class="small mb-0"><i class="fa fa-envelope me-1" aria-hidden="true"></i>Please also check your spam folder.</p>' +
				'</div>' +
				'<div class="d-flex flex-wrap gap-2 flex-shrink-0">' +
					'<button type="button" class="btn btn-primary text-nowrap" data-resend-confirmation-email>Resend confirmation email</button>' +
					'<a class="btn btn-outline-secondary text-nowrap" href="' + escapeHtml(changeEmailUrl) + '">Change email address</a>' +
				'</div>' +
			'</div>' +
		'</div>';
	}

	function syncEmailConfirmationUi() {
		var required = requiresEmailConfirmation();
		$('body').toggleClass('license-gate-email-confirmation-required', required);

		if (!required) {
			$('[component="license-gate/email-confirmation"]').remove();
			return;
		}

		if (!$('[component="license-gate/email-confirmation"]').length) {
			var brand = $('.brand-container').first();
			if (brand.length) {
				brand.after(renderEmailConfirmationNotice());
			}
		}

		require(['alerts'], function (alerts) {
			alerts.remove('email_confirm');
		});
	}

	function resendConfirmationEmail(button) {
		var originalLabel = button.text();
		button.prop('disabled', true).text('Sending…');
		socket.emit('user.emailConfirm', {}, function (error) {
			button.prop('disabled', false).text(originalLabel);
			require(['alerts'], function (alerts) {
				if (error) {
					alerts.error(error);
					return;
				}
				alerts.success('Confirmation email sent. Please check your inbox and spam folder.');
			});
		});
	}

	function applyLocalSupportPreview(status) {
		var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		var preview = new URLSearchParams(window.location.search).get('support-preview');
		if (!isLocal || (preview !== 'expired' && preview !== 'pass' && preview !== 'none')) {
			return status;
		}
		if (preview === 'none') {
			return Object.assign({}, status, {
				canPost: false,
				activeSource: null,
				activeSourceId: null,
				activePolicy: null,
				daysRemaining: 0,
				monthsRemaining: 0,
				supportUntil: null,
				keys: [],
				supportPasses: [],
			});
		}
		if (preview === 'pass') {
			var purchasedAt = new Date(Date.now() - (14 * 86400000));
			var endsAt = new Date(purchasedAt);
			endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 1);
			var policy = status.policy || {};
			return Object.assign({}, status, {
				canPost: true,
				activeSource: 'payment',
				activeSourceId: 'preview-support-pass',
				activePolicy: 'payment',
				daysRemaining: Math.ceil((endsAt.getTime() - Date.now()) / 86400000),
				supportUntil: endsAt.toISOString(),
				keys: (status.keys || []).map(function (key) {
					return Object.assign({}, key, { determinesSupport: false });
				}),
				supportPasses: [{
					id: 'preview-support-pass',
					source: 'payment',
					purchasedAt: purchasedAt.toISOString(),
					startsAt: purchasedAt.toISOString(),
					endsAt: endsAt.toISOString(),
					provider: 'preview',
					amountMinor: policy.priceMinor || 2000,
					currency: policy.currency || 'EUR',
					revokedAt: null,
					determinesSupport: true,
				}],
			});
		}
		return Object.assign({}, status, {
			canPost: false,
			activeSource: null,
			activeSourceId: null,
			daysRemaining: 0,
			supportUntil: new Date(Date.now() - (30 * 86400000)).toISOString(),
		});
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
			'<p>Lay Theme has always included free updates and personal forum support. I still release updates, often every month, and I love that many people come back to rebuild their websites with Lay Theme years later.</p>' +
			'<p>Over the years, I’ve seen customers return long after their original purchase, often to rebuild an entire website, and naturally need support again. I completely understand that, but providing personal support indefinitely is no longer sustainable for a small independent project.</p>' +
			'<p>To keep support personal and reliable, purchases or paid license upgrades from <strong>' + escapeHtml(formatLongDate(policy.effectiveAt)) + '</strong> include <strong>' + escapeHtml(formatDuration(policy.standardMonths)) + '</strong> of forum support. Earlier purchases and upgrades receive <strong>' + escapeHtml(formatDuration(policy.legacyMonths)) + '</strong> of included support under this new policy. After that, a <strong>' + escapeHtml(formatPrice(policy.priceMinor, policy.currency)) + ' support pass</strong> provides another ' + escapeHtml(formatDuration(policy.paidMonths)) + '.</p>' +
			'<p class="mb-0">Lay Theme updates remain free, and you can always continue reading the forum.</p>' +
		'</div>';
	}

	function renderSupportContactHelp(className) {
		return '<p class="' + escapeHtml(className || 'small mt-3 mb-0') + '">If this support status looks incorrect, or you recently purchased a license and are having trouble connecting it, email me at <a href="mailto:info@laytheme.com">info@laytheme.com</a> and I’ll help you sort it out.</p>';
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
				'<button type="button" class="btn btn-sm btn-outline-secondary text-nowrap" data-support-summary-action="support">Support &amp; licenses</button>' +
			'</div>'
		);
		updateSupportButtons(cachedStatus);
	}

	function updateSupportButtons(status) {
		var items = $('[component="license-gate/support"]');
		var summary = $('[component="license-gate/support-summary"]');
		var summaryAction = summary.find('[data-support-summary-action]');
		items.find('[data-support-icon]').removeClass('text-success text-warning text-secondary');
		summary.find('[data-support-dot]').removeClass('bg-success bg-warning bg-secondary');
		summaryAction.attr('data-support-summary-action', 'support').text('Support & licenses');
		if (!status) {
			items.find('[data-support-label]').text('Support');
			items.find('[data-support-icon]').addClass('text-secondary');
			summary.find('[data-support-dot]').addClass('bg-secondary');
			summary.find('[data-support-summary-title]').text('Checking forum support…');
			summary.find('[data-support-summary-date]').text('');
			return;
		}
		if (status.emailConfirmationRequired) {
			items.find('[data-support-label]').text('Confirm email');
			items.find('[data-support-icon]').addClass('text-warning');
			summary.find('[data-support-dot]').addClass('bg-warning');
			summary.find('[data-support-summary-title]').text('Please confirm your email');
			summary.find('[data-support-summary-date]').text('Check your inbox to activate forum posting');
			summaryAction.attr('data-support-summary-action', 'resend-email').text('Resend confirmation email');
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
		if (isAwaitingFirstLicense(status)) {
			items.find('[data-support-label]').text('Connect license');
			items.find('[data-support-icon]').addClass('text-secondary');
			summary.find('[data-support-dot]').addClass('bg-secondary');
			summary.find('[data-support-summary-title]').text('Connect your Lay Theme license');
			summary.find('[data-support-summary-date]').text('Enter your license key to check your support');
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
			summary.find('[data-support-summary-title]').text(elapsed ? 'Your included support ended ' + formatDayCount(elapsed) + ' ago' : 'Your included support ended today');
			summary.find('[data-support-summary-date]').text('Renew support to post again');
		}
	}

	function isSupportGatedComposerAction(action) {
		return action === 'topics.post' || action === 'posts.reply';
	}

	function isPostingBlocked(status) {
		return Boolean(status && !status.unavailable && status.postingEnforced && status.canPost === false && !(app.user && (app.user.isAdmin || app.user.isGlobalMod)));
	}

	function applyComposerSupportGate(postContainer, status) {
		var action = postContainer.attr('data-license-gate-composer-action');
		if (!isSupportGatedComposerAction(action)) {
			return;
		}

		postContainer.find('[component="license-gate/composer-support-required"]').remove();
		postContainer.find('.composer-submit[data-license-gate-disabled]')
			.prop('disabled', false)
			.removeAttr('data-license-gate-disabled');

		if (!isPostingBlocked(status)) {
			return;
		}

		var awaitingFirstLicense = isAwaitingFirstLicense(status);
		var title = awaitingFirstLicense ?
			'Connect your Lay Theme license to post.' :
			'Your included support period has ended.';
		var message = awaitingFirstLicense ?
			'Enter your license key to check your included support and posting access.' :
			(status.keys && status.keys.length ?
			'Connect another eligible Lay Theme license or purchase a 12-month Support Pass to continue posting.' :
			'Connect a valid Lay Theme license before purchasing a 12-month Support Pass.');
		var notice = $(
			'<div component="license-gate/composer-support-required" class="alert alert-warning d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-1 py-2 px-3">' +
				'<div><strong>' + escapeHtml(title) + '</strong><br><span class="small">' + escapeHtml(message) + '</span></div>' +
				'<button type="button" class="btn btn-sm btn-primary text-nowrap" data-open-support-from-composer>Support &amp; licenses</button>' +
			'</div>'
		);
		postContainer.find('.write-preview-container').before(notice);
		postContainer.find('.composer-submit')
			.prop('disabled', true)
			.attr('data-license-gate-disabled', 'true');
	}

	function refreshOpenComposerSupportGates(status) {
		$('[component="composer"][data-license-gate-composer-action]').each(function () {
			applyComposerSupportGate($(this), status);
		});
	}

	function loadStatus(force) {
		if (requiresEmailConfirmation()) {
			cachedStatus = getEmailConfirmationStatus();
			updateSupportButtons(cachedStatus);
			refreshOpenComposerSupportGates(cachedStatus);
			return Promise.resolve(cachedStatus);
		}
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
						status = applyLocalSupportPreview(status);
						cachedStatus = status;
						updateSupportButtons(status);
						refreshOpenComposerSupportGates(status);
						resolve(status);
					})
					.catch(function (error) {
						cachedStatus = { unavailable: true, message: error.message || String(error) };
						updateSupportButtons(cachedStatus);
						refreshOpenComposerSupportGates(cachedStatus);
						resolve(cachedStatus);
					})
					.finally(function () {
						statusPromise = null;
					});
			});
		});
		return statusPromise;
	}

	function renderAdminTopicAuthorSupport(summary) {
		var panel = $('[component="license-gate/admin-author-support"]');
		if (!panel.length) {
			return;
		}
		var dot = panel.find('[data-admin-support-dot]');
		var title = panel.find('[data-admin-support-title]');
		var detail = panel.find('[data-admin-support-detail]');
		var username = summary.username || 'This user';
		dot.removeClass('bg-success bg-warning bg-secondary');

		if (!summary.latestActivity) {
			dot.addClass('bg-secondary');
			title.text('No license or support pass is connected to ' + username + '.');
			detail.text('Support availability cannot be calculated yet.');
			return;
		}

		var activity = summary.latestActivity.label + ' ' + formatRelativeAge(summary.latestActivity.at) + ' · ' + formatDate(summary.latestActivity.at);
		if (summary.canPost) {
			dot.addClass('bg-success');
			title.text(username + '’s forum support is active · ' + formatDayCount(summary.daysRemaining) + ' remaining');
			detail.text('Available until ' + formatDate(summary.supportUntil) + '. Latest: ' + activity + '.');
			return;
		}

		dot.addClass('bg-warning');
		var ended = summary.supportUntil ? formatRelativeAge(summary.supportUntil) : '';
		title.text(username + '’s forum support ' + (ended ? 'expired ' + ended : 'has expired'));
		detail.text('Latest: ' + activity + '.');
	}

	function addAdminTopicAuthorSupport() {
		$('[component="license-gate/admin-author-support"]').remove();
		if (!app.user || !app.user.isAdmin || !ajaxify.data || !ajaxify.data.template || !ajaxify.data.template.topic) {
			return;
		}

		var firstPost = ajaxify.data.posts && ajaxify.data.posts[0];
		var targetUid = Number(ajaxify.data.uid || (firstPost && firstPost.uid));
		if (!targetUid) {
			return;
		}

		var topicInfo = $('[component="topic/title"]').closest('h1').siblings('.topic-info').first();
		if (!topicInfo.length) {
			return;
		}

		var username = firstPost && firstPost.user && (firstPost.user.displayname || firstPost.user.username);
		var panel = $(
			'<div component="license-gate/admin-author-support" class="license-gate-admin-author-support d-flex align-items-start gap-2 border rounded-2 px-3 py-2">' +
				'<span class="license-gate-support-dot bg-secondary mt-1" data-admin-support-dot aria-hidden="true"></span>' +
				'<span class="d-flex flex-column lh-sm min-w-0">' +
					'<strong class="small text-break" data-admin-support-title>Checking ' + escapeHtml(username || 'topic author') + '’s support…</strong>' +
					'<span class="small text-body-secondary text-break mt-1" data-admin-support-detail>Visible to forum administrators only.</span>' +
				'</span>' +
			'</div>'
		);
		topicInfo.after(panel);

		require(['api'], function (api) {
			api.get('/plugins/license-gate/admin/users/' + targetUid + '/support-status')
				.then(renderAdminTopicAuthorSupport)
				.catch(function (error) {
					panel.find('[data-admin-support-title]').text('Support status is unavailable.');
					panel.find('[data-admin-support-detail]').text(error.message || String(error));
				});
		});
	}

	function getAdminSupportIndicator(summary) {
		var dotClass = 'bg-secondary';
		var label = 'Support status unavailable';
		if (summary && !summary.unavailable) {
			if (!summary.latestActivity) {
				label = 'No license connected';
			} else if (summary.canPost) {
				dotClass = 'bg-success';
				label = 'Support active · ' + formatDayCount(summary.daysRemaining) + ' left';
			} else {
				dotClass = 'bg-warning';
				label = 'Support expired' + (summary.supportUntil ? ' ' + formatRelativeAge(summary.supportUntil) : '');
			}
		}
		return { dotClass: dotClass, label: label };
	}

	function renderRecentAuthorSupport(topic, summary) {
		var topicItem = $('[component="category/topic"][data-tid="' + Number(topic.tid) + '"]');
		if (!topicItem.length) {
			return;
		}
		topicItem.removeAttr('data-license-gate-support-loading');
		var header = topicItem.find('[component="topic/header"]');
		if (!header.length || header.siblings('[component="license-gate/recent-author-support"]').length) {
			return;
		}

		var indicator = getAdminSupportIndicator(summary);

		header.after(
			'<div component="license-gate/recent-author-support" class="license-gate-recent-author-support d-flex align-items-center gap-2 w-100 mt-1" title="Visible to forum administrators only">' +
				'<span class="license-gate-support-dot ' + indicator.dotClass + '" aria-hidden="true"></span>' +
				'<span class="text-body-secondary">' + escapeHtml(indicator.label) + '</span>' +
			'</div>'
		);
	}

	function renderAdminProfileSupport(summary) {
		var panel = $('[component="license-gate/profile-support"]');
		if (!panel.length) {
			return;
		}
		var indicator = getAdminSupportIndicator(summary);
		panel.find('[data-admin-profile-support-dot]')
			.removeClass('bg-success bg-warning bg-secondary')
			.addClass(indicator.dotClass);
		panel.find('[data-admin-profile-support-label]').text(indicator.label);
	}

	function addAdminProfileSupport() {
		$('[component="license-gate/profile-support"]').remove();
		if (!app.user || !app.user.isAdmin || !ajaxify.data || !ajaxify.data.template || !ajaxify.data.template['account/profile']) {
			return;
		}

		var targetUid = Number(ajaxify.data.uid);
		var identity = $('.account .fullname').first().parent();
		if (!targetUid || !identity.length) {
			return;
		}

		var panel = $(
			'<div component="license-gate/profile-support" class="license-gate-recent-author-support d-flex align-items-center gap-2 mt-1" title="Visible to forum administrators only">' +
				'<span class="license-gate-support-dot bg-secondary" data-admin-profile-support-dot aria-hidden="true"></span>' +
				'<span class="text-body-secondary" data-admin-profile-support-label>Checking forum support…</span>' +
			'</div>'
		);
		identity.append(panel);

		require(['api'], function (api) {
			api.get('/plugins/license-gate/admin/users/' + targetUid + '/support-status')
				.then(renderAdminProfileSupport)
				.catch(function () {
					renderAdminProfileSupport({ unavailable: true });
				});
		});
	}

	function addAdminRecentSupportStatuses(loadedTopics, reset) {
		if (reset) {
			$('[component="license-gate/recent-author-support"]').remove();
			$('[component="category/topic"]').removeAttr('data-license-gate-support-loading');
		}
		if (!app.user || !app.user.isAdmin || !ajaxify.data || !ajaxify.data.template || !ajaxify.data.template.recent) {
			return;
		}

		var topics = (loadedTopics || ajaxify.data.topics || []).filter(function (topic) {
			var topicItem = $('[component="category/topic"][data-tid="' + Number(topic.tid) + '"]');
			return Number(topic.tid) > 0 && Number(topic.uid) > 0 && topicItem.length &&
				!topicItem.attr('data-license-gate-support-loading') &&
				!topicItem.find('[component="license-gate/recent-author-support"]').length;
		});
		topics.forEach(function (topic) {
			$('[component="category/topic"][data-tid="' + Number(topic.tid) + '"]')
				.attr('data-license-gate-support-loading', '1');
		});
		var uids = topics.map(function (topic) { return Number(topic.uid); }).filter(function (uid, index, values) {
			return values.indexOf(uid) === index;
		});
		if (!uids.length) {
			return;
		}

		require(['api'], function (api) {
			api.post('/plugins/license-gate/admin/support-status-batch', { uids: uids })
				.then(function (result) {
					var users = result.users || {};
					topics.forEach(function (topic) {
						renderRecentAuthorSupport(topic, users[String(topic.uid)]);
					});
				})
				.catch(function () {
					topics.forEach(function (topic) {
						$('[component="category/topic"][data-tid="' + Number(topic.tid) + '"]')
							.removeAttr('data-license-gate-support-loading');
					});
				});
		});
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
		var featured = keys.find(function (key) { return key.determinesSupport; }) || null;
		var primary = featured || keys[0];
		var others = keys.filter(function (key) { return key.id !== primary.id; });
		var result = '<div class="list-group border rounded-2 overflow-hidden">' + renderKey(primary, status, Boolean(featured)) + '</div>';
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

	function renderSupportPass(pass, status) {
		var active = pass.determinesSupport && status.canPost && !pass.revokedAt;
		var paidMonths = (status.policy || {}).paidMonths || 12;
		var passDuration = paidMonths % 12 === 0 ? (paidMonths / 12) + '-Year' : paidMonths + '-Month';
		var title = pass.source === 'admin' ? 'Forum Support Access' : passDuration + ' Forum Support Pass';
		var purchaseLabel = pass.source === 'admin' ? 'Granted ' : 'Purchased ';
		var price = pass.amountMinor != null ? ' · ' + formatPrice(pass.amountMinor, pass.currency) : '';
		var revokedLabel = pass.revocationReason === 'refund' ? 'Refunded' : 'Suspended';
		var badge = pass.revokedAt ?
			'<span class="badge text-bg-secondary">' + escapeHtml(revokedLabel) + '</span>' :
			(active ? '<span class="badge text-bg-primary">Currently providing forum support</span>' : '');
		return '<div class="list-group-item ' + (active ? 'license-gate-featured-support-pass' : '') + '">' +
			'<div class="d-flex align-items-center gap-2 flex-wrap">' +
				'<i class="fa fa-headset" aria-hidden="true"></i>' +
				'<strong>' + escapeHtml(title) + '</strong>' + badge +
			'</div>' +
			'<div class="small text-body-secondary mt-2">' + purchaseLabel + escapeHtml(formatDate(pass.purchasedAt)) + escapeHtml(price) + '</div>' +
			'<div class="small text-body-secondary">Valid from ' + escapeHtml(formatDate(pass.startsAt)) + ' to ' + escapeHtml(formatDate(pass.endsAt)) + '</div>' +
			(active ? '<div class="small mt-2"><i class="fa fa-check-circle text-success me-1" aria-hidden="true"></i>This support pass is currently providing your forum support.</div>' : '') +
		'</div>';
	}

	function renderSupportPasses(passes, status) {
		if (!passes || !passes.length) {
			return '';
		}
		return '<h6 class="fw-semibold mt-4">Your support passes</h6>' +
			'<p class="small text-body-secondary">Support passes belong to this forum account and are independent of individual license keys.</p>' +
			'<div class="list-group border rounded-2 overflow-hidden">' + passes.map(function (pass) {
				return renderSupportPass(pass, status);
			}).join('') + '</div>';
	}

	function renderSupportCheckout(status) {
		var policy = status.policy || {};
		var label = 'Purchase ' + formatDuration(policy.paidMonths || 12) + ' of support for ' + formatPrice(policy.priceMinor || 2000, policy.currency || 'EUR');
		if (!status.keys || !status.keys.length) {
			return '<p class="small mb-0">Connect a valid Lay Theme license below before purchasing a Support Pass.</p>';
		}
		if (status.checkoutAvailable) {
			return '<button type="button" class="btn btn-primary" data-support-checkout>' + escapeHtml(label) + '</button>';
		}
		return '<button type="button" class="btn btn-primary" disabled>Purchase 1 year of support, coming soon</button>';
	}

	function renderStatus(status) {
		if (status.emailConfirmationRequired) {
			return '<div class="alert alert-warning mb-0">' +
				'<h5 class="alert-heading fw-semibold">Confirm your email to finish setting up your account</h5>' +
				'<p>Please click the confirmation link we sent you. Once confirmed, we can connect your Lay Theme license and calculate your forum support access. You can already read all forum topics.</p>' +
				'<p class="small"><i class="fa fa-envelope me-1" aria-hidden="true"></i>Please also check your spam folder.</p>' +
				'<div class="d-flex flex-wrap gap-2">' +
					'<button type="button" class="btn btn-primary" data-resend-confirmation-email>Resend confirmation email</button>' +
					'<a class="btn btn-outline-secondary" href="' + escapeHtml((config.relative_path || '') + '/me/edit/email') + '">Change email address</a>' +
				'</div>' +
			'</div>';
		}
		if (status.unavailable) {
			return '<div class="alert alert-secondary mb-3"><strong>Support status is unavailable.</strong><br><span class="small">' + escapeHtml(status.message || 'Please try again later.') + '</span></div>';
		}
		var forumEmail = app.user && app.user.email ? String(app.user.email) : '';
		var emailDescription = forumEmail ?
			'Your forum account uses <strong>' + escapeHtml(forumEmail) + '</strong>. If the license is registered to this email address, we will connect it immediately. If it is registered to a different email address, we will send a confirmation link to the license owner. Once confirmed, the license will be connected and included when we calculate your support availability.' :
			'If the license is registered to your forum account email, we will connect it immediately. If it is registered to a different email address, we will send a confirmation link to the license owner. Once confirmed, the license will be connected and included when we calculate your support availability.';
		var claimForm =
			'<p class="small text-body-secondary">' + emailDescription + '</p>' +
			'<form data-support-claim-form>' +
				'<label class="form-label" for="lay-support-license-key">License key</label>' +
				'<div class="input-group">' +
					'<input id="lay-support-license-key" name="licenseKey" class="form-control" type="text" autocomplete="off" required placeholder="Enter your license key">' +
					'<button class="btn btn-primary" type="submit">Connect license</button>' +
				'</div>' +
			'</form>';

		if (isAwaitingFirstLicense(status)) {
			return '<div class="mb-4">' +
				'<h5 class="fw-semibold">Please enter your license key</h5>' +
				'<p class="text-body-secondary mb-0">Connect your Lay Theme license to check your included forum support and posting access.</p>' +
			'</div>' + claimForm + renderSupportContactHelp('small text-body-secondary mt-3 mb-0');
		}
		var activeTitle = status.activeSource === 'payment' ? 'Your support pass is active.' : 'Your forum support is active.';
		var expiredMessage = status.checkoutAvailable ?
			'Purchase a Support Pass to post product-related questions for another year.' :
			'Connect an eligible Lay Theme license below to restore posting access.';
		var expiredLicenseOption =
			'<div class="d-flex align-items-center gap-3 my-4" aria-hidden="true">' +
				'<hr class="flex-grow-1 my-0">' +
				'<span class="small fw-semibold text-body-secondary">OR</span>' +
				'<hr class="flex-grow-1 my-0">' +
			'</div>' +
			'<div class="mb-4">' +
				'<h5 class="fw-semibold">Connect another license</h5>' +
				'<p class="text-body-secondary">If you have another Lay Theme license, enter its key here. A more recent purchase or paid upgrade may restore your included forum support.</p>' +
				claimForm +
			'</div>';
		var summary = status.canPost ?
			'<div class="alert alert-success"><strong>' + activeTitle + '</strong><br>You can post support questions until ' + escapeHtml(formatDate(status.supportUntil)) + ', with ' + escapeHtml(formatDayCount(status.daysRemaining)) + ' remaining.</div>' :
			'<div class="alert alert-warning"><strong>Your included support period ended' + (status.supportUntil ? ' on ' + escapeHtml(formatDate(status.supportUntil)) : '') + '.</strong><br>' + escapeHtml(expiredMessage) + '<div class="mt-3">' + renderSupportCheckout(status) + '</div>' + renderSupportContactHelp() + '</div>' + expiredLicenseOption + renderSupportPolicy(status);

		var licenseDescription = status.canPost && status.activeSource === 'payment' ?
			'Your current support is provided by the pass above. Your connected licenses remain available here for reference.' :
			'We use your most recent license purchase or paid upgrade to calculate included support.';
		var licenseTools =
			'<p class="small text-body-secondary">' + licenseDescription + '</p>' +
			renderKeys(status.keys, status) +
			(status.canPost ?
				'<hr class="my-4"><h6 class="fw-semibold">Connect another license</h6>' + claimForm : '');
		var licenseSection = status.canPost && status.activeSource === 'payment' ?
			'<details class="license-gate-manage-licenses border rounded-2 mt-4"><summary class="fw-semibold p-3">Manage connected licenses</summary><div class="border-top p-3">' + licenseTools + '</div></details>' :
			'<h6 class="fw-semibold mt-4">Your licenses</h6>' + licenseTools;

		return summary + renderSupportPasses(status.supportPasses, status) + licenseSection;
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
		modal.off('click.licenseGateCheckout').on('click.licenseGateCheckout', '[data-support-checkout]', function () {
			var button = $(this);
			var originalLabel = button.text();
			button.prop('disabled', true).text('Opening secure checkout…');
			require(['api', 'alerts'], function (api, alerts) {
				api.post('/plugins/license-gate/support-checkout', {})
					.then(function (result) {
						window.location.assign(result.checkoutUrl);
					})
					.catch(function (error) {
						alerts.error(error);
						button.prop('disabled', false).text(originalLabel);
					});
			});
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
						if (result.status === 'transfer_verification_required') {
							alerts.success('This license is connected to another forum account. A transfer confirmation email was sent to ' + result.sentTo + '.');
						} else if (result.status === 'verification_required') {
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

	function clearCheckoutQuery() {
		var url = new window.URL(window.location.href);
		url.searchParams.delete('support-checkout');
		window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
	}

	function handleCheckoutReturn() {
		var checkoutResult = utils.param('support-checkout');
		if (checkoutResult !== 'complete' && checkoutResult !== 'cancelled') {
			return;
		}
		clearCheckoutQuery();
		require(['alerts'], function (alerts) {
			if (checkoutResult === 'cancelled') {
				alerts.info('Checkout was cancelled. No payment was taken.');
				return;
			}
			alerts.success('Payment received. Your Support Pass will appear as soon as Dodo confirms the payment.');
			openSupportModal();
			var attemptsRemaining = 8;
			var refresh = function () {
				var modal = $('.license-gate-modal').last();
				if (!modal.length || attemptsRemaining <= 0) {
					return;
				}
				attemptsRemaining -= 1;
				cachedStatus = null;
				loadStatus(true).then(function (status) {
					modal.find('.bootbox-body').html(renderStatus(status));
					bindClaimForm(modal);
					if (status.activeSource !== 'payment') {
						window.setTimeout(refresh, 2000);
					}
				});
			};
			window.setTimeout(refresh, 2000);
		});
	}

	$(document).on('click', '[data-resend-confirmation-email], [data-support-summary-action="resend-email"]', function (event) {
		event.preventDefault();
		resendConfirmationEmail($(this));
	});

	$(document).on('click', '[component="license-gate/support"] button, [data-support-summary-action="support"], [data-open-support-from-composer]', function (event) {
		event.preventDefault();
		openSupportModal();
	});

	require(['hooks'], function (hooks) {
		hooks.on('action:topics.loaded', function (payload) {
			addAdminRecentSupportStatuses(payload && payload.topics, false);
		});

		hooks.on('filter:composer.check', function (payload) {
			var action = payload && payload.postData ? payload.postData.action : '';
			if (!isSupportGatedComposerAction(action) || (app.user && (app.user.isAdmin || app.user.isGlobalMod))) {
				return payload;
			}
			return loadStatus(false).then(function (status) {
				if (isPostingBlocked(status)) {
					payload.error = isAwaitingFirstLicense(status) ?
						'Connect your Lay Theme license before posting. Open “Support & licenses” and enter your license key.' :
						'Your included support period has ended. Open “Support & licenses” to connect another Lay Theme license or purchase a 12-month Support Pass before posting.';
				}
				return payload;
			});
		});
	});

	$(window).on('action:composer.loaded.licenseGate', function (event, data) {
		var postContainer = data && data.postContainer ? data.postContainer : $();
		var action = data && data.composerData ? data.composerData.action : '';
		if (!postContainer.length || !isSupportGatedComposerAction(action)) {
			return;
		}
		postContainer.attr('data-license-gate-composer-action', action);
		loadStatus(false).then(function (status) {
			applyComposerSupportGate(postContainer, status);
		});
	});

	syncEmailConfirmationUi();
	addSupportButtons();
	addSupportSummary();
	addAdminTopicAuthorSupport();
	addAdminRecentSupportStatuses(null, true);
	addAdminProfileSupport();
	if (app.user && app.user.uid) {
		loadStatus(false);
	}
	handleCheckoutReturn();

	$(window).on('action:ajaxify.end', function (e, data) {
		if (data.url === 'register' && utils.param('error')) {
			app.alertError('Registration failed. Please check your license key and try again.');
		}
		syncEmailConfirmationUi();
		addSupportButtons();
		addSupportSummary();
		addAdminTopicAuthorSupport();
		addAdminRecentSupportStatuses(null, true);
		addAdminProfileSupport();
		updateSupportButtons(cachedStatus);
		window.setTimeout(syncEmailConfirmationUi, 0);
	});
});
