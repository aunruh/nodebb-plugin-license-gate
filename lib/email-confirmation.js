'use strict';

async function resendConfirmationEmail(user, uid) {
	const confirmed = await user.getUserField(uid, 'email:confirmed');
	if (Number(confirmed) === 1) {
		throw new Error('Your email address is already confirmed.');
	}

	const email = await user.email.getEmailForValidation(uid);
	if (!email) {
		throw new Error('No email address is available for confirmation.');
	}

	await user.email.sendValidationEmail(uid, { email });
	return { sent: true };
}

module.exports = { resendConfirmationEmail };
