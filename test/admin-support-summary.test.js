'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminSupportSummary } = require('../lib/admin-support-summary');

test('returns only the compact admin summary and uses a paid upgrade as latest activity', () => {
	const summary = buildAdminSupportSummary({
		canPost: true,
		supportUntil: '2027-06-23T00:00:00.000Z',
		daysRemaining: 328,
		keys: [{
			key: 'secret-license-key',
			purchasedAt: '2025-02-19T00:00:00.000Z',
			upgradedAt: '2026-06-23T00:00:00.000Z',
			productRef: 'studio',
			maxAllowedDomains: 10,
		}],
		supportPasses: [],
	}, { uid: 42, username: 'customer', displayname: 'Customer' });

	assert.deepEqual(summary, {
		nodebbUid: 42,
		username: 'Customer',
		canPost: true,
		supportUntil: '2027-06-23T00:00:00.000Z',
		daysRemaining: 328,
		latestActivity: {
			type: 'license_upgrade',
			label: 'License upgraded to Studio',
			at: '2026-06-23T00:00:00.000Z',
		},
	});
	assert.equal(JSON.stringify(summary).includes('secret-license-key'), false);
});

test('uses the newest activity across license purchases and support passes', () => {
	const summary = buildAdminSupportSummary({
		canPost: false,
		supportUntil: '2025-05-01T00:00:00.000Z',
		keys: [{ purchasedAt: '2022-01-01T00:00:00.000Z', maxAllowedDomains: 1 }],
		supportPasses: [{ source: 'payment', purchasedAt: '2024-05-01T00:00:00.000Z' }],
	}, { uid: 7, username: 'customer' });

	assert.equal(summary.canPost, false);
	assert.deepEqual(summary.latestActivity, {
		type: 'support_pass',
		label: 'Support pass purchased',
		at: '2024-05-01T00:00:00.000Z',
	});
});

test('handles forum users without a connected license or support pass', () => {
	const summary = buildAdminSupportSummary({ canPost: false, keys: [], supportPasses: [] }, { uid: 8, username: 'new-user' });
	assert.equal(summary.username, 'new-user');
	assert.equal(summary.supportUntil, null);
	assert.equal(summary.latestActivity, null);
});
