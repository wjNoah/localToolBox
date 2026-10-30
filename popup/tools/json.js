// JSON formatter, validator and diff.
//
// The diff is written here rather than pulled in as a dependency: it is a
// recursive walk over two parsed values, which is less code than a package.

import { button, copyButton, el, field, outputBlock, persist, setStatus, statusLine } from "../ui.js";

// --- pure logic -------------------------------------------------------------

/**
 * @returns {{ok: true, value: unknown}|{ok: false, message: string, line: number|null, column: number|null}}
 */
export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, ...describeParseError(err, text) };
  }
}

/**
 * V8 reports a character offset ("at position 42"); turn that into line/column
 * ourselves so the message is the same across Chrome versions.
 */
function describeParseError(err, text) {
  const message = String(err.message);
  const atPosition = /position (\d+)/.exec(message);

  if (atPosition) {
    const position = Number(atPosition[1]);
    const before = text.slice(0, position);
    const lines = before.split("\n");
    return {
      message: cleanMessage(message),
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
      position,
    };
  }

  const atLine = /line (\d+) column (\d+)/.exec(message);
  if (atLine) {
    return { message: cleanMessage(message), line: Number(atLine[1]), column: Number(atLine[2]) };
  }
  return { message: cleanMessage(message), line: null, column: null };
}

function cleanMessage(message) {
  return message
    .replace(/^JSON\.parse: /, "")
    .replace(/ in JSON at position \d+.*$/, "")
    .replace(/ \(line \d+ column \d+\)$/, "")
    .trim();
}

export function formatJson(text, indent = 2) {
  const result = parseJson(text);
  if (!result.ok) throw errorFrom(result);
  return JSON.stringify(result.value, null, indent);
}

export function minifyJson(text) {
  const result = parseJson(text);
  if (!result.ok) throw errorFrom(result);
  return JSON.stringify(result.value);
}

function errorFrom(result) {
  const where = result.line ? ` (line ${result.line}, column ${result.column})` : "";
  return new Error(`${result.message}${where}`);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** JSONPath-ish rendering of a walk path: $.user.roles[0] or $["odd key"] */
export function formatPath(segments) {
  let out = "$";
  for (const segment of segments) {
    if (typeof segment === "number") out += `[${segment}]`;
    else if (IDENTIFIER.test(segment)) out += `.${segment}`;
    else out += `[${JSON.stringify(segment)}]`;
  }
  return out;
}

export function describeValue(value) {
  if (value === undefined) return "(absent)";
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

/**
 * Compare two parsed JSON values.
 * Arrays are compared by index, which is the honest reading of a JSON document
 * (there is no key to align elements on); the UI says so.
 * @returns {{path: string, type: "added"|"removed"|"changed", left: unknown, right: unknown}[]}
 */
export function diffValues(left, right, path = [], out = []) {
  if (deepEqual(left, right)) return out;

  if (isObject(left) && isObject(right)) {
    const keys = [...Object.keys(left), ...Object.keys(right).filter((key) => !(key in left))];
    for (const key of keys) {
      const inLeft = key in left;
      const inRight = key in right;
      if (inLeft && !inRight) out.push(entry([...path, key], "removed", left[key], undefined));
      else if (!inLeft && inRight) out.push(entry([...path, key], "added", undefined, right[key]));
      else diffValues(left[key], right[key], [...path, key], out);
    }
    return out;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      if (i >= right.length) out.push(entry([...path, i], "removed", left[i], undefined));
      else if (i >= left.length) out.push(entry([...path, i], "added", undefined, right[i]));
      else diffValues(left[i], right[i], [...path, i], out);
    }
    return out;
  }

  out.push(entry(path, "changed", left, right));
  return out;
}

function entry(path, type, left, right) {
  return { path: formatPath(path), type, left, right };
}

export function diffJson(leftText, rightText) {
  const left = parseJson(leftText);
  if (!left.ok) throw new Error(`Document A: ${errorFrom(left).message}`);
  const right = parseJson(rightText);
  if (!right.ok) throw new Error(`Document B: ${errorFrom(right).message}`);
  return diffValues(left.value, right.value);
}

/** Plain-text diff, for the copy button. */
export function diffToText(entries) {
  const sign = { added: "+", removed: "-", changed: "~" };
  return entries
    .map((item) => {
      if (item.type === "changed") {
        return `~ ${item.path}: ${describeValue(item.left)} -> ${describeValue(item.right)}`;
      }
      const value = item.type === "added" ? item.right : item.left;
      return `${sign[item.type]} ${item.path}: ${describeValue(value)}`;
    })
    .join("\n");
}

// --- UI ---------------------------------------------------------------------

const INDENTS = { 2: 2, 4: 4, tab: "\t" };

export function init(root) {
  root.textContent = "";

  const docA = textarea("{ \"service\": \"orders\", \"replicas\": 3 }");
  const docB = textarea("{ \"service\": \"orders\", \"replicas\": 5 }");

  const indent = el("select", { id: "ldt-json-indent" }, [
    el("option", { value: "2", text: "2 spaces" }),
    el("option", { value: "4", text: "4 spaces" }),
    el("option", { value: "tab", text: "Tab" }),
  ]);

  const statusA = statusLine();
  const statusB = statusLine();
  const result = statusLine();
  const output = outputBlock("Result");
  const diffList = el("div", { class: "diff hidden" });

  const toolbar = el("div", { class: "toolbar wrap" }, [
    button("Pretty-print", () => runSingle(formatJson)),
    button("Minify", () => runSingle((text) => minifyJson(text))),
    button("Validate", validate),
    button("Diff A ↔ B", runDiff),
    copyButton(() => output.body.textContent || diffText),
    el("div", { class: "inline-field" }, [el("label", { for: indent.id, text: "Indent" }), indent]),
  ]);

  let diffText = "";

  root.append(
    field("Document A", docA),
    statusA,
    field("Document B (for diff)", docB),
    statusB,
    toolbar,
    result,
    output.wrap,
    diffList,
  );

  function showOutput(text) {
    diffList.classList.add("hidden");
    diffList.textContent = "";
    diffText = "";
    output.wrap.classList.remove("hidden");
    output.body.textContent = text;
    reveal(output.wrap);
  }

  function runSingle(operation) {
    try {
      showOutput(operation(docA.value, INDENTS[indent.value]));
      setStatus(result, "Document A converted.", "ok");
    } catch (err) {
      showOutput("");
      setStatus(result, err.message, "err");
    }
  }

  function validate() {
    const checks = [
      ["A", docA.value],
      ["B", docB.value],
    ]
      .filter(([, text]) => text.trim())
      .map(([name, text]) => {
        const parsed = parseJson(text);
        return parsed.ok
          ? `${name}: valid ${kindOf(parsed.value)}`
          : `${name}: ${parsed.message}${parsed.line ? ` (line ${parsed.line}, column ${parsed.column})` : ""}`;
      });

    if (checks.length === 0) {
      setStatus(result, "Nothing to validate.", "muted");
      return;
    }
    const allValid = checks.every((line) => line.includes(": valid "));
    setStatus(result, checks.join(" · "), allValid ? "ok" : "err");
  }

  function runDiff() {
    let entries;
    try {
      entries = diffJson(docA.value, docB.value);
    } catch (err) {
      showOutput("");
      setStatus(result, err.message, "err");
      return;
    }

    output.wrap.classList.add("hidden");
    output.body.textContent = "";
    diffText = diffToText(entries);
    renderDiff(diffList, entries);
    diffList.classList.remove("hidden");
    reveal(diffList);

    setStatus(
      result,
      entries.length === 0
        ? "No differences."
        : `${entries.length} difference${entries.length === 1 ? "" : "s"}.`,
      entries.length === 0 ? "ok" : "warn",
    );
  }

  const liveCheck = (node, status, name) => () => {
    if (!node.value.trim()) {
      setStatus(status, "");
      return;
    }
    const parsed = parseJson(node.value);
    if (parsed.ok) {
      setStatus(status, `${name}: valid ${kindOf(parsed.value)}`, "ok");
    } else {
      const where = parsed.line ? ` — line ${parsed.line}, column ${parsed.column}` : "";
      setStatus(status, `${name}: ${parsed.message}${where}`, "err");
    }
  };

  const checkA = liveCheck(docA, statusA, "A");
  const checkB = liveCheck(docB, statusB, "B");
  docA.addEventListener("input", checkA);
  docB.addEventListener("input", checkB);

  persist("json", { a: docA, b: docB, indent }, () => {
    checkA();
    checkB();
  });
  checkA();
  checkB();
}

/** The popup is short, so scroll a fresh result into view rather than leaving it below the fold. */
function reveal(node) {
  node.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function textarea(placeholder) {
  return el("textarea", {
    rows: 4,
    spellcheck: false,
    autocapitalize: "off",
    class: "mono",
    placeholder,
  });
}

function kindOf(value) {
  if (Array.isArray(value)) return `array of ${value.length}`;
  if (value === null) return "null";
  if (typeof value === "object") return `object, ${Object.keys(value).length} key(s)`;
  return typeof value;
}

const SIGNS = { added: "+", removed: "−", changed: "~" };

function renderDiff(container, entries) {
  container.textContent = "";

  if (entries.length === 0) {
    container.append(el("p", { class: "hint", text: "A and B are equivalent." }));
    return;
  }

  for (const item of entries) {
    const values = el("div", { class: "diff-values mono" });
    if (item.type === "changed") {
      values.append(
        el("del", { text: describeValue(item.left) }),
        el("span", { class: "muted", text: " → " }),
        el("ins", { text: describeValue(item.right) }),
      );
    } else {
      values.append(
        el("span", { text: describeValue(item.type === "added" ? item.right : item.left) }),
      );
    }

    container.append(
      el("div", { class: `diff-row ${item.type}` }, [
        el("span", { class: "diff-sign", text: SIGNS[item.type], "aria-hidden": "true" }),
        el("div", { class: "diff-body" }, [
          el("code", { class: "diff-path", text: item.path }),
          values,
        ]),
        el("span", { class: "sr-only", text: item.type }),
      ]),
    );
  }

  container.append(
    el("p", { class: "hint", text: "Array elements are compared by index." }),
  );
}
