// Regex tester. Matching happens in a Worker with a timeout, so a pattern that
// backtracks catastrophically cannot lock up the popup.

import { MAX_INPUT, MAX_MATCHES } from "./regex-core.js";
import { copyButton, debounce, el, field, persist, setStatus, statusLine } from "../ui.js";

export { buildRegex, findMatches, groupNames, MAX_INPUT, MAX_MATCHES } from "./regex-core.js";

const TIMEOUT_MS = 1000;
const GROUPS_SHOWN = 20;
const FLAGS = [
  ["i", "ignore case"],
  ["m", "^ and $ match line breaks"],
  ["s", ". matches newlines"],
  ["u", "unicode"],
];

let worker = null;
let sequence = 0;

function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL("./regex-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

/**
 * Run one match job. Resolves either with the worker's reply or with
 * `{ok: false, timeout: true}` after TIMEOUT_MS, in which case the worker is
 * killed (a runaway regex cannot be interrupted any other way).
 */
function runMatch(pattern, flags, text) {
  const id = (sequence += 1);
  const current = ensureWorker();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      current.terminate();
      if (worker === current) worker = null;
      resolve({ id, ok: false, timeout: true });
    }, TIMEOUT_MS);

    function onMessage(event) {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data);
    }

    function onError() {
      cleanup();
      if (worker === current) worker = null;
      resolve({ id, ok: false, error: "The matcher failed to start." });
    }

    function cleanup() {
      clearTimeout(timer);
      current.removeEventListener("message", onMessage);
      current.removeEventListener("error", onError);
    }

    current.addEventListener("message", onMessage);
    current.addEventListener("error", onError);
    current.postMessage({ id, pattern, flags, text, limit: MAX_MATCHES });
  });
}

export function init(root) {
  root.textContent = "";

  const pattern = el("input", {
    type: "text",
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder: "(?<service>[a-z-]+)\\s+(?<level>INFO|WARN|ERROR)",
  });

  const subject = el("textarea", {
    rows: 5,
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder: "Text to match against",
  });

  const flagBoxes = {};
  const flagRow = el("div", { class: "toolbar wrap" });
  for (const [flag, description] of FLAGS) {
    const box = el("input", { type: "checkbox", id: `ldt-flag-${flag}` });
    flagBoxes[flag] = box;
    flagRow.append(
      el("div", { class: "check" }, [
        box,
        el("label", { for: box.id, title: description, text: flag }),
      ]),
    );
  }

  const status = statusLine();
  const highlight = el("div", { class: "out mono highlight", role: "group", "aria-label": "Matches in context" });
  const groups = el("div", { class: "groups" });

  root.append(
    field("Pattern", pattern),
    el("div", { class: "flags-line" }, [el("span", { class: "hint", text: "Flags:" }), flagRow]),
    field("Test string", subject),
    status,
    el("section", { class: "block" }, [
      el("div", { class: "block-head" }, [
        el("h2", { class: "block-title", text: "Matches" }),
        copyButton(() => matchSummary, "Copy matches"),
      ]),
      highlight,
    ]),
    groups,
    el("p", {
      class: "hint",
      text:
        "JavaScript (ECMAScript) engine. Java and Python patterns can behave differently — " +
        "lookbehind, \\A/\\z anchors and possessive quantifiers are not the same. " +
        "All occurrences are always listed; without the g flag, replace() only acts on the first.",
    }),
  );

  let matchSummary = "";
  let generation = 0;

  async function render() {
    const flags = Object.entries(flagBoxes)
      .filter(([, box]) => box.checked)
      .map(([flag]) => flag)
      .join("");

    const text = subject.value;
    const run = (generation += 1);

    highlight.textContent = "";
    groups.textContent = "";
    matchSummary = "";

    if (!pattern.value) {
      setStatus(status, "Enter a pattern.");
      highlight.textContent = text;
      return;
    }
    if (text.length > MAX_INPUT) {
      setStatus(status, `Test string is over the ${MAX_INPUT.toLocaleString()} character limit.`, "err");
      return;
    }
    if (!text) {
      setStatus(status, "Enter a test string.");
      return;
    }

    setStatus(status, "Matching…");
    const reply = await runMatch(pattern.value, flags, text);
    if (run !== generation) return; // A newer keystroke already took over.

    if (reply.timeout) {
      setStatus(
        status,
        "Stopped after 1 s — this pattern backtracks badly on this input. Try anchoring it or narrowing the quantifiers.",
        "err",
      );
      return;
    }
    if (!reply.ok) {
      setStatus(status, reply.error, "err");
      return;
    }

    const { matches, truncated, addedGlobal, names } = reply.result;
    renderHighlight(highlight, text, matches);
    renderGroups(groups, matches, names);
    matchSummary = matches.map((match, i) => `${i + 1}. @${match.index} ${match.text}`).join("\n");

    const parts = [`${matches.length} match${matches.length === 1 ? "" : "es"}`];
    if (truncated) parts.push(`showing the first ${MAX_MATCHES}`);
    if (addedGlobal) parts.push("g added for listing");
    setStatus(status, parts.join(" · "), matches.length ? "ok" : "muted");
  }

  const debounced = debounce(render, 150);
  pattern.addEventListener("input", debounced);
  subject.addEventListener("input", debounced);
  for (const box of Object.values(flagBoxes)) box.addEventListener("change", render);

  persist("regex", { pattern, subject, ...flagBoxes }, render);
  render();
}

function renderHighlight(container, text, matches) {
  container.textContent = "";
  let cursor = 0;

  matches.forEach((match, i) => {
    if (match.index > cursor) container.append(text.slice(cursor, match.index));

    const mark = el("mark", { title: `Match ${i + 1} at index ${match.index}` });
    if (match.text === "") {
      // Zero-length match: show a marker so it is visible at all.
      mark.classList.add("empty");
      mark.append(el("span", { class: "sr-only", text: "empty match" }));
    } else {
      mark.textContent = match.text;
    }
    container.append(mark);
    cursor = match.index + match.text.length;
  });

  container.append(text.slice(cursor));
}

function renderGroups(container, matches, names) {
  container.textContent = "";

  const withGroups = matches.filter((match) => match.groups.length > 0 || match.named);
  if (withGroups.length === 0) return;

  container.append(el("h2", { class: "block-title", text: "Capture groups" }));

  for (const [i, match] of matches.slice(0, GROUPS_SHOWN).entries()) {
    if (match.groups.length === 0 && !match.named) continue;

    const list = el("dl", { class: "group-list" });
    match.groups.forEach((value, index) => {
      const name = names[index];
      list.append(
        el("dt", { text: name ? `${index + 1} (${name})` : String(index + 1) }),
        el("dd", { class: "mono", text: value === null ? "(no match)" : value }),
      );
    });

    container.append(
      el("div", { class: "group-block" }, [
        el("p", { class: "group-head" }, [
          el("strong", { text: `Match ${i + 1}` }),
          el("span", { class: "muted", text: ` at index ${match.index}` }),
        ]),
        list,
      ]),
    );
  }

  if (matches.length > GROUPS_SHOWN) {
    container.append(
      el("p", {
        class: "hint",
        text: `Groups listed for the first ${GROUPS_SHOWN} of ${matches.length} matches.`,
      }),
    );
  }
}
