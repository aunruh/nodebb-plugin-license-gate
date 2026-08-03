'use strict';

const SUPPORT_REQUIRED_MESSAGE = 'Your forum support has expired. Open “Support & licenses” to connect another Lay Theme license or purchase a 12-month Support Pass before posting.';

function shouldCheckSupport({ uid, fromQueue, isAdmin, supportEnabled, supportEnforcementEnabled }) {
	return Number.isInteger(Number(uid)) && Number(uid) > 0 &&
		!fromQueue &&
		!isAdmin &&
		supportEnabled &&
		supportEnforcementEnabled;
}

function getPostingError(status) {
	return status && status.canPost === false ? SUPPORT_REQUIRED_MESSAGE : null;
}

module.exports = {
	SUPPORT_REQUIRED_MESSAGE,
	shouldCheckSupport,
	getPostingError,
};
