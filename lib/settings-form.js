// The language and API key controls shared by the popup and the setup page.

import { LANGUAGES } from "./languages.js";
import { getSettings } from "./player.js";
import { checkApiKey } from "./subdl.js";

const KEY_FIELD = `
  <div class="key-saved" data-role="saved" hidden>
    <span class="key-mask" data-role="mask"></span>
    <span class="pill pill-ok">Connected</span>
    <button class="link" type="button" data-role="edit">Change</button>
  </div>
  <form class="key-edit" data-role="form" hidden>
    <div class="inline-field">
      <input type="password" placeholder="Paste your SubDL API key" aria-label="SubDL API key"
        autocomplete="off" spellcheck="false" required />
      <button type="submit">Save</button>
    </div>
    <p class="field-note" data-role="note"></p>
    <p class="field-note">
      <a href="https://subdl.com/api-doc" target="_blank" rel="noreferrer">Get a free key</a>
      <button class="link" type="button" data-role="cancel" hidden>Cancel</button>
    </p>
  </form>
`;

export function fillLanguages(select, selected) {
  select.replaceChildren(
    ...LANGUAGES.map(({ code, name }) => new Option(name, code, false, code === selected)),
  );
}

export async function mountLanguage(select, onSaved = () => {}) {
  const { language } = await getSettings();
  fillLanguages(select, language);
  select.addEventListener("change", async () => {
    await chrome.storage.local.set({ language: select.value });
    onSaved(select.value);
  });
}

export async function mountKeyField(root, onChange = () => {}) {
  root.innerHTML = KEY_FIELD;
  const part = (name) => root.querySelector(`[data-role="${name}"]`);
  const form = part("form");
  const input = form.querySelector("input");
  const save = form.querySelector('button[type="submit"]');
  const note = part("note");
  let { apiKey } = await getSettings();

  function show() {
    part("saved").hidden = !apiKey;
    form.hidden = Boolean(apiKey);
    part("cancel").hidden = !apiKey;
    part("mask").textContent = `•••• ${apiKey.slice(-4)}`;
    input.value = "";
    note.textContent = "";
    note.classList.remove("error");
  }

  part("edit").addEventListener("click", () => {
    part("saved").hidden = true;
    form.hidden = false;
    part("cancel").hidden = false;
    input.focus();
  });
  part("cancel").addEventListener("click", show);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const candidate = input.value.trim();
    save.disabled = true;
    note.classList.remove("error");
    note.textContent = "Checking with SubDL...";

    const valid = await checkApiKey(candidate);
    save.disabled = false;
    if (valid === false) {
      note.classList.add("error");
      note.textContent = "SubDL didn't accept this key. Check it and try again.";
      return;
    }

    apiKey = candidate;
    await chrome.storage.local.set({ apiKey });
    show();
    onChange(true);
  });

  show();
}
