'use strict';

function getLicenseTier(key) {
	const product = String(key?.productRef || '').toLowerCase();
	const maxAllowedDomains = Number(key?.maxAllowedDomains || 0);
	if (product.includes('studio') || maxAllowedDomains >= 10) {
		return 'Studio';
	}
	if (product.includes('pro') || maxAllowedDomains >= 2) {
		return 'Pro';
	}
	if (product.includes('single') || maxAllowedDomains === 1) {
		return 'Single';
	}
	return 'Lay Theme';
}

function toActivity(item) {
	if (item.type === 'support_pass') {
		return {
			type: item.source === 'admin' ? 'support_grant' : 'support_pass',
			label: item.source === 'admin' ? 'Forum support granted' : 'Support pass purchased',
			at: item.purchasedAt,
		};
	}

	const tier = getLicenseTier(item);
	if (item.upgradedAt) {
		return {
			type: 'license_upgrade',
			label: `License upgraded to ${tier}`,
			at: item.upgradedAt,
		};
	}
	return {
		type: 'license_purchase',
		label: `${tier} License purchased`,
		at: item.purchasedAt,
	};
}

function buildAdminSupportSummary(status, account) {
	const activities = [
		...(status.keys || []).map(key => toActivity({ ...key, type: 'license' })),
		...(status.supportPasses || []).map(pass => toActivity({ ...pass, type: 'support_pass' })),
	].filter(activity => activity.at && !Number.isNaN(new Date(activity.at).getTime()));

	activities.sort((a, b) => new Date(b.at) - new Date(a.at));

	return {
		nodebbUid: Number(account.uid || account.nodebbUid),
		username: account.displayname || account.username || `User ${account.uid}`,
		canPost: Boolean(status.canPost),
		supportUntil: status.supportUntil || null,
		daysRemaining: Number(status.daysRemaining || 0),
		latestActivity: activities[0] || null,
	};
}

module.exports = {
	buildAdminSupportSummary,
	getLicenseTier,
};
