// Regex matching logic, kept free of DOM and imports so the Worker can load it
// on its own.

export const MAX_INPUT = 200000;
export const MAX_MATCHES = 500;

export function buildRegex(pattern, flags) {
  if (!pattern) throw new Error("Enter a pattern.");
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    throw new Error(String(err.message).replace(/^Invalid regular expression:[^:]*: /, ""));
  }
}

/**
 * Names of each numbered capture group, or null where the group is unnamed.
 * Scanned from the pattern text because a RegExp exposes no number-to-name
 * mapping, and matching named groups by their captured value guesses wrong
 * whenever two groups capture the same string.
 * @returns {(string|null)[]} index 0 describes group 1
 */
export function groupNames(pattern) {
  const names = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char !== "(") continue;

    if (pattern[i + 1] !== "?") {
      names.push(null);
      continue;
    }
    // (?<name> captures; (?<= and (?<! are lookbehind, (?: and (?= and (?! never capture.
    const named = /^\(\?<([^=!][^>]*)>/.exec(pattern.slice(i));
    if (named) names.push(named[1]);
  }

  return names;
}

/**
 * Find every occurrence. The `g` flag is added internally so the tester always
 * shows all matches; the UI points out that this differs from what replace()
 * does without `g`.
 *
 * @returns {{matches: {index: number, text: string, groups: string[], named: object|null}[],
 *            truncated: boolean, addedGlobal: boolean, names: (string|null)[]}}
 */
export function findMatches(pattern, flags, text, limit = MAX_MATCHES) {
  const addedGlobal = !flags.includes("g");
  const regex = buildRegex(pattern, addedGlobal ? `${flags}g` : flags);

  const matches = [];
  let truncated = false;

  for (const match of text.matchAll(regex)) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    matches.push({
      index: match.index,
      text: match[0],
      groups: match.slice(1).map((value) => (value === undefined ? null : value)),
      named: match.groups ? { ...match.groups } : null,
    });
  }

  return { matches, truncated, addedGlobal, names: groupNames(pattern) };
}
