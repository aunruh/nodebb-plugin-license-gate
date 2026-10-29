'use strict';

const SUPPORT_REQUIRED_MESSAGE = 'Your included support period has ended. Open “Support & licenses” to connect another Lay Theme license or purchase a 12-month Support Pass before posting.';
const STUDENT_SUPPORT_REQUIRED_MESSAGE = 'Your student license does not include forum support. Open “Support & licenses” to purchase a 12-month Support Pass before posting.';
const LICENSE_REQUIRED_MESSAGE = 'Connect your Lay Theme license before posting. Open “Support & licenses” and enter your license key.';

function shouldCheckSupport({ uid, fromQueue, isAdminOrGlobalMod, supportEnabled, supportEnforcementEnabled }) {
	return Number.isInteger(Number(uid)) && Number(uid) > 0 &&
		!fromQueue &&
		!isAdminOrGlobalMod &&
		supportEnabled &&
		supportEnforcementEnabled;
}

function getPostingError(status) {
	if (!status || status.canPost !== false) {
		return null;
	}
	if (Array.isArray(status.keys) && status.keys.some(key => key.licenseType === 'student' || key.includedSupport === false)) {
		return STUDENT_SUPPORT_REQUIRED_MESSAGE;
	}
	const hasSupportHistory = Boolean(
		(status.keys && status.keys.length) ||
		(status.supportPasses && status.supportPasses.length) ||
		status.supportUntil
	);
	return hasSupportHistory ? SUPPORT_REQUIRED_MESSAGE : LICENSE_REQUIRED_MESSAGE;
}

module.exports = {
	SUPPORT_REQUIRED_MESSAGE,
	STUDENT_SUPPORT_REQUIRED_MESSAGE,
	LICENSE_REQUIRED_MESSAGE,
	shouldCheckSupport,
	getPostingError,
};
