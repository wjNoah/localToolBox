// JWT decoder and signature verifier.

import { bytesFromBase64, textFromBase64, utf8FromText } from "../codec.js";
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

// --- signature verification --------------------------------------------------
//
// Runs entirely through SubtleCrypto: no network call, nothing leaves the
// popup. A secret or key the person pastes here is held in a plain JS
// variable and is never written to chrome.storage, even with "Remember
// input" on — see the comment in init() below.

const HMAC_ALGS = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" };
const RSA_ALGS = { RS256: "SHA-256", RS384: "SHA-384", RS512: "SHA-512" };
const RSA_PSS_ALGS = { PS256: "SHA-256", PS384: "SHA-384", PS512: "SHA-512" };
const EC_ALGS = {
  ES256: { hash: "SHA-256", namedCurve: "P-256" },
  ES384: { hash: "SHA-384", namedCurve: "P-384" },
  ES512: { hash: "SHA-512", namedCurve: "P-521" },
};
const PSS_SALT_LENGTH = { "SHA-256": 32, "SHA-384": 48, "SHA-512": 64 };

/** @returns {"hmac"|"rsa"|"rsa-pss"|"ec"|"none"|"unsupported"} */
export function algFamily(alg) {
  if (!alg || alg === "none") return "none";
  if (alg in HMAC_ALGS) return "hmac";
  if (alg in RSA_ALGS) return "rsa";
  if (alg in RSA_PSS_ALGS) return "rsa-pss";
  if (alg in EC_ALGS) return "ec";
  return "unsupported";
}

/** Strip PEM armor and whitespace, then hand the base64 body to the shared decoder. */
function bytesFromPem(pem) {
  const body = String(pem)
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .trim();
  if (!body) throw new Error("Paste a PEM-encoded public key (starts with -----BEGIN PUBLIC KEY-----).");
  return bytesFromBase64(body);
}

/**
 * Verify a JWT's signature against a secret (HMAC) or public key (RSA/EC).
 * Never throws on a bad secret/key/signature — that is a normal "invalid"
 * result. Throws only when the token itself can't be parsed.
 * @returns {{alg: string, family: string, checked: boolean, valid: boolean, reason: string}}
 */
export async function verifyJwtSignature(token, { secret = "", publicKeyPem = "" } = {}) {
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 3) throw new Error("Not a three-part JWT.");
  const [headerPart, payloadPart, sigPart] = parts;

  let header;
  try {
    header = JSON.parse(textFromBase64(headerPart));
  } catch {
    throw new Error("Header segment is not valid JSON.");
  }

  const alg = typeof header.alg === "string" ? header.alg : "";
  const family = algFamily(alg);

  if (family === "none") {
    return { alg: alg || "(missing)", family, checked: true, valid: false, reason: '"none" is unsigned — never trust it.' };
  }
  if (family === "unsupported") {
    return { alg, family, checked: false, valid: false, reason: `${alg} isn't supported for verification here.` };
  }

  let signatureBytes;
  try {
    signatureBytes = bytesFromBase64(sigPart);
  } catch {
    throw new Error("Signature segment is not valid base64url.");
  }
  const signingInput = utf8FromText(`${headerPart}.${payloadPart}`);

  try {
    if (family === "hmac") {
      if (!secret) return { alg, family, checked: false, valid: false, reason: "Paste the signing secret to verify." };
      const key = await crypto.subtle.importKey(
        "raw",
        utf8FromText(secret),
        { name: "HMAC", hash: HMAC_ALGS[alg] },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, signingInput);
      return { alg, family, checked: true, valid, reason: valid ? "Signature matches." : "Signature does not match this secret." };
    }

    if (!publicKeyPem.trim()) {
      return { alg, family, checked: false, valid: false, reason: "Paste the public key (SPKI, PEM) to verify." };
    }

    let keyBytes;
    try {
      keyBytes = bytesFromPem(publicKeyPem);
    } catch (err) {
      return { alg, family, checked: false, valid: false, reason: err.message };
    }

    if (family === "rsa" || family === "rsa-pss") {
      const hash = (family === "rsa" ? RSA_ALGS : RSA_PSS_ALGS)[alg];
      const key = await crypto.subtle.importKey(
        "spki",
        keyBytes,
        family === "rsa" ? { name: "RSASSA-PKCS1-v1_5", hash } : { name: "RSA-PSS", hash },
        false,
        ["verify"],
      );
      const algoParam = family === "rsa" ? "RSASSA-PKCS1-v1_5" : { name: "RSA-PSS", saltLength: PSS_SALT_LENGTH[hash] };
      const valid = await crypto.subtle.verify(algoParam, key, signatureBytes, signingInput);
      return { alg, family, checked: true, valid, reason: valid ? "Signature matches." : "Signature does not match this key." };
    }

    // family === "ec" — JWS signatures are raw r||s, which is also what
    // SubtleCrypto's ECDSA verify expects, so no re-encoding is needed.
    const { hash, namedCurve } = EC_ALGS[alg];
    const key = await crypto.subtle.importKey("spki", keyBytes, { name: "ECDSA", namedCurve }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash }, key, signatureBytes, signingInput);
    return { alg, family, checked: true, valid, reason: valid ? "Signature matches." : "Signature does not match this key." };
  } catch {
    return { alg, family, checked: false, valid: false, reason: "Could not read that key. Check it's an SPKI public key in PEM format." };
  }
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

  // Verification inputs. Deliberately left out of persist() below: a signing
  // secret or private deployment's key is more sensitive than the token
  // itself, so it stays in memory only and is never written to
  // chrome.storage, even with "Remember input" on.
  const secretInput = el("input", {
    type: "text",
    class: "mono",
    spellcheck: false,
    autocapitalize: "off",
    placeholder: "Signing secret",
  });
  const keyInput = el("textarea", {
    rows: 3,
    class: "mono",
    spellcheck: false,
    autocapitalize: "off",
    placeholder: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  });
  const verifyStatus = statusLine();
  const secretField = field("Signing secret", secretInput, "Not saved, even with Remember input on.");
  const keyField = field("Public key (SPKI, PEM)", keyInput, "Not saved, even with Remember input on.");
  secretField.classList.add("hidden");
  keyField.classList.add("hidden");

  const signatureBlock = el("section", { class: "block" }, [
    el("div", { class: "block-head" }, [
      el("h2", { class: "block-title", text: "Signature" }),
      copyButton(() => signature.textContent),
    ]),
    signature,
    secretField,
    keyField,
    verifyStatus,
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

  // Bumped on every render so a verify Promise that resolves after the token
  // (or secret/key) has already changed again is discarded instead of
  // overwriting a newer result.
  let verifyGeneration = 0;
  let currentAlg;

  function render() {
    badges.textContent = "";
    claims.textContent = "";
    header.body.textContent = "";
    payload.body.textContent = "";
    signature.textContent = "";
    secretField.classList.add("hidden");
    keyField.classList.add("hidden");
    setStatus(verifyStatus, "");

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
    currentAlg = decoded.header.alg;
    runVerify(raw);
  }

  function runVerify(raw) {
    const family = algFamily(currentAlg);
    secretField.classList.toggle("hidden", family !== "hmac");
    keyField.classList.toggle("hidden", !["rsa", "rsa-pss", "ec"].includes(family));

    verifyGeneration += 1;
    const generation = verifyGeneration;
    verifyJwtSignature(raw, { secret: secretInput.value, publicKeyPem: keyInput.value })
      .then((result) => {
        if (generation !== verifyGeneration) return; // stale: input changed since this call started
        const tone = !result.checked ? "muted" : result.valid ? "ok" : "err";
        setStatus(verifyStatus, `${result.alg}: ${result.reason}`, tone);
      })
      .catch((err) => {
        if (generation !== verifyGeneration) return;
        setStatus(verifyStatus, err.message, "err");
      });
  }

  input.addEventListener("input", render);
  secretInput.addEventListener("input", () => runVerify(input.value.trim()));
  keyInput.addEventListener("input", () => runVerify(input.value.trim()));
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
