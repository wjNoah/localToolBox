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

export function convert(text, { mode, direction, urlSafe, padding }) {
  const resolved =
    direction !== "auto"
      ? direction
      : mode === "url"
        ? detectUrlDirection(text)
        : detectBase64Direction(text);

  const result = mode === "url" ? convertUrl(text, resolved) : convertBase64(text, resolved, { urlSafe, padding });
  return { ...result, auto: direction === "auto" };
}

// --- UI ---------------------------------------------------------------------

export function init(root) {
  root.textContent = "";

  const mode = el("select", {}, [
    el("option", { value: "base64", text: "Base64" }),
    el("option", { value: "url", text: "URL (percent) encoding" }),
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
  );

  function syncOptionVisibility() {
    // The padding/alphabet switches only affect Base64 encoding.
    const relevant = mode.value === "base64" && direction.value !== "decode";
    options.classList.toggle("hidden", !relevant);
  }

  function render() {
    syncOptionVisibility();
    output.body.textContent = "";

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
