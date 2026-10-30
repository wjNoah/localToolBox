// Date, duration and time zone formatting. Pure functions: no DOM, no chrome.* APIs,
// so these can be unit tested on their own.

export const TIME_ZONES = [
  { id: "", label: "Local time" },
  { id: "UTC", label: "UTC" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "America/New_York", label: "New York" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "Asia/Kolkata", label: "Kolkata" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
];

// The empty id means "whatever this machine is set to"; Intl uses the local zone
// when timeZone is undefined.
export function zoneArg(id) {
  return id || undefined;
}

export function zoneLabel(id) {
  const found = TIME_ZONES.find((zone) => zone.id === id);
  return found ? found.label : id;
}

const UNITS = [
  ["d", 86400000],
  ["h", 3600000],
  ["min", 60000],
  ["s", 1000],
];

/** Human duration from a millisecond span, using at most the two largest units. */
export function formatDuration(ms) {
  const total = Math.abs(Math.round(ms));
  if (total < 1000) return `${total} ms`;

  const parts = [];
  let rest = total;
  for (const [label, size] of UNITS) {
    const value = Math.floor(rest / size);
    rest -= value * size;
    if (value > 0) parts.push(`${value} ${label}`);
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}

/** "3 min ago" / "in 3 min" for an absolute instant. */
export function formatRelative(ms, nowMs = Date.now()) {
  const delta = ms - nowMs;
  if (Math.abs(delta) < 1000) return "just now";
  return delta < 0 ? `${formatDuration(delta)} ago` : `in ${formatDuration(delta)}`;
}

function zoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneArg(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Offset of `timeZone` at this instant, in milliseconds east of UTC. */
export function zoneOffsetMs(date, timeZone) {
  const parts = zoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // The parts carry no milliseconds, so compare against the whole-second instant.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function formatOffset(offsetMs) {
  const sign = offsetMs < 0 ? "-" : "+";
  const minutes = Math.round(Math.abs(offsetMs) / 60000);
  return `${sign}${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`;
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

/** ISO 8601 with the offset of the given zone, e.g. 2026-10-30T14:03:05.000+01:00 */
export function isoInZone(date, timeZone) {
  if (timeZone === "UTC") return date.toISOString();

  const parts = zoneParts(date, timeZone);
  const millis = pad(date.getUTCMilliseconds(), 3);
  const offset = formatOffset(zoneOffsetMs(date, timeZone));
  return (
    `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}` +
    `T${pad(parts.hour, 2)}:${pad(parts.minute, 2)}:${pad(parts.second, 2)}.${millis}${offset}`
  );
}

/** Readable form, e.g. "Fri, 30 Oct 2026, 14:03:05 GMT+1" */
export function formatDateInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zoneArg(timeZone),
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

/**
 * Read "2026-10-30 14:03:05" as wall-clock time in `timeZone`.
 * Two passes: the offset itself depends on the instant we are trying to find,
 * so resolve it once with a rough guess and then with the corrected instant.
 */
export function msFromWallClock(year, month, day, hour, minute, second, millis, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const firstPass = zoneOffsetMs(new Date(guess), timeZone);
  const secondPass = zoneOffsetMs(new Date(guess - firstPass), timeZone);
  return guess - secondPass;
}

/** Largest instant a JavaScript Date can hold. */
export const MAX_DATE_MS = 8.64e15;

export function isValidInstant(ms) {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS;
}
