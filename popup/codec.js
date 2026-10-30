// Base64 / UTF-8 primitives shared by the JWT and Base64 tools. Pure functions.
//
// Error messages are written as sentence fragments ("is not valid Base64") so the
// caller can prefix the subject it knows about: "Header segment is not valid Base64."

const BASE64_CHARS = /^[A-Za-z0-9+/]*$/;
const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Decode Base64 to bytes, tolerating URL-safe alphabet, whitespace and missing padding.
 * @returns {Uint8Array}
 */
export function bytesFromBase64(input) {
  const clean = String(input)
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");

  if (!BASE64_CHARS.test(clean)) throw new Error("is not valid Base64");
  // A length of 4n+1 cannot be produced by any byte string.
  if (clean.length % 4 === 1) throw new Error("has a truncated Base64 length");

  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("is not valid Base64");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64FromBytes(bytes, { urlSafe = false, padding = true } = {}) {
  let binary = "";
  // Chunked to stay well under the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  let out = btoa(binary);
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  if (!padding) out = out.replace(/=+$/, "");
  return out;
}

export function utf8FromText(text) {
  return encoder.encode(text);
}

export function textFromUtf8(bytes) {
  try {
    return strictDecoder.decode(bytes);
  } catch {
    throw new Error("is not valid UTF-8 text");
  }
}

export function textFromBase64(input) {
  return textFromUtf8(bytesFromBase64(input));
}

export function base64FromText(text, options) {
  return base64FromBytes(utf8FromText(text), options);
}

/** Cheap shape check used for direction auto-detection. */
export function looksLikeBase64(text) {
  const clean = String(text).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  return clean.length >= 4 && clean.length % 4 !== 1 && BASE64_CHARS.test(clean);
}

export function formatBytes(count) {
  if (count < 1024) return `${count} byte${count === 1 ? "" : "s"}`;
  return `${(count / 1024).toFixed(1)} KiB`;
}
