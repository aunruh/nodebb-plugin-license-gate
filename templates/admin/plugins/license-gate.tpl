<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->

	<div class="row settings m-0">
		<div class="col-12 px-0 mb-5">
			<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
				<div>
					<h5 class="fw-bold tracking-tight settings-header mb-1">Support funnel</h5>
					<p class="form-text text-body-secondary mb-0">Unique forum accounts that loaded the forum during the selected period. Reloading a page does not increase the account count.</p>
				</div>
				<div class="btn-group" role="group" aria-label="Analytics period">
					<a class="btn btn-outline-secondary {period7Class}" href="{config.relative_path}/admin/plugins/license-gate?days=7">7 days</a>
					<a class="btn btn-outline-secondary {period30Class}" href="{config.relative_path}/admin/plugins/license-gate?days=30">30 days</a>
					<a class="btn btn-outline-secondary {period90Class}" href="{config.relative_path}/admin/plugins/license-gate?days=90">90 days</a>
					<a class="btn btn-outline-secondary {period365Class}" href="{config.relative_path}/admin/plugins/license-gate?days=365">1 year</a>
				</div>
			</div>

			{{{ if !analyticsConfigured }}}
			<div class="alert alert-secondary mb-0">Enable and configure the support entitlement service below to view analytics.</div>
			{{{ else }}}
				{{{ if analyticsError }}}
				<div class="alert alert-warning mb-0"><strong>Analytics are temporarily unavailable.</strong> {analyticsError}</div>
				{{{ end }}}
				{{{ if analyticsAvailable }}}
				<div class="alert alert-info py-2">Tracking begins when this analytics update is deployed. Earlier visits and key connection attempts cannot be reconstructed reliably.</div>

				<div class="row g-3 mb-4">
					<div class="col-6 col-lg-3">
						<div class="card h-100"><div class="card-body">
							<div class="text-body-secondary small">Forum visitors</div>
							<div class="fs-2 fw-semibold">{analytics.overview.visitors}</div>
							<div class="small text-body-secondary">unique logged-in accounts</div>
						</div></div>
					</div>
					<div class="col-6 col-lg-3">
						<div class="card h-100"><div class="card-body">
							<div class="text-body-secondary small">Unable to post</div>
							<div class="fs-2 fw-semibold">{analytics.overview.blockedUsers}</div>
							<div class="small text-body-secondary">{analytics.overview.blockedRate}% of visitors</div>
						</div></div>
					</div>
					<div class="col-6 col-lg-3">
						<div class="card h-100"><div class="card-body">
							<div class="text-body-secondary small">Actually blocked</div>
							<div class="fs-2 fw-semibold">{analytics.overview.postingBlockedUsers}</div>
							<div class="small text-body-secondary">{analytics.overview.postingBlockAttempts} posting attempts</div>
						</div></div>
					</div>
					<div class="col-6 col-lg-3">
						<div class="card h-100"><div class="card-body">
							<div class="text-body-secondary small">Support Pass buyers</div>
							<div class="fs-2 fw-semibold">{analytics.payments.paidUsers}</div>
							<div class="small text-body-secondary">{analytics.payments.blockedConversionRate}% of gated users</div>
						</div></div>
					</div>
				</div>

				<div class="row g-4">
					<div class="col-12 col-xl-4">
						<div class="card h-100"><div class="card-body">
							<h6 class="fw-bold">Why posting was unavailable</h6>
							<div class="d-flex justify-content-between border-bottom py-2"><span>No connected license</span><strong>{analytics.overview.noLicenseUsers}</strong></div>
							<div class="d-flex justify-content-between border-bottom py-2"><span>Included support expired</span><strong>{analytics.overview.expiredLicenseUsers}</strong></div>
							<div class="d-flex justify-content-between py-2"><span>Support active</span><strong>{analytics.overview.activeUsers}</strong></div>
						</div></div>
					</div>

					<div class="col-12 col-xl-4">
						<div class="card h-100"><div class="card-body">
							<h6 class="fw-bold">License connections</h6>
							<p class="small text-body-secondary">{analytics.licenses.claimUsers} accounts entered a key in the Support &amp; licenses window.</p>
							<div class="d-flex justify-content-between border-bottom py-2"><span>No key → support active</span><strong>{analytics.licenses.noLicenseToActive}</strong></div>
							<div class="d-flex justify-content-between border-bottom py-2"><span>No key → still expired</span><strong>{analytics.licenses.noLicenseToExpired}</strong></div>
							<div class="d-flex justify-content-between border-bottom py-2"><span>Expired key → active with new key</span><strong>{analytics.licenses.expiredToActive}</strong></div>
							<div class="d-flex justify-content-between py-2"><span>Expired key → still expired</span><strong>{analytics.licenses.expiredToExpired}</strong></div>
						</div></div>
					</div>

					<div class="col-12 col-xl-4">
						<div class="card h-100"><div class="card-body">
							<h6 class="fw-bold">Support Pass conversion</h6>
							<div class="d-flex justify-content-between border-bottom py-2"><span>Checkout opened</span><strong>{analytics.payments.checkoutUsers}</strong></div>
							<div class="d-flex justify-content-between border-bottom py-2"><span>Paid</span><strong>{analytics.payments.paidUsers}</strong></div>
							<div class="d-flex justify-content-between border-bottom py-2"><span>Gated account → paid</span><strong>{analytics.payments.blockedToPaidUsers}</strong></div>
							<div class="d-flex justify-content-between py-2"><span>Checkout conversion</span><strong>{analytics.payments.checkoutConversionRate}%</strong></div>
							{{{ if analytics.payments.failedOrders }}}<div class="small text-danger mt-2">{analytics.payments.failedOrders} failed checkout(s)</div>{{{ end }}}
						</div></div>
					</div>
				</div>
				{{{ end }}}
			{{{ end }}}
		</div>

		<div class="col-12 col-md-8 px-0 mb-4">
			{{{ if success }}}
			<div class="alert alert-success">{success}</div>
			{{{ end }}}
			<div class="mb-4">
				<h5 class="fw-bold tracking-tight settings-header">License Manager API</h5>
				<p class="form-text text-body-secondary">Configure the WordPress License Manager URL and verification secret. These are used to validate license keys during registration.</p>
				<form method="post" action="{config.relative_path}/admin/plugins/license-gate">
					<input type="hidden" name="csrf_token" value="{config.csrf_token}" />
					{{{ if supportEnabled }}}<input type="hidden" name="supportEnabled" value="on" />{{{ end }}}
					{{{ if supportEnforcementEnabled }}}<input type="hidden" name="supportEnforcementEnabled" value="on" />{{{ end }}}
					<input type="hidden" name="supportServiceUrl" value="{supportServiceUrl}" />
					<input type="hidden" name="supportServiceApiKey" value="{supportServiceApiKey}" />
					<div class="mb-3">
						<label class="form-label" for="apiUrl">API URL</label>
						<input id="apiUrl" class="form-control" type="url" name="apiUrl" value="{apiUrl}" placeholder="https://your-wordpress-site.com/" />
						<p class="form-text">Base URL of the WordPress site where your License Manager plugin is installed (e.g. https://your-wordpress-site.com/)</p>
					</div>
					<div class="mb-3">
						<label class="form-label" for="secretKey">Verification secret key</label>
						<input id="secretKey" class="form-control" type="password" name="secretKey" value="{secretKey}" placeholder="Your API secret from WordPress" autocomplete="off" />
						<p class="form-text">The "License Verification API Secret Key" from your WordPress License Manager settings.</p>
					</div>
					<div class="form-check form-switch mb-3">
						<input type="checkbox" class="form-check-input" id="rejectBlocked" name="rejectBlocked" {{{ if rejectBlocked }}}checked{{{ end }}} />
						<label for="rejectBlocked" class="form-check-label">Reject blocked license keys</label>
						<p class="form-text">If enabled, keys with status "blocked" in the license manager cannot be used to register.</p>
					</div>
					<button type="submit" class="btn btn-primary">Save settings</button>
				</form>
			</div>

			<div class="mb-4">
				<h5 class="fw-bold tracking-tight settings-header">Support entitlement service</h5>
				<p class="form-text text-body-secondary">Connect forum accounts to Lay Theme licenses, display their support status, and optionally require active support before posting.</p>
				<form method="post" action="{config.relative_path}/admin/plugins/license-gate">
					<input type="hidden" name="csrf_token" value="{config.csrf_token}" />
					<input type="hidden" name="apiUrl" value="{apiUrl}" />
					<input type="hidden" name="secretKey" value="{secretKey}" />
					{{{ if rejectBlocked }}}<input type="hidden" name="rejectBlocked" value="on" />{{{ end }}}
					<div class="form-check form-switch mb-3">
						<input type="checkbox" class="form-check-input" id="supportEnabled" name="supportEnabled" {{{ if supportEnabled }}}checked{{{ end }}} />
						<label for="supportEnabled" class="form-check-label">Enable support status integration</label>
					</div>
					<div class="form-check form-switch mb-3">
						<input type="checkbox" class="form-check-input" id="supportEnforcementEnabled" name="supportEnforcementEnabled" {{{ if supportEnforcementEnabled }}}checked{{{ end }}} />
						<label for="supportEnforcementEnabled" class="form-check-label">Require active support for posting</label>
						<p class="form-text">Blocks new topics and replies for regular users whose support has expired. Administrators and global moderators remain exempt. If the support service is temporarily unavailable, posting remains available.</p>
					</div>
					<div class="mb-3">
						<label class="form-label" for="supportServiceUrl">Service URL</label>
						<input id="supportServiceUrl" class="form-control" type="url" name="supportServiceUrl" value="{supportServiceUrl}" placeholder="https://support-service.example.com/" />
						<p class="form-text">Use <code>http://localhost:3002/</code> for local development.</p>
					</div>
					<div class="mb-3">
						<label class="form-label" for="supportServiceApiKey">NodeBB API key</label>
						<input id="supportServiceApiKey" class="form-control" type="password" name="supportServiceApiKey" value="{supportServiceApiKey}" autocomplete="off" />
						<p class="form-text">This must match <code>NODEBB_API_KEY</code> in the support service. It is never sent to the browser.</p>
					</div>
					<button type="submit" class="btn btn-primary">Save support settings</button>
				</form>
			</div>
		</div>
	</div>
</div>
