# Local Dev Toolbox

Small developer utilities in a browser extension popup: **JWT, Base64/URL,
timestamps, JSON and regex**. Everything runs locally — no account, no network
requests, no host permissions.

Built for the moment you need to paste a production token or a customer payload
somewhere and don't want it to end up on a random website.

- [Tools](#tools)
- [Download](#download)
- [Install](#install) — [Chrome](#google-chrome) · [Edge](#microsoft-edge) · [Brave](#brave) · [Opera](#opera--opera-gx) · [Vivaldi](#vivaldi) · [Arc](#arc) · [Firefox](#firefox) · [Safari](#safari)
- [Usage](#usage)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development) — [Publishing](#publishing-to-the-chrome-web-store)
- [License](#license)

## Tools

| Tab    | What it does                                                                 |
| ------ | ---------------------------------------------------------------------------- |
| JWT    | Decode header and payload, check expiry, verify HMAC / RSA / PSS / ECDSA signatures |
| Base64 | Base64 encode/decode, URL percent-encoding, query string ⇄ JSON              |
| Time   | Unix timestamp ⇄ date in any common zone, seconds through nanoseconds         |
| JSON   | Pretty-print, minify, validate with line/column, diff two documents          |
| Regex  | Live match highlighting and capture groups, safe against runaway patterns    |

### JWT

Paste a token to see the decoded header and payload as formatted JSON. `exp`,
`iat`, `nbf` and `auth_time` are shown as local dates with a plain-language
label ("valid for 29 min", "expired 3 min ago"), and the top line gives the
verdict for the whole token.

Base64url and UTF-8 are handled correctly, and malformed tokens get a specific
error (wrong part count, bad base64url, invalid JSON, non-object segment).

Signature verification runs entirely through `SubtleCrypto`: HS256/384/512
against a secret you paste, and RS256/384/512, PS256/384/512 and ES256/384/512
against an SPKI public key in PEM form. `alg: "none"` is always flagged
invalid. The secret/key field is **never persisted** — it's excluded from the
input store even with "Remember input" on, since a signing key is more
sensitive than the token itself.

### Base64

Encode and decode with direction auto-detection plus a manual override.
Supports the standard and URL-safe alphabets, optional `=` padding and input
with padding missing. Text is converted through `TextEncoder`/`TextDecoder`, so
non-ASCII round-trips correctly. A second mode does component-level URL
(percent) encoding.

Auto-detect only decodes when the input both looks like Base64 and decodes to
valid text, so ordinary words are not mistaken for encoded data.

A third mode parses a query string (or a full URL with one) into its key/value
pairs — shown as formatted JSON and as a raw-pairs table, so repeated keys
(`tag=a&tag=b`) stay visible instead of silently collapsing. The same mode
runs in reverse: paste a JSON object and it's built back into a query string,
with array values repeating the key.

### Time

One field accepts either a unix timestamp or a date. Seconds, milliseconds,
microseconds and nanoseconds are told apart by magnitude. Output covers ISO 8601
in the selected zone, ISO 8601 in UTC, a readable form, unix seconds, unix
milliseconds, the UTC offset and a relative label — each with its own copy
button.

The time zone selector covers local, UTC and a few common zones. A date typed
without an offset is read as wall-clock time in the selected zone; text that
carries `Z` or an offset keeps its own.

### JSON

Pretty-print (2 spaces, 4 spaces or tab), minify, and validate with the error
line and column. Both documents are validated live as you type.

"Diff A ↔ B" compares two documents and lists every difference by path
(`$.env.LOG_LEVEL`, `$.ports[2]`) marked added, removed or changed. Array
elements are compared by index.

### Regex

Pattern plus flag checkboxes, with matches highlighted live in the test string
and capture groups — including named ones — listed per match.

Matching runs in a Worker with a 1 second timeout, so a pattern that backtracks
catastrophically kills the Worker instead of freezing the popup. Input is capped
at 200,000 characters and the first 500 matches are listed.

Uses the JavaScript (ECMAScript) engine; the UI notes that Java and Python
regexes can behave differently.

## Download

The extension isn't in any browser store yet, so you install it from source.
There is no build step — the folder you download is the extension.

**With git:**

```bash
git clone https://github.com/wjNoah/localToolBox.git
```

**Without git:** open <https://github.com/wjNoah/localToolBox>, click
**Code → Download ZIP**, and unzip it.

Put the folder somewhere permanent (not `Downloads` or a temp directory). The
browser loads the extension straight from that folder, so if you move or delete
it, the extension stops working.

The folder you select during install is the one that contains `manifest.json`.

## Install

| Browser                                | Support                          |
| -------------------------------------- | -------------------------------- |
| Chrome, Edge, Brave, Opera, Vivaldi, Arc | Supported (Chromium, Manifest V3) |
| Firefox                                | Temporary add-on, untested       |
| Safari                                 | Needs Xcode conversion, untested |

### Google Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the project folder
4. Click the puzzle-piece icon in the toolbar and pin **Local Dev Toolbox**

### Microsoft Edge

1. Open `edge://extensions`
2. Turn on **Developer mode** (left sidebar, or bottom left)
3. Click **Load unpacked** and select the project folder
4. Click the puzzle-piece icon and toggle **Show in toolbar**

### Brave

1. Open `brave://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the project folder
4. Pin it from the puzzle-piece menu

### Opera / Opera GX

1. Open `opera://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the project folder
4. Pin it from the cube icon in the toolbar

### Vivaldi

1. Open `vivaldi://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the project folder

### Arc

1. Open `arc://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the project folder
4. Pin it from the extensions icon in the sidebar

### Firefox

Firefox only loads unsigned extensions as **temporary add-ons**, which are
removed when Firefox restarts. Firefox 115 or newer is needed (Manifest V3,
module Workers). This setup hasn't been tested yet — reports welcome.

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside the project folder
4. Pin it from the puzzle-piece menu in the toolbar

A temporary add-on gets a new internal ID on every load, so "Remember input"
data does not survive a restart.

### Safari

Safari needs every web extension wrapped in a macOS app. You need a Mac with
Xcode installed. This hasn't been tested yet.

```bash
xcrun safari-web-extension-converter /path/to/localToolBox
```

1. Xcode opens the generated project — press **Run** (⌘R)
2. In Safari, open **Settings → Advanced** and turn on **Show features for web developers**
3. In **Settings → Developer**, turn on **Allow unsigned extensions** (resets every time Safari quits)
4. In **Settings → Extensions**, enable **Local Dev Toolbox**

## Usage

- **Open the popup:** click the toolbar icon, or press **Cmd+Shift+Y** (macOS) /
  **Ctrl+Shift+Y** (Windows/Linux). If the shortcut does nothing, another
  extension probably took it — see [Troubleshooting](#troubleshooting).
- **Switch tools:** click a tab, or focus the tab bar and use **← / →**,
  **Home** and **End**.
- **Copy a result:** use the copy button next to it.
- **Remember input** (footer, off by default): keeps what you typed so it's
  still there next time you open the popup. **Clear saved input** wipes it.

## Updating and uninstalling

**Update:**

```bash
git pull
```

Then reload the extension: the ↻ icon on its card in `chrome://extensions`
(or the browser's equivalent page). Firefox: **Reload** in `about:debugging`.
Safari: run the Xcode project again. If you downloaded a ZIP, download it
again and replace the folder contents.

**Uninstall:** click **Remove** on the extension's card, then delete the
folder. Anything saved via "Remember input" is removed with the extension.

## Privacy

This is the point of the extension — people paste real tokens into these tools.

- The only permission is `storage`. No host permissions, no `tabs`, no `activeTab`.
- No network requests of any kind. The CSP sets `connect-src 'none'`, and there
  are no CDNs, fonts, analytics or telemetry.
- Input is **not** saved by default. The "Remember input" toggle in the footer is
  off until you turn it on; switching it off deletes anything already stored, and
  "Clear saved input" wipes it at any time. Stored input lives in
  `chrome.storage.local` on this machine only — `chrome.storage.sync` is not used.
- JWT signing secrets and public keys are never stored, even with
  "Remember input" on.

You can check this yourself: `manifest.json` is short enough to read in a minute, and
`grep -rn "fetch\|XMLHttpRequest\|WebSocket" popup` comes back empty.

## Troubleshooting

**"Manifest file is missing or unreadable"** — you selected the wrong folder.
Pick the one that directly contains `manifest.json`, not its parent (ZIP
downloads often unpack to `localToolBox-main/localToolBox-main/`).

**The keyboard shortcut doesn't open the popup** — another extension or the
OS already uses it. Set your own at `chrome://extensions/shortcuts`
(`edge://extensions/shortcuts`, `brave://extensions/shortcuts`, …) or, in
Firefox, `about:addons` → gear icon → **Manage Extension Shortcuts**.

**The extension disappeared after a restart** — expected in Firefox (temporary
add-on) and in Safari with unsigned extensions. In Chromium browsers, check
that the folder wasn't moved or deleted.

**"Disable developer mode extensions" popup on startup** (Chrome/Edge) — normal
for unpacked extensions. Click the X; don't click Disable.

**Regex says it timed out** — the pattern backtracks catastrophically on this
input (e.g. `(a+)+$`). Make the quantifiers more specific or shorten the input.

**Something looks wrong** — right-click inside the popup → **Inspect** opens
DevTools for the popup; errors show in its Console.

## Development

No build step, no framework, no runtime dependencies — plain ES modules.
Edit a file, then close and reopen the popup. Changes to `manifest.json`
need the ↻ reload on the extensions page.

```
manifest.json          Manifest V3, only the "storage" permission
icons/                 Toolbar and store icons (generated)
popup/popup.html       Popup shell with tabs
popup/popup.css        Styles (light/dark via prefers-color-scheme)
popup/popup.js         Tab switching, keyboard nav, lazy init of each tool
popup/codec.js         Shared Base64 / UTF-8 primitives
popup/format.js        Shared date, duration and time zone formatting
popup/ui.js            Shared DOM helpers and the opt-in input store
popup/tools/*.js       One module per tool, each exports init(root)
popup/tools/regex-core.js    Regex logic, shared by the tool and its Worker
popup/tools/regex-worker.js  Runs patterns off the main thread
scripts/               Packaging, icon and store-asset scripts (not shipped)
store/                 Store screenshots, promo tile and their HTML sources (not shipped)
STORE.md               Chrome Web Store listing and submission checklist
PRIVACY.md             Privacy policy linked from the store listing
```

Each tool keeps its logic in pure exported functions (`decodeJwt`,
`parseTimestamp`, `diffValues`, `findMatches`, …) separate from the DOM, so they
can be unit tested without a browser.

### Principles

- No network: the CSP sets `connect-src 'none'`
- Minimal permissions — `storage` only
- No dependencies, no build step
- User input reaches the DOM only through `textContent`; `innerHTML` is never
  assigned anywhere in the codebase

### Scripts

All standard library / built-in tools, nothing to install.

| Command                          | What it does                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| `./scripts/package.sh`           | Builds `dist/local-dev-toolbox-<version>.zip` for the store    |
| `python3 scripts/build-icons.py` | Regenerates `icons/icon-{16,32,48,128}.png`                    |
| `./scripts/store-assets.sh`      | Renders store screenshots and promo tile into `store/` (needs Chrome) |

### Publishing to the Chrome Web Store

[STORE.md](STORE.md) has the whole checklist plus every text the developer
dashboard asks for (description, single purpose, permission justification,
data-usage answers), ready to paste. The privacy policy is
[PRIVACY.md](PRIVACY.md).

## License

MIT — see [LICENSE](LICENSE).
