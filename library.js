'use strict';

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const nconf = require.main.require('nconf');

const meta = require.main.require('./src/meta');
const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups');
const posts = require.main.require('./src/posts');
const topics = require.main.require('./src/topics');
const winston = require.main.require('winston');
const { buildAdminSupportSummary } = require('./lib/admin-support-summary');
const { bearerMatches } = require('./lib/bearer-auth');
const { buildForumActivity, completeWeekRange } = require('./lib/forum-activity');
const { shouldCheckSupport, getPostingError } = require('./lib/support-posting-policy');

const PLUGIN_ID = 'nodebb-plugin-license-gate';
const SETTINGS_HASH = 'nodebb-plugin-license-gate';
const DISCOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADMIN_BATCH_MAX_USERS = 50;
const ADMIN_BATCH_CONCURRENCY = 4;
const FORUM_ANALYTICS_CACHE_MS = 10 * 60 * 1000;
const FORUM_ANALYTICS_CHUNK_SIZE = 500;
const forumAnalyticsCache = new Map();

function asBoolean(value, fallback) {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}
	return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

async function mapWithConcurrency(items, concurrency, callback) {
	const results = new Array(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await callback(items[index]);
		}
	});
	await Promise.all(workers);
	return results;
}

async function loadInChunks(items, callback) {
	const results = [];
	for (let index = 0; index < items.length; index += FORUM_ANALYTICS_CHUNK_SIZE) {
		results.push(...await callback(items.slice(index, index + FORUM_ANALYTICS_CHUNK_SIZE)));
	}
	return results;
}

async function getForumActivity(weeks) {
	const cached = forumAnalyticsCache.get(weeks);
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const range = completeWeekRange(weeks);
	const from = new Date(`${range.startDate}T00:00:00.000Z`).getTime() - 3 * 60 * 60 * 1000;
	const to = new Date(`${range.endExclusiveDate}T00:00:00.000Z`).getTime() + 3 * 60 * 60 * 1000;
	const [pids, staffUsers] = await Promise.all([
		db.getSortedSetRangeByScore('posts:pid', 0, -1, from, to),
		user.getAdminsandGlobalModsandModerators(),
	]);
	const postData = await loadInChunks(pids, ids => posts.getPostsFields(ids, [
		'pid', 'tid', 'uid', 'timestamp', 'deleted',
	]));
	const tids = [...new Set(postData.filter(Boolean).map(post => post.tid))];
	const topicData = await loadInChunks(tids, ids => topics.getTopicsFields(ids, [
		'tid', 'mainPid', 'deleted',
	]));
	const data = {
		period: {
			weeks: range.weeks,
			startDate: range.startDate,
			endDate: range.endDate,
		},
		daily: buildForumActivity({
			posts: postData,
			topics: topicData,
			staffUids: staffUsers.map(account => account.uid),
			range,
		}),
	};
	forumAnalyticsCache.set(weeks, { expiresAt: Date.now() + FORUM_ANALYTICS_CACHE_MS, data });
	return data;
}

async function supportAnalyticsRequest(days, settings, fallbackAdminUid) {
	let adminUids = [];
	try {
		adminUids = await groups.getMembers('administrators', 0, -1);
	} catch (error) {
		winston.warn(`[${PLUGIN_ID}] Could not load administrator UIDs for analytics: ${error.message}`);
	}
	if (fallbackAdminUid) {
		adminUids.push(fallbackAdminUid);
	}
	adminUids = [...new Set(adminUids.map(Number).filter(uid => Number.isInteger(uid) && uid > 0))];
	const exclusion = adminUids.length ? `&excludeNodebbUids=${encodeURIComponent(adminUids.join(','))}` : '';
	return supportServiceRequest(`/v1/admin/analytics?days=${days}${exclusion}`, settings);
}

/* ---------- Admin settings page ---------- */

function addAdminNavigation(data) {
	data.plugins = data.plugins || [];
	data.plugins.push({
		route: '/plugins/license-gate',
		icon: 'fa-key',
		name: 'License Gate',
	});
	return data;
}

function addAdminScripts(scripts) {
	scripts.push(`${nconf.get('relative_path')}/plugins/license-gate/admin-dashboard.js`);
	return scripts;
}

async function adminGetSettings(req, res) {
	const settings = await getSettings();
	const success = req.flash ? req.flash('success') : [];
	const requestedDays = Number(req.query?.days);
	const analyticsDays = [1, 7, 30, 90, 365].includes(requestedDays) ? requestedDays : 30;
	let analytics = null;
	let analyticsError = '';
	const analyticsConfigured = Boolean(settings.supportEnabled && settings.supportServiceUrl && settings.supportServiceApiKey);
	if (analyticsConfigured) {
		try {
			analytics = await supportAnalyticsRequest(analyticsDays, settings, req.uid);
		} catch (error) {
			analyticsError = error.message;
		}
	}
	res.render('admin/plugins/license-gate', {
		title: 'License Gate Settings',
		hideSave: true,
		apiUrl: settings.apiUrl || '',
		secretKey: settings.secretKey || '',
		rejectBlocked: asBoolean(settings.rejectBlocked, true),
		supportEnabled: asBoolean(settings.supportEnabled, false),
		supportEnforcementEnabled: asBoolean(settings.supportEnforcementEnabled, false),
		supportServiceUrl: settings.supportServiceUrl || '',
		supportServiceApiKey: settings.supportServiceApiKey || '',
		analyticsConfigured,
		analyticsAvailable: Boolean(analytics),
		analyticsError,
		analytics,
		analyticsDays,
		period1Class: analyticsDays === 1 ? 'active' : '',
		period7Class: analyticsDays === 7 ? 'active' : '',
		period30Class: analyticsDays === 30 ? 'active' : '',
		period90Class: analyticsDays === 90 ? 'active' : '',
		period365Class: analyticsDays === 365 ? 'active' : '',
		success: success && success.length ? success[0] : '',
	});
}

async function adminPostSettings(req, res) {
	const apiUrl = (req.body.apiUrl || '').trim();
	const secretKey = (req.body.secretKey || '').trim();
	const rejectBlocked = req.body.rejectBlocked === 'on';
	const supportEnabled = req.body.supportEnabled === 'on';
	const supportEnforcementEnabled = req.body.supportEnforcementEnabled === 'on';
	const supportServiceUrl = (req.body.supportServiceUrl || '').trim();
	const supportServiceApiKey = (req.body.supportServiceApiKey || '').trim();
	await meta.settings.set(SETTINGS_HASH, {
		apiUrl: apiUrl || '',
		secretKey,
		rejectBlocked,
		supportEnabled,
		supportEnforcementEnabled,
		supportServiceUrl,
		supportServiceApiKey,
	});
	req.flash('success', 'License Gate settings saved.');
	res.redirect(nconf.get('relative_path') + '/admin/plugins/license-gate');
}

async function addApiRoutes({ router, middleware, helpers }) {
	const routeHelpers = require.main.require('./src/routes/helpers');
	const middlewares = [middleware.ensureLoggedIn];

	routeHelpers.setupApiRoute(router, 'get', '/license-gate/support-status', middlewares, async (req, res) => {
		const settings = await getSettings();
		assertSupportIntegration(settings);
		await syncSupportAccount(req.uid, settings, { discover: true });
		const isAdministrator = await user.isAdministrator(req.uid);
		const trackingQuery = isAdministrator ? '' : '?track=gate_viewed';
		const status = await supportServiceRequest(`/v1/accounts/${req.uid}/support-status${trackingQuery}`, settings);
		status.postingEnforced = settings.supportEnforcementEnabled;
		helpers.formatApiResponse(200, res, status);
	});

	routeHelpers.setupApiRoute(router, 'post', '/license-gate/license-claims', middlewares, async (req, res) => {
		const settings = await getSettings();
		assertSupportIntegration(settings);
		const licenseKey = String(req.body?.licenseKey || '').trim();
		if (licenseKey.length < 5 || licenseKey.length > 255) {
			throw new Error('Please enter a valid license key.');
		}

		await syncSupportAccount(req.uid, settings);
		const result = await supportServiceRequest('/v1/license-claims', settings, {
			method: 'POST',
			body: { nodebbUid: req.uid, licenseKey, source: 'support_modal' },
		});
		helpers.formatApiResponse(200, res, result);
	});

	routeHelpers.setupApiRoute(router, 'post', '/license-gate/support-checkout', middlewares, async (req, res) => {
		const settings = await getSettings();
		assertSupportIntegration(settings);
		await syncSupportAccount(req.uid, settings);
		const result = await supportServiceRequest(`/v1/accounts/${req.uid}/checkout`, settings, {
			method: 'POST',
		});
		helpers.formatApiResponse(200, res, result);
	});

	routeHelpers.setupApiRoute(router, 'get', '/license-gate/admin/users/:uid/support-status', middlewares, async (req, res) => {
		if (!await user.isAdministrator(req.uid)) {
			return helpers.formatApiResponse(403, res, new Error('Only forum administrators can view another user\'s support status.'));
		}

		const targetUid = Number(req.params.uid);
		if (!Number.isInteger(targetUid) || targetUid < 1) {
			return helpers.formatApiResponse(400, res, new Error('Invalid user ID.'));
		}

		const settings = await getSettings();
		assertSupportIntegration(settings);
		const account = await syncSupportAccount(targetUid, settings, { discover: true });
		const status = await supportServiceRequest(`/v1/accounts/${targetUid}/support-status`, settings);
		return helpers.formatApiResponse(200, res, buildAdminSupportSummary(status, account));
	});

	routeHelpers.setupApiRoute(router, 'post', '/license-gate/admin/support-status-batch', middlewares, async (req, res) => {
		if (!await user.isAdministrator(req.uid)) {
			return helpers.formatApiResponse(403, res, new Error('Only forum administrators can view another user\'s support status.'));
		}

		const targetUids = [...new Set((Array.isArray(req.body?.uids) ? req.body.uids : [])
			.map(Number)
			.filter(uid => Number.isInteger(uid) && uid > 0))];
		if (targetUids.length > ADMIN_BATCH_MAX_USERS) {
			return helpers.formatApiResponse(400, res, new Error(`A maximum of ${ADMIN_BATCH_MAX_USERS} users can be checked at once.`));
		}
		if (!targetUids.length) {
			return helpers.formatApiResponse(200, res, { users: {} });
		}

		const settings = await getSettings();
		assertSupportIntegration(settings);
		const summaries = await mapWithConcurrency(targetUids, ADMIN_BATCH_CONCURRENCY, async (targetUid) => {
			try {
				const account = await syncSupportAccount(targetUid, settings, { discover: true });
				const status = await supportServiceRequest(`/v1/accounts/${targetUid}/support-status`, settings);
				return [targetUid, buildAdminSupportSummary(status, account)];
			} catch (error) {
				winston.warn(`[${PLUGIN_ID}] Could not load admin support summary for uid ${targetUid}: ${error.message}`);
				return [targetUid, { nodebbUid: targetUid, unavailable: true }];
			}
		});

		return helpers.formatApiResponse(200, res, { users: Object.fromEntries(summaries) });
	});

	routeHelpers.setupApiRoute(router, 'get', '/license-gate/admin/analytics', middlewares, async (req, res) => {
		if (!await user.isAdministrator(req.uid)) {
			return helpers.formatApiResponse(403, res, new Error('Only forum administrators can view support analytics.'));
		}
		const requestedDays = Number(req.query?.days);
		const days = [1, 7, 30, 90, 365].includes(requestedDays) ? requestedDays : 30;
		const settings = await getSettings();
		assertSupportIntegration(settings);
		const analytics = await supportAnalyticsRequest(days, settings, req.uid);
		return helpers.formatApiResponse(200, res, analytics);
	});

	routeHelpers.setupApiRoute(router, 'get', '/license-gate/admin/forum-activity', [], async (req, res) => {
		const settings = await getSettings();
		const sharedKeyAuthorized = bearerMatches(req.headers?.authorization, settings.supportServiceApiKey);
		const forumStaffAuthorized = req.uid > 0 && await user.isAdminOrGlobalMod(req.uid);
		if (!sharedKeyAuthorized && !forumStaffAuthorized) {
			return helpers.formatApiResponse(403, res, new Error('Only forum staff can view forum analytics.'));
		}
		const weeks = Number(req.query?.weeks || 12);
		if (![4, 12, 26, 52].includes(weeks)) {
			return helpers.formatApiResponse(400, res, new Error('Please select a valid analysis period.'));
		}
		return helpers.formatApiResponse(200, res, await getForumActivity(weeks));
	});
}

function onAppLoad(data) {
	const helpers = require.main.require('./src/routes/helpers');
	// Match pattern from nodebb-plugin-emailer-sendgrid: buildHeader + render, and API route for admin
	data.router.get('/admin/plugins/license-gate', data.middleware.admin.buildHeader, helpers.tryRoute(adminGetSettings));
	data.router.get('/api/admin/plugins/license-gate', helpers.tryRoute(adminGetSettings));
	data.router.post('/admin/plugins/license-gate', data.middleware.admin.buildHeader, helpers.tryRoute(adminPostSettings));
	data.router.get('/plugins/license-gate/admin-dashboard.js', (req, res) => {
		res.type('application/javascript').sendFile(path.join(__dirname, 'static/lib/admin-dashboard.js'));
	});

	// Clear stale session.registration when there are no interstitials (e.g. after switching
	// from interstitial to register.build). Runs before the router so registrationComplete won't redirect.
	data.app.use(clearStaleRegistrationSession);
}

async function clearStaleRegistrationSession(req, res, next) {
	if (!req.session || !req.session.hasOwnProperty('registration')) {
		return setImmediate(next);
	}
	const path = req.path.startsWith('/api/') ? req.path.replace('/api', '') : req.path;
	// Don't clear when user is on register/complete or confirm (path may include relative_path)
	if (path.endsWith('/register/complete') || path.includes('/confirm/')) {
		return setImmediate(next);
	}
	try {
		const user = require.main.require('./src/user');
		const data = await user.interstitials.get(req, req.session.registration);
		if (data.interstitials.length === 0) {
			delete req.session.registration;
			winston.verbose(`[${PLUGIN_ID}] Cleared stale session.registration (no interstitials to complete).`);
		}
	} catch (err) {
		winston.warn(`[${PLUGIN_ID}] clearStaleRegistrationSession: ${err.message}`);
	}
	setImmediate(next);
}

async function getSettings() {
	const defaults = {
		apiUrl: (nconf.get('license_gate_api_url') || '').trim() || '',
		secretKey: (nconf.get('license_gate_secret_key') || '').trim(),
		rejectBlocked: true,
		supportEnabled: asBoolean(nconf.get('license_gate_support_enabled'), false),
		supportEnforcementEnabled: asBoolean(nconf.get('license_gate_support_enforcement_enabled'), false),
		supportServiceUrl: (nconf.get('license_gate_support_service_url') || '').trim(),
		supportServiceApiKey: (nconf.get('license_gate_support_service_api_key') || '').trim(),
	};
	const settings = await meta.settings.get(SETTINGS_HASH);
	const merged = { ...defaults, ...(settings || {}) };
	merged.rejectBlocked = asBoolean(merged.rejectBlocked, true);
	merged.supportEnabled = asBoolean(merged.supportEnabled, false);
	merged.supportEnforcementEnabled = asBoolean(merged.supportEnforcementEnabled, false);
	return merged;
}

function assertSupportIntegration(settings) {
	if (!settings.supportEnabled || !settings.supportServiceUrl || !settings.supportServiceApiKey) {
		const error = new Error('Support status is not configured yet.');
		error.status = 503;
		throw error;
	}
}

async function supportServiceRequest(path, settings, options = {}) {
	const url = new URL(path, settings.supportServiceUrl.endsWith('/') ? settings.supportServiceUrl : `${settings.supportServiceUrl}/`);
	let response;
	try {
		response = await fetch(url, {
			method: options.method || 'GET',
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${settings.supportServiceApiKey}`,
				...(options.body ? { 'content-type': 'application/json' } : {}),
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		winston.warn(`[${PLUGIN_ID}] Support service request failed: ${error.message}`);
		throw new Error('The support service is temporarily unavailable. Please try again later.');
	}

	let data;
	try {
		data = await response.json();
	} catch (error) {
		winston.warn(`[${PLUGIN_ID}] Support service returned invalid JSON for ${url.pathname}.`);
		throw new Error('The support service returned an invalid response.');
	}

	if (!response.ok) {
		const serviceError = new Error(data?.error?.message || 'The support service could not complete the request.');
		serviceError.code = data?.error?.code;
		serviceError.status = response.status;
		throw serviceError;
	}
	return data;
}

async function getForumAccount(uid) {
	const account = await user.getUserFields(uid, ['uid', 'email', 'username']);
	if (!account?.email) {
		throw new Error('Please add an email address to your forum account first.');
	}
	return {
		nodebbUid: Number(account.uid),
		email: String(account.email).trim().toLowerCase(),
		username: account.username || '',
	};
}

async function syncSupportAccount(uid, settings, { discover = false } = {}) {
	const account = await getForumAccount(uid);
	await supportServiceRequest('/v1/accounts/sync', settings, { method: 'POST', body: account });

	if (!discover) {
		return account;
	}

	const cacheKey = `${PLUGIN_ID}:discovery:${uid}`;
	const cache = await db.getObject(cacheKey);
	const lastDiscovery = Number(cache?.timestamp || 0);
	const serviceUrl = new URL(settings.supportServiceUrl).origin;
	const shouldDiscover = cache?.email !== account.email ||
		cache?.serviceUrl !== serviceUrl ||
		Date.now() - lastDiscovery >= DISCOVERY_INTERVAL_MS;
	if (!shouldDiscover) {
		return account;
	}

	try {
		await supportServiceRequest(`/v1/accounts/${uid}/discover-licenses`, settings, { method: 'POST' });
		await db.setObject(cacheKey, { email: account.email, serviceUrl, timestamp: Date.now() });
		await db.pexpire(cacheKey, DISCOVERY_INTERVAL_MS);
	} catch (error) {
		winston.warn(`[${PLUGIN_ID}] Automatic license discovery failed for uid ${uid}: ${error.message}`);
	}
	return account;
}

async function enforceSupportForPosting(data) {
	const uid = Number(data?.uid);
	const settings = await getSettings();
	const isAdminOrGlobalMod = Number.isInteger(uid) && uid > 0 ? await user.isAdminOrGlobalMod(uid) : false;
	if (!shouldCheckSupport({
		uid,
		fromQueue: Boolean(data?.fromQueue),
		isAdminOrGlobalMod,
		supportEnabled: settings.supportEnabled,
		supportEnforcementEnabled: settings.supportEnforcementEnabled,
	})) {
		return data;
	}

	let status;
	try {
		await syncSupportAccount(uid, settings, { discover: true });
		status = await supportServiceRequest(`/v1/accounts/${uid}/support-status`, settings);
	} catch (error) {
		// Keep the forum usable if the entitlement service has a temporary outage.
		winston.error(`[${PLUGIN_ID}] Support posting check failed open for uid ${uid}: ${error.message}`);
		return data;
	}

	const postingError = getPostingError(status);
	if (postingError) {
		try {
			await supportServiceRequest(`/v1/accounts/${uid}/events`, settings, {
				method: 'POST',
				body: {
					eventType: 'posting_blocked',
					action: data?.tid ? 'posts.reply' : 'topics.post',
				},
			});
		} catch (error) {
			winston.warn(`[${PLUGIN_ID}] Could not track blocked posting attempt for uid ${uid}: ${error.message}`);
		}
		const error = new Error(postingError);
		error.code = 'SUPPORT_REQUIRED';
		throw error;
	}
	return data;
}

async function onUserCreate({ user: createdUser, data }) {
	const settings = await getSettings();
	if (!settings.supportEnabled || !settings.supportServiceUrl || !settings.supportServiceApiKey) {
		return;
	}

	try {
		const account = {
			nodebbUid: Number(createdUser.uid),
			email: String(data.email || '').trim().toLowerCase(),
			username: createdUser.username || data.username || '',
		};
		if (!account.email) {
			return;
		}
		await supportServiceRequest('/v1/accounts/sync', settings, { method: 'POST', body: account });
		const licenseKey = String(data.license_key || '').trim();
		if (licenseKey) {
			await supportServiceRequest('/v1/license-claims', settings, {
				method: 'POST',
				body: { nodebbUid: account.nodebbUid, licenseKey, source: 'registration' },
			});
		}
	} catch (error) {
		winston.warn(`[${PLUGIN_ID}] Could not initialize support status for new uid ${createdUser.uid}: ${error.message}`);
	}
}

function httpGet(urlString) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlString);
		const lib = url.protocol === 'https:' ? https : http;
		lib.get(urlString, (res) => {
			let body = '';
			res.on('data', (chunk) => { body += chunk; });
			res.on('end', () => resolve(body));
		}).on('error', reject);
	});
}

/**
 * Validate a license key against the WordPress License Manager API (slm_check).
 * @param {string} licenseKey - The license key to validate
 * @param {object} settings - { apiUrl, secretKey, rejectBlocked }
 * @returns {Promise<object>} - API response data
 */
async function validateWithLicenseManager(licenseKey, settings) {
	const url = new URL(settings.apiUrl);
	url.searchParams.set('slm_action', 'slm_check');
	url.searchParams.set('secret_key', settings.secretKey);
	url.searchParams.set('license_key', licenseKey);

	let text;
	try {
		text = await httpGet(url.toString());
	} catch (err) {
		winston.warn(`[${PLUGIN_ID}] License API request failed: ${err.message}`);
		throw new Error('License server is unavailable. Please try again later.');
	}

	let data;
	try {
		data = JSON.parse(text);
	} catch (e) {
		winston.warn(`[${PLUGIN_ID}] License API returned non-JSON: ${text.slice(0, 200)}`);
		throw new Error('License server is unavailable. Please try again later.');
	}

	if (data.result === 'error') {
		const msg = data.message || 'Invalid license key.';
		throw new Error(msg);
	}

	if (data.result !== 'success') {
		throw new Error('Invalid license key.');
	}

	if (settings.rejectBlocked && data.status === 'blocked') {
		throw new Error('This license key has been blocked.');
	}

	return data;
}

/**
 * Add the license key field to the main registration form (same pattern as nodebb-plugin-registration-question).
 * Fired via filter:register.build from the render middleware.
 */
async function addLicenseField(params) {
	const settings = await getSettings();
	if (!settings.apiUrl || !settings.secretKey) {
		return params;
	}

	const inputId = 'license_key';
	const entry = {
		label: 'License key',
		inputId,
		styleName: '',
		html: '<input class="form-control" type="text" name="' + inputId + '" id="' + inputId + '" placeholder="Enter your license key" autocomplete="off" aria-required="true" />',
	};

	if (params.templateData.regFormEntry && Array.isArray(params.templateData.regFormEntry)) {
		params.templateData.regFormEntry.push(entry);
	} else {
		params.templateData.regFormEntry = [entry];
	}

	return params;
}

/**
 * Validate the license key on form submit (filter:register.check). Same pattern as registration-question.
 */
async function checkLicenseKey(params) {
	const settings = await getSettings();
	if (!settings.apiUrl || !settings.secretKey) {
		return params;
	}

	const key = (params.req.body && params.req.body.license_key) ? String(params.req.body.license_key).trim() : '';
	if (!key) {
		throw new Error('Please enter your license key.');
	}

	await validateWithLicenseManager(key, settings);
	if (settings.supportEnabled && settings.supportServiceUrl && settings.supportServiceApiKey) {
		await supportServiceRequest('/v1/registration/check', settings, {
			method: 'POST',
			body: { licenseKey: key },
		});
	}
	return params;
}

module.exports = {
	addLicenseField,
	checkLicenseKey,
	addAdminNavigation,
	addAdminScripts,
	onAppLoad,
	addApiRoutes,
	onUserCreate,
	enforceSupportForPosting,
	getSettings,
	validateWithLicenseManager,
	supportServiceRequest,
};
