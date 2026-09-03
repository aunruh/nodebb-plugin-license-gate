'use strict';

const crypto = require('crypto');

function getBearerToken(authorization) {
	if (typeof authorization !== 'string') return '';
	const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
	return match ? match[1] : '';
}

function tokensMatch(actual, expected) {
	if (!actual || !expected) return false;
	const actualBuffer = Buffer.from(String(actual));
	const expectedBuffer = Buffer.from(String(expected));
	return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearerMatches(authorization, expected) {
	return tokensMatch(getBearerToken(authorization), expected);
}

module.exports = { bearerMatches, getBearerToken, tokensMatch };
