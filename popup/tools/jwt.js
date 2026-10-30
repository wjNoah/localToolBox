// JWT decoder. Decode only: the signature is shown but never verified in v1.

import { bytesFromBase64, textFromBase64 } from "../codec.js";
import { formatDateInZone, formatDuration, isoInZone, isValidInstant } from "../format.js";
import { copyButton, el, field, outputBlock, persist, setStatus, statusLine } from "../ui.js";

// --- pure logic -------------------------------------------------------------

/** Claims that RFC 7519 (and common OIDC practice) defines as NumericDate. */
export const DATE_CLAIMS = {
  exp: "Expires",
  iat: "Issued at",
  nbf: "Not before",
  auth_time: "Authenticated at",
};

/**
 * @param {string} token
 * @returns {{header: object, payload: object, signature: string, signatureBytes: number}}
 * @throws {Error} with a message naming the specific problem.
 */
export function decodeJwt(token) {
  const raw = String(token ?? "").trim();
  if (!raw) throw new Error("Paste a token to decode.");

  const parts = raw.split(".");
  if (parts.length !== 3) {
    const dots = parts.length - 1;
    const what = dots === 0 ? "no dots" : `${dots} dot${dots === 1 ? "" : "s"}`;
    throw new Error(`A JWT has three dot-separated parts; this has ${what}.`);
  }

  const [headerPart, payloadPart, signature] = parts;
  const header = parseSegment(headerPart, "Header");
  const payload = parseSegment(payloadPart, "Payload");

  let signatureBytes = 0;
  if (signature) {
    try {
      signatureBytes = bytesFromBase64(signature).length;
    } catch {
      throw new Error("Signature segment is not valid base64url.");
    }
  }

  return { header, payload, signature, signatureBytes };
}

function parseSegment(segment, name) {
  if (!segment) throw new Error(`${name} segment is empty.`);

  let text;
  try {
    text = textFromBase64(segment);
  } catch (err) {
    // codec.js messages are sentence fragments; "base64" reads as base64url here.
    throw new Error(`${name} segment ${err.message.replace("Base64", "base64url")}.`);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new Error(`${name} segment is not valid JSON: ${err.message}`);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} segment is JSON but not an object.`);
  }
  return value;
}

/**
 * Interpret a NumericDate claim.
 * RFC 7519 says seconds, but some services emit milliseconds; a seconds value
 * that large would read as a date in the year 5000+, so treat it as millis.
 * @returns {{ms: number, unit: "s"|"ms"}|null} null when the value is not a number.
 */
export function numericDateToMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.abs(value) > 1e11 ? { ms: value, unit: "ms" } : { ms: value * 1000, unit: "s" };
}

/**
 * Plain-language state of a date claim.
 * @returns {{tone: "ok"|"warn"|"err"|"muted", text: string}}
 */
export function claimStatus(claim, ms, nowMs = Date.now()) {
  const delta = ms - nowMs;
  const span = formatDuration(delta);

  if (claim === "exp") {
    return delta >= 0
      ? { tone: "ok", text: `valid for ${span}` }
      : { tone: "err", text: `expired ${span} ago` };
  }
  if (claim === "nbf") {
    return delta > 0
      ? { tone: "warn", text: `not usable for another ${span}` }
      : { tone: "ok", text: `active since ${span} ago` };
  }
  return delta <= 0 ? { tone: "muted", text: `${span} ago` } : { tone: "muted", text: `in ${span}` };
}

/** One-line verdict for the whole token, driven by exp/nbf. */
export function tokenValidity(payload, nowMs = Date.now()) {
  const exp = numericDateToMs(payload.exp);
  const nbf = numericDateToMs(payload.nbf);

  if (exp && exp.ms < nowMs) {
    return { tone: "err", text: `Expired ${formatDuration(nowMs - exp.ms)} ago` };
  }
  if (nbf && nbf.ms > nowMs) {
    return { tone: "warn", text: `Not valid for another ${formatDuration(nbf.ms - nowMs)}` };
  }
  if (exp) {
    return { tone: "ok", text: `Valid for ${formatDuration(exp.ms - nowMs)}` };
  }
  return { tone: "muted", text: "No exp claim" };
}

// --- UI ---------------------------------------------------------------------

const SAMPLE_HINT = "Paste a token. It is decoded in the popup; nothing is sent anywhere.";

export function init(root) {
  root.textContent = "";

  const input = el("textarea", {
    rows: 4,
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature",
  });

  const status = statusLine();
  const badges = el("div", { class: "badges" });
  const claims = el("div", { class: "claims" });
  const header = outputBlock("Header");
  const payload = outputBlock("Payload");
  const signature = el("div", { class: "sig mono" });

  const signatureBlock = el("section", { class: "block" }, [
    el("div", { class: "block-head" }, [
      el("h2", { class: "block-title", text: "Signature" }),
      copyButton(() => signature.textContent),
    ]),
    signature,
    el("p", { class: "hint", text: "Not verified. v1 decodes only." }),
  ]);

  root.append(
    field("JWT", input, SAMPLE_HINT),
    el("div", { class: "toolbar" }, [
      copyButton(() => input.value, "Copy token"),
      el("button", {
        class: "btn ghost small",
        type: "button",
        text: "Clear",
        onClick: () => {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        },
      }),
    ]),
    status,
    badges,
    claims,
    header.wrap,
    payload.wrap,
    signatureBlock,
  );

  function render() {
    badges.textContent = "";
    claims.textContent = "";
    header.body.textContent = "";
    payload.body.textContent = "";
    signature.textContent = "";

    const raw = input.value.trim();
    if (!raw) {
      setStatus(status, "Waiting for a token.");
      return;
    }

    let decoded;
    try {
      decoded = decodeJwt(raw);
    } catch (err) {
      setStatus(status, err.message, "err");
      return;
    }

    const verdict = tokenValidity(decoded.payload);
    setStatus(status, verdict.text, verdict.tone);

    for (const [key, value] of Object.entries({
      alg: decoded.header.alg,
      typ: decoded.header.typ,
      kid: decoded.header.kid,
    })) {
      if (value === undefined || value === null) continue;
      badges.append(el("span", { class: "badge", text: `${key}: ${String(value)}` }));
    }

    header.body.textContent = JSON.stringify(decoded.header, null, 2);
    payload.body.textContent = JSON.stringify(decoded.payload, null, 2);

    signature.textContent = decoded.signature || "(none — unsigned token)";
    if (decoded.signatureBytes) {
      signature.append(el("span", { class: "muted", text: `  ${decoded.signatureBytes} bytes` }));
    }

    renderClaims(claims, decoded.payload);
  }

  input.addEventListener("input", render);
  persist("jwt", { token: input }, render);
  render();
}

function renderClaims(container, payload) {
  const rows = [];
  for (const [claim, label] of Object.entries(DATE_CLAIMS)) {
    if (!(claim in payload)) continue;

    const parsed = numericDateToMs(payload[claim]);
    if (!parsed || !isValidInstant(parsed.ms)) {
      rows.push({
        claim,
        label,
        value: String(payload[claim]),
        date: "\u2014",
        state: { tone: "err", text: "not a usable NumericDate" },
        tone: "err",
      });
      continue;
    }

    const date = new Date(parsed.ms);
    const state = claimStatus(claim, parsed.ms);
    rows.push({
      claim,
      label,
      value: `${payload[claim]}${parsed.unit === "ms" ? " (read as ms)" : ""}`,
      date: `${formatDateInZone(date, "")}`,
      iso: isoInZone(date, ""),
      state,
      tone: state.tone,
    });
  }

  if (rows.length === 0) {
    container.append(el("p", { class: "hint", text: "No exp / iat / nbf claims in this token." }));
    return;
  }

  const table = el("table", { class: "table" }, [
    el("thead", {}, el("tr", {}, [
      el("th", { text: "Claim" }),
      el("th", { text: "Raw" }),
      el("th", { text: "Local time" }),
    ])),
  ]);

  const body = el("tbody");
  for (const row of rows) {
    body.append(
      el("tr", {}, [
        el("td", {}, [
          el("code", { text: row.claim }),
          el("span", { class: "muted block", text: row.label }),
        ]),
        el("td", { class: "mono nowrap", text: row.value }),
        el("td", {}, [
          el("span", { text: row.date, title: row.iso ?? "" }),
          el("span", { class: `tag ${row.tone} block`, text: row.state.text }),
        ]),
      ]),
    );
  }
  table.append(body);
  container.append(table);
}
