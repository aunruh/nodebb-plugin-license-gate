'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resendConfirmationEmail } = require('../lib/email-confirmation');

test('sends a validation email for an unconfirmed user', async () => {
	let sentUid = null;
	const user = {
		getUserField: async () => 0,
		email: {
			sendValidationEmail: async (uid) => { sentUid = uid; },
		},
	};

	const result = await resendConfirmationEmail(user, 42);

	assert.equal(sentUid, 42);
	assert.deepEqual(result, { sent: true });
});

test('does not send another validation email for a confirmed user', async () => {
	let sent = false;
	const user = {
		getUserField: async () => '1',
		email: {
			sendValidationEmail: async () => { sent = true; },
		},
	};

	await assert.rejects(
		resendConfirmationEmail(user, 42),
		/Your email address is already confirmed\./
	);
	assert.equal(sent, false);
});
