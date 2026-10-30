// Small DOM helpers shared by the tools.
//
// Nothing here ever assigns innerHTML. User input reaches the page only through
// textContent or createTextNode, so a token that happens to contain markup is
// rendered as the characters the user pasted.

/**
 * @param {string} tag
 * @param {Object} [props] `class`, `text` and `dataset` are special-cased; keys
 *   starting with "on" become listeners; booleans are set as properties so
 *   `checked`/`disabled` behave; everything else becomes an attribute.
 * @param {(Node|string)[]|Node|string} [children]
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (typeof value === "boolean") node[key] = value;
    else node.setAttribute(key, value);
  }

  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

let uid = 0;

/** A labelled control. The label is always real and always linked to the input. */
export function field(labelText, control, hint) {
  if (!control.id) control.id = `ldt-${(uid += 1)}`;
  return el("div", { class: "field" }, [
    el("label", { for: control.id, text: labelText }),
    control,
    hint ? el("p", { class: "hint", text: hint }) : null,
  ]);
}

export function button(label, onClick, { className = "btn", type = "button", title } = {}) {
  return el("button", { class: className, type, title, text: label, onClick });
}

/** Announce a transient message to screen readers via the shared live region. */
export function announce(message) {
  const region = document.getElementById("live");
  if (region) region.textContent = message;
}

/** Copy button that reads its text lazily, so it always copies the current output. */
export function copyButton(getText, label = "Copy") {
  const btn = button(label, async () => {
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flash(btn, "Copied", label);
    } catch {
      flash(btn, "Copy failed", label);
    }
  }, { className: "btn ghost small" });
  return btn;
}

function flash(btn, message, original) {
  btn.textContent = message;
  btn.classList.add("flashed");
  announce(message);
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("flashed");
  }, 1000);
}

/**
 * Titled output area with a copy button.
 * @returns {{wrap: HTMLElement, body: HTMLElement, head: HTMLElement}}
 */
export function outputBlock(title, { tag = "pre", copy = true } = {}) {
  const body = el(tag, { class: tag === "pre" ? "out mono" : "out" });
  const head = el("div", { class: "block-head" }, [
    el("h2", { class: "block-title", text: title }),
    copy ? copyButton(() => body.textContent) : null,
  ]);
  return { wrap: el("section", { class: "block" }, [head, body]), body, head };
}

export function statusLine() {
  return el("p", { class: "status", role: "status" });
}

export function setStatus(node, message, tone = "muted") {
  node.textContent = message;
  node.className = `status ${tone}`;
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// --- Optional "remember my input" storage -----------------------------------
//
// Off by default: people paste production tokens into these fields, so nothing
// is written to disk until the toggle is switched on.

const SETTINGS_KEY = "settings";
const INPUTS_KEY = "inputs";
// Guarded so the modules stay importable outside the extension (e.g. in tests).
const local = globalThis.chrome?.storage?.local ?? null;

let remember = false;

const ready = (async () => {
  if (!local) return;
  try {
    const stored = await local.get(SETTINGS_KEY);
    remember = Boolean(stored[SETTINGS_KEY]?.remember);
  } catch {
    remember = false;
  }
})();

export function settingsReady() {
  return ready;
}

export function rememberEnabled() {
  return remember;
}

export async function setRemember(enabled) {
  remember = enabled;
  if (!local) return;
  await local.set({ [SETTINGS_KEY]: { remember: enabled } });
  if (!enabled) await clearStoredInputs();
}

export async function clearStoredInputs() {
  if (!local) return;
  await local.remove(INPUTS_KEY);
}

async function loadInputs(tool) {
  await ready;
  if (!local || !remember) return {};
  try {
    const stored = await local.get(INPUTS_KEY);
    return stored[INPUTS_KEY]?.[tool] ?? {};
  } catch {
    return {};
  }
}

async function saveInputs(tool, values) {
  await ready;
  if (!local || !remember) return;
  try {
    const stored = await local.get(INPUTS_KEY);
    const all = stored[INPUTS_KEY] ?? {};
    all[tool] = values;
    await local.set({ [INPUTS_KEY]: all });
  } catch {
    // Over quota or storage disabled: remembering input is a convenience, not
    // something worth interrupting the user for.
  }
}

/**
 * Wire a tool's controls to the optional input store.
 * @param {string} tool Namespace for this tool's values.
 * @param {Record<string, HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>} controls
 * @param {() => void} [onRestore] Called once if anything was restored.
 */
export function persist(tool, controls, onRestore) {
  loadInputs(tool).then((saved) => {
    let restored = false;
    for (const [name, node] of Object.entries(controls)) {
      const value = saved[name];
      if (typeof value !== "string") continue;
      if (node.type === "checkbox") node.checked = value === "true";
      else node.value = value;
      restored = true;
    }
    if (restored && onRestore) onRestore();
  });

  const save = debounce(() => {
    const values = {};
    for (const [name, node] of Object.entries(controls)) {
      values[name] = node.type === "checkbox" ? String(node.checked) : node.value;
    }
    saveInputs(tool, values);
  }, 400);

  for (const node of Object.values(controls)) {
    node.addEventListener("input", save);
    node.addEventListener("change", save);
  }
}
