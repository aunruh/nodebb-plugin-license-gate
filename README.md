for use with: https://de.wordpress.org/plugins/software-license-manager/

# nodebb-plugin-license-gate

Validates Lay Theme license keys during registration and connects NodeBB accounts to the separate Lay Support Key Gate service.

## How it works

Same pattern as [nodebb-plugin-registration-question](https://www.npmjs.com/package/@nodebb/nodebb-plugin-registration-question): the **license key** field is added to the main registration form (one page with username, password, and license key).

1. User fills in the registration form: username, password, and **license key**.
2. On submit, the plugin calls your WordPress License Manager API (`slm_check`) to validate the key.
3. If the key is valid, registration completes. If not, an error is shown and they can try again.

## Configuration

**Recommended:** In the NodeBB Admin Control Panel, go to **Extend > Plugins** and click **License Gate** in the sidebar. Enter the **API URL** and **Verification secret key** there and click **Save settings**. No need to edit config files.

**Optional (fallback):** You can also set defaults in your NodeBB `config.json`:

```json
{
  "license_gate_api_url": "http://x.x.x.x/",
  "license_gate_secret_key": "YOUR_VERIFICATION_SECRET_FROM_WORDPRESS"
}
```

- **API URL** – Base URL of the WordPress site where the License Manager plugin is installed (e.g. `http://x.x.x.x/`).
- **Verification secret key** – The "License Verification API Secret Key" from your WordPress License Manager settings (used for `slm_check`).

If both API URL and secret key are not set, the license step is **skipped** (registration works as normal).

## WordPress License Manager API

The plugin uses the **slm_check** action:

- `slm_action=slm_check`
- `secret_key=<your verification secret>`
- `license_key=<user-entered key>`

A valid key returns JSON with `result: "success"`. Blocked keys can be rejected by configuring the plugin to reject `status === 'blocked'` (default: enabled).

## Support status and posting integration

The optional support integration displays account-bound support entitlements, exposes checkout when the support service reports that a payment provider is available, and can require active support for posting.

When enabled, the plugin:

1. Synchronizes the logged-in NodeBB account with the support service.
2. Automatically discovers licenses using the forum account email once per 24 hours.
3. Adds a **Support** item to the Harmony desktop and mobile navigation.
4. Shows support passes separately from masked licenses, purchases, paid upgrades, and remaining support time.
5. Lets a user connect another key. A different license-owner email triggers the service's confirmation-email flow.
6. Starts the Dodo Payments Support Pass checkout when payments are enabled, returns to the forum after payment, and refreshes the modal until the signed webhook activates the pass.
7. Shows administrators a compact support summary for the topic author directly below the topic metadata and beside every topic on the Recent page. The corresponding APIs are protected by a server-side administrator check and never return license keys or email addresses.
8. When posting enforcement is enabled, blocks both new topics and replies for regular users whose support has expired. The check runs on the NodeBB server, administrators are exempt, editing and reading remain available, and a temporary support-service outage fails open.

Configure these values in **Extend > Plugins > License Gate**:

- **Enable support status integration**
- **Require active support for posting** – server-side enforcement for new topics and replies
- **Service URL** – `http://localhost:3002/` for local development or the Railway URL in production
- **NodeBB API key** – must match `NODEBB_API_KEY` in the support service

The API key is only used by the NodeBB server and is never exposed to browser JavaScript.

The plugin calls:

- `POST /v1/accounts/sync`
- `POST /v1/accounts/:uid/discover-licenses`
- `GET /v1/accounts/:uid/support-status`
- `POST /v1/license-claims`
- `POST /v1/accounts/:uid/checkout`

Registration continues to use the existing WordPress License Manager connection during this rollout.

## Installation

1. Install the plugin (from your NodeBB root):
   ```bash
   npm install nodebb-plugin-license-gate
   ```
2. Build NodeBB so the plugin template and client script are included:
   ```bash
   ./nodebb build
   ```
   On Windows: `node nodebb build`
3. In the NodeBB Admin Control Panel, go to **Extend > Plugins** and activate **License Gate**.
4. Click **License Gate** in the Plugins section of the admin sidebar and enter your API URL and secret key.
