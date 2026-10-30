import { init as initJwt } from "./tools/jwt.js";
import { init as initBase64 } from "./tools/base64.js";
import { init as initTimestamp } from "./tools/timestamp.js";
import { init as initJson } from "./tools/json.js";
import { init as initRegex } from "./tools/regex.js";
import { announce, clearStoredInputs, rememberEnabled, setRemember, settingsReady } from "./ui.js";

const tools = {
  jwt: initJwt,
  base64: initBase64,
  timestamp: initTimestamp,
  json: initJson,
  regex: initRegex,
};

const tabs = [...document.querySelectorAll('nav [role="tab"]')];
const panels = document.querySelectorAll(".panel");
const initialized = new Set();

function activate(name, { focusTab = false } = {}) {
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(selected));
    // Roving tabindex: only the selected tab is in the tab order.
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) tab.focus();
  }
  for (const panel of panels) {
    panel.classList.toggle("active", panel.id === `tab-${name}`);
  }

  // Initialize each tool lazily, the first time its tab is opened.
  if (!initialized.has(name)) {
    initialized.add(name);
    tools[name](document.getElementById(`tab-${name}`));
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => activate(tab.dataset.tab));
}

document.querySelector("nav").addEventListener("keydown", (event) => {
  const current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  const moves = {
    ArrowLeft: current - 1,
    ArrowRight: current + 1,
    Home: 0,
    End: tabs.length - 1,
  };
  if (!(event.key in moves)) return;

  event.preventDefault();
  const next = (moves[event.key] + tabs.length) % tabs.length;
  activate(tabs[next].dataset.tab, { focusTab: true });
});

const remember = document.getElementById("remember");
const clearButton = document.getElementById("clear-stored");

settingsReady().then(() => {
  remember.checked = rememberEnabled();
});

remember.addEventListener("change", async () => {
  await setRemember(remember.checked);
  announce(
    remember.checked
      ? "Input will be remembered on this device."
      : "Input is no longer remembered; saved input cleared.",
  );
});

clearButton.addEventListener("click", async () => {
  await clearStoredInputs();
  // Same confirmation treatment as the copy buttons: a word plus a checkmark,
  // so the feedback never rests on colour alone.
  clearButton.textContent = "Cleared";
  clearButton.classList.add("flashed");
  announce("Saved input cleared.");
  setTimeout(() => {
    clearButton.textContent = "Clear saved input";
    clearButton.classList.remove("flashed");
  }, 1000);
});

activate("jwt");
