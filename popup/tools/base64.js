// Base64 and URL encoding, both directions, with auto-detection.
//
// All conversion goes through TextEncoder/TextDecoder, so non-ASCII input
// round-trips correctly; btoa/atob are only ever handed Latin-1 byte strings.

import {
  base64FromText,
  bytesFromBase64,
  formatBytes,
  looksLikeBase64,
  textFromBase64,
  utf8FromText,
} from "../codec.js";
import { el, field, outputBlock, persist, setStatus, statusLine } from "../ui.js";

// --- pure logic -------------------------------------------------------------

/**
 * Guess whether the user wants to encode or decode.
 * Decoding wins only if the text is shaped like Base64 *and* decodes to text,
 * which keeps ordinary words like "food" (valid Base64, binary result) on the
 * encode side.
 * @returns {"encode"|"decode"}
 */
export function detectBase64Direction(text) {
  const trimmed = String(text).trim();
  if (!trimmed || !looksLikeBase64(trimmed)) return "encode";
  try {
    textFromBase64(trimmed);
    return "decode";
  } catch {
    return "encode";
  }
}

/** URL text is only ever decoded when it actually carries %XX escapes. */
export function detectUrlDirection(text) {
  return /%[0-9A-Fa-f]{2}/.test(String(text)) ? "decode" : "encode";
}

/**
 * @returns {{direction: "encode"|"decode", output: string, note: string}}
 * @throws {Error} on input that cannot be decoded.
 */
export function convertBase64(text, direction, { urlSafe = false, padding = true } = {}) {
  if (direction === "decode") {
    const trimmed = text.trim();
    let output;
    try {
      output = textFromBase64(trimmed);
    } catch (err) {
      throw new Error(`Input ${err.message}.`);
    }
    const bytes = bytesFromBase64(trimmed).length;
    return { direction, output, note: `decoded ${formatBytes(bytes)}` };
  }

  const bytes = utf8FromText(text);
  return {
    direction,
    output: base64FromText(text, { urlSafe, padding }),
    note: `encoded ${formatBytes(bytes.length)}${urlSafe ? ", URL-safe alphabet" : ""}`,
  };
}

export function convertUrl(text, direction) {
  if (direction === "decode") {
    try {
      return { direction, output: decodeURIComponent(text.trim()), note: "percent-decoded" };
    } catch {
      throw new Error("Input has a malformed percent escape (for example a lone %).");
    }
  }
  return { direction, output: encodeURIComponent(text), note: "percent-encoded (component level)" };
}

/**
 * Parse a query string, or a full URL that has one, into its key/value pairs.
 * Repeated keys collapse into an array in `obj`, matching how most servers
 * read `a=1&a=2`.
 * @returns {{pairs: [string, string][], obj: Record<string, string|string[]>}}
 * @throws {Error} when there is nothing to parse.
 */
export function parseQueryString(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error("Paste a URL or query string.");

  const qIndex = trimmed.indexOf("?");
  const search = (qIndex === -1 ? trimmed : trimmed.slice(qIndex + 1)).replace(/^[?&]+/, "").replace(/#.*$/, "");
  // URLSearchParams happily parses plain prose as one key with an empty
  // value ("no query here" → {"no query here": ""}), so require an explicit
  // "?" or at least one "key=value" pair before trusting the result.
  if (!search || !(qIndex !== -1 || search.includes("="))) {
    throw new Error("No query parameters found — paste something with a ?a=b&c=d part.");
  }

  const pairs = [...new URLSearchParams(search).entries()];
  if (pairs.length === 0) throw new Error("No query parameters found.");

  const obj = {};
  for (const [key, value] of pairs) {
    if (key in obj) obj[key] = Array.isArray(obj[key]) ? [...obj[key], value] : [obj[key], value];
    else obj[key] = value;
  }
  return { pairs, obj };
}

/**
 * Build a query string from a flat JSON object. Array values repeat the key
 * (`{"a":[1,2]}` → `a=1&a=2`); null/undefined values are dropped.
 * @throws {Error} on invalid JSON or a non-object document.
 */
export function buildQueryString(jsonText) {
  let value;
  try {
    value = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Not valid JSON: ${err.message}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON must be an object of key → value pairs, e.g. {\"a\": 1, \"b\": \"two\"}.");
  }

  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(value)) {
    if (val === null || val === undefined) continue;
    for (const item of Array.isArray(val) ? val : [val]) params.append(key, String(item));
  }
  return params.toString();
}

/** Build when the input parses as a JSON object; parse otherwise. */
export function detectQueryDirection(text) {
  return /^\s*\{/.test(String(text)) ? "encode" : "decode";
}

export function convert(text, { mode, direction, urlSafe, padding }) {
  const resolved =
    direction !== "auto"
      ? direction
      : mode === "url"
        ? detectUrlDirection(text)
        : mode === "query"
          ? detectQueryDirection(text)
          : detectBase64Direction(text);

  let result;
  if (mode === "url") {
    result = convertUrl(text, resolved);
  } else if (mode === "query") {
    if (resolved === "encode") {
      result = { direction: resolved, output: buildQueryString(text), note: "built from JSON" };
    } else {
      const { obj, pairs } = parseQueryString(text);
      result = { direction: resolved, output: JSON.stringify(obj, null, 2), note: `parsed ${pairs.length} param${pairs.length === 1 ? "" : "s"}`, pairs };
    }
  } else {
    result = convertBase64(text, resolved, { urlSafe, padding });
  }
  return { ...result, auto: direction === "auto" };
}

// --- UI ---------------------------------------------------------------------

export function init(root) {
  root.textContent = "";

  const mode = el("select", {}, [
    el("option", { value: "base64", text: "Base64" }),
    el("option", { value: "url", text: "URL (percent) encoding" }),
    el("option", { value: "query", text: "Query string" }),
  ]);

  const direction = el("select", {}, [
    el("option", { value: "auto", text: "Auto-detect" }),
    el("option", { value: "encode", text: "Encode" }),
    el("option", { value: "decode", text: "Decode" }),
  ]);

  const urlSafe = el("input", { type: "checkbox" });
  const padding = el("input", { type: "checkbox", checked: true });

  const options = el("div", { class: "toolbar wrap" }, [
    checkbox("URL-safe alphabet (-_)", urlSafe),
    checkbox("Keep = padding", padding),
  ]);

  const input = el("textarea", {
    rows: 5,
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder: "Text to encode, or Base64 to decode",
  });

  const status = statusLine();
  const output = outputBlock("Output");
  const paramsTable = el("div", { class: "hidden" });

  const useOutput = el("button", {
    class: "btn ghost small",
    type: "button",
    text: "Output → input",
    title: "Move the result into the input box to chain conversions",
    onClick: () => {
      if (!output.body.textContent) return;
      input.value = output.body.textContent;
      render();
      input.focus();
    },
  });
  output.head.append(useOutput);

  root.append(
    el("div", { class: "row" }, [field("Mode", mode), field("Direction", direction)]),
    options,
    field("Input", input),
    status,
    output.wrap,
    paramsTable,
  );

  function syncOptionVisibility() {
    // The padding/alphabet switches only affect Base64 encoding.
    const relevant = mode.value === "base64" && direction.value !== "decode";
    options.classList.toggle("hidden", !relevant);

    input.placeholder =
      mode.value === "query"
        ? 'A URL or query string to parse, or JSON like {"a": 1} to build one'
        : "Text to encode, or Base64 to decode";
  }

  function render() {
    syncOptionVisibility();
    output.body.textContent = "";
    paramsTable.textContent = "";
    paramsTable.classList.add("hidden");

    const text = input.value;
    if (!text) {
      setStatus(status, "Waiting for input.");
      return;
    }

    try {
      const result = convert(text, {
        mode: mode.value,
        direction: direction.value,
        urlSafe: urlSafe.checked,
        padding: padding.checked,
      });
      output.body.textContent = result.output;
      const prefix = result.auto ? `Auto: ${result.direction} — ` : "";
      setStatus(status, `${prefix}${result.note}`, "ok");
      if (result.pairs) renderParamsTable(paramsTable, result.pairs);
    } catch (err) {
      setStatus(status, err.message, "err");
    }
  }

  for (const control of [mode, direction, urlSafe, padding]) {
    control.addEventListener("change", render);
  }
  input.addEventListener("input", render);

  persist("base64", { text: input, mode, direction, urlSafe, padding }, render);
  render();
}

function checkbox(labelText, control) {
  if (!control.id) control.id = `ldt-cb-${labelText.replace(/\W+/g, "")}`;
  return el("div", { class: "check" }, [control, el("label", { for: control.id, text: labelText })]);
}

/** Every raw pair in order, so repeated keys stay visible as separate rows. */
function renderParamsTable(container, pairs) {
  container.classList.remove("hidden");
  for (const [key, value] of pairs) {
    container.append(
      el("div", { class: "kv-row" }, [
        el("span", { class: "kv-key mono", text: key }),
        el("span", { class: "kv-value mono", text: value }),
      ]),
    );
  }
}
