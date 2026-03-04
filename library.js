'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const nconf = require('nconf');

const meta = require.main.require('./src/meta');
const winston = require.main.require('winston');

const PLUGIN_ID = 'nodebb-plugin-license-gate';
const SETTINGS_HASH = 'nodebb-plugin-license-gate';

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

async function adminGetSettings(req, res) {
	const settings = await getSettings();
	const success = req.flash ? req.flash('success') : [];
	res.render('admin/plugins/license-gate', {
		title: 'License Gate Settings',
		hideSave: true,
		apiUrl: settings.apiUrl || '',
		secretKey: settings.secretKey || '',
		rejectBlocked: settings.rejectBlocked !== false,
		success: success && success.length ? success[0] : '',
	});
}

async function adminPostSettings(req, res) {
	const apiUrl = (req.body.apiUrl || '').trim();
	const secretKey = (req.body.secretKey || '').trim();
	const rejectBlocked = req.body.rejectBlocked === 'on';
	await meta.settings.set(SETTINGS_HASH, {
		apiUrl: apiUrl || '',
		secretKey,
		rejectBlocked,
	});
	req.flash('success', 'License Gate settings saved.');
	res.redirect(nconf.get('relative_path') + '/admin/plugins/license-gate');
}

function onAppLoad(data) {
	const helpers = require.main.require('./src/routes/helpers');
	// Match pattern from nodebb-plugin-emailer-sendgrid: buildHeader + render, and API route for admin
	data.router.get('/admin/plugins/license-gate', data.middleware.admin.buildHeader, helpers.tryRoute(adminGetSettings));
	data.router.get('/api/admin/plugins/license-gate', helpers.tryRoute(adminGetSettings));
	data.router.post('/admin/plugins/license-gate', data.middleware.admin.buildHeader, helpers.tryRoute(adminPostSettings));
}

async function getSettings() {
	const defaults = {
		apiUrl: (nconf.get('license_gate_api_url') || '').trim() || '',
		secretKey: (nconf.get('license_gate_secret_key') || '').trim(),
		rejectBlocked: true,
	};
	const settings = await meta.settings.get(SETTINGS_HASH);
	return { ...defaults, ...(settings || {}) };
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
		html: [
			'<input class="form-control" type="text" name="' + inputId + '" id="' + inputId + '" placeholder="Enter your license key" autocomplete="off" aria-required="true" />',
			'<span class="form-text text-xs">Your key is validated against the license manager.</span>',
		].join('\n'),
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
	return params;
}

module.exports = {
	addLicenseField,
	checkLicenseKey,
	addAdminNavigation,
	onAppLoad,
	getSettings,
	validateWithLicenseManager,
};
