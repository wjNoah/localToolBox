// Unix timestamp <-> date converter. One input field takes either form and the
// output shows every representation, because log lines carry all of them.

import {
  TIME_ZONES,
  formatDateInZone,
  formatOffset,
  formatRelative,
  isValidInstant,
  isoInZone,
  msFromWallClock,
  zoneLabel,
  zoneOffsetMs,
} from "../format.js";
import { copyButton, el, field, persist, setStatus, statusLine } from "../ui.js";

// --- pure logic -------------------------------------------------------------

const UNIT_TO_MS = { s: 1000, ms: 1, us: 0.001, ns: 0.000001 };

const UNIT_LABEL = {
  s: "seconds",
  ms: "milliseconds",
  us: "microseconds",
  ns: "nanoseconds",
};

/**
 * Pick the unit a bare number is most likely in.
 * 1e11 seconds is the year 5138, so anything larger is not seconds; the same
 * reasoning chains up through micro- and nanoseconds.
 * @returns {"s"|"ms"|"us"|"ns"}
 */
export function detectUnit(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 1e11) return "s";
  if (magnitude < 1e14) return "ms";
  if (magnitude < 1e17) return "us";
  return "ns";
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const WALL_CLOCK_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

/**
 * Parse a numeric unix timestamp.
 * @returns {{ms: number, unit: string, value: number}}
 */
export function parseTimestamp(text) {
  // Tolerate 1_730_300_000 and 1,730,300,000 from logs and code.
  const raw = String(text).trim().replace(/[_,\s]/g, "");
  if (!NUMBER_RE.test(raw)) throw new Error("Not a plain number.");

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("Number is too large to read.");

  // A fractional value is seconds-with-decimals, the common log format.
  const unit = raw.includes(".") ? "s" : detectUnit(value);
  const ms = value * UNIT_TO_MS[unit];
  if (!isValidInstant(ms)) throw new Error("Outside the range a date can represent.");

  return { ms, unit, value };
}

/**
 * Parse a date string. Text carrying an explicit offset or Z is absolute;
 * bare wall-clock text is read in `timeZone`.
 * @returns {{ms: number, zoned: boolean}}
 */
export function parseDateText(text, timeZone = "") {
  const raw = String(text).trim();
  if (!raw) throw new Error("Empty input.");

  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (!hasExplicitZone) {
    const match = WALL_CLOCK_RE.exec(raw);
    if (match) {
      const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "0"] = match;
      const ms = msFromWallClock(
        Number(y),
        Number(mo),
        Number(d),
        Number(h),
        Number(mi),
        Number(s),
        Number(frac.padEnd(3, "0")),
        timeZone,
      );
      if (!isValidInstant(ms)) throw new Error("Outside the range a date can represent.");
      return { ms, zoned: true };
    }
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw new Error("Not a timestamp or a date this browser can parse.");
  return { ms: parsed, zoned: false };
}

/**
 * Accept either form.
 * @returns {{ms: number, kind: "timestamp"|"date", detail: string}}
 */
export function parseAny(text, timeZone = "") {
  const raw = String(text).trim();
  if (!raw) throw new Error("Waiting for input.");

  if (NUMBER_RE.test(raw.replace(/[_,\s]/g, ""))) {
    const { ms, unit } = parseTimestamp(raw);
    return { ms, kind: "timestamp", detail: `read as unix ${UNIT_LABEL[unit]}` };
  }

  const { ms, zoned } = parseDateText(raw, timeZone);
  return {
    ms,
    kind: "date",
    detail: zoned ? `read as wall-clock time in ${zoneLabel(timeZone)}` : "read with its own UTC offset",
  };
}

/** Every representation worth copying, in display order. */
export function representations(ms, timeZone) {
  const date = new Date(ms);
  const seconds = ms / 1000;
  return [
    { label: "ISO 8601", value: isoInZone(date, timeZone) },
    { label: "ISO 8601 (UTC)", value: date.toISOString() },
    { label: `Readable (${zoneLabel(timeZone)})`, value: formatDateInZone(date, timeZone) },
    { label: "Unix seconds", value: String(Number.isInteger(seconds) ? seconds : seconds.toFixed(3)) },
    { label: "Unix milliseconds", value: String(ms) },
    { label: "UTC offset", value: formatOffset(zoneOffsetMs(date, timeZone)) },
    { label: "Relative", value: formatRelative(ms) },
  ];
}

// --- UI ---------------------------------------------------------------------

export function init(root) {
  root.textContent = "";

  const zone = el("select", {}, TIME_ZONES.map((tz) =>
    el("option", { value: tz.id, text: tz.label }),
  ));

  const input = el("input", {
    type: "text",
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder: "1730300000 or 2026-10-30 14:03:05",
  });

  const status = statusLine();
  const rows = el("div", { class: "kv" });

  const nowButton = el("button", {
    class: "btn",
    type: "button",
    text: "Now",
    onClick: () => {
      input.value = String(Math.floor(Date.now() / 1000));
      render();
      input.focus();
    },
  });

  root.append(
    el("div", { class: "row" }, [field("Time zone", zone), field("Timestamp or date", input)]),
    el("div", { class: "toolbar" }, [
      nowButton,
      el("button", {
        class: "btn ghost small",
        type: "button",
        text: "Now (ms)",
        onClick: () => {
          input.value = String(Date.now());
          render();
        },
      }),
      el("button", {
        class: "btn ghost small",
        type: "button",
        text: "Clear",
        onClick: () => {
          input.value = "";
          render();
          input.focus();
        },
      }),
    ]),
    el("p", {
      class: "hint",
      text: "Seconds, milliseconds, microseconds and nanoseconds are told apart by magnitude.",
    }),
    status,
    rows,
  );

  function render() {
    rows.textContent = "";

    if (!input.value.trim()) {
      setStatus(status, "Waiting for a timestamp or a date.");
      return;
    }

    let parsed;
    try {
      parsed = parseAny(input.value, zone.value);
    } catch (err) {
      setStatus(status, err.message, "err");
      return;
    }

    setStatus(status, `Input ${parsed.detail}.`, "ok");

    for (const row of representations(parsed.ms, zone.value)) {
      rows.append(
        el("div", { class: "kv-row" }, [
          el("span", { class: "kv-key", text: row.label }),
          el("span", { class: "kv-value mono", text: row.value }),
          copyButton(() => row.value),
        ]),
      );
    }
  }

  input.addEventListener("input", render);
  zone.addEventListener("change", render);

  persist("timestamp", { value: input, zone }, render);
  render();
}
