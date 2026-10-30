// Runs the user's pattern off the main thread. A pattern that backtracks
// catastrophically hangs this Worker, not the popup; regex.js terminates it on
// timeout and starts a fresh one.

import { findMatches } from "./regex-core.js";

self.addEventListener("message", (event) => {
  const { id, pattern, flags, text, limit } = event.data;
  try {
    self.postMessage({ id, ok: true, result: findMatches(pattern, flags, text, limit) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err.message) });
  }
});
