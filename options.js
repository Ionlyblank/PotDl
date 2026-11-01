import { checkHelper, getSettings } from "./lib/player.js";
import { mountKeyField, mountLanguage } from "./lib/settings-form.js";

const HELPER_CHECK_MS = 2000;

const helperMessage = document.getElementById("helperMessage");
const languageSaved = document.getElementById("languageSaved");
let helperReady = false;

function markStep(id, done) {
  const step = document.getElementById(id);
  step.classList.toggle("done", done);
  step.querySelector(".step-mark").textContent = done ? "✓" : step.dataset.number;
}

async function refreshAllSet() {
  const { apiKey } = await getSettings();
  markStep("stepKey", Boolean(apiKey));
  document.getElementById("allSet").hidden = !(helperReady && apiKey);
}

// Keeps checking until the installer has run, so nobody has to press anything.
async function refreshHelper() {
  const outcome = await checkHelper();
  helperReady = outcome.ok;
  helperMessage.classList.toggle("success", outcome.ok);
  helperMessage.textContent = outcome.ok ? "✓ Connected" : "";
  document.getElementById("helperInstall").hidden = outcome.ok;

  markStep("stepHelper", outcome.ok);
  await refreshAllSet();
  if (!outcome.ok) setTimeout(refreshHelper, HELPER_CHECK_MS);
}

for (const step of document.querySelectorAll(".step")) {
  step.dataset.number = step.querySelector(".step-mark").textContent;
}
markStep("stepLanguage", true);
helperMessage.textContent = "Checking...";

mountLanguage(document.getElementById("language"), () => {
  languageSaved.textContent = "✓ Saved";
  setTimeout(() => (languageSaved.textContent = ""), 1800);
});
mountKeyField(document.getElementById("keyField"), refreshAllSet);
refreshHelper();
