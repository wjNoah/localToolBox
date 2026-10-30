# Publishing to the Chrome Web Store

Everything the Developer Dashboard asks for, ready to paste.

## Before the first upload

1. Register as a Chrome Web Store developer at
   <https://chrome.google.com/webstore/devconsole> — one-time US$5 fee, Google
   account with 2-Step Verification.
2. Make the GitHub repo public, so the privacy policy and source links below
   resolve.
3. Build the upload:

   ```bash
   ./scripts/package.sh
   ```

   This writes `dist/local-dev-toolbox-<version>.zip` containing only
   `manifest.json`, `popup/`, `icons/` and `LICENSE`.
4. In the dashboard: **New item** → upload the ZIP → fill in the tabs below →
   **Submit for review**. Reviews for a `storage`-only extension usually take a
   few days.

## Store listing tab

**Name** (from manifest): Local Dev Toolbox

**Summary** (from manifest, max 132 chars):

> Small developer utilities (JWT, Base64, timestamps, JSON, regex) that run 100% locally. No account, no network.

**Category:** Developer Tools

**Language:** English

**Description:**

```
Decode JWTs, convert timestamps and format JSON without pasting production data into a random website.

Local Dev Toolbox puts five everyday developer utilities in one popup. Everything runs inside your browser: no account, no network requests, no access to the pages you visit.

JWT
• Decode header and payload as formatted JSON
• exp / iat / nbf shown as local dates with "expired 3 min ago" / "valid for 29 min"
• Verify signatures locally: HS256/384/512, RS256/384/512, PS256/384/512, ES256/384/512
• alg "none" is always flagged; signing secrets are never saved

BASE64 & URL
• Encode/decode with auto-detection, standard and URL-safe alphabets, missing padding handled
• Correct UTF-8 round-trips
• URL percent-encoding
• Query string ⇄ JSON, with repeated keys kept visible

TIME
• Unix timestamp ⇄ date, seconds / ms / µs / ns detected automatically
• ISO 8601 in UTC and common time zones, relative time, one-click copy

JSON
• Pretty-print (2 spaces, 4 spaces, tab), minify, validate with line and column
• Diff two documents by path: $.env.LOG_LEVEL changed, $.ports[2] added

REGEX
• Live match highlighting, capture groups including named groups
• Runaway patterns time out after 1 second instead of freezing the browser

PRIVACY
• Only permission: storage
• Content Security Policy blocks all network connections (connect-src 'none')
• No analytics, no telemetry, no third-party code
• Input is not saved unless you turn on "Remember input" — and then only on this computer

Open it with Ctrl+Shift+Y (Cmd+Shift+Y on Mac).

Open source (MIT): https://github.com/wjNoah/localToolBox
```

**Graphics** (all in `store/`):

| Asset              | File                                | Size     |
| ------------------ | ----------------------------------- | -------- |
| Store icon         | `icons/icon-128.png`                | 128×128  |
| Screenshot 1       | `store/screenshot-1-jwt.png`        | 1280×800 |
| Screenshot 2       | `store/screenshot-2-json.png`       | 1280×800 |
| Screenshot 3       | `store/screenshot-3-time.png`       | 1280×800 |
| Small promo tile   | `store/promo-small.png`             | 440×280  |

Regenerate them with `./scripts/store-assets.sh` after a UI change.

**Official URL / Homepage URL:** https://github.com/wjNoah/localToolBox

**Support URL:** https://github.com/wjNoah/localToolBox/issues

## Privacy practices tab

**Single purpose:**

> Provide offline developer utilities — decoding and verifying JWTs, Base64 and URL encoding, timestamp conversion, JSON formatting and diffing, and regex testing — in a toolbar popup, entirely on the user's device.

**Permission justification — `storage`:**

> Used only when the user turns on the "Remember input" option, to keep the text they typed into the tools between popup openings. Data is saved with chrome.storage.local on the user's device, is never transmitted, and is deleted when the option is turned off or "Clear saved input" is clicked. Off by default.

**Remote code:** No, I am not using remote code.

> All JavaScript is included in the package. The Content Security Policy is script-src 'self' and connect-src 'none'.

**Data usage:** tick **none** of the data categories. The extension does not
collect or transmit any user data; locally stored input never leaves the
device, which the Chrome Web Store does not count as collection.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

```
https://github.com/wjNoah/localToolBox/blob/main/PRIVACY.md
```

## Distribution tab

- **Visibility:** Public (or Unlisted to test the listing first)
- **Regions:** All regions
- **Pricing:** Free

## Publishing an update

1. Bump `"version"` in `manifest.json` — the store rejects a ZIP whose version
   isn't higher than the published one.
2. `./scripts/package.sh`
3. Dashboard → the item → **Package** → **Upload new package** → **Submit for review**.
