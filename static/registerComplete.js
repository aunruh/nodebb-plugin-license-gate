'use strict';

/**
 * NodeBB expects a client module "forum/registerComplete" for the register/complete page,
 * but core does not ship one. This plugin provides a minimal no-op module so the page
 * loads without "Cannot find module './registerComplete'" and the form can submit.
 */
define('forum/registerComplete', [], function () {
	return {
		init: function () {}
	};
});
