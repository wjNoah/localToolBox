# Privacy Policy — Local Dev Toolbox

_Last updated: 30 October 2026_

Local Dev Toolbox is a browser extension with developer utilities (JWT, Base64,
timestamps, JSON, regex). It is built so that nothing you enter leaves your
computer.

## What the extension collects

Nothing. The extension does not collect, transmit, sell or share any data.

- It makes **no network requests**. Its Content Security Policy sets
  `connect-src 'none'`, which blocks every outgoing connection from the
  extension's pages.
- It contains **no analytics, telemetry, crash reporting, ads or third-party
  code**.
- It **cannot read the websites you visit**. Its only permission is `storage`;
  it has no host permissions and no access to tabs, history or page content.

## What is stored on your device

By default, nothing. Text you type into the tools is kept in memory only while
the popup is open and is gone when it closes.

If you turn on **Remember input** in the popup footer, the text in the tool
fields is saved with `chrome.storage.local` so it is still there the next time
you open the popup. This data:

- stays on your computer and is not synced to your Google account
  (`chrome.storage.sync` is not used);
- never includes JWT signing secrets or public keys — those fields are never
  saved;
- is deleted when you turn **Remember input** off, when you click
  **Clear saved input**, or when you remove the extension.

## Changes

If this policy changes, the updated version will be published at this address
with a new date. Because the extension has no network access, a change in data
handling would require a new extension version, visible in the source code.

## Contact

Questions or concerns: open an issue at
<https://github.com/wjNoah/localToolBox/issues>.
