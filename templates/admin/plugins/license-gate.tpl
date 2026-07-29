<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->

	<div class="row settings m-0">
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
				<p class="form-text text-body-secondary">Connect forum accounts to Lay Theme licenses and display their support status. This first rollout only displays status and does not restrict posting.</p>
				<form method="post" action="{config.relative_path}/admin/plugins/license-gate">
					<input type="hidden" name="csrf_token" value="{config.csrf_token}" />
					<input type="hidden" name="apiUrl" value="{apiUrl}" />
					<input type="hidden" name="secretKey" value="{secretKey}" />
					{{{ if rejectBlocked }}}<input type="hidden" name="rejectBlocked" value="on" />{{{ end }}}
					<div class="form-check form-switch mb-3">
						<input type="checkbox" class="form-check-input" id="supportEnabled" name="supportEnabled" {{{ if supportEnabled }}}checked{{{ end }}} />
						<label for="supportEnabled" class="form-check-label">Enable support status integration</label>
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
