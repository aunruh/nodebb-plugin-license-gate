'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bearerMatches, getBearerToken, tokensMatch } = require('../lib/bearer-auth');

test('reads a strict bearer token without exposing alternate authentication schemes', () => {
	assert.equal(getBearerToken('Bearer shared-secret'), 'shared-secret');
	assert.equal(getBearerToken('bearer shared-secret'), 'shared-secret');
	assert.equal(getBearerToken('Basic shared-secret'), '');
	assert.equal(getBearerToken('Bearer shared secret'), '');
	assert.equal(getBearerToken(undefined), '');
});

test('compares bearer credentials safely and rejects missing or different values', () => {
	assert.equal(tokensMatch('same-secret', 'same-secret'), true);
	assert.equal(tokensMatch('short', 'different-length'), false);
	assert.equal(tokensMatch('', 'same-secret'), false);
	assert.equal(bearerMatches('Bearer same-secret', 'same-secret'), true);
	assert.equal(bearerMatches('Bearer wrong-secret', 'same-secret'), false);
});
