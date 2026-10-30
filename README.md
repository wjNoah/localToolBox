# Local Dev Toolbox

Small developer utilities in a Chrome extension popup. Everything runs locally:
no account, no network requests, no host permissions.

## Tools

All five are implemented.

### JWT

Paste a token to see the decoded header and payload as formatted JSON. `exp`,
`iat`, `nbf` and `auth_time` are shown as local dates with a plain-language
label ("valid for 29 min", "expired 3 min ago"), and the top line gives the
verdict for the whole token.

Decode only — the signature is displayed but **not verified**. Base64url and
UTF-8 are handled correctly, and malformed tokens get a specific error (wrong
part count, bad base64url, invalid JSON, non-object segment).

### Base64

Encode and decode with direction auto-detection plus a manual override.
Supports the standard and URL-safe alphabets, optional `=` padding and input
with padding missing. Text is converted through `TextEncoder`/`TextDecoder`, so
non-ASCII round-trips correctly. A second mode does component-level URL
(percent) encoding.

Auto-detect only decodes when the input both looks like Base64 and decodes to
valid text, so ordinary words are not mistaken for encoded data.

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
elements are compared by index. The diff is written in `json.js` rather than
pulled in as a dependency.

### Regex

Pattern plus flag checkboxes, with matches highlighted live in the test string
and capture groups — including named ones — listed per match.

Matching runs in a Worker with a 1 second timeout, so a pattern that backtracks
catastrophically kills the Worker instead of freezing the popup. Input is capped
at 200,000 characters and the first 500 matches are listed.

Uses the JavaScript (ECMAScript) engine; the UI notes that Java and Python
regexes can behave differently.

## Privacy

This is the point of the extension — people paste real tokens into these tools.

- The only permission is `storage`. No host permissions, no `tabs`, no `activeTab`.
- No network requests of any kind. The CSP sets `connect-src 'none'`, and there
  are no CDNs, fonts, analytics or telemetry.
- Input is **not** saved by default. The "Remember input" toggle in the footer is
  off until you turn it on; switching it off deletes anything already stored, and
  "Clear saved input" wipes it at any time. Stored input lives in
  `chrome.storage.local` on this machine only — `chrome.storage.sync` is not used.

## Run it locally

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
4. Open the popup via the toolbar icon or Cmd+Shift+Y (Ctrl+Shift+Y on Windows/Linux)

## Structure

```
manifest.json          Manifest V3, only the "storage" permission
popup/popup.html       Popup shell with tabs
popup/popup.css        Styles (light/dark via prefers-color-scheme)
popup/popup.js         Tab switching, keyboard nav, lazy init of each tool
popup/codec.js         Shared Base64 / UTF-8 primitives
popup/format.js        Shared date, duration and time zone formatting
popup/ui.js            Shared DOM helpers and the opt-in input store
popup/tools/*.js       One module per tool, each exports init(root)
popup/tools/regex-core.js    Regex logic, shared by the tool and its Worker
popup/tools/regex-worker.js  Runs patterns off the main thread
```

Each tool keeps its logic in pure exported functions (`decodeJwt`,
`parseTimestamp`, `diffValues`, `findMatches`, …) separate from the DOM, so they
can be unit tested without a browser.

## Principles

- No network: the CSP sets `connect-src 'none'`
- Minimal permissions
- No build step, no framework, no runtime dependencies — plain ES modules
- User input reaches the DOM only through `textContent`; `innerHTML` is never
  assigned anywhere in the codebase

## License

MIT
