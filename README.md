for use with: https://de.wordpress.org/plugins/software-license-manager/

# nodebb-plugin-license-gate

Restricts forum registration to users who have a valid license key in your WordPress License Manager (e.g. [Software License Manager](https://github.com/your-repo/software-license-manager) at `http://x.x.x.x/`).

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
