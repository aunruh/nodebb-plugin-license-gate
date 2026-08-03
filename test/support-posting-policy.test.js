'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
	SUPPORT_REQUIRED_MESSAGE,
	shouldCheckSupport,
	getPostingError,
} = require('../lib/support-posting-policy');

test('checks regular logged-in users only when enforcement is enabled', () => {
	assert.equal(shouldCheckSupport({
		uid: 42,
		fromQueue: false,
		isAdminOrGlobalMod: false,
		supportEnabled: true,
		supportEnforcementEnabled: true,
	}), true);
	assert.equal(shouldCheckSupport({
		uid: 42,
		fromQueue: false,
		isAdminOrGlobalMod: false,
		supportEnabled: true,
		supportEnforcementEnabled: false,
	}), false);
});

test('exempts administrators, global moderators, guests, and posts released from the queue', () => {
	const base = { supportEnabled: true, supportEnforcementEnabled: true };
	assert.equal(shouldCheckSupport({ ...base, uid: 1, isAdminOrGlobalMod: true, fromQueue: false }), false);
	assert.equal(shouldCheckSupport({ ...base, uid: 2, isAdminOrGlobalMod: true, fromQueue: false }), false);
	assert.equal(shouldCheckSupport({ ...base, uid: 0, isAdminOrGlobalMod: false, fromQueue: false }), false);
	assert.equal(shouldCheckSupport({ ...base, uid: 8, isAdminOrGlobalMod: false, fromQueue: true }), false);
});

test('blocks expired support and allows active support', () => {
	assert.equal(getPostingError({ canPost: true }), null);
	assert.equal(getPostingError({ canPost: false }), SUPPORT_REQUIRED_MESSAGE);
	assert.equal(getPostingError(null), null);
});
