'use strict';

async function resendConfirmationEmail(user, uid) {
	const confirmed = await user.getUserField(uid, 'email:confirmed');
	if (Number(confirmed) === 1) {
		throw new Error('Your email address is already confirmed.');
	}

	await user.email.sendValidationEmail(uid);
	return { sent: true };
}

module.exports = { resendConfirmationEmail };
